import type { CredentialStore } from './credentialStore';
import { redactSensitiveData } from './security';

export type CloudTranscriptionProvider = 'groq' | 'openai';

export interface CloudTranscriptionRequest {
  requestId: string;
  provider: CloudTranscriptionProvider;
  model: string;
  audio: ArrayBuffer;
  language?: string;
  prompt?: string;
}

export interface CloudTranscriptionResult {
  cancelled?: boolean;
  text: string;
  language?: string;
  duration?: number;
  segments?: Array<{ start: number; end: number; text: string }>;
}

const PROVIDER_CONFIG: Record<
  CloudTranscriptionProvider,
  { endpoint: string; model: string; keyPrefix: string }
> = {
  groq: {
    endpoint: 'https://api.groq.com/openai/v1/audio/transcriptions',
    model: 'whisper-large-v3-turbo',
    keyPrefix: 'gsk_',
  },
  openai: {
    endpoint: 'https://api.openai.com/v1/audio/transcriptions',
    model: 'whisper-1',
    keyPrefix: 'sk-',
  },
};

export function isValidCloudTranscriptionRequest(
  value: unknown
): value is CloudTranscriptionRequest {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const request = value as Record<string, unknown>;
  if (
    typeof request.requestId !== 'string' ||
    !/^[a-zA-Z0-9_-]{1,80}$/.test(request.requestId) ||
    (request.provider !== 'groq' && request.provider !== 'openai') ||
    typeof request.model !== 'string' ||
    request.model.length > 100 ||
    !(request.audio instanceof ArrayBuffer) ||
    request.audio.byteLength < 400 ||
    request.audio.byteLength > 25 * 1024 * 1024
  ) {
    return false;
  }
  if (
    request.language !== undefined &&
    (typeof request.language !== 'string' ||
      !/^[a-zA-Z]{2,3}(?:-[a-zA-Z]{2,4})?$/.test(request.language))
  ) {
    return false;
  }
  if (
    request.prompt !== undefined &&
    (typeof request.prompt !== 'string' || request.prompt.length > 1000)
  ) {
    return false;
  }
  return request.model === PROVIDER_CONFIG[request.provider].model;
}

/**
 * Performs cloud speech transcription inside Electron main. Provider keys are
 * resolved here and never cross IPC into Chromium.
 */
export async function transcribeCloudAudio(
  credentialStore: Pick<CredentialStore, 'getKey'>,
  request: CloudTranscriptionRequest,
  signal?: AbortSignal
): Promise<CloudTranscriptionResult> {
  if (!isValidCloudTranscriptionRequest(request)) {
    throw new Error('Invalid cloud transcription request.');
  }

  const providerConfig = PROVIDER_CONFIG[request.provider];
  const apiKey = (await credentialStore.getKey(request.provider))?.trim() || '';
  if (!apiKey || !apiKey.startsWith(providerConfig.keyPrefix)) {
    throw new Error(
      `A valid ${request.provider.toUpperCase()} API key is required for speech transcription.`
    );
  }

  const formData = new FormData();
  formData.append('file', new Blob([request.audio]), 'recording.wav');
  formData.append('model', providerConfig.model);
  formData.append('response_format', 'verbose_json');
  if (request.language) formData.append('language', request.language);
  if (request.prompt) formData.append('prompt', request.prompt);

  const response = await fetch(providerConfig.endpoint, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}` },
    body: formData,
    signal: signal
      ? AbortSignal.any([signal, AbortSignal.timeout(90_000)])
      : AbortSignal.timeout(90_000),
  });

  if (!response.ok) {
    const detail = redactSensitiveData((await response.text().catch(() => '')).slice(0, 1500));
    throw new Error(
      detail
        ? `${request.provider.toUpperCase()} transcription failed (HTTP ${response.status}): ${detail}`
        : `${request.provider.toUpperCase()} transcription failed (HTTP ${response.status}).`
    );
  }

  const data = (await response.json()) as Record<string, unknown>;
  if (typeof data.text !== 'string') {
    throw new Error('Transcription provider returned an invalid response.');
  }

  const segments = Array.isArray(data.segments)
    ? data.segments
        .filter(
          (segment): segment is Record<string, unknown> =>
            Boolean(segment) &&
            typeof segment === 'object' &&
            typeof (segment as Record<string, unknown>).start === 'number' &&
            Number.isFinite((segment as Record<string, unknown>).start) &&
            typeof (segment as Record<string, unknown>).end === 'number' &&
            Number.isFinite((segment as Record<string, unknown>).end) &&
            typeof (segment as Record<string, unknown>).text === 'string'
        )
        .slice(0, 20_000)
        .map((segment) => ({
          start: segment.start as number,
          end: segment.end as number,
          text: (segment.text as string).slice(0, 10_000),
        }))
    : undefined;

  return {
    text: data.text.slice(0, 500_000),
    language: typeof data.language === 'string' ? data.language.slice(0, 20) : undefined,
    duration:
      typeof data.duration === 'number' && Number.isFinite(data.duration)
        ? data.duration
        : undefined,
    segments,
  };
}
