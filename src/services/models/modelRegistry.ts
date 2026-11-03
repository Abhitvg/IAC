/**
 * Authoritative AI Model Registry and Diagnostic Governor
 *
 * Single source of truth for:
 * - Provider definitions and exact API model IDs
 * - Capabilities, input/output modalities, context and token limits
 * - Availability, deprecation, and official replacement mappings
 * - Settings migration and recovery rules
 * - Safe error classification and model fallback enforcement
 * - Model preflight validation and credential-safe diagnostics
 */

export type AIProviderId = 'groq' | 'openai' | 'openrouter' | 'ollama';

export type ModelType = 'llm' | 'stt' | 'tts';

export type ModelCapability =
  | 'chat'
  | 'streaming'
  | 'tools'
  | 'json'
  | 'reasoning'
  | 'multilingual'
  | 'vision'
  | 'transcription';

export type Modality = 'text' | 'audio' | 'image';

export type ModelStatus = 'active' | 'deprecated' | 'retired';

export interface ModelDefinition {
  readonly id: string; // Exact API model ID
  readonly provider: AIProviderId;
  readonly type: ModelType;
  readonly displayName: string;
  readonly capabilities: readonly ModelCapability[];
  readonly inputModalities: readonly Modality[];
  readonly outputModalities: readonly Modality[];
  readonly supportsStreaming: boolean;
  readonly contextWindow?: number;
  readonly maxOutputTokens?: number;
  readonly status: ModelStatus;
  readonly deprecationNotice?: string;
  readonly recommendedReplacement?: string; // Target API model ID
  readonly pricing?: {
    readonly promptCostPer1M: number;
    readonly completionCostPer1M: number;
  };
  readonly isDefault?: boolean;
}

export interface ModelResolutionResult {
  readonly requestedModel: string;
  readonly resolvedModel: string;
  readonly wasMigrated: boolean;
  readonly reason?: string;
  readonly notice?: string;
}

export type AIErrorCode =
  | 'AUTH_INVALID_KEY'
  | 'AUTH_FORBIDDEN'
  | 'BILLING_PAYMENT_REQUIRED'
  | 'QUOTA_EXHAUSTED'
  | 'RATE_LIMIT_EXCEEDED'
  | 'NETWORK_ERROR'
  | 'MODEL_NOT_FOUND'
  | 'MODEL_DECOMMISSIONED'
  | 'SERVER_ERROR'
  | 'PREFLIGHT_FAILED'
  | 'UNKNOWN';

export interface ClassifiedAIError extends Error {
  readonly code: AIErrorCode;
  readonly status?: number;
  readonly isRecoverableByModelFallback: boolean;
  readonly provider: AIProviderId;
  readonly model: string;
  readonly originalErrorDetail?: string;
}

export interface FallbackDiagnosticRecord {
  readonly timestamp: number;
  readonly provider: AIProviderId;
  readonly originalModel: string;
  readonly fallbackModel: string;
  readonly triggerError: {
    readonly code: AIErrorCode;
    readonly status?: number;
    readonly message: string;
  };
  readonly successful: boolean;
}

/**
 * Authoritative Model Catalog
 */
export const MODEL_REGISTRY: readonly ModelDefinition[] = [
  // ==========================================
  // GROQ — Active LLMs
  // ==========================================
  {
    id: 'openai/gpt-oss-120b',
    provider: 'groq',
    type: 'llm',
    displayName: 'GPT-OSS 120B (Recommended — 120B MoE, ~500 tps)',
    capabilities: ['chat', 'streaming', 'tools', 'json', 'reasoning'],
    inputModalities: ['text'],
    outputModalities: ['text'],
    supportsStreaming: true,
    contextWindow: 131072,
    maxOutputTokens: 65536,
    status: 'active',
    isDefault: true,
    pricing: { promptCostPer1M: 0.15, completionCostPer1M: 0.6 },
  },
  {
    id: 'openai/gpt-oss-20b',
    provider: 'groq',
    type: 'llm',
    displayName: 'GPT-OSS 20B (Ultra-fast — 20B MoE, ~1,000 tps)',
    capabilities: ['chat', 'streaming', 'tools', 'json', 'reasoning'],
    inputModalities: ['text'],
    outputModalities: ['text'],
    supportsStreaming: true,
    contextWindow: 131072,
    maxOutputTokens: 65536,
    status: 'active',
    pricing: { promptCostPer1M: 0.075, completionCostPer1M: 0.3 },
  },
  {
    id: 'qwen/qwen3.8-27b',
    provider: 'groq',
    type: 'llm',
    displayName: 'Qwen 3.8 27B (Reasoning & Multilingual Vision)',
    capabilities: ['chat', 'streaming', 'tools', 'json', 'reasoning', 'multilingual', 'vision'],
    inputModalities: ['text', 'image'],
    outputModalities: ['text'],
    supportsStreaming: true,
    contextWindow: 131072,
    maxOutputTokens: 16384,
    status: 'active',
    pricing: { promptCostPer1M: 0.8, completionCostPer1M: 4.0 },
  },
  {
    id: 'allam-2-7b',
    provider: 'groq',
    type: 'llm',
    displayName: 'ALLaM 2 7B',
    capabilities: ['chat', 'streaming', 'json', 'multilingual'],
    inputModalities: ['text'],
    outputModalities: ['text'],
    supportsStreaming: true,
    contextWindow: 4096,
    maxOutputTokens: 4096,
    status: 'active',
  },

  // ==========================================
  // GROQ — Retired / Deprecated LLMs
  // ==========================================
  {
    id: 'llama-3.3-70b-versatile',
    provider: 'groq',
    type: 'llm',
    displayName: 'Llama 3.3 70B Versatile (Retired)',
    capabilities: ['chat', 'streaming'],
    inputModalities: ['text'],
    outputModalities: ['text'],
    supportsStreaming: true,
    contextWindow: 131072,
    status: 'retired',
    deprecationNotice: 'Retired by Groq on developer tier. Replaced by openai/gpt-oss-120b.',
    recommendedReplacement: 'openai/gpt-oss-120b',
  },
  {
    id: 'llama-3.1-8b-instant',
    provider: 'groq',
    type: 'llm',
    displayName: 'Llama 3.1 8B Instant (Retired)',
    capabilities: ['chat', 'streaming'],
    inputModalities: ['text'],
    outputModalities: ['text'],
    supportsStreaming: true,
    contextWindow: 131072,
    status: 'retired',
    deprecationNotice: 'Retired by Groq on developer tier. Replaced by openai/gpt-oss-20b.',
    recommendedReplacement: 'openai/gpt-oss-20b',
  },
  {
    id: 'llama-3.1-70b-versatile',
    provider: 'groq',
    type: 'llm',
    displayName: 'Llama 3.1 70B Versatile (Retired)',
    capabilities: ['chat', 'streaming'],
    inputModalities: ['text'],
    outputModalities: ['text'],
    supportsStreaming: true,
    contextWindow: 131072,
    status: 'retired',
    deprecationNotice: 'Retired by Groq. Replaced by openai/gpt-oss-120b.',
    recommendedReplacement: 'openai/gpt-oss-120b',
  },
  {
    id: 'llama3-70b-8192',
    provider: 'groq',
    type: 'llm',
    displayName: 'Llama 3 70B (Retired)',
    capabilities: ['chat', 'streaming'],
    inputModalities: ['text'],
    outputModalities: ['text'],
    supportsStreaming: true,
    contextWindow: 8192,
    status: 'retired',
    deprecationNotice: 'Deprecated and removed by Groq. Replaced by openai/gpt-oss-120b.',
    recommendedReplacement: 'openai/gpt-oss-120b',
  },
  {
    id: 'llama3-8b-8192',
    provider: 'groq',
    type: 'llm',
    displayName: 'Llama 3 8B (Retired)',
    capabilities: ['chat', 'streaming'],
    inputModalities: ['text'],
    outputModalities: ['text'],
    supportsStreaming: true,
    contextWindow: 8192,
    status: 'retired',
    deprecationNotice: 'Deprecated and removed by Groq. Replaced by openai/gpt-oss-20b.',
    recommendedReplacement: 'openai/gpt-oss-20b',
  },
  {
    id: 'mixtral-8x7b-32768',
    provider: 'groq',
    type: 'llm',
    displayName: 'Mixtral 8x7B (Retired)',
    capabilities: ['chat', 'streaming'],
    inputModalities: ['text'],
    outputModalities: ['text'],
    supportsStreaming: true,
    contextWindow: 32768,
    status: 'retired',
    deprecationNotice: 'Retired on Groq. Replaced by openai/gpt-oss-120b.',
    recommendedReplacement: 'openai/gpt-oss-120b',
  },
  {
    id: 'gemma2-9b-it',
    provider: 'groq',
    type: 'llm',
    displayName: 'Gemma 2 9B (Retired)',
    capabilities: ['chat', 'streaming'],
    inputModalities: ['text'],
    outputModalities: ['text'],
    supportsStreaming: true,
    contextWindow: 8192,
    status: 'retired',
    deprecationNotice: 'Retired on Groq. Replaced by openai/gpt-oss-20b.',
    recommendedReplacement: 'openai/gpt-oss-20b',
  },

  // ==========================================
  // GROQ — Speech-to-Text (STT)
  // ==========================================
  {
    id: 'whisper-large-v3-turbo',
    provider: 'groq',
    type: 'stt',
    displayName: 'Whisper Large V3 Turbo (Fast Multilingual STT)',
    capabilities: ['transcription', 'multilingual'],
    inputModalities: ['audio'],
    outputModalities: ['text'],
    supportsStreaming: false,
    contextWindow: 448,
    maxOutputTokens: 448,
    status: 'active',
    isDefault: true,
    pricing: { promptCostPer1M: 0.04, completionCostPer1M: 0.04 },
  },
  {
    id: 'whisper-large-v3',
    provider: 'groq',
    type: 'stt',
    displayName: 'Whisper Large V3 (Standard)',
    capabilities: ['transcription', 'multilingual'],
    inputModalities: ['audio'],
    outputModalities: ['text'],
    supportsStreaming: false,
    contextWindow: 448,
    maxOutputTokens: 448,
    status: 'active',
    pricing: { promptCostPer1M: 0.111, completionCostPer1M: 0.111 },
  },

  // ==========================================
  // OPENAI
  // ==========================================
  {
    id: 'gpt-4o-mini',
    provider: 'openai',
    type: 'llm',
    displayName: 'GPT-4o Mini (Fast & Cost-Efficient)',
    capabilities: ['chat', 'streaming', 'tools', 'json', 'vision'],
    inputModalities: ['text', 'image'],
    outputModalities: ['text'],
    supportsStreaming: true,
    contextWindow: 128000,
    maxOutputTokens: 16384,
    status: 'active',
    isDefault: true,
    pricing: { promptCostPer1M: 0.15, completionCostPer1M: 0.6 },
  },
  {
    id: 'gpt-4o',
    provider: 'openai',
    type: 'llm',
    displayName: 'GPT-4o (Omni High Reasoning)',
    capabilities: ['chat', 'streaming', 'tools', 'json', 'reasoning', 'vision'],
    inputModalities: ['text', 'image'],
    outputModalities: ['text'],
    supportsStreaming: true,
    contextWindow: 128000,
    maxOutputTokens: 16384,
    status: 'active',
    pricing: { promptCostPer1M: 2.5, completionCostPer1M: 10.0 },
  },
  {
    id: 'whisper-1',
    provider: 'openai',
    type: 'stt',
    displayName: 'OpenAI Whisper-1',
    capabilities: ['transcription', 'multilingual'],
    inputModalities: ['audio'],
    outputModalities: ['text'],
    supportsStreaming: false,
    status: 'active',
    isDefault: true,
  },

  // ==========================================
  // OPENROUTER
  // ==========================================
  {
    id: 'google/gemini-2.0-flash-001',
    provider: 'openrouter',
    type: 'llm',
    displayName: 'Gemini 2.0 Flash (Fast & Capable)',
    capabilities: ['chat', 'streaming', 'tools', 'json', 'reasoning'],
    inputModalities: ['text'],
    outputModalities: ['text'],
    supportsStreaming: true,
    contextWindow: 1048576,
    maxOutputTokens: 8192,
    status: 'active',
    isDefault: true,
  },
  {
    id: 'meta-llama/llama-3.3-70b-instruct',
    provider: 'openrouter',
    type: 'llm',
    displayName: 'Meta Llama 3.3 70B Instruct (via OpenRouter)',
    capabilities: ['chat', 'streaming', 'tools', 'json', 'reasoning'],
    inputModalities: ['text'],
    outputModalities: ['text'],
    supportsStreaming: true,
    contextWindow: 131072,
    maxOutputTokens: 8192,
    status: 'active',
  },

  // ==========================================
  // OLLAMA (Local)
  // ==========================================
  {
    id: 'llama3.2:1b',
    provider: 'ollama',
    type: 'llm',
    displayName: 'Llama 3.2 1B (Ultra-light Local)',
    capabilities: ['chat', 'streaming', 'json'],
    inputModalities: ['text'],
    outputModalities: ['text'],
    supportsStreaming: true,
    status: 'active',
    isDefault: true,
  },
  {
    id: 'llama3.2:3b',
    provider: 'ollama',
    type: 'llm',
    displayName: 'Llama 3.2 3B (Balanced Local)',
    capabilities: ['chat', 'streaming', 'json'],
    inputModalities: ['text'],
    outputModalities: ['text'],
    supportsStreaming: true,
    status: 'active',
  },
  {
    id: 'llama3.3:70b',
    provider: 'ollama',
    type: 'llm',
    displayName: 'Llama 3.3 70B (High-capacity Local)',
    capabilities: ['chat', 'streaming', 'json', 'reasoning'],
    inputModalities: ['text'],
    outputModalities: ['text'],
    supportsStreaming: true,
    status: 'active',
  },
];

/**
 * Registry Lookup & Query Functions
 */

export function getModelDefinition(
  provider: AIProviderId,
  modelId: string
): ModelDefinition | undefined {
  const normId = (modelId || '').trim().toLowerCase();
  return MODEL_REGISTRY.find(
    (m) => m.provider === provider && m.id.toLowerCase() === normId
  );
}

export function getActiveModelsForProvider(
  provider: AIProviderId,
  type: ModelType = 'llm'
): readonly ModelDefinition[] {
  return MODEL_REGISTRY.filter(
    (m) => m.provider === provider && m.type === type && m.status === 'active'
  );
}

export function getDefaultModelForProvider(
  provider: AIProviderId,
  type: ModelType = 'llm'
): string {
  const defaultEntry = MODEL_REGISTRY.find(
    (m) => m.provider === provider && m.type === type && m.isDefault && m.status === 'active'
  );
  if (defaultEntry) return defaultEntry.id;
  const firstActive = MODEL_REGISTRY.find(
    (m) => m.provider === provider && m.type === type && m.status === 'active'
  );
  return firstActive ? firstActive.id : 'openai/gpt-oss-120b';
}

export function isModelActive(provider: AIProviderId, modelId: string): boolean {
  const def = getModelDefinition(provider, modelId);
  return def !== undefined && def.status === 'active';
}

/**
 * Migration & Resolution Governor
 *
 * Detects deprecated or retired models and transparently maps them to their
 * official recommended replacement. Preserves valid custom models.
 */
export function resolveOrMigrateModel(
  provider: AIProviderId,
  currentModel: string | undefined | null,
  type: ModelType = 'llm'
): ModelResolutionResult {
  const defaultModel = getDefaultModelForProvider(provider, type);

  if (!currentModel || typeof currentModel !== 'string' || !currentModel.trim()) {
    return {
      requestedModel: '',
      resolvedModel: defaultModel,
      wasMigrated: false,
    };
  }

  const trimmed = currentModel.trim();
  const def = getModelDefinition(provider, trimmed);

  // If model is actively registered and operational, keep user choice
  if (def && def.status === 'active') {
    return {
      requestedModel: trimmed,
      resolvedModel: def.id,
      wasMigrated: false,
    };
  }

  // If model is explicitly registered as deprecated or retired, migrate to recommended replacement
  if (def && (def.status === 'retired' || def.status === 'deprecated')) {
    const target = def.recommendedReplacement || defaultModel;
    return {
      requestedModel: trimmed,
      resolvedModel: target,
      wasMigrated: true,
      reason: `model_${def.status}`,
      notice:
        def.deprecationNotice ||
        `Configured model '${trimmed}' is retired. Automatically migrated to '${target}'.`,
    };
  }

  // Heuristic catch for Groq legacy models that are not registered
  if (provider === 'groq' && type === 'llm') {
    const lower = trimmed.toLowerCase();
    if (
      lower.includes('llama') ||
      lower.includes('mixtral') ||
      lower.includes('gemma') ||
      lower === 'openrouter/free'
    ) {
      const replacement = lower.includes('8b') ? 'openai/gpt-oss-20b' : defaultModel;
      return {
        requestedModel: trimmed,
        resolvedModel: replacement,
        wasMigrated: true,
        reason: 'legacy_groq_model_retired',
        notice: `Legacy model '${trimmed}' was retired on Groq. Automatically migrated to '${replacement}'.`,
      };
    }
  }

  // For unknown models on non-Groq or custom models, preserve user configuration without overwriting
  return {
    requestedModel: trimmed,
    resolvedModel: trimmed,
    wasMigrated: false,
  };
}

/**
 * Fallback Chain Builder
 *
 * Returns an ordered list of active alternative models for the same provider,
 * excluding the currently attempted model.
 */
export function getModelFallbackChain(
  provider: AIProviderId,
  currentModelId: string,
  type: ModelType = 'llm'
): readonly string[] {
  const normCurrent = currentModelId.trim().toLowerCase();
  const active = getActiveModelsForProvider(provider, type);
  return active.map((m) => m.id).filter((id) => id.toLowerCase() !== normCurrent);
}

/**
 * Secret Sanitization
 * Redacts Groq and OpenAI API keys from strings, headers, and logs.
 */
export function sanitizeDiagnosticSecret(text: string): string {
  if (!text || typeof text !== 'string') return '';
  return text
    .replace(/gsk_[A-Za-z0-9_-]{20,}/g, 'gsk_[REDACTED_GROQ_KEY]')
    .replace(/sk-[A-Za-z0-9_-]{20,}/g, 'sk-[REDACTED_OPENAI_KEY]')
    .replace(/Bearer\s+[A-Za-z0-9_.-]+/gi, 'Bearer [REDACTED_TOKEN]');
}

/**
 * Safe AI Error Classifier
 *
 * Categorizes errors to ensure that fallbacks are ONLY attempted for recoverable
 * model-level errors (404 model_not_found, decommissioning), and NEVER for
 * bad credentials (401), missing permissions (403), billing/quota (402/429), or network dropouts.
 */
export function classifyAIError(
  provider: AIProviderId,
  model: string,
  status: number | undefined,
  errorBody: any,
  originalError?: Error
): ClassifiedAIError {
  let code: AIErrorCode = 'UNKNOWN';
  let isRecoverableByModelFallback = false;
  let detailMessage = '';

  if (typeof errorBody === 'string') {
    detailMessage = errorBody;
  } else if (errorBody && typeof errorBody === 'object') {
    detailMessage = errorBody.error?.message || errorBody.message || JSON.stringify(errorBody);
  } else if (originalError?.message) {
    detailMessage = originalError.message;
  }

  const cleanDetail = sanitizeDiagnosticSecret(detailMessage);
  const lowerMsg = cleanDetail.toLowerCase();

  if (status === 401 || lowerMsg.includes('invalid api key') || lowerMsg.includes('unauthorized')) {
    code = 'AUTH_INVALID_KEY';
    isRecoverableByModelFallback = false;
  } else if (status === 403 || lowerMsg.includes('forbidden') || lowerMsg.includes('permission_denied')) {
    code = 'AUTH_FORBIDDEN';
    isRecoverableByModelFallback = false;
  } else if (status === 402 || lowerMsg.includes('payment required') || lowerMsg.includes('billing')) {
    code = 'BILLING_PAYMENT_REQUIRED';
    isRecoverableByModelFallback = false;
  } else if (status === 429) {
    if (lowerMsg.includes('quota') || lowerMsg.includes('insufficient_quota') || lowerMsg.includes('credit')) {
      code = 'QUOTA_EXHAUSTED';
    } else {
      code = 'RATE_LIMIT_EXCEEDED';
    }
    isRecoverableByModelFallback = false;
  } else if (
    status === 404 ||
    lowerMsg.includes('model_not_found') ||
    lowerMsg.includes('model not found') ||
    lowerMsg.includes('does not exist') ||
    lowerMsg.includes('decommissioned') ||
    lowerMsg.includes('model_retired') ||
    lowerMsg.includes('invalid_model_id')
  ) {
    code = lowerMsg.includes('decommissioned') || lowerMsg.includes('retired')
      ? 'MODEL_DECOMMISSIONED'
      : 'MODEL_NOT_FOUND';
    isRecoverableByModelFallback = true;
  } else if (
    originalError?.name === 'TypeError' &&
    (lowerMsg.includes('fetch failed') || lowerMsg.includes('network') || lowerMsg.includes('failed to fetch'))
  ) {
    code = 'NETWORK_ERROR';
    isRecoverableByModelFallback = false;
  } else if (status && status >= 500) {
    code = 'SERVER_ERROR';
    // Server 500/503 might be transient or platform outage; does not qualify for silent model fallback
    isRecoverableByModelFallback = false;
  }

  const err = new Error(
    `[${provider.toUpperCase()}] ${code} (HTTP ${status || 'N/A'}): ${cleanDetail}`
  ) as any;
  err.name = 'ClassifiedAIError';
  err.code = code;
  err.status = status;
  err.isRecoverableByModelFallback = isRecoverableByModelFallback;
  err.provider = provider;
  err.model = model;
  err.originalErrorDetail = cleanDetail;

  return err as ClassifiedAIError;
}

/**
 * Preflight Model Validator
 *
 * Validates provider, credential format, and model availability before initiating
 * an interview or answer generation session.
 */
export async function validateModelPreflight(
  provider: AIProviderId,
  model: string,
  apiKey?: string,
  endpoint?: string,
  signal?: AbortSignal
): Promise<{
  valid: boolean;
  code?: AIErrorCode;
  message?: string;
  availableModels?: string[];
}> {
  // 1. Provider & Credential Format Check
  if (provider === 'groq') {
    const cleanKey = (apiKey || '').trim();
    if (!cleanKey) {
      return {
        valid: false,
        code: 'AUTH_INVALID_KEY',
        message: 'Groq API key is missing. Please configure your key in Settings.',
      };
    }
    if (!cleanKey.startsWith('gsk_')) {
      return {
        valid: false,
        code: 'AUTH_INVALID_KEY',
        message: 'Invalid Groq API key format. Key must start with "gsk_".',
      };
    }

    // 2. Query Groq models endpoint to verify key validity and model access
    try {
      const res = await fetch('https://api.groq.com/openai/v1/models', {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${cleanKey}`,
        },
        signal,
      });

      if (!res.ok) {
        let errData: any;
        try {
          errData = await res.json();
        } catch {
          errData = await res.text();
        }
        const classified = classifyAIError(provider, model, res.status, errData);
        return {
          valid: false,
          code: classified.code,
          message: classified.originalErrorDetail || res.statusText,
        };
      }

      const body = await res.json();
      const availableIds: string[] = Array.isArray(body?.data)
        ? body.data.map((m: any) => m.id)
        : [];

      // Check if requested model exists on the account
      const normModel = model.trim().toLowerCase();
      const hasModel = availableIds.some((id) => id.toLowerCase() === normModel);

      if (!hasModel) {
        return {
          valid: false,
          code: 'MODEL_NOT_FOUND',
          message: `Model '${model}' is not available for this Groq account. Available models: ${availableIds.slice(0, 5).join(', ')}`,
          availableModels: availableIds,
        };
      }

      return {
        valid: true,
        availableModels: availableIds,
      };
    } catch (netErr: any) {
      return {
        valid: false,
        code: 'NETWORK_ERROR',
        message: `Network error verifying Groq preflight: ${netErr.message || String(netErr)}`,
      };
    }
  }

  if (provider === 'openai') {
    const cleanKey = (apiKey || '').trim();
    if (!cleanKey) {
      return {
        valid: false,
        code: 'AUTH_INVALID_KEY',
        message: 'OpenAI API key is missing. Please configure your key in Settings.',
      };
    }
    if (!cleanKey.startsWith('sk-')) {
      return {
        valid: false,
        code: 'AUTH_INVALID_KEY',
        message: 'Invalid OpenAI API key format. Key must start with "sk-".',
      };
    }
    return { valid: true };
  }

  if (provider === 'ollama') {
    const targetEndpoint = endpoint || 'http://127.0.0.1:11434';
    try {
      const res = await fetch(`${targetEndpoint.replace(/\/+$/, '')}/api/tags`, {
        method: 'GET',
        signal,
      });
      if (!res.ok) {
        return {
          valid: false,
          code: 'PREFLIGHT_FAILED',
          message: `Ollama daemon returned HTTP ${res.status}`,
        };
      }
      return { valid: true };
    } catch (err: any) {
      return {
        valid: false,
        code: 'NETWORK_ERROR',
        message: `Could not connect to Ollama at ${targetEndpoint}: ${err.message || String(err)}`,
      };
    }
  }

  return { valid: true };
}
