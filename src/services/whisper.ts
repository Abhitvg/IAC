/**
 * Whisper Transcription Service
 * Supports OpenAI Whisper API and local Whisper implementations
 */

import { TECH_TERMS } from './ai';
import { convertBlobToWav } from '../utils/audioConversion';

export interface WhisperConfig {
  apiKey?: string;
  model: string;
  endpoint?: string; // For local Whisper server
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

/**
 * Transcribe audio using Whisper
 */
export async function transcribeAudio(
  audioBlob: Blob,
  config: WhisperConfig
): Promise<TranscriptionResult> {
  // Try local Whisper first, then fall back to OpenAI API
  if (config.endpoint) {
    return transcribeLocal(audioBlob, config);
  }
  
  if (config.apiKey) {
    return transcribeOpenAI(audioBlob, config);
  }

  throw new Error('No Whisper configuration found. Please set up either a local Whisper server or provide an OpenAI API key.');
}

/**
 * Transcribe using OpenAI Whisper API
 */
async function transcribeOpenAI(audioBlob: Blob, config: WhisperConfig): Promise<TranscriptionResult> {
  const wavBlob = await convertBlobToWav(audioBlob);
  const formData = new FormData();
  formData.append('file', wavBlob, 'recording.wav');
  formData.append('model', config.model || 'whisper-1');
  formData.append('response_format', 'verbose_json');
  
  if (config.language) {
    formData.append('language', config.language);
  }

  // Add technical vocabulary as prompt to improve accuracy
  const techPrompt = TECH_TERMS.slice(0, 50).join(', ');
  formData.append('prompt', `Technical interview discussion about: ${techPrompt}`);

  const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${config.apiKey}`,
    },
    body: formData,
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Whisper API error: ${response.status} - ${errorText}`);
  }

  const data = await response.json();
  
  return {
    text: postProcessTranscript(data.text),
    language: data.language,
    duration: data.duration,
    segments: data.segments?.map((seg: any) => ({
      start: seg.start,
      end: seg.end,
      text: seg.text,
    })),
  };
}

/**
 * Transcribe using local Whisper server (e.g., whisper.cpp, faster-whisper)
 */
async function transcribeLocal(audioBlob: Blob, config: WhisperConfig): Promise<TranscriptionResult> {
  const wavBlob = await convertBlobToWav(audioBlob);
  const formData = new FormData();
  formData.append('file', wavBlob, 'recording.wav');
  formData.append('model', config.model || 'base');
  
  if (config.language) {
    formData.append('language', config.language);
  }

  const endpoint = config.endpoint || 'http://localhost:8080/inference';

  const response = await fetch(endpoint, {
    method: 'POST',
    body: formData,
  });

  if (!response.ok) {
    throw new Error(`Local Whisper error: ${response.status}`);
  }

  const data = await response.json();
  
  return {
    text: postProcessTranscript(data.text || data.transcription || ''),
    language: data.language,
    duration: data.duration,
  };
}

/**
 * Post-process transcript to fix common technical term errors
 */
function postProcessTranscript(text: string): string {
  let processed = text;

  // Common misrecognitions and corrections
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
    'aws': 'AWS',
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
    const regex = new RegExp(`\\b${wrong}\\b`, 'gi');
    processed = processed.replace(regex, right);
  }

  return processed.trim();
}

/**
 * Extract questions from a transcript
 */
export function extractQuestions(transcript: string): string[] {
  const sentences = transcript.split(/[.!?]+/).map(s => s.trim()).filter(Boolean);
  const questions: string[] = [];

  for (const sentence of sentences) {
    // Direct questions
    if (sentence.endsWith('?') || sentence.includes('?')) {
      questions.push(sentence);
      continue;
    }

    // Imperative/directive questions common in interviews
    const questionPatterns = [
      /^(explain|describe|tell me|walk me through|what is|what are|how do|how does|how would|can you|could you|why|when|where|which|define|compare|differentiate|implement|write|design|solve|optimize|give|list|discuss)/i,
    ];

    if (questionPatterns.some(p => p.test(sentence)) && sentence.length > 15) {
      questions.push(sentence);
    }
  }

  // If no explicit questions found, treat the whole transcript as the question
  if (questions.length === 0 && transcript.length > 10) {
    questions.push(transcript.trim());
  }

  return questions;
}
