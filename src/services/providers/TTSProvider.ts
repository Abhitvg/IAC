import { TTSProvider, TTSOptions, TTSResult } from './types';

export class BrowserSpeechTTSProvider implements TTSProvider {
  public readonly id = 'browser-speech' as const;
  public readonly name = 'Browser Native Speech (Offline)';
  public readonly isLocal = true;

  async synthesize(text: string, options?: TTSOptions): Promise<TTSResult> {
    const startTime = Date.now();
    if (typeof window === 'undefined' || !window.speechSynthesis) {
      throw new Error('Web Speech API not supported in this environment');
    }

    return new Promise((resolve, reject) => {
      const utterance = new SpeechSynthesisUtterance(text);
      if (options?.speed) utterance.rate = options.speed;
      if (options?.pitch) utterance.pitch = options.pitch;

      utterance.onend = () => {
        const latencyMs = Date.now() - startTime;
        resolve({
          durationSeconds: Math.max(1, text.split(' ').length / 2.5),
          latencyMs,
          providerId: this.id,
        });
      };

      utterance.onerror = (e) => {
        reject(new Error(`Speech synthesis error: ${e.error}`));
      };

      window.speechSynthesis.speak(utterance);
    });
  }

  async checkHealth(): Promise<{ ok: boolean; message?: string }> {
    const supported = typeof window !== 'undefined' && Boolean(window.speechSynthesis);
    return {
      ok: supported,
      message: supported ? 'Web Speech API ready' : 'Web Speech API not available',
    };
  }
}

export class PiperLocalTTSProvider implements TTSProvider {
  public readonly id = 'piper-local' as const;
  public readonly name = 'Piper Local Neural TTS (Offline)';
  public readonly isLocal = true;

  constructor(private endpoint: string = 'http://127.0.0.1:5000') {}

  async synthesize(text: string, _options?: TTSOptions): Promise<TTSResult> {
    const startTime = Date.now();
    const base = this.endpoint.replace(/\/+$/, '');
    const url = `${base}/`;

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain' },
        body: text,
      });

      if (!response.ok) {
        throw new Error(`Piper TTS HTTP ${response.status}`);
      }

      const audioBuffer = await response.arrayBuffer();
      const latencyMs = Date.now() - startTime;

      return {
        audioBuffer,
        durationSeconds: Math.max(1, text.split(' ').length / 2.5),
        latencyMs,
        providerId: this.id,
      };
    } catch (err: any) {
      throw new Error(`Piper local TTS failed at ${this.endpoint}: ${err.message || String(err)}`, { cause: err });
    }
  }

  async checkHealth(): Promise<{ ok: boolean; message?: string }> {
    try {
      const res = await fetch(this.endpoint, { method: 'GET' });
      return { ok: res.ok, message: res.ok ? 'Piper daemon running' : `Piper returned ${res.status}` };
    } catch {
      return { ok: false, message: `Piper daemon not reachable at ${this.endpoint}` };
    }
  }
}

export class KokoroLocalTTSProvider implements TTSProvider {
  public readonly id = 'kokoro-local' as const;
  public readonly name = 'Kokoro Local Neural TTS (Offline)';
  public readonly isLocal = true;

  constructor(private endpoint: string = 'http://127.0.0.1:8880/v1/audio/speech') {}

  async synthesize(text: string, options?: TTSOptions): Promise<TTSResult> {
    const startTime = Date.now();

    try {
      const response = await fetch(this.endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'kokoro',
          input: text,
          voice: options?.voice || 'af_heart',
          speed: options?.speed || 1.0,
        }),
      });

      if (!response.ok) {
        throw new Error(`Kokoro TTS HTTP ${response.status}`);
      }

      const audioBuffer = await response.arrayBuffer();
      const latencyMs = Date.now() - startTime;

      return {
        audioBuffer,
        durationSeconds: Math.max(1, text.split(' ').length / 2.5),
        latencyMs,
        providerId: this.id,
      };
    } catch (err: any) {
      throw new Error(`Kokoro local TTS failed at ${this.endpoint}: ${err.message || String(err)}`, { cause: err });
    }
  }

  async checkHealth(): Promise<{ ok: boolean; message?: string }> {
    try {
      const base = this.endpoint.replace(/\/v1\/audio\/speech$/, '');
      const res = await fetch(`${base}/health`, { method: 'GET' });
      return { ok: res.ok, message: res.ok ? 'Kokoro daemon running' : `Kokoro returned ${res.status}` };
    } catch {
      return { ok: false, message: `Kokoro daemon not reachable at ${this.endpoint}` };
    }
  }
}

export class TTSManager {
  private providers: Map<string, TTSProvider> = new Map();
  private primaryId: string = 'browser-speech';

  constructor(primaryId: string = 'browser-speech') {
    this.primaryId = primaryId;
  }

  public register(provider: TTSProvider): void {
    this.providers.set(provider.id, provider);
  }

  public async speakWithFallback(text: string, options?: TTSOptions): Promise<TTSResult> {
    const order = [this.primaryId, 'piper-local', 'kokoro-local', 'browser-speech']
      .filter((id, idx, arr) => arr.indexOf(id) === idx && this.providers.has(id));

    let lastError: Error | null = null;

    for (const id of order) {
      const p = this.providers.get(id);
      if (!p) continue;
      try {
        return await p.synthesize(text, options);
      } catch (err: any) {
        lastError = err;
        console.warn(`[TTSManager] ${id} synthesis failed: ${err.message}. Trying next fallback...`);
      }
    }

    throw new Error(`All TTS providers failed. Last error: ${lastError?.message || 'Unknown'}`);
  }
}
