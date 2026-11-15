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

export interface ProviderFetchPolicy {
  signal?: AbortSignal;
  timeoutMs: number;
  /** Number of same-provider retries. Defaults to one; callers may explicitly disable it. */
  maxRetries?: number;
  retryBaseDelayMs?: number;
}

const RETRYABLE_HTTP_STATUSES = new Set([408, 425, 429, 500, 502, 503, 504]);

function isTransientNetworkError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  if (error.name === 'AbortError' || error.name === 'TimeoutError') return false;
  const code = (error as Error & { code?: string }).code;
  return (
    error instanceof TypeError ||
    ['ECONNRESET', 'ECONNREFUSED', 'EHOSTUNREACH', 'ENETUNREACH', 'EAI_AGAIN', 'ETIMEDOUT'].includes(
      code ?? ''
    )
  );
}

function getRetryAfterMs(response: Response): number {
  const value = response.headers.get('retry-after');
  if (!value) return 0;
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) {
    return Math.min(5000, Math.round(seconds * 1000));
  }
  const date = Date.parse(value);
  return Number.isFinite(date) ? Math.min(5000, Math.max(0, date - Date.now())) : 0;
}

function waitForRetry(delayMs: number, signal?: AbortSignal): Promise<void> {
  if (signal?.aborted) {
    return Promise.reject(
      signal.reason ??
        Object.assign(new Error('Provider request was cancelled by the caller.'), {
          name: 'AbortError',
        })
    );
  }
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, delayMs);
    const onAbort = () => {
      clearTimeout(timer);
      signal?.removeEventListener('abort', onAbort);
      reject(
        signal?.reason ??
          Object.assign(new Error('Provider request was cancelled by the caller.'), {
            name: 'AbortError',
          })
      );
    };
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

/**
 * Retry only safe, pre-response provider failures. Authentication, billing,
 * malformed-request, and caller-cancellation failures are never retried.
 */
export async function fetchProviderWithRetry(
  input: RequestInfo | URL,
  init: RequestInit,
  policy: ProviderFetchPolicy
): Promise<Response> {
  const maxRetries = policy.maxRetries ?? 1;
  const baseDelayMs = policy.retryBaseDelayMs ?? 120;
  if (!Number.isInteger(maxRetries) || maxRetries < 0 || maxRetries > 2) {
    throw new Error('Provider maxRetries must be an integer between 0 and 2');
  }
  if (!Number.isFinite(baseDelayMs) || baseDelayMs < 0 || baseDelayMs > 2000) {
    throw new Error('Provider retry base delay must be between 0ms and 2 seconds');
  }

  for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
    const signal = createProviderRequestSignal(policy.signal, policy.timeoutMs);
    try {
      const response = await fetch(input, { ...init, signal });
      if (!RETRYABLE_HTTP_STATUSES.has(response.status) || attempt === maxRetries) {
        return response;
      }

      const retryAfterMs = getRetryAfterMs(response);
      await response.body?.cancel().catch(() => undefined);
      const exponentialDelay = Math.min(1000, baseDelayMs * 2 ** attempt);
      const jitter = baseDelayMs === 0 ? 0 : Math.floor(Math.random() * exponentialDelay * 0.2);
      await waitForRetry(Math.max(retryAfterMs, exponentialDelay + jitter), policy.signal);
    } catch (error) {
      if (policy.signal?.aborted) {
        throw policy.signal.reason ?? error;
      }
      const timedOut = signal.aborted && (signal.reason as Error | undefined)?.name === 'TimeoutError';
      if (!timedOut && !isTransientNetworkError(error)) {
        throw error;
      }
      if (attempt === maxRetries) {
        throw timedOut ? signal.reason ?? error : error;
      }
      const exponentialDelay = Math.min(1000, baseDelayMs * 2 ** attempt);
      const jitter = baseDelayMs === 0 ? 0 : Math.floor(Math.random() * exponentialDelay * 0.2);
      await waitForRetry(exponentialDelay + jitter, policy.signal);
    }
  }

  throw new Error('Provider request retry loop exited unexpectedly');
}
