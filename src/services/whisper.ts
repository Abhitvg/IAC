/**
 * Whisper Transcription Service
 * Supports OpenAI Whisper API and local Whisper implementations
 */

import { TECH_TERMS } from './ai';
import { convertBlobToWav } from '../utils/audioConversion';

export interface WhisperConfig {
  apiKey?: string;
  model: string;
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
    // Keep diagnostics useful without dumping arbitrarily large server responses.
    return body.slice(0, 1500) || '(empty response body)';
  } catch {
    return '(could not read response body)';
  }
}

/** Transcribe audio using the configured local server or OpenAI API. */
export async function transcribeAudio(
  audioBlob: Blob,
  config: WhisperConfig
): Promise<TranscriptionResult> {
  if (config.endpoint) return transcribeLocal(audioBlob, config);
  if (config.apiKey) return transcribeOpenAI(audioBlob, config);

  throw new Error(
    'No Whisper configuration found. Set up a local Whisper server or provide an OpenAI API key.'
  );
}

async function transcribeOpenAI(
  audioBlob: Blob,
  config: WhisperConfig
): Promise<TranscriptionResult> {
  const wavBlob = await convertBlobToWav(audioBlob);
  const formData = new FormData();
  formData.append('file', wavBlob, 'recording.wav');
  formData.append('model', config.model || 'whisper-1');
  formData.append('response_format', 'verbose_json');

  if (config.language) formData.append('language', config.language);
  const techPrompt = TECH_TERMS.slice(0, 50).join(', ');
  formData.append('prompt', `Technical interview discussion about: ${techPrompt}`);

  const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${config.apiKey}` },
    body: formData,
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
  config: WhisperConfig
): Promise<TranscriptionResult> {
  const wavBlob = await convertBlobToWav(audioBlob);
  const formData = new FormData();
  formData.append('file', wavBlob, 'recording.wav');
  if (config.language) formData.append('language', config.language);

  const endpoint = config.endpoint || 'http://localhost:8080/inference';
  const response = await fetch(endpoint, { method: 'POST', body: formData });

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
    // Some local Whisper servers return plain text rather than JSON.
    data = { text };
  }

  const transcript = typeof data === 'string'
    ? data
    : (data.text || data.transcription || data.result || '');

  return {
    text: postProcessTranscript(String(transcript)),
    language: data.language,
    duration: data.duration,
  };
}

function postProcessTranscript(text: string): string {
  let processed = text;
  const corrections: Record<string, string> = {
    'port pipeline': 'CodePipeline',
    'code pipeline': 'CodePipeline',
    'aws': 'AWS',
    'node js': 'Node.js',
    'nodejs': 'Node.js',
    'next js': 'Next.js',
    'nextjs': 'Next.js',
    'react js': 'React',
    'reactjs': 'React',
    'vue js': 'Vue.js',
    'mongodb': 'MongoDB',
    'mongo db': 'MongoDB',
    'postgres': 'PostgreSQL',
    'my sequel': 'MySQL',
    'my sql': 'MySQL',
    'dynamo db': 'DynamoDB',
    'dynamodb': 'DynamoDB',
    'redis': 'Redis',
    'elastic search': 'Elasticsearch',
    'graphql': 'GraphQL',
    'graph ql': 'GraphQL',
    'rest api': 'REST API',
    'restful': 'RESTful',
    'typescript': 'TypeScript',
    'type script': 'TypeScript',
    'javascript': 'JavaScript',
    'java script': 'JavaScript',
    'docker': 'Docker',
    'kubernetes': 'Kubernetes',
    'k8s': 'Kubernetes',
    'ci cd': 'CI/CD',
    'cicd': 'CI/CD',
    'ec2': 'EC2',
    's3': 'S3',
    'lambda': 'Lambda',
    'oop': 'OOP',
    'sql': 'SQL',
    'nosql': 'NoSQL',
    'api': 'API',
    'sdk': 'SDK',
    'jwt': 'JWT',
    'oauth': 'OAuth',
    'cors': 'CORS',
    'http': 'HTTP',
    'https': 'HTTPS',
    'tcp': 'TCP',
    'udp': 'UDP',
    'dns': 'DNS',
    'cdn': 'CDN',
    'html': 'HTML',
    'css': 'CSS',
    'json': 'JSON',
    'xml': 'XML',
    'yaml': 'YAML',
    'ide': 'IDE',
    'git': 'Git',
    'github': 'GitHub',
    'gitlab': 'GitLab',
    'devops': 'DevOps',
    'big o': 'Big O',
    'o of n': 'O(n)',
    'o of n squared': 'O(n²)',
    'o of log n': 'O(log n)',
    'o of n log n': 'O(n log n)',
    'hashmap': 'HashMap',
    'hash map': 'HashMap',
    'treemap': 'TreeMap',
    'linked list': 'LinkedList',
    'binary tree': 'Binary Tree',
    'binary search tree': 'Binary Search Tree',
    'bfs': 'BFS',
    'dfs': 'DFS',
    'dijkstra': 'Dijkstra',
    'dbms': 'DBMS',
    'rdbms': 'RDBMS',
    'acid': 'ACID',
    'cap theorem': 'CAP Theorem',
    'solid': 'SOLID',
    'mvc': 'MVC',
    'mvvm': 'MVVM',
    'jvm': 'JVM',
    'jdk': 'JDK',
    'jre': 'JRE',
  };

  for (const [wrong, right] of Object.entries(corrections)) {
    const regex = new RegExp(`\\b${wrong.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'gi');
    processed = processed.replace(regex, right);
  }
  return processed.trim();
}

/** Extract likely interview questions from a finalized transcript. */
export function extractQuestions(transcript: string): string[] {
  const sentences = transcript.split(/(?<=[.!?])\s+/).map(s => s.trim()).filter(Boolean);
  const questions: string[] = [];

  for (const sentence of sentences) {
    if (sentence.includes('?')) {
      questions.push(sentence);
      continue;
    }

    const questionPatterns = [
      /^(explain|describe|tell me|walk me through|what is|what are|how do|how does|how would|can you|could you|why|when|where|which|define|compare|differentiate|implement|write|design|solve|optimize|give|list|discuss)\b/i,
    ];
    if (sentence.length > 15 && questionPatterns.some(pattern => pattern.test(sentence))) {
      questions.push(sentence);
    }
  }

  if (questions.length === 0 && transcript.trim().length > 10) {
    questions.push(transcript.trim());
  }
  return questions;
}
