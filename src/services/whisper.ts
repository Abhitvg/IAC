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
  apiKey?: string;
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

/**
 * Transcribe audio using Groq Whisper Large V3 Turbo, OpenAI Whisper, or a local server.
 * Propagates AbortSignal to all fetch requests.
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

  // 1. Validate audio payload before network transmission
  if (!audioBlob || audioBlob.size < 400) {
    return { text: '' };
  }

  const arrayBuf = await audioBlob.arrayBuffer();
  // Quick sanity check on audio buffer structure
  if (arrayBuf.byteLength >= 44) {
    // If it's supposed to be WAV, check validation
    const headerStr = String.fromCharCode(...new Uint8Array(arrayBuf.slice(0, 4)));
    if (headerStr === 'RIFF' && !isValidWav(arrayBuf)) {
      console.warn(
        '[Whisper] Audio payload failed strict WAV validation. Attempting conversion...'
      );
    }
  }

  // 2. Respect the application-selected provider. Ollama means local Whisper;
  // never fall through to cloud STT when local mode is selected.
  const targetProvider = resolveTranscriptionProvider(config);
  const sttConfig = { ...config, model: config.model || config.whisperModel };

  if (targetProvider === 'local') {
    return transcribeLocal(audioBlob, sttConfig, signal);
  }

  // Cloud transcription credentials and provider requests stay in Electron main.
  const cloudProvider = targetProvider as 'groq' | 'openai';
  const targetModel = resolveTranscriptionModel(cloudProvider, sttConfig.model);
  const wavBlob = await convertBlobToWav(audioBlob);
  const audio = new Uint8Array(await wavBlob.arrayBuffer());
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
  const prompt =
    cloudProvider === 'groq'
      ? `Technical interview discussion: ${[...new Set([...dynamicVocab, ...TECH_TERMS.slice(0, 30)])]
          .slice(0, 60)
          .join(', ')}`
      : `Technical interview discussion about: AWS CodePipeline, AWS, Kubernetes, Docker, CI/CD, DevOps, ${TECH_TERMS.slice(0, 50).join(', ')}`;

  const electronAPI = typeof window !== 'undefined' ? window.electronAPI : undefined;
  if (!electronAPI?.transcribeCloudAudio) {
    throw new Error('Secure cloud transcription is unavailable in this application session.');
  }

  const requestId = crypto.randomUUID();
  const cancelRequest = () => {
    void electronAPI.cancelCloudTranscription?.(requestId);
  };
  signal?.addEventListener('abort', cancelRequest, { once: true });

  try {
    if (signal?.aborted) {
      const abortError = new Error('Transcription aborted');
      abortError.name = 'AbortError';
      throw abortError;
    }

    const data = await electronAPI.transcribeCloudAudio({
      requestId,
      provider: cloudProvider,
      model: targetModel,
      audio,
      language: config.language,
      prompt,
    });

    return {
      text: postProcessTranscript(data.text || ''),
      language: data.language,
      duration: data.duration,
      segments: data.segments,
    };
  } catch (error) {
    if (signal?.aborted) {
      const abortError = new Error('Transcription aborted');
      abortError.name = 'AbortError';
      throw abortError;
    }
    throw error;
  } finally {
    signal?.removeEventListener('abort', cancelRequest);
  }
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
  let processed = text.replace(/\[[^\]]+\]|\([^)]+\)/g, '').trim();
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
