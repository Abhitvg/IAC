import { STTProvider, STTOptions, STTResult } from './types';
import {
  resolveOrMigrateModel,
  getDefaultModelForProvider,
  classifyAIError,
} from '../models/modelRegistry';

export class OpenAIWhisperProvider implements STTProvider {
  public readonly id = 'openai-whisper' as const;
  public readonly name = 'OpenAI Whisper Cloud';
  public readonly isLocal = false;

  constructor(
    private apiKey: string,
    private model: string = getDefaultModelForProvider('openai', 'stt')
  ) {}

  async transcribe(
    audioData: Blob | Buffer | ArrayBuffer,
    options?: STTOptions
  ): Promise<STTResult> {
    const startTime = Date.now();
    const formData = new FormData();

    const blob =
      audioData instanceof Blob ? audioData : new Blob([audioData as any], { type: 'audio/webm' });

    formData.append('file', blob, 'audio.webm');
    formData.append('model', this.model);
    if (options?.language) formData.append('language', options.language);
    if (options?.prompt) formData.append('prompt', options.prompt);
    if (options?.temperature !== undefined)
      formData.append('temperature', String(options.temperature));

    const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: formData,
    });

    if (!response.ok) {
      const err = await response.text();
      throw new Error(`OpenAI Whisper error (${response.status}): ${err}`);
    }

    const data = await response.json();
    const latencyMs = Date.now() - startTime;
    // Whisper costs $0.006 per minute
    const estimatedCostUsd = Math.round((60 / 60) * 0.006 * 1000) / 1000;

    return {
      transcript: data.text || '',
      durationSeconds: data.duration || 5,
      latencyMs,
      estimatedCostUsd,
      providerId: this.id,
    };
  }

  async checkHealth(): Promise<{ ok: boolean; message?: string }> {
    if (!this.apiKey) return { ok: false, message: 'Missing API key' };
    return { ok: true, message: 'OpenAI Whisper ready' };
  }
}

export class GroqWhisperProvider implements STTProvider {
  public readonly id = 'groq-whisper' as const;
  public readonly name = 'Groq Whisper Large v3';
  public readonly isLocal = false;

  constructor(
    private apiKey: string,
    private model: string = getDefaultModelForProvider('groq', 'stt')
  ) {}

  async transcribe(
    audioData: Blob | Buffer | ArrayBuffer,
    options?: STTOptions
  ): Promise<STTResult> {
    const startTime = Date.now();
    const targetModel = resolveOrMigrateModel('groq', this.model, 'stt').resolvedModel;
    const formData = new FormData();

    const blob =
      audioData instanceof Blob ? audioData : new Blob([audioData as any], { type: 'audio/webm' });

    formData.append('file', blob, 'audio.webm');
    formData.append('model', targetModel);
    if (options?.language) formData.append('language', options.language);
    if (options?.prompt) formData.append('prompt', options.prompt);

    const response = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: formData,
    });

    if (!response.ok) {
      const err = await response.text();
      const classified = classifyAIError('groq', targetModel, response.status, err);
      throw classified;
    }

    const data = await response.json();
    const latencyMs = Date.now() - startTime;
    // Groq whisper pricing: ~$0.0005 per audio minute (near zero)
    const estimatedCostUsd = 0.0005;

    return {
      transcript: data.text || '',
      durationSeconds: data.duration || 5,
      latencyMs,
      estimatedCostUsd,
      providerId: this.id,
    };
  }

  async checkHealth(): Promise<{ ok: boolean; message?: string }> {
    if (!this.apiKey) return { ok: false, message: 'Missing API key' };
    return { ok: true, message: 'Groq Whisper ready' };
  }
}

export class LocalWhisperCppProvider implements STTProvider {
  public readonly id = 'local-whisper-cpp' as const;
  public readonly name = 'Local whisper.cpp (Offline)';
  public readonly isLocal = true;

  constructor(private endpoint: string = 'http://127.0.0.1:8080/inference') {}

  async transcribe(
    audioData: Blob | Buffer | ArrayBuffer,
    options?: STTOptions
  ): Promise<STTResult> {
    const startTime = Date.now();

    // Check if local whisper.cpp server is reachable
    const formData = new FormData();
    const blob =
      audioData instanceof Blob ? audioData : new Blob([audioData as any], { type: 'audio/wav' });

    formData.append('file', blob, 'audio.wav');
    if (options?.language) formData.append('language', options.language);

    try {
      const response = await fetch(this.endpoint, {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        throw new Error(`Local whisper.cpp HTTP ${response.status}`);
      }

      const data = await response.json();
      const latencyMs = Date.now() - startTime;

      return {
        transcript: data.text || data.transcription || '',
        durationSeconds: 5,
        latencyMs,
        estimatedCostUsd: 0.0, // Free local compute
        providerId: this.id,
        segments: data.segments,
      };
    } catch (err: any) {
      throw new Error(
        `Local whisper.cpp failed at ${this.endpoint}: ${err.message || String(err)}. Ensure whisper.cpp server is running (./server -m models/ggml-base.bin).`,
        { cause: err }
      );
    }
  }

  async checkHealth(): Promise<{ ok: boolean; message?: string }> {
    try {
      const base = this.endpoint.replace(/\/inference$/, '');
      const res = await fetch(base, { method: 'GET' });
      if (res.ok) {
        return { ok: true, message: 'Local whisper.cpp server running' };
      }
      return { ok: false, message: `whisper.cpp returned status ${res.status}` };
    } catch {
      return { ok: false, message: `whisper.cpp not reachable at ${this.endpoint}` };
    }
  }
}

export class STTManager {
  private providers: Map<string, STTProvider> = new Map();
  private primaryId: string = 'groq-whisper';

  constructor(primaryId: string = 'groq-whisper') {
    this.primaryId = primaryId;
  }

  public register(provider: STTProvider): void {
    this.providers.set(provider.id, provider);
  }

  public async transcribeWithFallback(
    audioData: Blob | Buffer | ArrayBuffer,
    options?: STTOptions
  ): Promise<STTResult> {
    const order = [this.primaryId, 'groq-whisper', 'openai-whisper', 'local-whisper-cpp'].filter(
      (id, idx, arr) => arr.indexOf(id) === idx && this.providers.has(id)
    );

    let lastError: Error | null = null;

    for (const id of order) {
      const p = this.providers.get(id);
      if (!p) continue;
      try {
        return await p.transcribe(audioData, options);
      } catch (err: any) {
        lastError = err;
        console.warn(
          `[STTManager] ${id} transcription failed: ${err.message}. Trying next fallback...`
        );
      }
    }

    throw new Error(
      `All STT transcription providers failed. Last error: ${lastError?.message || 'Unknown'}`
    );
  }
}
