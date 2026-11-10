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
  | 'ENDPOINT_NOT_FOUND'
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
  readonly rateLimit?: {
    isRateLimited: boolean;
    isDailyQuota: boolean;
    isPerMinute: boolean;
    limitType: 'tokens' | 'requests' | 'daily' | 'unknown';
    cooldownSeconds: number;
    remainingTokens?: number;
    remainingRequests?: number;
    resetTokens?: string;
    resetRequests?: string;
    shouldAutoRetry: boolean;
    suggestedFallbackModel?: string;
  };
  readonly retryable?: boolean;
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
    id: 'openai/gpt-oss-safeguard-20b',
    provider: 'groq',
    type: 'llm',
    displayName: 'GPT-OSS Safeguard 20B (Safety & Moderation Classifier)',
    capabilities: ['chat', 'streaming', 'json'],
    inputModalities: ['text'],
    outputModalities: ['text'],
    supportsStreaming: true,
    contextWindow: 131072,
    maxOutputTokens: 8192,
    status: 'active',
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
  return MODEL_REGISTRY.find((m) => m.provider === provider && m.id.toLowerCase() === normId);
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

  // Known legacy Groq model IDs that must be migrated even if prefixed or unregistered
  const KNOWN_RETIRED_GROQ_MODELS = new Set([
    'llama-3.3-70b-versatile',
    'llama-3.1-70b-versatile',
    'llama-3.1-8b-instant',
    'llama-3.2-1b-preview',
    'llama-3.2-3b-preview',
    'llama-3.2-11b-vision-preview',
    'llama-3.2-90b-vision-preview',
    'llama3-70b-8192',
    'llama3-8b-8192',
    'mixtral-8x7b-32768',
    'gemma2-9b-it',
    'gemma-7b-it',
    'openrouter/free',
  ]);

  if (provider === 'groq' && type === 'llm') {
    const rawId = trimmed.toLowerCase().replace(/^groq\//, '');
    if (KNOWN_RETIRED_GROQ_MODELS.has(rawId)) {
      const replacement =
        rawId.includes('8b') || rawId.includes('9b') || rawId.includes('1b') || rawId.includes('3b')
          ? 'openai/gpt-oss-20b'
          : defaultModel;
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
 * Redacts Groq and OpenAI API keys, authorization headers, bearer tokens, and nested secrets.
 */
export function sanitizeDiagnosticSecret(input: any): string {
  if (input === null || input === undefined) return '';
  const text = typeof input === 'string' ? input : JSON.stringify(input);
  return text
    .replace(/gsk_[A-Za-z0-9_-]{10,}/g, 'gsk_[REDACTED_GROQ_KEY]')
    .replace(/sk-(?:proj-)?[A-Za-z0-9_-]{10,}/g, 'sk-[REDACTED_OPENAI_KEY]')
    .replace(/Bearer\s+[A-Za-z0-9_.-]+/gi, 'Bearer [REDACTED_TOKEN]')
    .replace(
      /(["']?(?:authorization|api[-_]?key|token|secret|password|access_token)["']?\s*[:=]\s*["'])(?:Bearer\s+)?[^"'\s,;]+(["'])/gi,
      '$1[REDACTED_SECRET]$2'
    )
    .replace(/("authorization"\s*:\s*")Bearer\s+[^"]+(")/gi, '$1Bearer [REDACTED_TOKEN]$2');
}

/**
 * Creates a synthetic, minimal 0.25-second 16kHz PCM mono WAV fixture for preflight STT validation.
 * Guaranteed to contain no user voice recordings or PII.
 */
export function createTinyPreflightWavBlob(): Blob {
  const sampleRate = 16000;
  const numSamples = Math.floor(sampleRate * 0.25); // 0.25 seconds
  const dataSize = numSamples * 2;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);

  view.setUint32(0, 0x52494646, false); // "RIFF"
  view.setUint32(4, 36 + dataSize, true);
  view.setUint32(8, 0x57415645, false); // "WAVE"
  view.setUint32(12, 0x666d7420, false); // "fmt "
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // Mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  view.setUint32(36, 0x64617461, false); // "data"
  view.setUint32(40, dataSize, true);

  for (let i = 0; i < numSamples; i++) {
    const sample = Math.floor(Math.sin((2 * Math.PI * 440 * i) / sampleRate) * 1000);
    view.setInt16(44 + i * 2, sample, true);
  }

  return new Blob([buffer], { type: 'audio/wav' });
}

/**
 * Diagnostic Factory
 * Builds strictly allowlisted, sanitized diagnostic records without raw request bodies,
 * credentials, headers, user questions, or candidate answers.
 */
export function createSafeDiagnosticRecord(
  provider: AIProviderId,
  originalModel: string,
  fallbackModel: string,
  errorCode: AIErrorCode,
  status: number | undefined,
  rawMessage: string,
  successful: boolean
): FallbackDiagnosticRecord {
  return {
    timestamp: Date.now(),
    provider,
    originalModel: String(originalModel || '').slice(0, 100),
    fallbackModel: String(fallbackModel || '').slice(0, 100),
    triggerError: {
      code: errorCode,
      status: typeof status === 'number' ? status : undefined,
      message: sanitizeDiagnosticSecret(String(rawMessage || '')).slice(0, 250),
    },
    successful: Boolean(successful),
  };
}

/**
 * Safe AI Error Classifier
 *
 * Categorizes errors to ensure that fallbacks are ONLY attempted for recoverable
 * model-level errors (404 model_not_found, decommissioning), and NEVER for
 * bad credentials (401), missing permissions (403), billing/quota (402/429), or network dropouts.
 * Prefers structured provider error codes over loose text matching.
 */
export function classifyAIError(
  provider: AIProviderId,
  model: string,
  status: number | undefined,
  errorBody: any,
  originalError?: Error,
  headers?: any
): ClassifiedAIError {
  let code: AIErrorCode = 'UNKNOWN';
  let isRecoverableByModelFallback = false;
  let detailMessage = '';
  let providerErrorCode = '';

  if (typeof errorBody === 'string') {
    detailMessage = errorBody;
  } else if (errorBody && typeof errorBody === 'object') {
    providerErrorCode = String(errorBody.error?.code || errorBody.code || '');
    detailMessage = errorBody.error?.message || errorBody.message || JSON.stringify(errorBody);
  } else if (originalError?.message) {
    detailMessage = originalError.message;
  }

  const cleanDetail = sanitizeDiagnosticSecret(detailMessage);
  const lowerMsg = cleanDetail.toLowerCase();
  const lowerCode = providerErrorCode.toLowerCase().trim();

  // 1. Prefer structured provider error codes first
  const STRUCTURED_MODEL_ERROR_CODES = new Set([
    'model_not_found',
    'model_decommissioned',
    'invalid_model_id',
    'model_retired',
  ]);
  const hasStructuredModelCode = STRUCTURED_MODEL_ERROR_CODES.has(lowerCode);

  // 2. Strict model-specific message matching: must explicitly reference the target model
  // to prevent unrelated errors (e.g. "data model does not exist" or "routing model does not exist")
  // from falsely triggering fallback.
  const normModel = (model || '').trim().toLowerCase();
  const referencesTargetModel = normModel.length > 0 && lowerMsg.includes(normModel);
  const isExplicitDecommissionMessage =
    (lowerMsg.includes('has been decommissioned') ||
      lowerMsg.includes('model_decommissioned') ||
      lowerMsg.includes('model retired') ||
      lowerMsg.includes('is decommissioned')) &&
    (referencesTargetModel || lowerCode.includes('decommission'));

  const isExplicitModelNotFoundMessage =
    referencesTargetModel &&
    (lowerMsg.includes('does not exist') ||
      lowerMsg.includes('model not found') ||
      lowerMsg.includes('model_not_found') ||
      lowerMsg.includes('unknown model') ||
      lowerMsg.includes('unrecognized model') ||
      lowerMsg.includes('invalid model'));

  const isModelSpecific =
    hasStructuredModelCode || isExplicitDecommissionMessage || isExplicitModelNotFoundMessage;

  if (status === 401 || lowerMsg.includes('invalid api key') || lowerMsg.includes('unauthorized')) {
    code = 'AUTH_INVALID_KEY';
    isRecoverableByModelFallback = false;
  } else if (
    status === 403 ||
    lowerMsg.includes('forbidden') ||
    lowerMsg.includes('permission_denied')
  ) {
    code = 'AUTH_FORBIDDEN';
    isRecoverableByModelFallback = false;
  } else if (status === 429) {
    if (
      lowerMsg.includes('quota') ||
      lowerMsg.includes('insufficient_quota') ||
      lowerMsg.includes('credit')
    ) {
      code = 'QUOTA_EXHAUSTED';
    } else {
      code = 'RATE_LIMIT_EXCEEDED';
    }
    isRecoverableByModelFallback = false;
  } else if (
    status === 402 ||
    lowerMsg.includes('payment required') ||
    (lowerMsg.includes('billing') &&
      !lowerMsg.includes('rate limit') &&
      !lowerMsg.includes('tpm') &&
      !lowerMsg.includes('tokens per minute'))
  ) {
    code = 'BILLING_PAYMENT_REQUIRED';
    isRecoverableByModelFallback = false;
  } else if (isModelSpecific) {
    code =
      lowerCode.includes('decommissioned') ||
      lowerMsg.includes('decommissioned') ||
      lowerMsg.includes('retired')
        ? 'MODEL_DECOMMISSIONED'
        : 'MODEL_NOT_FOUND';
    isRecoverableByModelFallback = true;
  } else if (status === 404) {
    // Generic HTTP 404: Endpoint path or route does not exist. NOT recoverable by model fallback.
    code = 'ENDPOINT_NOT_FOUND';
    isRecoverableByModelFallback = false;
  } else if (
    originalError?.name === 'TypeError' ||
    originalError?.name === 'AbortError' ||
    originalError?.name === 'TimeoutError' ||
    lowerMsg.includes('fetch failed') ||
    lowerMsg.includes('network') ||
    lowerMsg.includes('failed to fetch') ||
    lowerMsg.includes('timeout') ||
    lowerMsg.includes('aborted')
  ) {
    code = 'NETWORK_ERROR';
    isRecoverableByModelFallback = false;
  } else if (status && status >= 500) {
    code = 'SERVER_ERROR';
    // Server 500/502/503 is platform outage; does not qualify for silent model fallback
    isRecoverableByModelFallback = false;
  }

  let rateLimit: any = undefined;
  let retryable = false;

  if (status === 429 || code === 'RATE_LIMIT_EXCEEDED' || code === 'QUOTA_EXHAUSTED') {
    const isDaily =
      lowerMsg.includes('daily') ||
      lowerMsg.includes('per day') ||
      lowerMsg.includes('insufficient_quota') ||
      lowerCode.includes('insufficient_quota') ||
      lowerMsg.includes('credit');

    let cooldownSeconds = 0;
    const getHeader = (name: string): string | null => {
      if (!headers) return null;
      if (typeof headers.get === 'function') return headers.get(name);
      return headers[name] || headers[name.toLowerCase()] || null;
    };

    const retryAfter = getHeader('retry-after');
    if (retryAfter) {
      const parsed = parseFloat(retryAfter);
      if (!isNaN(parsed) && parsed > 0) cooldownSeconds = Math.ceil(parsed);
    }
    if (!cooldownSeconds) {
      const resetTokens = getHeader('x-ratelimit-reset-tokens');
      if (resetTokens) {
        const m = resetTokens.match(/(\d+(?:\.\d+)?)/);
        if (m) cooldownSeconds = Math.ceil(parseFloat(m[1]));
      }
    }
    if (!cooldownSeconds) {
      const m = cleanDetail.match(/try again in (\d+(?:\.\d+)?)s/i);
      if (m) cooldownSeconds = Math.ceil(parseFloat(m[1]));
    }
    if (!cooldownSeconds) {
      cooldownSeconds = isDaily ? 3600 : 15;
    }

    rateLimit = {
      isRateLimited: true,
      isDailyQuota: isDaily,
      isPerMinute: !isDaily,
      limitType: isDaily
        ? 'daily'
        : lowerMsg.includes('token') || lowerMsg.includes('tpm')
          ? 'tokens'
          : 'requests',
      cooldownSeconds,
      remainingTokens: getHeader('x-ratelimit-remaining-tokens')
        ? parseInt(getHeader('x-ratelimit-remaining-tokens')!, 10)
        : undefined,
      remainingRequests: getHeader('x-ratelimit-remaining-requests')
        ? parseInt(getHeader('x-ratelimit-remaining-requests')!, 10)
        : undefined,
      resetTokens: getHeader('x-ratelimit-reset-tokens') || undefined,
      resetRequests: getHeader('x-ratelimit-reset-requests') || undefined,
      shouldAutoRetry: !isDaily && cooldownSeconds <= 20,
    };
    retryable = rateLimit.shouldAutoRetry;
  } else if (
    code === 'SERVER_ERROR' ||
    (code === 'NETWORK_ERROR' && !lowerMsg.includes('aborted'))
  ) {
    retryable = true;
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
  err.rateLimit = rateLimit;
  err.retryable = retryable;

  return err as ClassifiedAIError;
}

export interface PreflightOptions {
  probeTranscription?: boolean;
  signal?: AbortSignal;
}

export interface ModelPreflightResult {
  valid: boolean;
  code?: AIErrorCode;
  message?: string;
  latencyMs?: number;
  availableModels?: string[];
  modelListAvailable?: boolean;
  transcriptionCapable?: boolean;
}

/**
 * Preflight Model Validator
 *
 * Validates provider credentials and performs an active completion probe
 * to confirm access and model health before initiating an interview session.
 */
export async function validateModelPreflight(
  provider: AIProviderId,
  model: string,
  apiKey?: string,
  endpoint?: string,
  optionsOrSignal?: AbortSignal | PreflightOptions
): Promise<ModelPreflightResult> {
  const options: PreflightOptions =
    optionsOrSignal instanceof AbortSignal ? { signal: optionsOrSignal } : optionsOrSignal || {};
  const signal = options.signal;
  const probeTranscription = options.probeTranscription === true;

  // 1. Groq Provider Preflight
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

    // If STT model, check models catalog and optionally probe transcription with a tiny fixture
    if (model.toLowerCase().includes('whisper')) {
      try {
        const startTime = Date.now();
        const res = await fetch('https://api.groq.com/openai/v1/models', {
          method: 'GET',
          headers: { Authorization: `Bearer ${cleanKey}` },
          signal,
        });
        const latencyMs = Date.now() - startTime;

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
            message: sanitizeDiagnosticSecret(classified.originalErrorDetail || res.statusText),
            latencyMs,
            modelListAvailable: false,
            transcriptionCapable: false,
          };
        }

        const body = await res.json();
        const availableIds: string[] = Array.isArray(body?.data)
          ? body.data.map((m: any) => m.id)
          : [];
        const hasModel = availableIds.some((id) => id.toLowerCase() === model.trim().toLowerCase());
        if (!hasModel) {
          return {
            valid: false,
            code: 'MODEL_NOT_FOUND',
            message: `Model '${model}' is not available for this Groq account.`,
            latencyMs,
            availableModels: availableIds,
            modelListAvailable: false,
            transcriptionCapable: false,
          };
        }

        // If deep transcription probe requested, use tiny synthetic WAV fixture (never user recordings)
        if (probeTranscription) {
          const testAudio = createTinyPreflightWavBlob();
          const formData = new FormData();
          formData.append('file', testAudio, 'preflight.wav');
          formData.append('model', model);

          const txStart = Date.now();
          const txRes = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
            method: 'POST',
            headers: { Authorization: `Bearer ${cleanKey}` },
            body: formData,
            signal,
          });
          const txLatencyMs = Date.now() - txStart;

          if (!txRes.ok) {
            let txErr: any;
            try {
              txErr = await txRes.json();
            } catch {
              txErr = await txRes.text();
            }
            const classifiedTx = classifyAIError(provider, model, txRes.status, txErr);
            return {
              valid: false,
              code: classifiedTx.code,
              message: sanitizeDiagnosticSecret(
                classifiedTx.originalErrorDetail || txRes.statusText
              ),
              latencyMs: txLatencyMs,
              availableModels: availableIds,
              modelListAvailable: true,
              transcriptionCapable: false,
            };
          }

          return {
            valid: true,
            latencyMs: txLatencyMs,
            availableModels: availableIds,
            modelListAvailable: true,
            transcriptionCapable: true,
          };
        }

        return {
          valid: true,
          latencyMs,
          availableModels: availableIds,
          modelListAvailable: true,
          transcriptionCapable: undefined,
        };
      } catch (netErr: any) {
        return {
          valid: false,
          code: 'NETWORK_ERROR',
          message: sanitizeDiagnosticSecret(
            `Network error verifying Groq STT preflight: ${netErr.message || String(netErr)}`
          ),
          modelListAvailable: false,
          transcriptionCapable: false,
        };
      }
    }

    // For LLMs, perform an active 1-token completion probe
    try {
      const startTime = Date.now();
      const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${cleanKey}`,
        },
        body: JSON.stringify({
          model,
          messages: [{ role: 'user', content: 'ping' }],
          max_tokens: 1,
        }),
        signal,
      });
      const latencyMs = Date.now() - startTime;

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
          message: sanitizeDiagnosticSecret(classified.originalErrorDetail || res.statusText),
          latencyMs,
        };
      }

      return {
        valid: true,
        latencyMs,
      };
    } catch (netErr: any) {
      return {
        valid: false,
        code: 'NETWORK_ERROR',
        message: sanitizeDiagnosticSecret(
          `Network error verifying Groq preflight: ${netErr.message || String(netErr)}`
        ),
      };
    }
  }

  // 2. OpenAI Provider Preflight
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

    try {
      const startTime = Date.now();
      const res = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${cleanKey}`,
        },
        body: JSON.stringify({
          model,
          messages: [{ role: 'user', content: 'ping' }],
          max_tokens: 1,
        }),
        signal,
      });
      const latencyMs = Date.now() - startTime;

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
          message: sanitizeDiagnosticSecret(classified.originalErrorDetail || res.statusText),
          latencyMs,
        };
      }

      return { valid: true, latencyMs };
    } catch (netErr: any) {
      return {
        valid: false,
        code: 'NETWORK_ERROR',
        message: sanitizeDiagnosticSecret(
          `Network error verifying OpenAI preflight: ${netErr.message || String(netErr)}`
        ),
      };
    }
  }

  // 3. OpenRouter Provider Preflight
  if (provider === 'openrouter') {
    const cleanKey = (apiKey || '').trim();
    if (!cleanKey) {
      return {
        valid: false,
        code: 'AUTH_INVALID_KEY',
        message: 'OpenRouter API key is missing. Please configure your key in Settings.',
      };
    }

    try {
      const startTime = Date.now();
      const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${cleanKey}`,
          'HTTP-Referer': 'ai-interview-assistant',
        },
        body: JSON.stringify({
          model,
          messages: [{ role: 'user', content: 'ping' }],
          max_tokens: 1,
        }),
        signal,
      });
      const latencyMs = Date.now() - startTime;

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
          message: sanitizeDiagnosticSecret(classified.originalErrorDetail || res.statusText),
          latencyMs,
        };
      }

      return { valid: true, latencyMs };
    } catch (netErr: any) {
      return {
        valid: false,
        code: 'NETWORK_ERROR',
        message: sanitizeDiagnosticSecret(
          `Network error verifying OpenRouter preflight: ${netErr.message || String(netErr)}`
        ),
      };
    }
  }

  // 4. Ollama Provider Preflight
  if (provider === 'ollama') {
    const targetEndpoint = endpoint || 'http://127.0.0.1:11434';
    try {
      const startTime = Date.now();
      const res = await fetch(`${targetEndpoint.replace(/\/+$/, '')}/api/tags`, {
        method: 'GET',
        signal,
      });
      const latencyMs = Date.now() - startTime;

      if (!res.ok) {
        return {
          valid: false,
          code: 'PREFLIGHT_FAILED',
          message: `Ollama daemon returned HTTP ${res.status}`,
          latencyMs,
        };
      }

      const body = await res.json();
      const availableModels: string[] = Array.isArray(body?.models)
        ? body.models.map((m: any) => m.name)
        : [];
      const normModel = model.trim().toLowerCase();
      if (availableModels.length === 0) {
        return {
          valid: false,
          code: 'MODEL_NOT_FOUND',
          message:
            'No models are installed in the local Ollama instance. Pull a model before running preflight.',
          latencyMs,
          availableModels,
        };
      }

      const hasModel = availableModels.some(
        (name) => name.toLowerCase().includes(normModel) || normModel.includes(name.toLowerCase())
      );

      if (!hasModel) {
        return {
          valid: false,
          code: 'MODEL_NOT_FOUND',
          message: `Model '${model}' not found in local Ollama instance. Available: ${availableModels.join(', ')}`,
          latencyMs,
          availableModels,
        };
      }

      return { valid: true, latencyMs, availableModels };
    } catch (err: any) {
      return {
        valid: false,
        code: 'NETWORK_ERROR',
        message: sanitizeDiagnosticSecret(
          `Could not connect to Ollama at ${targetEndpoint}: ${err.message || String(err)}`
        ),
      };
    }
  }

  return { valid: true };
}
