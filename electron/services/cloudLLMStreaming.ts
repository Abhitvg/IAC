import type { CredentialStore } from './credentialStore';
import { redactSensitiveData } from './security';

export type CloudLLMProvider = 'groq' | 'openai' | 'openrouter';

export interface CloudLLMStreamRequest {
  requestId: string;
  provider: CloudLLMProvider;
  model: string;
  systemPrompt: string;
  question: string;
  temperature: number;
  maxTokens: number;
  stream: boolean;
}

export interface CloudLLMStreamStartResult {
  ok: boolean;
  status: number;
  statusText: string;
  headers: Record<string, string>;
  body?: string;
  usedSecondaryKey?: boolean;
}

const PROVIDER_ENDPOINTS: Record<CloudLLMProvider, string> = {
  groq: 'https://api.groq.com/openai/v1/chat/completions',
  openai: 'https://api.openai.com/v1/chat/completions',
  openrouter: 'https://openrouter.ai/api/v1/chat/completions',
};

export const MAX_CLOUD_LLM_RESPONSE_BYTES = 8 * 1024 * 1024;
const MAX_CLOUD_LLM_ERROR_BYTES = 64 * 1024;

const ALLOWED_RESPONSE_HEADERS = [
  'content-type',
  'retry-after',
  'x-ratelimit-limit-requests',
  'x-ratelimit-limit-tokens',
  'x-ratelimit-remaining-requests',
  'x-ratelimit-remaining-tokens',
  'x-ratelimit-reset-requests',
  'x-ratelimit-reset-tokens',
  'x-request-id',
];

export function validateCloudLLMStreamRequest(value: unknown): value is CloudLLMStreamRequest {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const request = value as Record<string, unknown>;
  return (
    typeof request.requestId === 'string' &&
    /^[a-zA-Z0-9_-]{1,80}$/.test(request.requestId) &&
    (request.provider === 'groq' ||
      request.provider === 'openai' ||
      request.provider === 'openrouter') &&
    typeof request.model === 'string' &&
    /^[a-zA-Z0-9._:/-]{1,160}$/.test(request.model) &&
    typeof request.systemPrompt === 'string' &&
    request.systemPrompt.length > 0 &&
    request.systemPrompt.length <= 80_000 &&
    typeof request.question === 'string' &&
    request.question.length > 0 &&
    request.question.length <= 30_000 &&
    typeof request.temperature === 'number' &&
    Number.isFinite(request.temperature) &&
    request.temperature >= 0 &&
    request.temperature <= 2 &&
    Number.isInteger(request.maxTokens) &&
    (request.maxTokens as number) >= 1 &&
    (request.maxTokens as number) <= 8_000 &&
    typeof request.stream === 'boolean'
  );
}

function isValidProviderKey(provider: CloudLLMProvider, key: string): boolean {
  if (provider === 'groq') return key.startsWith('gsk_');
  if (provider === 'openrouter') return key.startsWith('sk-or-v1-');
  return key.startsWith('sk-');
}

function getSafeResponseHeaders(headers: Headers): Record<string, string> {
  const result: Record<string, string> = {};
  for (const name of ALLOWED_RESPONSE_HEADERS) {
    const value = headers.get(name);
    if (value) result[name] = value;
  }
  return result;
}

async function readResponseTextLimited(response: Response, maxBytes: number): Promise<string> {
  if (!response.body) return '';

  const reader = response.body.getReader();
  const decoder = new TextDecoder('utf-8');
  let totalBytes = 0;
  let text = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      totalBytes += value.byteLength;
      if (totalBytes > maxBytes) {
        await reader.cancel();
        throw new Error(`Provider response exceeded maximum size limit of ${maxBytes} bytes.`);
      }
      text += decoder.decode(value, { stream: true });
    }
    return text + decoder.decode();
  } finally {
    try {
      reader.releaseLock();
    } catch {
      // The response stream may already have released its lock.
    }
  }
}

function isDailyQuotaError(body: string): boolean {
  return /daily quota|per day|daily limit|quota exceeded|billing limit/i.test(body);
}

async function createProviderRequest(
  request: CloudLLMStreamRequest,
  apiKey: string,
  signal: AbortSignal
): Promise<Response> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${apiKey}`,
  };
  if (request.provider === 'openrouter') {
    headers['HTTP-Referer'] = 'ai-interview-assistant';
  }

  return fetch(PROVIDER_ENDPOINTS[request.provider], {
    method: 'POST',
    headers,
    body: JSON.stringify({
      model: request.model,
      messages: [
        { role: 'system', content: request.systemPrompt },
        { role: 'user', content: request.question },
      ],
      stream: request.stream,
      temperature: request.temperature,
      max_tokens: request.maxTokens,
    }),
    signal: AbortSignal.any([signal, AbortSignal.timeout(75_000)]),
  });
}

/**
 * Resolve credentials and start the provider request in Electron main.
 * Only generated stream chunks and sanitized response metadata cross IPC.
 */
export async function startCloudLLMStream(
  request: CloudLLMStreamRequest,
  credentialStore: Pick<CredentialStore, 'getKey'>,
  signal: AbortSignal,
  send: (channel: string, payload: Record<string, unknown>) => void
): Promise<CloudLLMStreamStartResult> {
  let apiKey = (await credentialStore.getKey(request.provider))?.trim() || '';
  let usedSecondaryKey = false;

  if (request.provider === 'groq' && !apiKey) {
    apiKey = (await credentialStore.getKey('groq-secondary'))?.trim() || '';
    usedSecondaryKey = Boolean(apiKey);
  }

  if (!apiKey || !isValidProviderKey(request.provider, apiKey)) {
    throw new Error(
      `[AUTH_INVALID_KEY] A valid ${request.provider.toUpperCase()} API key is required.`
    );
  }

  let response = await createProviderRequest(request, apiKey, signal);

  if (request.provider === 'groq' && response.status === 429 && !usedSecondaryKey) {
    const primaryErrorBody = await readResponseTextLimited(response, MAX_CLOUD_LLM_ERROR_BYTES).catch(() => '');
    if (!isDailyQuotaError(primaryErrorBody)) {
      const secondaryKey = (await credentialStore.getKey('groq-secondary'))?.trim() || '';
      if (secondaryKey && secondaryKey !== apiKey && isValidProviderKey('groq', secondaryKey)) {
        response = await createProviderRequest(request, secondaryKey, signal);
        usedSecondaryKey = true;
      } else {
        return {
          ok: false,
          status: 429,
          statusText: response.statusText,
          headers: {},
          body: redactSensitiveData(primaryErrorBody).slice(0, 1500),
        };
      }
    } else {
      return {
        ok: false,
        status: 429,
        statusText: response.statusText,
        headers: getSafeResponseHeaders(response.headers),
        body: redactSensitiveData(primaryErrorBody).slice(0, 1500),
      };
    }
  }

  const headers = getSafeResponseHeaders(response.headers);
  if (!response.ok) {
    const body = await response.text().catch(() => '');
    return {
      ok: false,
      status: response.status,
      statusText: response.statusText,
      headers,
      body: redactSensitiveData(body).slice(0, 1500),
      usedSecondaryKey,
    };
  }

  if (!request.stream) {
    return {
      ok: true,
      status: response.status,
      statusText: response.statusText,
      headers,
      body: await readResponseTextLimited(response, MAX_CLOUD_LLM_RESPONSE_BYTES),
      usedSecondaryKey,
    };
  }

  if (!response.body) {
    throw new Error('Provider returned an empty streaming response.');
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder('utf-8');
  void (async () => {
    try {
      let receivedBytes = false;
      let totalBytes = 0;
      const isEventStream = (response.headers.get('content-type') || '')
        .toLowerCase()
        .includes('text/event-stream');
      let pendingSseText = '';
      let receivedSseData = false;

      // Ignore SSE comments and heartbeats; only non-terminal data events count as a response.
      const inspectSseChunk = (chunk: string, flush = false) => {
        pendingSseText += chunk;
        const lines = pendingSseText.split(/\r?\n/);
        pendingSseText = flush ? '' : lines.pop() || '';
        for (const line of lines) {
          if (!line.startsWith('data:')) continue;
          const data = line.slice(5).trim();
          if (data && data !== '[DONE]') receivedSseData = true;
        }
      };

      while (true) {
        if (signal.aborted) throw signal.reason || new Error('AI stream cancelled.');
        const { done, value } = await reader.read();
        if (done) break;
        totalBytes += value.byteLength;
        if (totalBytes > MAX_CLOUD_LLM_RESPONSE_BYTES) {
          throw new Error(
            `Provider streaming response exceeded maximum size limit of ${MAX_CLOUD_LLM_RESPONSE_BYTES} bytes.`
          );
        }
        if (value.byteLength > 0) receivedBytes = true;
        const chunk = decoder.decode(value, { stream: true });
        if (isEventStream && chunk) inspectSseChunk(chunk);
        if (chunk) send('ai:stream-chunk', { requestId: request.requestId, chunk });
      }
      const tail = decoder.decode();
      if (isEventStream) inspectSseChunk(tail, true);
      if (tail) send('ai:stream-chunk', { requestId: request.requestId, chunk: tail });
      if (!receivedBytes || (isEventStream && !receivedSseData)) {
        throw new Error('Provider returned an empty streaming response.');
      }
      send('ai:stream-done', { requestId: request.requestId });
    } catch (error) {
      const aborted = signal.aborted || (error as Error)?.name === 'AbortError';
      send('ai:stream-error', {
        requestId: request.requestId,
        name: aborted ? 'AbortError' : 'Error',
        message: aborted
          ? 'AI generation cancelled.'
          : redactSensitiveData((error as Error)?.message || 'AI stream failed.'),
      });
    } finally {
      try {
        await reader.cancel();
      } catch {
        // The provider may already have closed the stream.
      }
      try {
        reader.releaseLock();
      } catch {
        // The stream may already have released its lock.
      }
    }
  })();

  return {
    ok: true,
    status: response.status,
    statusText: response.statusText,
    headers,
    usedSecondaryKey,
  };
}
