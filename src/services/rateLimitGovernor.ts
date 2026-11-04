import { AIProviderId, getModelFallbackChain, isModelActive } from './models/modelRegistry';

export interface RateLimitAnalysis {
  isRateLimited: boolean;
  isDailyQuota: boolean;
  isPerMinute: boolean;
  limitType: 'tokens' | 'requests' | 'daily' | 'unknown';
  cooldownSeconds: number;
  remainingTokens?: number;
  remainingRequests?: number;
  resetTokens?: string;
  resetRequests?: string;
  shouldAutoRetry: boolean;
  suggestedFallbackModel?: string;
}

export class RateLimitGovernor {
  private static readonly MAX_AUTO_RETRIES = 2;
  private static readonly MAX_AUTO_RETRY_COOLDOWN_SEC = 20;

  /**
   * Analyzes an HTTP 429 or classified rate limit error with response headers and payload.
   */
  public static analyzeRateLimit(
    status: number | undefined,
    errorBody: any,
    headers?: Headers | Record<string, string>,
    providerId: AIProviderId = 'groq',
    currentModel: string = ''
  ): RateLimitAnalysis {
    if (status !== 429 && !(errorBody?.error?.code === 'rate_limit_exceeded')) {
      return {
        isRateLimited: false,
        isDailyQuota: false,
        isPerMinute: false,
        limitType: 'unknown',
        cooldownSeconds: 0,
        shouldAutoRetry: false,
      };
    }

    let rawMsg = '';
    let errorCode = '';
    let errorType = '';

    if (typeof errorBody === 'string') {
      rawMsg = errorBody;
    } else if (errorBody && typeof errorBody === 'object') {
      rawMsg = errorBody.error?.message || errorBody.message || '';
      errorCode = String(errorBody.error?.code || errorBody.code || '');
      errorType = String(errorBody.error?.type || errorBody.type || '');
    }

    const lowerMsg = rawMsg.toLowerCase();
    const lowerCode = errorCode.toLowerCase();

    // 1. Distinguish daily quota exhaustion from per-minute limits
    const isDailyQuota =
      lowerMsg.includes('daily') ||
      lowerMsg.includes('per day') ||
      lowerMsg.includes('insufficient_quota') ||
      lowerCode.includes('insufficient_quota') ||
      lowerMsg.includes('credit balance');

    const isTokenLimit =
      errorType === 'tokens' ||
      lowerMsg.includes('token') ||
      lowerMsg.includes('tpm') ||
      lowerMsg.includes('tokens per minute');

    const isRequestLimit =
      errorType === 'requests' ||
      lowerMsg.includes('request') ||
      lowerMsg.includes('rpm') ||
      lowerMsg.includes('requests per minute');

    let limitType: 'tokens' | 'requests' | 'daily' | 'unknown' = 'unknown';
    if (isDailyQuota) limitType = 'daily';
    else if (isTokenLimit) limitType = 'tokens';
    else if (isRequestLimit) limitType = 'requests';

    // 2. Extract cooldown seconds from headers or message
    let cooldownSeconds = 0;

    const getHeader = (name: string): string | null => {
      if (!headers) return null;
      if (typeof (headers as any).get === 'function') {
        return (headers as Headers).get(name);
      }
      const record = headers as Record<string, string>;
      return record[name] || record[name.toLowerCase()] || null;
    };

    const retryAfterHeader = getHeader('retry-after');
    if (retryAfterHeader) {
      const parsedSec = parseFloat(retryAfterHeader);
      if (!isNaN(parsedSec) && parsedSec > 0) {
        cooldownSeconds = Math.ceil(parsedSec);
      }
    }

    // Header fallbacks: x-ratelimit-reset-tokens (e.g. "15.25s" or "2s")
    const resetTokensHeader = getHeader('x-ratelimit-reset-tokens');
    const resetRequestsHeader = getHeader('x-ratelimit-reset-requests');

    if (!cooldownSeconds && resetTokensHeader) {
      const match = resetTokensHeader.match(/(\d+(?:\.\d+)?)/);
      if (match) cooldownSeconds = Math.ceil(parseFloat(match[1]));
    }
    if (!cooldownSeconds && resetRequestsHeader) {
      const match = resetRequestsHeader.match(/(\d+(?:\.\d+)?)/);
      if (match) cooldownSeconds = Math.ceil(parseFloat(match[1]));
    }

    // Message fallback: "Please try again in 15.254s" or "try again in 15s"
    if (!cooldownSeconds) {
      const match = rawMsg.match(/try again in (\d+(?:\.\d+)?)s/i);
      if (match) {
        cooldownSeconds = Math.ceil(parseFloat(match[1]));
      }
    }

    // If still unknown but rate limited, default conservative cooldown
    if (!cooldownSeconds) {
      cooldownSeconds = isDailyQuota ? 3600 : 15;
    }

    const remainingTokens = getHeader('x-ratelimit-remaining-tokens')
      ? parseInt(getHeader('x-ratelimit-remaining-tokens')!, 10)
      : undefined;
    const remainingRequests = getHeader('x-ratelimit-remaining-requests')
      ? parseInt(getHeader('x-ratelimit-remaining-requests')!, 10)
      : undefined;

    // 3. Auto-retry eligibility
    const shouldAutoRetry =
      !isDailyQuota &&
      cooldownSeconds <= RateLimitGovernor.MAX_AUTO_RETRY_COOLDOWN_SEC;

    // 4. Fallback Model Selection
    let suggestedFallbackModel: string | undefined;
    if (isTokenLimit && providerId === 'groq') {
      const chain = getModelFallbackChain('groq', currentModel, 'llm');
      // Prefer active model from chain with different footprint (e.g. openai/gpt-oss-20b)
      for (const m of chain) {
        if (isModelActive('groq', m) && m !== currentModel) {
          suggestedFallbackModel = m;
          break;
        }
      }
    }

    return {
      isRateLimited: true,
      isDailyQuota,
      isPerMinute: !isDailyQuota,
      limitType,
      cooldownSeconds,
      remainingTokens,
      remainingRequests,
      resetTokens: resetTokensHeader || undefined,
      resetRequests: resetRequestsHeader || undefined,
      shouldAutoRetry,
      suggestedFallbackModel,
    };
  }

  /**
   * Calculates bounded exponential backoff delay with jitter.
   */
  public static calculateBackoffDelayMs(attempt: number, cooldownSeconds: number): number {
    const baseDelayMs = Math.max(cooldownSeconds * 1000, 1000 * Math.pow(2, attempt));
    const jitterMs = Math.floor(Math.random() * 500); // 0 to 500ms random jitter
    const clampedDelayMs = Math.min(baseDelayMs + jitterMs, 30000); // Max 30s
    return clampedDelayMs;
  }
}
