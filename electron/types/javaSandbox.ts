export type JavaSandboxStatus =
  | 'COMPILED'
  | 'EXECUTED'
  | 'OUTPUT_MATCHED'
  | 'OUTPUT_MISMATCH'
  | 'COMPILE_FAILED'
  | 'RUNTIME_FAILED'
  | 'TIMEOUT'
  | 'DOCKER_UNAVAILABLE'
  | 'DOCKER_CONTEXT_REJECTED'
  | 'ROOTLESS_DOCKER_REQUIRED'
  | 'JAVA_IMAGE_MISSING'
  | 'DOCKER_ERROR'
  | 'CLEANUP_FAILED'
  | 'INVALID_REQUEST';

export interface JavaSandboxRequest {
  sourceCode: string;
  stdin?: string;
  expectedOutput?: string;
  executeMain: boolean;
}

export interface JavaSandboxResult {
  status: JavaSandboxStatus;
  ok: boolean;
  message: string;
  stdout: string;
  stderr: string;
  durationMs: number;
  compileSucceeded: boolean | null;
  exitCode: number | null;
  outputMatched: boolean | null;
  setupCommand?: string;
  cleanupWarning?: string;
}
