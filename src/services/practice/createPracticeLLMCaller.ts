import type { AppSettings, ElectronAPI } from '../../types';

type PracticeCloudApi = Pick<ElectronAPI, 'getSettings' | 'startCloudLLMStream'>;

const SUPPORTED_CLOUD_PROVIDERS = ['groq', 'openai', 'openrouter'] as const;
let requestSequence = 0;

export function createPracticeLLMCaller(
  api: PracticeCloudApi
): (prompt: string, _model: string) => Promise<string> {
  return async (prompt: string, _model: string): Promise<string> => {
    if (typeof prompt !== 'string' || prompt.trim().length === 0 || prompt.length > 30_000) {
      throw new Error('Practice prompt is empty or exceeds the supported size limit.');
    }

    const settings: AppSettings = await api.getSettings();
    const provider = settings.aiProvider;

    if (!SUPPORTED_CLOUD_PROVIDERS.includes(provider as (typeof SUPPORTED_CLOUD_PROVIDERS)[number])) {
      throw new Error('Mock interviewer AI currently requires Groq, OpenAI, or OpenRouter.');
    }

    const model = (settings.aiModel || '').trim();
    if (!model) {
      throw new Error('No AI model is configured for Mock Gym.');
    }

    requestSequence += 1;
    const result = await api.startCloudLLMStream({
      requestId: `practice-${Date.now()}-${requestSequence}`,
      provider: provider as (typeof SUPPORTED_CLOUD_PROVIDERS)[number],
      model,
      systemPrompt:
        'You are an expert technical interviewer. Follow the supplied instructions exactly and return only the requested response.',
      question: prompt,
      temperature: Math.max(0, Math.min(2, settings.temperature ?? 0.2)),
      maxTokens: Math.max(1, Math.min(1500, Math.floor(settings.maxTokens || 1500))),
      stream: false,
    });

    if (!result.ok) {
      throw new Error(result.body || `AI provider request failed with status ${result.status}.`);
    }
    if (!result.body) {
      throw new Error('AI provider returned an empty response.');
    }

    let payload: { choices?: Array<{ message?: { content?: unknown } }> };
    try {
      payload = JSON.parse(result.body);
    } catch {
      throw new Error('AI provider returned an invalid response payload.');
    }

    const content = payload.choices?.[0]?.message?.content;
    if (typeof content !== 'string' || content.trim().length === 0) {
      throw new Error('AI provider response did not contain generated text.');
    }
    return content;
  };
}
