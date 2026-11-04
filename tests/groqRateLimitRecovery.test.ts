import { describe, it, expect, vi, beforeEach } from 'vitest';
import { RateLimitGovernor } from '../src/services/rateLimitGovernor';
import { classifyAIError } from '../src/services/models/modelRegistry';

describe('Suite C: Groq Rate-Limit Handling & Recovery', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('correctly parses HTTP 429 with retry-after header and identifies TPM token limit', () => {
    const headers = new Headers({
      'retry-after': '12.5',
      'x-ratelimit-remaining-tokens': '240',
      'x-ratelimit-reset-tokens': '12.5s',
    });

    const body = {
      error: {
        message: 'Rate limit reached for model openai/gpt-oss-120b on tokens per minute (TPM): Limit 8000, Used 7800, Requested 2000.',
        type: 'tokens',
        code: 'rate_limit_exceeded',
      },
    };

    const analysis = RateLimitGovernor.analyzeRateLimit(429, body, headers, 'groq', 'openai/gpt-oss-120b');

    expect(analysis.isRateLimited).toBe(true);
    expect(analysis.isPerMinute).toBe(true);
    expect(analysis.isDailyQuota).toBe(false);
    expect(analysis.limitType).toBe('tokens');
    expect(analysis.cooldownSeconds).toBe(13); // ceil(12.5)
    expect(analysis.shouldAutoRetry).toBe(true);
    expect(analysis.suggestedFallbackModel).toBe('openai/gpt-oss-20b');
  });

  it('correctly distinguishes daily quota exhaustion from per-minute rate limits and prevents auto-retry', () => {
    const body = {
      error: {
        message: 'You have exceeded your daily request limit for organization. Credit balance exhausted.',
        type: 'insufficient_quota',
        code: 'insufficient_quota',
      },
    };

    const analysis = RateLimitGovernor.analyzeRateLimit(429, body, undefined, 'groq', 'openai/gpt-oss-120b');

    expect(analysis.isRateLimited).toBe(true);
    expect(analysis.isDailyQuota).toBe(true);
    expect(analysis.isPerMinute).toBe(false);
    expect(analysis.shouldAutoRetry).toBe(false); // Do not retry storm when daily quota exhausted
  });

  it('calculates bounded exponential backoff with jitter (max 30s)', () => {
    const delay1 = RateLimitGovernor.calculateBackoffDelayMs(1, 5);
    expect(delay1).toBeGreaterThanOrEqual(5000);
    expect(delay1).toBeLessThanOrEqual(5600);

    const delayLarge = RateLimitGovernor.calculateBackoffDelayMs(10, 45);
    expect(delayLarge).toBeLessThanOrEqual(30000); // Clamped to 30s max
  });

  it('classifies Groq 429 error containing settings/billing URL as RATE_LIMIT_EXCEEDED (not BILLING_PAYMENT_REQUIRED)', () => {
    const errorBody = {
      error: {
        message: "Rate limit reached for model 'openai/gpt-oss-120b' in organization 'org_01m4efq3rqek082ea2sc3hf6py' service tier 'on_demand' on tokens per minute (TPM): Limit 8000, Used 5713, Requested 4321. Please try again in 15.25499999s. Need more tokens? Upgrade to Dev Tier today at https://console.groq.com/settings/billing",
        type: 'tokens',
        code: 'rate_limit_exceeded',
      },
    };

    const classified = classifyAIError('groq', 'openai/gpt-oss-120b', 429, errorBody);

    expect(classified.code).toBe('RATE_LIMIT_EXCEEDED');
    expect(classified.rateLimit?.limitType).toBe('tokens');
    expect(classified.retryable).toBe(true);
    expect(classified.rateLimit?.cooldownSeconds).toBe(16); // ceil(15.255)
  });

  it('strictly classifies non-retryable client errors (401, 403, 400) and marks retryable as false', () => {
    const err401 = classifyAIError('groq', 'openai/gpt-oss-120b', 401, { error: { message: 'Invalid API Key' } });
    expect(err401.code).toBe('AUTH_INVALID_KEY');
    expect(err401.retryable).toBe(false);

    const err403 = classifyAIError('groq', 'openai/gpt-oss-120b', 403, { error: { message: 'Forbidden country/IP' } });
    expect(err403.code).toBe('AUTH_FORBIDDEN');
    expect(err403.retryable).toBe(false);

    const err400 = classifyAIError('groq', 'openai/gpt-oss-120b', 400, { error: { message: 'Bad Request' } });
    expect(err400.retryable).toBe(false);
  });
});
