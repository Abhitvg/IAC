import {
  LLMProvider,
  LLMMessage,
  LLMRequestOptions,
  LLMResponse,
  calculateEstimatedCost,
} from './types';

export class GroqProvider implements LLMProvider {
  public readonly id = 'groq' as const;
  public readonly name = 'Groq Cloud';
  public readonly isLocal = false;

  constructor(
    private apiKey: string,
    private defaultModel: string = 'openai/gpt-oss-120b'
  ) { }

  async complete(messages: LLMMessage[], options?: LLMRequestOptions): Promise<LLMResponse> {
    const startTime = Date.now();
    const model = options?.model || this.defaultModel;

    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages,
        temperature: options?.temperature ?? 0.2,
        max_tokens: options?.maxTokens ?? 1500,
      }),
      signal: options?.signal,
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Groq API error (${response.status}): ${errText}`);
    }

    const data = await response.json();
    const text = data.choices?.[0]?.message?.content || '';
    const promptTokens =
      data.usage?.prompt_tokens || Math.ceil(messages.map((m) => m.content).join(' ').length / 4);
    const completionTokens = data.usage?.completion_tokens || Math.ceil(text.length / 4);
    const totalTokens = promptTokens + completionTokens;
    const latencyMs = Date.now() - startTime;

    return {
      text,
      promptTokens,
      completionTokens,
      totalTokens,
      estimatedCostUsd: calculateEstimatedCost(this.id, promptTokens, completionTokens),
      latencyMs,
      providerId: this.id,
      model,
    };
  }

  async stream(messages: LLMMessage[], options: LLMRequestOptions): Promise<LLMResponse> {
    // For streaming with callback
    const res = await this.complete(messages, options);
    if (options.onToken) {
      options.onToken(res.text);
    }
    return res;
  }

  async checkHealth(): Promise<{ ok: boolean; message?: string }> {
    if (!this.apiKey) return { ok: false, message: 'Missing API key' };
    return { ok: true, message: 'Groq connection ready' };
  }
}

export class OpenAIProvider implements LLMProvider {
  public readonly id = 'openai' as const;
  public readonly name = 'OpenAI Cloud';
  public readonly isLocal = false;

  constructor(
    private apiKey: string,
    private defaultModel: string = 'gpt-4o-mini'
  ) { }

  async complete(messages: LLMMessage[], options?: LLMRequestOptions): Promise<LLMResponse> {
    const startTime = Date.now();
    const model = options?.model || this.defaultModel;

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages,
        temperature: options?.temperature ?? 0.2,
        max_tokens: options?.maxTokens ?? 1500,
      }),
      signal: options?.signal,
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`OpenAI API error (${response.status}): ${errText}`);
    }

    const data = await response.json();
    const text = data.choices?.[0]?.message?.content || '';
    const promptTokens = data.usage?.prompt_tokens || 100;
    const completionTokens = data.usage?.completion_tokens || 100;
    const totalTokens = promptTokens + completionTokens;
    const latencyMs = Date.now() - startTime;

    return {
      text,
      promptTokens,
      completionTokens,
      totalTokens,
      estimatedCostUsd: calculateEstimatedCost(this.id, promptTokens, completionTokens),
      latencyMs,
      providerId: this.id,
      model,
    };
  }

  async stream(messages: LLMMessage[], options: LLMRequestOptions): Promise<LLMResponse> {
    const res = await this.complete(messages, options);
    if (options.onToken) {
      options.onToken(res.text);
    }
    return res;
  }

  async checkHealth(): Promise<{ ok: boolean; message?: string }> {
    if (!this.apiKey) return { ok: false, message: 'Missing API key' };
    return { ok: true, message: 'OpenAI connection ready' };
  }
}

export class OpenRouterProvider implements LLMProvider {
  public readonly id = 'openrouter' as const;
  public readonly name = 'OpenRouter';
  public readonly isLocal = false;

  constructor(
    private apiKey: string,
    private defaultModel: string = 'meta-llama/llama-3.3-70b-instruct'
  ) { }

  async complete(messages: LLMMessage[], options?: LLMRequestOptions): Promise<LLMResponse> {
    const startTime = Date.now();
    const model = options?.model || this.defaultModel;

    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
        'HTTP-Referer': 'https://github.com/ai-interview-assistant',
        'X-Title': 'AI Interview Practice Gym',
      },
      body: JSON.stringify({
        model,
        messages,
        temperature: options?.temperature ?? 0.2,
        max_tokens: options?.maxTokens ?? 1500,
      }),
      signal: options?.signal,
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`OpenRouter API error (${response.status}): ${errText}`);
    }

    const data = await response.json();
    const text = data.choices?.[0]?.message?.content || '';
    const promptTokens = data.usage?.prompt_tokens || 100;
    const completionTokens = data.usage?.completion_tokens || 100;
    const totalTokens = promptTokens + completionTokens;
    const latencyMs = Date.now() - startTime;

    return {
      text,
      promptTokens,
      completionTokens,
      totalTokens,
      estimatedCostUsd: calculateEstimatedCost(this.id, promptTokens, completionTokens),
      latencyMs,
      providerId: this.id,
      model,
    };
  }

  async stream(messages: LLMMessage[], options: LLMRequestOptions): Promise<LLMResponse> {
    const res = await this.complete(messages, options);
    if (options.onToken) {
      options.onToken(res.text);
    }
    return res;
  }

  async checkHealth(): Promise<{ ok: boolean; message?: string }> {
    if (!this.apiKey) return { ok: false, message: 'Missing API key' };
    return { ok: true, message: 'OpenRouter connection ready' };
  }
}

export class OllamaProvider implements LLMProvider {
  public readonly id = 'ollama' as const;
  public readonly name = 'Ollama (Local Offline)';
  public readonly isLocal = true;

  constructor(
    private endpoint: string = 'http://127.0.0.1:11434',
    private defaultModel: string = 'llama3.2:1b'
  ) { }

  async complete(messages: LLMMessage[], options?: LLMRequestOptions): Promise<LLMResponse> {
    const startTime = Date.now();
    const model = options?.model || this.defaultModel;

    const base = this.endpoint.replace(/\/+$/, '');
    const url = `${base}/v1/chat/completions`;

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        messages,
        temperature: options?.temperature ?? 0.2,
        max_tokens: options?.maxTokens ?? 1500,
      }),
      signal: options?.signal,
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Ollama error (${response.status}): ${errText}`);
    }

    const data = await response.json();
    const text = data.choices?.[0]?.message?.content || '';
    const promptTokens =
      data.usage?.prompt_tokens || Math.ceil(messages.map((m) => m.content).join(' ').length / 4);
    const completionTokens = data.usage?.completion_tokens || Math.ceil(text.length / 4);
    const totalTokens = promptTokens + completionTokens;
    const latencyMs = Date.now() - startTime;

    return {
      text,
      promptTokens,
      completionTokens,
      totalTokens,
      estimatedCostUsd: 0.0, // 100% free local compute
      latencyMs,
      providerId: this.id,
      model,
    };
  }

  async stream(messages: LLMMessage[], options: LLMRequestOptions): Promise<LLMResponse> {
    const res = await this.complete(messages, options);
    if (options.onToken) {
      options.onToken(res.text);
    }
    return res;
  }

  async checkHealth(): Promise<{ ok: boolean; message?: string }> {
    try {
      const base = this.endpoint.replace(/\/+$/, '');
      const res = await fetch(`${base}/api/tags`, { method: 'GET' });
      if (res.ok) {
        return { ok: true, message: 'Ollama local daemon running' };
      }
      return { ok: false, message: `Ollama returned HTTP ${res.status}` };
    } catch (err: any) {
      return {
        ok: false,
        message: `Could not reach Ollama at ${this.endpoint}: ${err.message || String(err)}`,
      };
    }
  }
}

export interface SessionResourceUsage {
  totalPromptTokens: number;
  totalCompletionTokens: number;
  totalTokens: number;
  totalEstimatedCostUsd: number;
  averageLatencyMs: number;
  requestCount: number;
  providerFallbackCount: number;
}

/**
 * Manages LLM execution with token budgets, per-session cost tracking, and graceful fallback.
 */
export class LLMManager {
  private providers: Map<string, LLMProvider> = new Map();
  private primaryProviderId: string = 'groq';
  private tokenBudgetPerSession: number = 25000;
  private sessionUsage: SessionResourceUsage = {
    totalPromptTokens: 0,
    totalCompletionTokens: 0,
    totalTokens: 0,
    totalEstimatedCostUsd: 0,
    averageLatencyMs: 0,
    requestCount: 0,
    providerFallbackCount: 0,
  };

  constructor(primaryProviderId: string = 'groq', tokenBudget: number = 25000) {
    this.primaryProviderId = primaryProviderId;
    this.tokenBudgetPerSession = tokenBudget;
  }

  public registerProvider(provider: LLMProvider): void {
    this.providers.set(provider.id, provider);
  }

  public setPrimaryProvider(providerId: string): void {
    this.primaryProviderId = providerId;
  }

  public getSessionUsage(): SessionResourceUsage {
    return { ...this.sessionUsage };
  }

  public resetSessionUsage(): void {
    this.sessionUsage = {
      totalPromptTokens: 0,
      totalCompletionTokens: 0,
      totalTokens: 0,
      totalEstimatedCostUsd: 0,
      averageLatencyMs: 0,
      requestCount: 0,
      providerFallbackCount: 0,
    };
  }

  public async executeWithFallback(
    messages: LLMMessage[],
    options?: LLMRequestOptions
  ): Promise<LLMResponse> {
    if (this.sessionUsage.totalTokens >= this.tokenBudgetPerSession) {
      throw new Error(
        `Token budget exceeded: Session used ${this.sessionUsage.totalTokens} tokens (budget: ${this.tokenBudgetPerSession}).`
      );
    }

    const fallbackOrder = [this.primaryProviderId, 'groq', 'openai', 'openrouter', 'ollama'].filter(
      (id, idx, arr) => arr.indexOf(id) === idx && this.providers.has(id)
    );

    let lastError: Error | null = null;

    for (let i = 0; i < fallbackOrder.length; i++) {
      const providerId = fallbackOrder[i];
      const provider = this.providers.get(providerId);
      if (!provider) continue;

      try {
        const response = await provider.complete(messages, options);

        // Update session usage
        this.sessionUsage.totalPromptTokens += response.promptTokens;
        this.sessionUsage.totalCompletionTokens += response.completionTokens;
        this.sessionUsage.totalTokens += response.totalTokens;
        this.sessionUsage.totalEstimatedCostUsd =
          Math.round(
            (this.sessionUsage.totalEstimatedCostUsd + response.estimatedCostUsd) * 1_000_000
          ) / 1_000_000;

        const prevTotalLatency =
          this.sessionUsage.averageLatencyMs * this.sessionUsage.requestCount;
        this.sessionUsage.requestCount += 1;
        this.sessionUsage.averageLatencyMs = Math.round(
          (prevTotalLatency + response.latencyMs) / this.sessionUsage.requestCount
        );

        if (i > 0) {
          this.sessionUsage.providerFallbackCount += 1;
        }

        return response;
      } catch (err: any) {
        lastError = err;
        console.warn(
          `[LLMManager] Provider ${providerId} failed: ${err.message}. Trying next fallback...`
        );
      }
    }

    throw new Error(
      `All configured LLM providers failed. Last error: ${lastError?.message || 'Unknown error'}`
    );
  }
}
