import { execFile } from 'child_process';
import crypto from 'crypto';
import fs from 'fs';
import os from 'os';
import path from 'path';
import type { ExecFileException } from 'child_process';
import type { JavaSandboxRequest, JavaSandboxResult } from '../types/javaSandbox';

export const JAVA_SANDBOX_IMAGE =
  'eclipse-temurin:21-jdk-jammy@sha256:b2711c65970c1227197c29c46e669bfdbb137524e9da0e664703a140ec25a040';

export const JAVA_SANDBOX_LIMITS = {
  maxSourceBytes: 32 * 1024,
  maxStdinBytes: 8 * 1024,
  maxExpectedOutputBytes: 8 * 1024,
  maxOutputBytes: 24 * 1024,
  memory: '384m',
  cpus: '1',
  pids: '32',
  runTimeoutMs: 15_000,
};

const COMPILE_MARKER_PREFIX = '__IAC_JAVA_COMPILE_OK_';
const COMPILE_FAILURE_EXIT_CODE = 42;
const COMMAND_MAX_BUFFER = 64 * 1024;
const PREFLIGHT_TIMEOUT_MS = 5_000;
const CREATE_TIMEOUT_MS = 8_000;
const COPY_TIMEOUT_MS = 5_000;
const CLEANUP_TIMEOUT_MS = 5_000;

const CONTAINER_SCRIPT = [
  'set -eu',
  'mkdir -p /workspace/out',
  'if ! javac -J-Xms16m -J-Xmx128m -J-XX:ActiveProcessorCount=1 -proc:none -encoding UTF-8 -d /workspace/out "/workspace/$1.java" 2>/workspace/javac.stderr; then',
  '  cat /workspace/javac.stderr >&2',
  '  exit 42',
  'fi',
  'if [ -s /workspace/javac.stderr ]; then cat /workspace/javac.stderr >&2; fi',
  'printf "%s\\n" "$IAC_COMPILE_MARKER"',
  'if [ "$IAC_EXECUTE_MAIN" != "1" ]; then exit 0; fi',
  'exec java -Xms16m -Xmx128m -XX:MaxMetaspaceSize=64m -XX:ActiveProcessorCount=1 -XX:+DisableAttachMechanism -Djava.io.tmpdir=/tmp -cp /workspace/out "$1" < /workspace/stdin.txt',
].join('\n');

interface ExecFileOptions {
  timeout: number;
  maxBuffer: number;
  windowsHide: boolean;
}

interface ExecFileResult {
  stdout: string;
  stderr: string;
}

type ExecFileRunner = (
  file: string,
  args: string[],
  options: ExecFileOptions
) => Promise<ExecFileResult>;

export interface JavaSourceAnalysis {
  className: string;
  hasMainMethod: boolean;
  fileName: string;
}

export interface JavaSandboxRunnerDependencies {
  execFile: ExecFileRunner;
  mkdtemp: (prefix: string) => Promise<string>;
  writeFile: (filePath: string, content: string) => Promise<void>;
  removeDirectory: (directoryPath: string) => Promise<void>;
  tempDirectory: string;
  platform: NodeJS.Platform;
  uuid: () => string;
  now: () => number;
}

function defaultExecFile(
  file: string,
  args: string[],
  options: ExecFileOptions
): Promise<ExecFileResult> {
  return new Promise((resolve, reject) => {
    execFile(file, args, options, (error: ExecFileException | null, stdout, stderr) => {
      if (error) {
        Object.assign(error, { stdout: String(stdout || ''), stderr: String(stderr || '') });
        reject(error);
        return;
      }
      resolve({ stdout: String(stdout || ''), stderr: String(stderr || '') });
    });
  });
}

const DEFAULT_DEPENDENCIES: JavaSandboxRunnerDependencies = {
  execFile: defaultExecFile,
  mkdtemp: (prefix) => fs.promises.mkdtemp(prefix),
  writeFile: async (filePath, content) => {
    await fs.promises.writeFile(filePath, content, {
      encoding: 'utf8',
      flag: 'wx',
      mode: 0o644,
    });
  },
  removeDirectory: async (directoryPath) => {
    await fs.promises.rm(directoryPath, { recursive: true, force: true });
  },
  tempDirectory: os.tmpdir(),
  platform: process.platform,
  uuid: () => crypto.randomUUID(),
  now: () => Date.now(),
};

interface CommandResult {
  ok: boolean;
  stdout: string;
  stderr: string;
  exitCode: number | null;
  timedOut: boolean;
  message?: string;
}

function readErrorOutput(error: unknown): {
  stdout: string;
  stderr: string;
  exitCode: number | null;
  timedOut: boolean;
  message: string;
} {
  const value = error as {
    stdout?: unknown;
    stderr?: unknown;
    code?: unknown;
    signal?: unknown;
    killed?: unknown;
    message?: unknown;
  };
  const numericCode = typeof value?.code === 'number' ? value.code : null;
  const timedOut =
    value?.code === 'ETIMEDOUT' ||
    value?.killed === true ||
    value?.signal === 'SIGTERM' ||
    value?.signal === 'SIGKILL';
  return {
    stdout: typeof value?.stdout === 'string' ? value.stdout : '',
    stderr: typeof value?.stderr === 'string' ? value.stderr : '',
    exitCode: numericCode,
    timedOut,
    message: typeof value?.message === 'string' ? value.message : 'Command failed.',
  };
}

function truncate(value: string, maxLength = JAVA_SANDBOX_LIMITS.maxOutputBytes): string {
  if (value.length <= maxLength) return value;
  return value.slice(0, maxLength) + '\n[output truncated at ' + maxLength + ' characters]';
}

function createResult(
  status: JavaSandboxResult['status'],
  message: string,
  fields: Partial<JavaSandboxResult> = {}
): JavaSandboxResult {
  return {
    status,
    ok: false,
    message,
    stdout: '',
    stderr: '',
    durationMs: 0,
    compileSucceeded: null,
    exitCode: null,
    outputMatched: null,
    ...fields,
  };
}

export function analyzeJavaSource(sourceCode: string): JavaSourceAnalysis | null {
  if (/^\s*package\s+[A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*\s*;/m.test(sourceCode)) {
    return null;
  }

  const withoutComments = sourceCode
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:])\/\/.*$/gm, '$1 ');
  const publicType = withoutComments.match(
    /\bpublic\s+(?:(?:abstract|final)\s+)?(?:class|record|enum)\s+([A-Za-z_$][\w$]*)/
  );
  const anyType = withoutComments.match(/\b(?:class|record|enum)\s+([A-Za-z_$][\w$]*)/);
  const className = publicType?.[1] || anyType?.[1];
  if (!className) return null;

  const hasMainMethod =
    /\bpublic\s+static\s+void\s+main\s*\(\s*(?:final\s+)?(?:java\.lang\.)?String\s*(?:\[\s*\]|\.\.\.)\s+[A-Za-z_$][\w$]*\s*\)/.test(
      withoutComments
    );

  return {
    className,
    fileName: className + '.java',
    hasMainMethod,
  };
}

export function normalizeJavaOutput(value: string): string {
  return value.replace(/\r\n/g, '\n').replace(/\n+$/g, '');
}

export function isLocalDockerEndpoint(endpoint: string): boolean {
  return (
    endpoint.startsWith('unix://') || /^npipe:\/\/\/\/\.\/pipe\/[A-Za-z0-9_.-]+$/.test(endpoint)
  );
}

export function buildJavaSandboxCreateArgs(options: { containerName: string }): string[] {
  return [
    'create',
    '--name',
    options.containerName,
    '--network',
    'none',
    '--memory',
    JAVA_SANDBOX_LIMITS.memory,
    '--memory-swap',
    JAVA_SANDBOX_LIMITS.memory,
    '--cpus',
    JAVA_SANDBOX_LIMITS.cpus,
    '--pids-limit',
    JAVA_SANDBOX_LIMITS.pids,
    '--read-only',
    '--cap-drop',
    'ALL',
    '--security-opt',
    'no-new-privileges=true',
    '--user',
    '10001:10001',
    '--tmpfs',
    '/workspace:rw,nosuid,nodev,noexec,size=16m,mode=1777',
    '--tmpfs',
    '/tmp:rw,nosuid,nodev,noexec,size=16m,mode=1777',
    '--ulimit',
    'cpu=12:12',
    '--ulimit',
    'nofile=64:64',
    '--ulimit',
    'fsize=1048576:1048576',
    '--ulimit',
    'nproc=32:32',
    '--workdir',
    '/workspace',
    '--log-driver',
    'none',
    '--env',
    'HOME=/tmp',
    '--env',
    'TMPDIR=/tmp',
    '--entrypoint',
    '/bin/sh',
    JAVA_SANDBOX_IMAGE,
    '-c',
    'exec sleep 60',
  ];
}

export function buildJavaSandboxExecArgs(options: {
  containerId: string;
  marker: string;
  executeMain: boolean;
  className: string;
}): string[] {
  return [
    'exec',
    '--env',
    'IAC_COMPILE_MARKER=' + options.marker,
    '--env',
    'IAC_EXECUTE_MAIN=' + (options.executeMain ? '1' : '0'),
    options.containerId,
    '/bin/sh',
    '-c',
    CONTAINER_SCRIPT,
    'iac-java-sandbox',
    options.className,
  ];
}

function hasCompileMarker(stdout: string, marker: string): boolean {
  return stdout.split(/\r?\n/).includes(marker);
}

function removeCompileMarker(stdout: string, marker: string): string {
  const lines = stdout.split(/\r?\n/);
  const index = lines.indexOf(marker);
  if (index >= 0) lines.splice(index, 1);
  return lines.join('\n').replace(/^\n/, '');
}

export function createJavaSandboxRunner(
  overrides: Partial<JavaSandboxRunnerDependencies> = {}
): (request: unknown) => Promise<JavaSandboxResult> {
  const dependencies = { ...DEFAULT_DEPENDENCIES, ...overrides };

  const runCommand = async (args: string[], timeout: number): Promise<CommandResult> => {
    try {
      const executed = await dependencies.execFile('docker', args, {
        timeout,
        maxBuffer: COMMAND_MAX_BUFFER,
        windowsHide: true,
      });
      return {
        ok: true,
        stdout: executed.stdout,
        stderr: executed.stderr,
        exitCode: 0,
        timedOut: false,
      };
    } catch (error) {
      const details = readErrorOutput(error);
      return { ok: false, ...details };
    }
  };

  return async (rawRequest: unknown): Promise<JavaSandboxResult> => {
    const startedAt = dependencies.now();
    let lastResult: JavaSandboxResult | null = null;
    const createTrackedResult = (
      status: JavaSandboxResult['status'],
      message: string,
      fields: Partial<JavaSandboxResult> = {}
    ): JavaSandboxResult => {
      const response = createResult(status, message, fields);
      lastResult = response;
      return response;
    };
    const markCleanupFailed = (warning: string) => {
      if (!lastResult) return;
      lastResult.ok = false;
      lastResult.status = 'CLEANUP_FAILED';
      lastResult.cleanupWarning = warning;
      lastResult.message += ' Cleanup was not confirmed: ' + warning;
    };
    if (!rawRequest || typeof rawRequest !== 'object' || Array.isArray(rawRequest)) {
      return createTrackedResult('INVALID_REQUEST', 'Invalid Java sandbox request.');
    }

    const request = rawRequest as Partial<JavaSandboxRequest>;
    if (
      typeof request.sourceCode !== 'string' ||
      typeof request.executeMain !== 'boolean' ||
      (request.stdin !== undefined && typeof request.stdin !== 'string') ||
      (request.expectedOutput !== undefined && typeof request.expectedOutput !== 'string')
    ) {
      return createTrackedResult(
        'INVALID_REQUEST',
        'Source code, execution choice, or test input has an invalid type.'
      );
    }

    const sourceBytes = Buffer.byteLength(request.sourceCode, 'utf8');
    const stdin = request.stdin ?? '';
    const expectedOutput = request.expectedOutput;
    if (
      sourceBytes === 0 ||
      sourceBytes > JAVA_SANDBOX_LIMITS.maxSourceBytes ||
      request.sourceCode.includes('\0')
    ) {
      return createTrackedResult(
        'INVALID_REQUEST',
        'Java source must be non-empty and no larger than ' +
          JAVA_SANDBOX_LIMITS.maxSourceBytes / 1024 +
          ' KB.'
      );
    }
    if (Buffer.byteLength(stdin, 'utf8') > JAVA_SANDBOX_LIMITS.maxStdinBytes) {
      return createTrackedResult(
        'INVALID_REQUEST',
        'Standard input must not exceed ' + JAVA_SANDBOX_LIMITS.maxStdinBytes / 1024 + ' KB.'
      );
    }
    if (
      expectedOutput !== undefined &&
      Buffer.byteLength(expectedOutput, 'utf8') > JAVA_SANDBOX_LIMITS.maxExpectedOutputBytes
    ) {
      return createTrackedResult(
        'INVALID_REQUEST',
        'Expected output must not exceed ' +
          JAVA_SANDBOX_LIMITS.maxExpectedOutputBytes / 1024 +
          ' KB.'
      );
    }

    const analysis = analyzeJavaSource(request.sourceCode);
    if (!analysis) {
      return createTrackedResult(
        'INVALID_REQUEST',
        'Provide one Java class, record, or enum without a package declaration. Platform-specific snippets that need an external harness are not supported yet.'
      );
    }

    const shouldExecute = request.executeMain && analysis.hasMainMethod;

    const context = await runCommand(
      ['context', 'inspect', '--format', '{{json .Endpoints.docker}}'],
      PREFLIGHT_TIMEOUT_MS
    );
    if (!context.ok) {
      return createTrackedResult(
        'DOCKER_UNAVAILABLE',
        'A local Docker Engine is required. Start Docker Desktop or the local Docker service, then retry.'
      );
    }

    let contextEndpoint: string;
    try {
      const endpointInfo = JSON.parse(context.stdout.trim()) as { Host?: unknown };
      contextEndpoint = typeof endpointInfo.Host === 'string' ? endpointInfo.Host : '';
    } catch {
      return createTrackedResult(
        'DOCKER_CONTEXT_REJECTED',
        'Could not verify that the Docker context is local.'
      );
    }
    if (!isLocalDockerEndpoint(contextEndpoint)) {
      return createTrackedResult(
        'DOCKER_CONTEXT_REJECTED',
        'The selected Docker context is remote or unsupported. Switch to a local unix-socket or Windows named-pipe Docker context; source code must not be sent to a remote Docker host.'
      );
    }

    const info = await runCommand(
      ['info', '--format', '{{json .SecurityOptions}}'],
      PREFLIGHT_TIMEOUT_MS
    );
    if (!info.ok) {
      return createTrackedResult(
        'DOCKER_UNAVAILABLE',
        'Docker Engine is not responding. Start the local Docker service and retry.'
      );
    }
    if (dependencies.platform === 'linux') {
      try {
        const securityOptions = JSON.parse(info.stdout.trim()) as string[];
        if (
          !Array.isArray(securityOptions) ||
          !securityOptions.some((value) => /rootless/i.test(value))
        ) {
          return createTrackedResult(
            'ROOTLESS_DOCKER_REQUIRED',
            'On Linux, configure rootless Docker before running untrusted code. A rootful Docker daemon is not accepted by this runner.'
          );
        }
      } catch {
        return createTrackedResult(
          'ROOTLESS_DOCKER_REQUIRED',
          'Could not verify rootless Docker mode. The runner requires rootless Docker on Linux.'
        );
      }
    }

    const image = await runCommand(
      ['image', 'inspect', '--format', '{{.Id}}', JAVA_SANDBOX_IMAGE],
      PREFLIGHT_TIMEOUT_MS
    );
    if (!image.ok) {
      return createTrackedResult(
        'JAVA_IMAGE_MISSING',
        'The pinned Java 21 sandbox image is not installed locally. IAC will not download images automatically.',
        {
          setupCommand: 'docker pull ' + JAVA_SANDBOX_IMAGE,
          durationMs: dependencies.now() - startedAt,
        }
      );
    }

    let tempDirectory: string | undefined;
    const containerName = 'iac-java-sandbox-' + dependencies.uuid();
    let createAttempted = false;
    let containerCreated = false;
    const marker = COMPILE_MARKER_PREFIX + dependencies.uuid() + '__';

    try {
      tempDirectory = await dependencies.mkdtemp(
        path.join(dependencies.tempDirectory, 'iac-java-sandbox-')
      );
      const sourcePath = path.join(tempDirectory, analysis.fileName);
      const stdinPath = path.join(tempDirectory, 'stdin.txt');
      await dependencies.writeFile(sourcePath, request.sourceCode);
      await dependencies.writeFile(stdinPath, stdin);

      createAttempted = true;
      const create = await runCommand(
        buildJavaSandboxCreateArgs({ containerName }),
        CREATE_TIMEOUT_MS
      );
      if (!create.ok) {
        return createTrackedResult(
          'DOCKER_ERROR',
          'Docker could not create the restricted Java container.',
          {
            stderr: truncate(create.stderr || create.message || ''),
            durationMs: dependencies.now() - startedAt,
          }
        );
      }
      containerCreated = true;
      const containerId = create.stdout.trim();
      if (!/^[a-f0-9]{12,64}$/i.test(containerId)) {
        return createTrackedResult(
          'DOCKER_ERROR',
          'Docker returned an invalid container identifier; execution was stopped.',
          { durationMs: dependencies.now() - startedAt }
        );
      }
      const startContainer = await runCommand(['start', containerId], COPY_TIMEOUT_MS);
      if (!startContainer.ok) {
        return createTrackedResult(
          'DOCKER_ERROR',
          'Docker could not start the restricted Java container.',
          {
            stderr: truncate(startContainer.stderr || startContainer.message || ''),
            durationMs: dependencies.now() - startedAt,
          }
        );
      }

      const sourceCopy = await runCommand(
        ['cp', sourcePath, containerId + ':/workspace/' + analysis.fileName],
        COPY_TIMEOUT_MS
      );
      if (!sourceCopy.ok) {
        return createTrackedResult(
          'DOCKER_ERROR',
          'Could not copy Java source into the isolated container.',
          {
            stderr: truncate(sourceCopy.stderr || sourceCopy.message || ''),
            durationMs: dependencies.now() - startedAt,
          }
        );
      }

      const inputCopy = await runCommand(
        ['cp', stdinPath, containerId + ':/workspace/stdin.txt'],
        COPY_TIMEOUT_MS
      );
      if (!inputCopy.ok) {
        return createTrackedResult(
          'DOCKER_ERROR',
          'Could not copy standard input into the isolated container.',
          {
            stderr: truncate(inputCopy.stderr || inputCopy.message || ''),
            durationMs: dependencies.now() - startedAt,
          }
        );
      }

      const started = await runCommand(
        buildJavaSandboxExecArgs({
          containerId,
          marker,
          executeMain: shouldExecute,
          className: analysis.className,
        }),
        JAVA_SANDBOX_LIMITS.runTimeoutMs
      );
      const compileSucceeded = hasCompileMarker(started.stdout, marker);
      const stdout = truncate(removeCompileMarker(started.stdout, marker));
      const stderr = truncate(started.stderr);

      if (started.timedOut) {
        return createTrackedResult(
          'TIMEOUT',
          'The compile/run operation exceeded the 15-second limit and was terminated.',
          {
            stdout,
            stderr,
            durationMs: dependencies.now() - startedAt,
            compileSucceeded,
            exitCode: started.exitCode,
          }
        );
      }

      if (!compileSucceeded) {
        if (started.exitCode === COMPILE_FAILURE_EXIT_CODE) {
          return createTrackedResult(
            'COMPILE_FAILED',
            'Java compilation failed. Review the compiler diagnostics.',
            {
              stdout,
              stderr,
              durationMs: dependencies.now() - startedAt,
              compileSucceeded: false,
              exitCode: started.exitCode,
            }
          );
        }
        return createTrackedResult(
          'DOCKER_ERROR',
          'The Java container stopped before compilation could be confirmed.',
          {
            stdout,
            stderr,
            durationMs: dependencies.now() - startedAt,
            compileSucceeded: false,
            exitCode: started.exitCode,
          }
        );
      }

      if (!shouldExecute) {
        return createTrackedResult(
          'COMPILED',
          analysis.hasMainMethod
            ? 'Compilation passed. Execution was disabled by your selection.'
            : 'Compilation passed. No public static main(String[] args) method was found, so the code was not executed.',
          {
            ok: true,
            stdout,
            stderr,
            durationMs: dependencies.now() - startedAt,
            compileSucceeded: true,
            exitCode: 0,
          }
        );
      }

      if (!started.ok || started.exitCode !== 0) {
        return createTrackedResult(
          'RUNTIME_FAILED',
          'Compilation passed, but the Java program exited with an error.',
          {
            stdout,
            stderr,
            durationMs: dependencies.now() - startedAt,
            compileSucceeded: true,
            exitCode: started.exitCode,
          }
        );
      }

      if (expectedOutput !== undefined) {
        const outputMatched = normalizeJavaOutput(stdout) === normalizeJavaOutput(expectedOutput);
        return createTrackedResult(
          outputMatched ? 'OUTPUT_MATCHED' : 'OUTPUT_MISMATCH',
          outputMatched
            ? 'Compilation passed and actual output matched the expected output.'
            : 'Compilation and execution completed, but actual output did not match the expected output.',
          {
            ok: outputMatched,
            stdout,
            stderr,
            durationMs: dependencies.now() - startedAt,
            compileSucceeded: true,
            exitCode: 0,
            outputMatched,
          }
        );
      }

      return createTrackedResult(
        'EXECUTED',
        'Compilation and execution completed. No expected output was supplied, so correctness has not been asserted.',
        {
          ok: true,
          stdout,
          stderr,
          durationMs: dependencies.now() - startedAt,
          compileSucceeded: true,
          exitCode: 0,
        }
      );
    } catch (error) {
      const details = readErrorOutput(error);
      if (details.timedOut) {
        return createTrackedResult(
          'TIMEOUT',
          'The sandbox operation exceeded its time limit and was terminated.',
          {
            stdout: truncate(details.stdout),
            stderr: truncate(details.stderr),
            durationMs: dependencies.now() - startedAt,
          }
        );
      }
      return createTrackedResult('DOCKER_ERROR', 'The sandbox could not complete safely.', {
        stdout: truncate(details.stdout),
        stderr: truncate(details.stderr),
        durationMs: dependencies.now() - startedAt,
      });
    } finally {
      if (createAttempted) {
        const cleanup = await runCommand(['rm', '--force', containerName], CLEANUP_TIMEOUT_MS);
        if (!cleanup.ok && containerCreated) {
          markCleanupFailed(
            'Docker did not confirm removal of the sandbox container. Inspect Docker for ' +
              containerName +
              ' and remove it before continuing. ' +
              truncate(cleanup.stderr || cleanup.message || 'Unknown Docker cleanup error.')
          );
        }
      }
      if (tempDirectory) {
        try {
          await dependencies.removeDirectory(tempDirectory);
        } catch (error) {
          markCleanupFailed(
            'The temporary source directory could not be removed. Check the operating system temp directory.'
          );
          console.error('[JavaSandbox] Failed to remove temporary source directory:', error);
        }
      }
    }
  };
}

export const runJavaSandbox = createJavaSandboxRunner();
