export interface LLMMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface LLMRequestOptions {
  model?: string;
  temperature?: number;
  maxTokens?: number;
  stream?: boolean;
  onToken?: (token: string) => void;
  signal?: AbortSignal;
}

export interface LLMResponse {
  text: string;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  estimatedCostUsd: number;
  latencyMs: number;
  providerId: string;
  model: string;
}

export interface LLMProvider {
  readonly id: 'groq' | 'openai' | 'openrouter' | 'ollama';
  readonly name: string;
  readonly isLocal: boolean;
  complete(messages: LLMMessage[], options?: LLMRequestOptions): Promise<LLMResponse>;
  stream(messages: LLMMessage[], options: LLMRequestOptions): Promise<LLMResponse>;
  checkHealth(): Promise<{ ok: boolean; message?: string }>;
}

export interface STTOptions {
  language?: string;
  prompt?: string;
  temperature?: number;
}

export interface STTResult {
  transcript: string;
  durationSeconds: number;
  latencyMs: number;
  estimatedCostUsd: number;
  providerId: string;
  segments?: Array<{ start: number; end: number; text: string }>;
}

export interface STTProvider {
  readonly id: 'openai-whisper' | 'groq-whisper' | 'local-whisper-cpp';
  readonly name: string;
  readonly isLocal: boolean;
  transcribe(audioData: Blob | Buffer | ArrayBuffer, options?: STTOptions): Promise<STTResult>;
  checkHealth(): Promise<{ ok: boolean; message?: string }>;
}

export interface TTSOptions {
  voice?: string;
  speed?: number;
  pitch?: number;
}

export interface TTSResult {
  audioUrl?: string;
  audioBuffer?: ArrayBuffer;
  durationSeconds: number;
  latencyMs: number;
  providerId: string;
}

export interface TTSProvider {
  readonly id: 'browser-speech' | 'piper-local' | 'kokoro-local';
  readonly name: string;
  readonly isLocal: boolean;
  synthesize(text: string, options?: TTSOptions): Promise<TTSResult>;
  checkHealth(): Promise<{ ok: boolean; message?: string }>;
}

export function calculateEstimatedCost(
  providerId: string,
  promptTokens: number,
  completionTokens: number
): number {
  if (providerId === 'ollama' || providerId === 'local-whisper-cpp' || providerId === 'piper-local' || providerId === 'kokoro-local' || providerId === 'browser-speech') {
    return 0.0;
  }

  // Rates per 1,000,000 tokens
  let promptRatePerMillion = 0.50;
  let completionRatePerMillion = 0.80;

  if (providerId === 'openai') {
    // GPT-4o-mini rates
    promptRatePerMillion = 0.15;
    completionRatePerMillion = 0.60;
  } else if (providerId === 'groq') {
    promptRatePerMillion = 0.59;
    completionRatePerMillion = 0.79;
  } else if (providerId === 'openrouter') {
    promptRatePerMillion = 0.50;
    completionRatePerMillion = 0.80;
  }

  const cost =
    (promptTokens / 1_000_000) * promptRatePerMillion +
    (completionTokens / 1_000_000) * completionRatePerMillion;

  return Math.round(cost * 1_000_000) / 1_000_000;
}
