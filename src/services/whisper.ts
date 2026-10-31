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

export interface WhisperConfig {
  provider?: 'groq' | 'openai' | 'local';
  apiKey?: string;
  model?: string;
  endpoint?: string;
  language?: string;
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
      console.warn('[Whisper] Audio payload failed strict WAV validation. Attempting conversion...');
    }
  }

  // 2. Determine target provider
  const targetProvider =
    config.provider ||
    (config.endpoint && !config.endpoint.includes('groq.com') && !config.endpoint.includes('openai.com')
      ? 'local'
      : config.model?.toLowerCase().includes('whisper-1')
        ? 'openai'
        : 'groq');

  if (targetProvider === 'local') {
    return transcribeLocal(audioBlob, config, signal);
  }

  // 3. Resolve API key
  let apiKey = config.apiKey;
  if (!apiKey && typeof window !== 'undefined' && window.electronAPI?.getApiKey) {
    apiKey = (await window.electronAPI.getApiKey(targetProvider)) || undefined;
    if (!apiKey && targetProvider === 'groq') {
      // Fallback to openai key if configured
      apiKey = (await window.electronAPI.getApiKey('openai')) || undefined;
    }
  }

  if (!apiKey && typeof import.meta !== 'undefined' && (import.meta as any).env) {
    const env = (import.meta as any).env;
    if (targetProvider === 'groq') {
      apiKey = env.VITE_GROQ_API_KEY || env.GROQ_API_KEY;
    } else {
      apiKey = env.VITE_OPENAI_API_KEY || env.OPENAI_API_KEY;
    }
  }

  if (apiKey) {
    const match = apiKey.match(/gsk_[A-Za-z0-9_-]+/);
    const cleanKey = match ? match[0] : apiKey.trim();

    if (targetProvider === 'groq' || cleanKey.startsWith('gsk_')) {
      return transcribeGroq(audioBlob, cleanKey, config, signal);
    }
    return transcribeOpenAI(audioBlob, { ...config, apiKey: cleanKey }, signal);
  }

  throw new Error(
    `No speech-to-text API key found for ${targetProvider.toUpperCase()}. Please configure your API key in Settings.`
  );
}

async function transcribeGroq(
  audioBlob: Blob,
  apiKey: string,
  config?: WhisperConfig,
  signal?: AbortSignal
): Promise<TranscriptionResult> {
  const wavBlob = await convertBlobToWav(audioBlob);
  const formData = new FormData();
  formData.append('file', wavBlob, 'recording.wav');
  formData.append('model', config?.model || 'whisper-large-v3-turbo');
  formData.append('response_format', 'verbose_json');

  if (config?.language) formData.append('language', config.language);

  // Dynamic Whisper Priming: context-aware vocabulary injection
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
  formData.append('prompt', `Technical interview discussion: ${techPrompt}`);

  const response = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}` },
    body: formData,
    signal,
  });

  if (!response.ok) {
    const detail = await readErrorBody(response);
    throw new Error(`Groq Whisper error: HTTP ${response.status} — ${detail}`);
  }

  const data = await response.json();
  return {
    text: postProcessTranscript(data.text || ''),
    language: data.language,
    duration: data.duration,
    segments: data.segments?.map((seg: any) => ({
      start: seg.start,
      end: seg.end,
      text: seg.text,
    })),
  };
}

async function transcribeOpenAI(
  audioBlob: Blob,
  config: WhisperConfig,
  signal?: AbortSignal
): Promise<TranscriptionResult> {
  const wavBlob = await convertBlobToWav(audioBlob);
  const formData = new FormData();
  formData.append('file', wavBlob, 'recording.wav');
  formData.append('model', config.model || 'whisper-1');
  formData.append('response_format', 'verbose_json');

  if (config.language) formData.append('language', config.language);
  const techPrompt = TECH_TERMS.slice(0, 50).join(', ');
  formData.append(
    'prompt',
    `Technical interview discussion about: AWS CodePipeline, AWS, Kubernetes, Docker, CI/CD, DevOps, ${techPrompt}`
  );

  const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${config.apiKey}` },
    body: formData,
    signal,
  });

  if (!response.ok) {
    const detail = await readErrorBody(response);
    throw new Error(`Whisper API error: HTTP ${response.status} — ${detail}`);
  }

  const data = await response.json();
  return {
    text: postProcessTranscript(data.text || ''),
    language: data.language,
    duration: data.duration,
    segments: data.segments?.map((seg: any) => ({
      start: seg.start,
      end: seg.end,
      text: seg.text,
    })),
  };
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
