/**
 * Whisper Transcription Service
 * Supports Groq Whisper Large V3 Turbo, OpenAI Whisper, and local Whisper servers.
 * Includes request-scoped cancellation via AbortSignal, audio payload validation,
 * dynamic domain vocabulary priming, and post-processing corrections.
 */

import { TECH_TERMS } from './ai';
import { getDynamicWhisperVocab } from './candidatePersona';
import { useAppStore } from '../store/useAppStore';
import { convertBlobToWav, isValidWav } from '../utils/audioConversion';
import {
  getDefaultModelForProvider,
  getModelDefinition,
  resolveOrMigrateModel,
} from './models/modelRegistry';

export interface WhisperConfig {
  /** Explicit transcription provider override. */
  provider?: 'groq' | 'openai' | 'local';
  /** Main application setting; Ollama maps to the configured local Whisper service. */
  aiProvider?: 'groq' | 'openai' | 'openrouter' | 'ollama';
  model?: string;
  /** Main application STT setting. */
  whisperModel?: string;
  endpoint?: string;
  language?: string;
}

export type TranscriptionProvider = 'groq' | 'openai' | 'local';

function resolveTranscriptionModel(provider: 'groq' | 'openai', requestedModel?: string): string {
  const resolved = resolveOrMigrateModel(provider, requestedModel, 'stt').resolvedModel;
  const definition = getModelDefinition(provider, resolved);
  if (definition?.type === 'stt' && definition.status === 'active') {
    return definition.id;
  }
  return getDefaultModelForProvider(provider, 'stt');
}

/**
 * Resolve STT without silently moving audio to a cloud provider.
 * OpenRouter has no STT model in this app, so callers must select a supported
 * speech provider instead of being silently routed to Groq.
 */
export function resolveTranscriptionProvider(config: WhisperConfig): TranscriptionProvider {
  if (config.provider) return config.provider;
  if (config.aiProvider === 'ollama') return 'local';
  if (config.aiProvider === 'groq' || config.aiProvider === 'openai') return config.aiProvider;
  if (config.aiProvider === 'openrouter') {
    throw new Error(
      'OpenRouter is not configured for speech transcription. Select Groq, OpenAI, or local Whisper for speech-to-text.'
    );
  }

  // Backward compatibility for callers which still supply only STT model IDs.
  const configuredModel = (config.model || config.whisperModel || '').toLowerCase();
  if (
    config.endpoint &&
    !config.endpoint.includes('groq.com') &&
    !config.endpoint.includes('openai.com')
  ) {
    return 'local';
  }
  if (configuredModel.includes('whisper-1')) return 'openai';
  return 'groq';
}

export interface TranscriptionResult {
  text: string;
  language?: string;
  duration?: number;
  segments?: TranscriptionSegment[];
}

export interface TranscriptionSegment {
  start: number;
  end: number;
  text: string;
}

async function readErrorBody(response: Response): Promise<string> {
  try {
    const body = await response.text();
    return body.slice(0, 1500) || '(empty response body)';
  } catch {
    return '(could not read response body)';
  }
}

const TRANSCRIPTION_RETRY_DELAYS_MS = [500, 1500] as const;
const RATE_LIMIT_RETRY_DELAYS_MS = [2000, 5000] as const;

function createTranscriptionAbortError(signal?: AbortSignal): Error {
  const reason = signal?.reason;
  const message =
    reason instanceof Error
      ? reason.message
      : typeof reason === 'string' && reason.trim()
        ? reason
        : 'Transcription aborted';
  const error = new Error(message);
  error.name = 'AbortError';
  return error;
}

function isRetryableTranscriptionError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const candidate = error as {
    name?: unknown;
    status?: unknown;
    statusCode?: unknown;
    message?: unknown;
  };

  if (candidate.name === 'AbortError') return false;
  if (candidate.name === 'TimeoutError') return true;

  const message = typeof candidate.message === 'string' ? candidate.message : String(error);
  if (
    /\\[(AUTH_INVALID_KEY|MODEL_NOT_FOUND|TRANSCRIPTION_EMPTY|TRANSCRIPTION_INVALID_RESPONSE)\\]/i.test(
      message
    )
  ) {
    return false;
  }
  if (/\\[(RATE_LIMITED|PROVIDER_UNAVAILABLE)\\]/i.test(message)) return true;

  const status = Number(candidate.status ?? candidate.statusCode);
  if ([408, 425, 429, 500, 502, 503, 504].includes(status)) return true;
  if (Number.isFinite(status) && status > 0) return false;

  return /HTTP\\s+(408|425|429|500|502|503|504)\\b|fetch failed|failed to fetch|network error|ECONNRESET|ETIMEDOUT|EAI_AGAIN|socket hang up|connection reset|timed out|timeout/i.test(
    message
  );
}

function getTranscriptionRetryDelay(error: unknown, attemptIndex: number): number {
  const message =
    error && typeof error === 'object' && 'message' in error
      ? String((error as { message?: unknown }).message || '')
      : String(error || '');
  const delays = /\\[(RATE_LIMITED)\\]/i.test(message)
    ? RATE_LIMIT_RETRY_DELAYS_MS
    : TRANSCRIPTION_RETRY_DELAYS_MS;
  return delays[Math.min(attemptIndex, delays.length - 1)];
}

function waitForTranscriptionRetry(delayMs: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(createTranscriptionAbortError(signal));
      return;
    }

    let timer: ReturnType<typeof setTimeout>;
    const cleanup = () => signal?.removeEventListener('abort', onAbort);
    const onAbort = () => {
      clearTimeout(timer);
      cleanup();
      reject(createTranscriptionAbortError(signal));
    };

    timer = setTimeout(() => {
      cleanup();
      resolve();
    }, delayMs);
    signal?.addEventListener('abort', onAbort, { once: true });
    if (signal?.aborted) onAbort();
  });
}

async function withTranscriptionRetries<T>(
  operation: () => Promise<T>,
  signal?: AbortSignal
): Promise<T> {
  let retryCount = 0;
  while (true) {
    if (signal?.aborted) throw createTranscriptionAbortError(signal);
    try {
      return await operation();
    } catch (error) {
      if (signal?.aborted) throw createTranscriptionAbortError(signal);
      if (retryCount >= TRANSCRIPTION_RETRY_DELAYS_MS.length || !isRetryableTranscriptionError(error)) {
        throw error;
      }

      const delayMs = getTranscriptionRetryDelay(error, retryCount);
      retryCount += 1;
      const errorName = error instanceof Error ? error.name : 'UnknownError';
      console.warn('[Whisper] Retrying transient transcription failure.', {
        attempt: retryCount,
        maxRetries: TRANSCRIPTION_RETRY_DELAYS_MS.length,
        delayMs,
        errorName,
      });
      await waitForTranscriptionRetry(delayMs, signal);
    }
  }
}

/**
 * Transcribe audio using cloud providers through Electron main, or a local Whisper server.
 * Provider credentials never enter the renderer process.
 */
export async function transcribeAudio(
  audioBlob: Blob,
  config: WhisperConfig = {},
  signal?: AbortSignal
): Promise<TranscriptionResult> {
  if (signal?.aborted) {
    const abortErr = new Error('Transcription aborted');
    abortErr.name = 'AbortError';
    throw abortErr;
  }

  if (!audioBlob || audioBlob.size < 400) return { text: '' };

  const arrayBuf = await audioBlob.arrayBuffer();
  if (arrayBuf.byteLength >= 44) {
    const headerStr = String.fromCharCode(...new Uint8Array(arrayBuf.slice(0, 4)));
    if (headerStr === 'RIFF' && !isValidWav(arrayBuf)) {
      console.warn(
        '[Whisper] Audio payload failed strict WAV validation. Attempting conversion...'
      );
    }
  }

  const targetProvider = resolveTranscriptionProvider(config);
  const sttConfig = { ...config, model: config.model || config.whisperModel };
  if (targetProvider === 'local') {
    return withTranscriptionRetries(
      async () => requireUsableTranscript(await transcribeLocal(audioBlob, sttConfig, signal)),
      signal
    );
  }

  const electronAPI = typeof window !== 'undefined' ? window.electronAPI : undefined;
  if (!electronAPI?.transcribeCloudAudio) {
    throw new Error('Secure cloud transcription is available only in the desktop application.');
  }

  const targetModel = resolveTranscriptionModel(targetProvider, sttConfig.model);
  const wavBlob = await convertBlobToWav(audioBlob);
  const audio = await wavBlob.arrayBuffer();
  let prompt: string;

  if (targetProvider === 'groq') {
    const store = useAppStore.getState();
    const lastCategory =
      store.conversationHistory?.length > 0
        ? store.conversationHistory[store.conversationHistory.length - 1].category
        : 'General';
    const dynamicVocab = getDynamicWhisperVocab(
      lastCategory,
      store.resumeText || '',
      store.targetRole || ''
    );
    const techPrompt = [...new Set([...dynamicVocab, ...TECH_TERMS.slice(0, 30)])]
      .slice(0, 60)
      .join(', ');
    prompt = `Technical interview discussion: ${techPrompt}`;
  } else {
    const techPrompt = TECH_TERMS.slice(0, 50).join(', ');
    prompt = `Technical interview discussion about: AWS CodePipeline, AWS, Kubernetes, Docker, CI/CD, DevOps, ${techPrompt}`;
  }

  return withTranscriptionRetries(async () => {
    if (signal?.aborted) throw createTranscriptionAbortError(signal);

    // Each attempt gets a distinct main-process request ID. The failed attempt's
    // IPC controller is released before the next request is submitted.
    const requestId = crypto.randomUUID();
    const cancelRequest = () => {
      void electronAPI.cancelCloudTranscription?.(requestId).catch(() => undefined);
    };
    const requestPromise = electronAPI.transcribeCloudAudio({
      requestId,
      provider: targetProvider,
      model: targetModel,
      audio: new Uint8Array(audio),
      language: sttConfig.language,
      prompt,
    });
    signal?.addEventListener('abort', cancelRequest, { once: true });

    try {
      if (signal?.aborted) cancelRequest();
      const result = await requestPromise;
      if (result.cancelled || signal?.aborted) {
        throw createTranscriptionAbortError(signal);
      }
      return requireUsableTranscript(result);
    } finally {
      signal?.removeEventListener('abort', cancelRequest);
    }
  }, signal);
}

/**
 * Do not treat an empty or malformed ASR payload as a successful transcription.
 * The caller can now offer retry/manual correction instead of silently dropping a question.
 */
function requireUsableTranscript(result: TranscriptionResult): TranscriptionResult {
  if (!result || typeof result.text !== 'string') {
    throw new Error(
      '[TRANSCRIPTION_INVALID_RESPONSE] Speech provider returned an invalid transcript.'
    );
  }
  const text = postProcessTranscript(result.text);
  if (!text.trim()) {
    throw new Error(
      '[TRANSCRIPTION_EMPTY] No speech was recognized. Retry transcription or enter the question manually.'
    );
  }
  return { ...result, text };
}

/** Supports local endpoints with a multipart "file" field, such as whisper.cpp server. */
async function transcribeLocal(
  audioBlob: Blob,
  config: WhisperConfig,
  signal?: AbortSignal
): Promise<TranscriptionResult> {
  const wavBlob = await convertBlobToWav(audioBlob);
  const formData = new FormData();
  formData.append('file', wavBlob, 'recording.wav');
  if (config.language) formData.append('language', config.language);

  // Pass technical vocabulary prompt and greedy temperature to prime Whisper
  const techPrompt = TECH_TERMS.slice(0, 50).join(', ');
  formData.append(
    'prompt',
    `Technical interview discussion: AWS CodePipeline, AWS, Kubernetes, Docker, CI/CD, DevOps, ${techPrompt}`
  );
  formData.append('temperature', '0.0');
  formData.append('response_format', 'json');

  const endpoint = config.endpoint || 'http://localhost:8080/inference';
  const response = await fetch(endpoint, { method: 'POST', body: formData, signal });

  if (!response.ok) {
    const detail = await readErrorBody(response);
    throw new Error(`Local Whisper error: HTTP ${response.status} from ${endpoint} — ${detail}`);
  }

  const contentType = response.headers.get('content-type') || '';
  let data: any;
  if (contentType.includes('application/json')) {
    data = await response.json();
  } else {
    const text = await response.text();
    data = { text };
  }

  const transcript =
    typeof data === 'string' ? data : data.text || data.transcription || data.result || '';

  return {
    text: postProcessTranscript(String(transcript)),
    language: data.language,
    duration: data.duration,
  };
}

export function postProcessTranscript(text: string): string {
  // Preserve semantic content: parenthetical explanations and bracketed uncertainty markers
  // may contain real spoken information. ASR cleanup must never silently delete them.
  let processed = text.trim();
  const corrections: Record<string, string> = {
    'aws code pipeline': 'AWS CodePipeline',
    'aws codepipeline': 'AWS CodePipeline',
    'aws code build': 'AWS CodeBuild',
    'aws codebuild': 'AWS CodeBuild',
    'aws code deploy': 'AWS CodeDeploy',
    'aws codedeploy': 'AWS CodeDeploy',
    'aws code commit': 'AWS CodeCommit',
    'aws codecommit': 'AWS CodeCommit',
    'port pipeline': 'CodePipeline',
    'court pipeline': 'CodePipeline',
    'cold pipeline': 'CodePipeline',
    'call pipeline': 'CodePipeline',
    'code pipeline': 'CodePipeline',
    codepipeline: 'CodePipeline',
    'code build': 'CodeBuild',
    codebuild: 'CodeBuild',
    'code deploy': 'CodeDeploy',
    codedeploy: 'CodeDeploy',
    'code commit': 'CodeCommit',
    codecommit: 'CodeCommit',
    'amazon web services': 'AWS',
    aws: 'AWS',
    'node js': 'Node.js',
    nodejs: 'Node.js',
    'next js': 'Next.js',
    nextjs: 'Next.js',
    'react js': 'React',
    reactjs: 'React',
    'vue js': 'Vue.js',
    mongodb: 'MongoDB',
    'mongo db': 'MongoDB',
    postgres: 'PostgreSQL',
    'my sequel': 'MySQL',
    'my sql': 'MySQL',
    'dynamo db': 'DynamoDB',
    dynamodb: 'DynamoDB',
    redis: 'Redis',
    'elastic search': 'Elasticsearch',
    graphql: 'GraphQL',
    'graph ql': 'GraphQL',
    'rest api': 'REST API',
    restful: 'RESTful',
    typescript: 'TypeScript',
    'type script': 'TypeScript',
    javascript: 'JavaScript',
    'java script': 'JavaScript',
    docker: 'Docker',
    kubernetes: 'Kubernetes',
    k8s: 'Kubernetes',
    'ci cd': 'CI/CD',
    cicd: 'CI/CD',
    ec2: 'EC2',
    s3: 'S3',
    lambda: 'Lambda',
    oop: 'OOP',
    sql: 'SQL',
    nosql: 'NoSQL',
    api: 'API',
    sdk: 'SDK',
    jwt: 'JWT',
    oauth: 'OAuth',
    cors: 'CORS',
    http: 'HTTP',
    https: 'HTTPS',
    tcp: 'TCP',
    udp: 'UDP',
    dns: 'DNS',
    cdn: 'CDN',
    html: 'HTML',
    css: 'CSS',
    json: 'JSON',
    xml: 'XML',
    yaml: 'YAML',
    ide: 'IDE',
    git: 'Git',
    github: 'GitHub',
    gitlab: 'GitLab',
    devops: 'DevOps',
    'big o': 'Big O',
    'o of n': 'O(n)',
    'o of n squared': 'O(n²)',
    'o of log n': 'O(log n)',
    'o of n log n': 'O(n log n)',
    hashmap: 'HashMap',
    'hash map': 'HashMap',
    treemap: 'TreeMap',
    'linked list': 'LinkedList',
    'binary tree': 'Binary Tree',
    'binary search tree': 'Binary Search Tree',
    bfs: 'BFS',
    dfs: 'DFS',
    dijkstra: 'Dijkstra',
    dbms: 'DBMS',
    rdbms: 'RDBMS',
    acid: 'ACID',
    'cap theorem': 'CAP Theorem',
    solid: 'SOLID',
    mvc: 'MVC',
    mvvm: 'MVVM',
    jvm: 'JVM',
    jdk: 'JDK',
    jre: 'JRE',
  };

  for (const [wrong, right] of Object.entries(corrections)) {
    const regex = new RegExp(`\\b${wrong.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'gi');
    processed = processed.replace(regex, right);
  }
  return processed.trim();
}

/** Extract likely interview questions from a finalized transcript. */
export function extractQuestions(transcript: string): string[] {
  const sentences = transcript
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
  const questions: string[] = [];

  for (const sentence of sentences) {
    if (sentence.includes('?')) {
      questions.push(sentence);
      continue;
    }

    const questionPatterns = [
      /^(explain|describe|tell me|walk me through|what is|what are|how do|how does|how would|can you|could you|why|when|where|which|define|compare|differentiate|implement|write|design|solve|optimize|give|list|discuss)\b/i,
    ];
    if (sentence.length >= 8 && questionPatterns.some((pattern) => pattern.test(sentence))) {
      questions.push(sentence);
    }
  }

  if (questions.length === 0 && transcript.trim().length > 6) {
    questions.push(transcript.trim());
  }
  return questions;
}
