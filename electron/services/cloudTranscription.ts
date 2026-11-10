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
  text: string;
  language?: string;
  duration?: number;
  segments?: Array<{ start: number; end: number; text: string }>;
}

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

export async function transcribeCloudAudio(
  request: CloudTranscriptionRequest,
  apiKey: string,
  signal: AbortSignal
): Promise<CloudTranscriptionResult> {
  const cleanKey = apiKey.trim();
  if (!cleanKey) {
    throw new Error(`[${'AUTH_INVALID_KEY'}] No ${request.provider.toUpperCase()} API key is saved.`);
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
    const detail = await response.text().catch(() => '');
    const safeDetail = redactSensitiveData(detail).slice(0, 500);
    const code = classifyTranscriptionStatus(response.status);
    throw new Error(
      safeDetail
        ? `[${code}] Transcription provider returned HTTP ${response.status}: ${safeDetail}`
        : `[${code}] Transcription provider returned HTTP ${response.status}.`
    );
  }

  const data = (await response.json()) as Record<string, unknown>;
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
