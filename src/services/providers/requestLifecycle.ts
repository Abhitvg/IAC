/**
 * Compose a caller-owned cancellation signal with a hard provider deadline.
 * The returned signal stays active through response-body parsing, not just until
 * the server sends response headers.
 */
export const DEFAULT_LLM_REQUEST_TIMEOUT_MS = 30_000;
export const DEFAULT_STT_REQUEST_TIMEOUT_MS = 60_000;

export function createProviderRequestSignal(
  callerSignal?: AbortSignal,
  timeoutMs: number = DEFAULT_LLM_REQUEST_TIMEOUT_MS
): AbortSignal {
  if (!Number.isFinite(timeoutMs) || timeoutMs < 1 || timeoutMs > 5 * 60_000) {
    throw new Error('Provider request timeout must be between 1ms and 5 minutes');
  }

  if (callerSignal?.aborted) {
    throw (
      callerSignal.reason ??
      Object.assign(new Error('Provider request was cancelled by the caller.'), {
        name: 'AbortError',
      })
    );
  }
  const timeoutSignal = AbortSignal.timeout(timeoutMs);
  return callerSignal ? AbortSignal.any([callerSignal, timeoutSignal]) : timeoutSignal;
}
