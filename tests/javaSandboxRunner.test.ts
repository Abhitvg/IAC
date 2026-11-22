import { describe, expect, it, vi } from 'vitest';
import {
  analyzeJavaSource,
  buildJavaSandboxCreateArgs,
  createJavaSandboxRunner,
  isLocalDockerEndpoint,
  normalizeJavaOutput,
} from '../electron/services/javaSandboxRunner';

const runnableSource = [
  'public class Main {',
  '  public static void main(String[] args) {',
  '    System.out.println("42");',
  '  }',
  '}',
].join('\n');

function createFakeRunner(
  options: {
    platform?: NodeJS.Platform;
    endpoint?: string;
    securityOptions?: string[];
    imageAvailable?: boolean;
    startOutput?: string;
    startError?: {
      code: number | string;
      stdout?: string;
      stderr?: string;
      killed?: boolean;
      signal?: string;
    };
  } = {}
) {
  const calls: Array<{ file: string; args: string[] }> = [];
  const marker = '__IAC_JAVA_COMPILE_OK_test-uuid__';
  const execFile = vi.fn(async (file: string, args: string[]) => {
    calls.push({ file, args });
    if (args[0] === 'context') {
      return {
        stdout: JSON.stringify({ Host: options.endpoint ?? 'unix:///var/run/docker.sock' }),
        stderr: '',
      };
    }
    if (args[0] === 'info') {
      return { stdout: JSON.stringify(options.securityOptions ?? ['name=rootless']), stderr: '' };
    }
    if (args[0] === 'image') {
      if (options.imageAvailable === false) {
        throw Object.assign(new Error('No such image'), { code: 1, stderr: 'No such image' });
      }
      return { stdout: 'sha256:local-image-id', stderr: '' };
    }
    if (args[0] === 'create') return { stdout: '0123456789abcdef0123456789abcdef', stderr: '' };
    if (args[0] === 'cp' || args[0] === 'rm') return { stdout: '', stderr: '' };
    if (args[0] === 'start') return { stdout: '', stderr: '' };
    if (args[0] === 'exec') {
      if (options.startError) {
        throw Object.assign(new Error('docker exec failed'), options.startError);
      }
      return { stdout: options.startOutput ?? marker + '\n42\n', stderr: '' };
    }
    throw new Error('Unexpected Docker command: ' + args.join(' '));
  });
  const writeFile = vi.fn(async () => undefined);
  const removeDirectory = vi.fn(async () => undefined);
  const runner = createJavaSandboxRunner({
    execFile,
    mkdtemp: async () => '/tmp/iac-java-sandbox-test',
    writeFile,
    removeDirectory,
    tempDirectory: '/tmp',
    platform: options.platform ?? 'linux',
    uuid: () => 'test-uuid',
    now: () => 1000,
  });
  return { runner, calls, execFile, writeFile, removeDirectory, marker };
}

describe('Java Docker sandbox runner', () => {
  it('recognizes a simple Java entry point and derives a matching source filename', () => {
    expect(analyzeJavaSource(runnableSource)).toEqual({
      className: 'Main',
      fileName: 'Main.java',
      hasMainMethod: true,
    });
  });

  it('recognizes judge-style classes as compile-only and rejects package paths', () => {
    expect(
      analyzeJavaSource('class Solution { public int sum(int a, int b) { return a + b; } }')
    ).toEqual({
      className: 'Solution',
      fileName: 'Solution.java',
      hasMainMethod: false,
    });
    expect(analyzeJavaSource('package demo; public class Main {}')).toBeNull();
  });

  it('accepts only local Docker socket contexts', () => {
    expect(isLocalDockerEndpoint('unix:///var/run/docker.sock')).toBe(true);
    expect(isLocalDockerEndpoint('npipe:////./pipe/docker_engine')).toBe(true);
    expect(isLocalDockerEndpoint('ssh://remote.example.com')).toBe(false);
    expect(isLocalDockerEndpoint('tcp://127.0.0.1:2375')).toBe(false);
  });

  it('builds a container with restrictive network, filesystem, user and resource settings', () => {
    const args = buildJavaSandboxCreateArgs({
      containerName: 'iac-java-sandbox-test',
      marker: 'marker',
      executeMain: true,
      className: 'Main',
    });
    expect(args).toContain('--network');
    expect(args).toContain('none');
    expect(args).toContain('--read-only');
    expect(args).toContain('--cap-drop');
    expect(args).toContain('ALL');
    expect(args).toContain('--pids-limit');
    expect(args).toContain('32');
    expect(args).toContain('--user');
    expect(args).toContain('10001:10001');
    expect(args).toContain('no-new-privileges=true');
    expect(args).not.toContain('--mount');
    expect(args).not.toContain('--privileged');
  });

  it('executes Java only in the local rootless sandbox and compares supplied output', async () => {
    const { runner, calls, writeFile, removeDirectory, marker } = createFakeRunner();
    const result = await runner({
      sourceCode: runnableSource,
      stdin: 'sample input\n',
      expectedOutput: '42\n',
      executeMain: true,
    });

    expect(result.status).toBe('OUTPUT_MATCHED');
    expect(result.ok).toBe(true);
    expect(result.compileSucceeded).toBe(true);
    expect(result.outputMatched).toBe(true);
    expect(result.stdout).toBe('42');
    expect(calls.map((call) => call.args[0])).toEqual([
      'context',
      'info',
      'image',
      'create',
      'start',
      'cp',
      'cp',
      'exec',
      'rm',
    ]);
    const create = calls.find((call) => call.args[0] === 'create')!;
    expect(create.args).toContain('--network');
    expect(create.args).toContain('none');
    const execution = calls.find((call) => call.args[0] === 'exec')!;
    expect(execution.args.some((arg) => arg === 'IAC_COMPILE_MARKER=' + marker)).toBe(true);
    expect(writeFile).toHaveBeenCalledTimes(2);
    expect(removeDirectory).toHaveBeenCalledWith('/tmp/iac-java-sandbox-test');
  });

  it('reports compile-only success when no main method is present', async () => {
    const { runner, calls } = createFakeRunner({
      startOutput: '__IAC_JAVA_COMPILE_OK_test-uuid__\n',
    });
    const result = await runner({
      sourceCode: 'class Solution { public int sum(int a, int b) { return a + b; } }',
      executeMain: true,
    });

    expect(result.status).toBe('COMPILED');
    expect(result.ok).toBe(true);
    const create = calls.find((call) => call.args[0] === 'create')!;
    expect(create.args).toContain('IAC_EXECUTE_MAIN=0');
  });

  it('refuses remote Docker contexts before creating a container', async () => {
    const { runner, calls } = createFakeRunner({ endpoint: 'ssh://docker-host.example' });
    const result = await runner({ sourceCode: runnableSource, executeMain: true });

    expect(result.status).toBe('DOCKER_CONTEXT_REJECTED');
    expect(calls.map((call) => call.args[0])).toEqual(['context']);
  });

  it('requires rootless Docker on Linux', async () => {
    const { runner, calls } = createFakeRunner({
      securityOptions: ['name=seccomp,profile=builtin'],
    });
    const result = await runner({ sourceCode: runnableSource, executeMain: true });

    expect(result.status).toBe('ROOTLESS_DOCKER_REQUIRED');
    expect(calls.map((call) => call.args[0])).toEqual(['context', 'info']);
  });

  it('does not pull an image and returns the exact pinned setup command when missing', async () => {
    const { runner, calls } = createFakeRunner({ imageAvailable: false });
    const result = await runner({ sourceCode: runnableSource, executeMain: true });

    expect(result.status).toBe('JAVA_IMAGE_MISSING');
    expect(result.setupCommand).toContain('docker pull eclipse-temurin:21-jdk-jammy@sha256:');
    expect(calls.map((call) => call.args[0])).toEqual(['context', 'info', 'image']);
  });

  it('maps compiler exit 42 to COMPILE_FAILED and still removes the container', async () => {
    const { runner, calls } = createFakeRunner({
      startError: { code: 42, stderr: 'Main.java:1: error: expected ;' },
    });
    const result = await runner({ sourceCode: runnableSource, executeMain: true });

    expect(result.status).toBe('COMPILE_FAILED');
    expect(result.compileSucceeded).toBe(false);
    expect(calls.some((call) => call.args[0] === 'rm')).toBe(true);
  });

  it('maps an execution timeout without claiming that the program passed', async () => {
    const { runner } = createFakeRunner({
      startError: {
        code: 'ETIMEDOUT',
        stdout: '__IAC_JAVA_COMPILE_OK_test-uuid__\n',
        stderr: '',
        killed: true,
        signal: 'SIGTERM',
      },
    });
    const result = await runner({ sourceCode: runnableSource, executeMain: true });

    expect(result.status).toBe('TIMEOUT');
    expect(result.compileSucceeded).toBe(true);
    expect(result.ok).toBe(false);
  });

  it('rejects malformed or over-sized requests before contacting Docker', async () => {
    const { runner, calls } = createFakeRunner();
    const malformed = await runner({ sourceCode: runnableSource });
    const oversized = await runner({
      sourceCode: 'class Main {' + ' '.repeat(40 * 1024) + '}',
      executeMain: true,
    });

    expect(malformed.status).toBe('INVALID_REQUEST');
    expect(oversized.status).toBe('INVALID_REQUEST');
    expect(calls).toHaveLength(0);
  });

  it('compares line endings and ignores only trailing newlines', () => {
    expect(normalizeJavaOutput('line 1\r\nline 2\r\n')).toBe('line 1\nline 2');
    expect(normalizeJavaOutput('line 1\n\n')).toBe('line 1');
  });
});
