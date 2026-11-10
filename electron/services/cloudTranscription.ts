import { redactSensitiveData } from './security';

export type CloudTranscriptionProvider = 'groq' | 'openai';

export interface CloudTranscriptionRequest {
  requestId: string;
  provider: CloudTranscriptionProvider;
  model: string;
  audio: Uint8Array;
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

export const MAX_CLOUD_TRANSCRIPTION_RESPONSE_BYTES = 4 * 1024 * 1024;
const MAX_CLOUD_TRANSCRIPTION_ERROR_BYTES = 64 * 1024;

const TRANSCRIPTION_ENDPOINTS: Record<CloudTranscriptionProvider, string> = {
  groq: 'https://api.groq.com/openai/v1/audio/transcriptions',
  openai: 'https://api.openai.com/v1/audio/transcriptions',
};

function classifyTranscriptionStatus(status: number): string {
  if (status === 401 || status === 403) return 'AUTH_INVALID_KEY';
  if (status === 404) return 'MODEL_NOT_FOUND';
  if (status === 429) return 'RATE_LIMITED';
  if (status >= 500) return 'PROVIDER_UNAVAILABLE';
  return 'TRANSCRIPTION_FAILED';
}

async function readResponseTextLimited(response: Response, maxBytes: number): Promise<string> {
  if (!response.body) return '';
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let bytesRead = 0;
  let result = '';
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytesRead += value.byteLength;
      if (bytesRead > maxBytes) {
        try {
          await reader.cancel();
        } catch {
          // Preserve the size-limit error even if the provider stream cannot be cancelled.
        }
        throw new Error(`Transcription provider response exceeded the ${maxBytes}-byte limit.`);
      }
      result += decoder.decode(value, { stream: true });
    }
    return result + decoder.decode();
  } finally {
    reader.releaseLock();
  }
}

export async function transcribeCloudAudio(
  request: CloudTranscriptionRequest,
  apiKey: string,
  signal: AbortSignal
): Promise<CloudTranscriptionResult> {
  const cleanKey = apiKey.trim();
  if (!cleanKey) {
    throw new Error(
      `[${'AUTH_INVALID_KEY'}] No ${request.provider.toUpperCase()} API key is saved.`
    );
  }
  if (request.provider === 'groq' && !cleanKey.startsWith('gsk_')) {
    throw new Error('[AUTH_INVALID_KEY] A valid Groq API key is required for transcription.');
  }
  if (request.provider === 'openai' && !cleanKey.startsWith('sk-')) {
    throw new Error('[AUTH_INVALID_KEY] A valid OpenAI API key is required for transcription.');
  }

  const formData = new FormData();
  const audioBuffer = Uint8Array.from(request.audio).buffer as ArrayBuffer;
  formData.append('file', new Blob([audioBuffer], { type: 'audio/wav' }), 'recording.wav');
  formData.append('model', request.model);
  formData.append('response_format', 'verbose_json');
  if (request.language) formData.append('language', request.language);
  if (request.prompt) formData.append('prompt', request.prompt);

  const timeoutSignal = AbortSignal.timeout(60_000);
  const requestSignal = AbortSignal.any([signal, timeoutSignal]);
  const response = await fetch(TRANSCRIPTION_ENDPOINTS[request.provider], {
    method: 'POST',
    headers: { Authorization: `Bearer ${cleanKey}` },
    body: formData,
    signal: requestSignal,
  });

  if (!response.ok) {
    const detail = await readResponseTextLimited(response, MAX_CLOUD_TRANSCRIPTION_ERROR_BYTES).catch(() => '');
    const safeDetail = redactSensitiveData(detail).slice(0, 500);
    const code = classifyTranscriptionStatus(response.status);
    throw new Error(
      safeDetail
        ? `[${code}] Transcription provider returned HTTP ${response.status}: ${safeDetail}`
        : `[${code}] Transcription provider returned HTTP ${response.status}.`
    );
  }

  const responseText = await readResponseTextLimited(response, MAX_CLOUD_TRANSCRIPTION_RESPONSE_BYTES);
  let data: Record<string, unknown>;
  try {
    data = JSON.parse(responseText) as Record<string, unknown>;
  } catch {
    throw new Error('Transcription provider returned an invalid JSON response.');
  }
  const segments = Array.isArray(data.segments)
    ? data.segments
        .filter(
          (segment): segment is Record<string, unknown> =>
            Boolean(segment) && typeof segment === 'object'
        )
        .map((segment) => ({
          start: Number(segment.start) || 0,
          end: Number(segment.end) || 0,
          text: String(segment.text || ''),
        }))
    : undefined;

  return {
    text: String(data.text || ''),
    language: typeof data.language === 'string' ? data.language : undefined,
    duration: typeof data.duration === 'number' ? data.duration : undefined,
    segments,
  };
}
