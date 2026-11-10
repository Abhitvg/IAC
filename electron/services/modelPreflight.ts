import { redactSensitiveData } from './security';

export type CloudAIProvider = 'groq' | 'openai' | 'openrouter';

export interface CloudModelPreflightResult {
  valid: boolean;
  code?: string;
  message?: string;
  latencyMs?: number;
}

const PROVIDER_ENDPOINTS: Record<CloudAIProvider, string> = {
  groq: 'https://api.groq.com/openai/v1/chat/completions',
  openai: 'https://api.openai.com/v1/chat/completions',
  openrouter: 'https://openrouter.ai/api/v1/chat/completions',
};

function classifyStatus(status: number): string {
  if (status === 401 || status === 403) return 'AUTH_INVALID_KEY';
  if (status === 404) return 'MODEL_NOT_FOUND';
  if (status === 429) return 'RATE_LIMITED';
  if (status >= 500) return 'PROVIDER_UNAVAILABLE';
  return 'PREFLIGHT_FAILED';
}

export async function validateCloudModelPreflight(
  provider: CloudAIProvider,
  model: string,
  apiKey: string
): Promise<CloudModelPreflightResult> {
  const cleanKey = apiKey.trim();
  if (!cleanKey) {
    return {
      valid: false,
      code: 'AUTH_INVALID_KEY',
      message: `${provider} API key is missing. Configure a key in Settings.`,
    };
  }

  if (provider === 'groq' && !cleanKey.startsWith('gsk_')) {
    return {
      valid: false,
      code: 'AUTH_INVALID_KEY',
      message: 'Invalid Groq API key format. Key must start with "gsk_".',
    };
  }
  if (provider === 'openai' && !cleanKey.startsWith('sk-')) {
    return {
      valid: false,
      code: 'AUTH_INVALID_KEY',
      message: 'Invalid OpenAI API key format. Key must start with "sk-".',
    };
  }
  if (provider === 'openrouter' && !cleanKey.startsWith('sk-or-v1-')) {
    return {
      valid: false,
      code: 'AUTH_INVALID_KEY',
      message: 'Invalid OpenRouter API key format. Key must start with "sk-or-v1-".',
    };
  }

  const startTime = Date.now();
  try {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${cleanKey}`,
    };
    if (provider === 'openrouter') {
      headers['HTTP-Referer'] = 'ai-interview-assistant';
    }

    const response = await fetch(PROVIDER_ENDPOINTS[provider], {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model,
        messages: [{ role: 'user', content: 'ping' }],
        max_tokens: 1,
      }),
      signal: AbortSignal.timeout(15_000),
    });
    const latencyMs = Date.now() - startTime;

    if (response.ok) return { valid: true, latencyMs };

    const rawBody = await response.text().catch(() => '');
    let detail = rawBody;
    try {
      const parsed = JSON.parse(rawBody);
      detail = typeof parsed === 'string' ? parsed : JSON.stringify(parsed);
    } catch {
      // Keep the raw response text for non-JSON provider errors.
    }

    const safeDetail = redactSensitiveData(detail).slice(0, 250);
    return {
      valid: false,
      code: classifyStatus(response.status),
      message: safeDetail
        ? `Provider returned HTTP ${response.status}: ${safeDetail}`
        : `Provider returned HTTP ${response.status}.`,
      latencyMs,
    };
  } catch (error) {
    const err = error as Error;
    return {
      valid: false,
      code: err.name === 'TimeoutError' || err.name === 'AbortError' ? 'TIMEOUT' : 'NETWORK_ERROR',
      message: redactSensitiveData(err.message || String(error)).slice(0, 250),
      latencyMs: Date.now() - startTime,
    };
  }
}
