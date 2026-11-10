import { AIStreamParser } from './AIStreamParser';
import { SentenceBuffer } from './SentenceBuffer';
import { globalLatencyTracker } from './LatencyTracker';
import {
  resolveOrMigrateModel,
  getModelFallbackChain,
  classifyAIError,
  sanitizeDiagnosticSecret,
  createSafeDiagnosticRecord,
  FallbackDiagnosticRecord,
  AIProviderId,
  getDefaultModelForProvider,
} from './models/modelRegistry';
import {
  AIProviderConfig,
  AIResponse,
  CodingSolution,
  ProgrammingLanguage,
  QuestionCategory,
  Difficulty,
  ResumeContext,
} from '../types';

// ─── Technical Term Dictionary ───

const TECH_TERMS = [
  'React',
  'Node.js',
  'Next.js',
  'MongoDB',
  'PostgreSQL',
  'AWS',
  'Docker',
  'Kubernetes',
  'Java',
  'Python',
  'C++',
  'TypeScript',
  'CodePipeline',
  'Lambda',
  'EC2',
  'S3',
  'DynamoDB',
  'Redis',
  'GraphQL',
  'REST',
  'API',
  'OAuth',
  'JWT',
  'CORS',
  'HTTPS',
  'TCP',
  'UDP',
  'DNS',
  'CDN',
  'CI/CD',
  'DevOps',
  'Git',
  'GitHub',
  'GitLab',
  'Jenkins',
  'Terraform',
  'Ansible',
  'NGINX',
  'Apache',
  'Express',
  'NestJS',
  'Spring Boot',
  'Hibernate',
  'JPA',
  'JDBC',
  'MySQL',
  'SQLite',
  'Cassandra',
  'Elasticsearch',
  'Kafka',
  'RabbitMQ',
  'gRPC',
  'WebSocket',
  'HashMap',
  'TreeMap',
  'LinkedList',
  'Binary Tree',
  'Graph',
  'Dynamic Programming',
  'Greedy',
  'BFS',
  'DFS',
  'Dijkstra',
  'Quick Sort',
  'Merge Sort',
  'Heap Sort',
  'Binary Search',
  'Normalization',
  'ACID',
  'BASE',
  'CAP Theorem',
  'Sharding',
  'Microservices',
  'Monolith',
  'Load Balancer',
  'Rate Limiting',
  'Caching',
  'Memcached',
  'Pub/Sub',
  'Event Driven',
  'Virtual Memory',
  'Process',
  'Thread',
  'Mutex',
  'Semaphore',
  'Deadlock',
  'Race Condition',
  'Context Switch',
  'Polymorphism',
  'Encapsulation',
  'Inheritance',
  'Abstraction',
  'SOLID',
  'Design Patterns',
  'Singleton',
  'Factory',
  'Observer',
  'Strategy',
  'MVC',
  'MVVM',
  'Redux',
  'Zustand',
  'Vue',
  'Angular',
  'Svelte',
  'Tailwind',
  'Bootstrap',
  'Webpack',
  'Vite',
  'Babel',
];

// ─── Question Classification ───

const CATEGORY_KEYWORDS: Record<QuestionCategory, string[]> = {
  Coding: [
    'code',
    'write a function',
    'implement',
    'algorithm',
    'solve',
    'program',
    'write code',
    'coding',
  ],
  DSA: [
    'array',
    'linked list',
    'tree',
    'graph',
    'stack',
    'queue',
    'hash',
    'sort',
    'search',
    'dynamic programming',
    'greedy',
    'two pointer',
    'sliding window',
    'binary search',
    'recursion',
    'backtracking',
    'BFS',
    'DFS',
    'heap',
    'trie',
    'time complexity',
    'space complexity',
    'Big O',
  ],
  'System Design': [
    'design',
    'architecture',
    'scalable',
    'distributed',
    'microservices',
    'load balancer',
    'cache',
    'database design',
    'API design',
    'URL shortener',
    'chat system',
    'notification',
    'rate limiter',
    'high availability',
    'fault tolerant',
    'scale',
  ],
  DBMS: [
    'database',
    'SQL',
    'normalization',
    'ACID',
    'transaction',
    'index',
    'join',
    'primary key',
    'foreign key',
    'relational',
    'query',
    'schema',
    'NoSQL',
    'MongoDB',
    'PostgreSQL',
    'MySQL',
    'aggregate',
    'group by',
    'stored procedure',
    'trigger',
    'view',
  ],
  'Operating Systems': [
    'process',
    'thread',
    'deadlock',
    'memory',
    'virtual memory',
    'paging',
    'scheduling',
    'semaphore',
    'mutex',
    'file system',
    'kernel',
    'interrupt',
    'context switch',
    'race condition',
    'operating system',
    'OS',
  ],
  'Computer Networks': [
    'TCP',
    'UDP',
    'HTTP',
    'HTTPS',
    'DNS',
    'OSI',
    'IP address',
    'subnet',
    'routing',
    'firewall',
    'proxy',
    'VPN',
    'bandwidth',
    'latency',
    'packet',
    'socket',
    'port',
    'protocol',
    'network',
  ],
  OOP: [
    'object oriented',
    'OOP',
    'class',
    'inheritance',
    'polymorphism',
    'encapsulation',
    'abstraction',
    'interface',
    'abstract class',
    'SOLID',
    'design pattern',
    'singleton',
    'factory',
    'observer',
    'strategy',
  ],
  Java: [
    'Java',
    'JVM',
    'JDK',
    'Spring',
    'Spring Boot',
    'Hibernate',
    'JPA',
    'Maven',
    'Gradle',
    'Collections',
    'Stream API',
    'Multithreading in Java',
    'Garbage Collection',
  ],
  Python: [
    'Python',
    'Django',
    'Flask',
    'FastAPI',
    'pip',
    'virtualenv',
    'decorator',
    'generator',
    'list comprehension',
    'GIL',
    'Pythonic',
  ],
  JavaScript: [
    'JavaScript',
    'JS',
    'ES6',
    'closure',
    'prototype',
    'async await',
    'promise',
    'callback',
    'event loop',
    'hoisting',
    'scope',
    'this keyword',
    'arrow function',
  ],
  React: [
    'React',
    'hooks',
    'useState',
    'useEffect',
    'component',
    'JSX',
    'Redux',
    'context',
    'virtual DOM',
    'reconciliation',
    'Next.js',
    'SSR',
    'SSG',
  ],
  'Node.js': [
    'Node',
    'Node.js',
    'Express',
    'NestJS',
    'middleware',
    'event loop',
    'stream',
    'buffer',
    'cluster',
    'npm',
    'package',
  ],
  AWS: [
    'AWS',
    'EC2',
    'S3',
    'Lambda',
    'DynamoDB',
    'CloudFront',
    'SQS',
    'SNS',
    'ECS',
    'EKS',
    'IAM',
    'VPC',
    'RDS',
    'CodePipeline',
    'CloudWatch',
    'Route 53',
  ],
  DevOps: [
    'Docker',
    'Kubernetes',
    'CI/CD',
    'Jenkins',
    'GitLab CI',
    'GitHub Actions',
    'Terraform',
    'Ansible',
    'monitoring',
    'deployment',
    'container',
    'orchestration',
    'pipeline',
  ],
  Behavioral: [
    'tell me about',
    'describe a time',
    'challenging',
    'conflict',
    'teamwork',
    'leadership',
    'failure',
    'mistake',
    'strength',
    'weakness',
    'why do you want',
    'where do you see',
    'motivation',
  ],
  Resume: [
    'resume',
    'your project',
    'your experience',
    'tell me about your',
    'walk me through',
    'your background',
    'your role',
    'your contribution',
  ],
  Project: [
    'project',
    'what did you build',
    'architecture of your',
    'tech stack',
    'challenges in your',
    'your application',
  ],
  HR: [
    'salary',
    'notice period',
    'relocation',
    'joining',
    'CTC',
    'benefits',
    'work from home',
    'remote',
    'hybrid',
    'shift',
  ],
  General: [],
};

export function classifyQuestion(question: string): {
  category: QuestionCategory;
  difficulty: Difficulty;
} {
  const lowerQ = question.toLowerCase();
  let maxScore = 0;
  let bestCategory: QuestionCategory = 'General';

  for (const [category, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
    let score = 0;
    for (const keyword of keywords) {
      if (lowerQ.includes(keyword.toLowerCase())) {
        score += keyword.split(' ').length; // Multi-word matches score higher
      }
    }
    if (score > maxScore) {
      maxScore = score;
      bestCategory = category as QuestionCategory;
    }
  }

  // Difficulty estimation
  let difficulty: Difficulty = 'Medium';
  const hardIndicators = [
    'optimize',
    'most efficient',
    'design a system',
    'distributed',
    'at scale',
    'real-time',
    'concurrent',
    'advanced',
    'complex',
  ];
  const easyIndicators = [
    'what is',
    'define',
    'explain',
    'difference between',
    'list',
    'types of',
    'basic',
    'simple',
  ];

  if (hardIndicators.some((ind) => lowerQ.includes(ind))) {
    difficulty = 'Hard';
  } else if (easyIndicators.some((ind) => lowerQ.includes(ind))) {
    difficulty = 'Easy';
  }

  return { category: bestCategory, difficulty };
}

// ─── AI Provider Factory ───

export function createSystemPrompt(
  config: AIProviderConfig,
  mode: 'quick' | 'interview' | 'deep',
  category: QuestionCategory,
  language: ProgrammingLanguage,
  resumeContext?: ResumeContext | null
): string {
  const basePrompt = config.systemPrompt || 'You are a technical interview assistant.';

  const modeInstructions: Record<string, string> = {
    quick:
      'Provide a concise 2-5 sentence answer suitable for speaking aloud in an interview. Be direct and clear.',
    interview:
      'Provide a natural, well-structured answer that a candidate could explain verbally in an interview. Include key points, brief examples, and be conversational yet technical. Aim for 1-2 minutes of speaking time.',
    deep: 'Provide a comprehensive technical explanation including: concept explanation, detailed examples, tradeoffs, edge cases, architecture considerations, and potential follow-up questions the interviewer might ask.',
  };

  const codingInstructions = ['Coding', 'DSA'].includes(category)
    ? `\n\nFor coding questions, provide:
1. Problem Understanding
2. Brute Force Approach (briefly)
3. Optimized Approach
4. Algorithm explanation
5. Code in ${language}
6. Time Complexity
7. Space Complexity
8. Edge Cases
9. Brief interview explanation\n\nUse markdown code blocks with language identifier.`
    : '';

  const resumeInstructions = resumeContext
    ? `\n\nCandidate Resume Context:
Projects: ${resumeContext.projects.join(', ')}
Skills: ${resumeContext.skills.join(', ')}
Technologies: ${resumeContext.technologies.join(', ')}
Experience: ${resumeContext.experience.join(', ')}\n\nUse this context to personalize answers when relevant, especially for behavioral, resume, and project questions.`
    : '';

  return `${basePrompt}\n\nCategory: ${category}\nMode: ${mode}\n${modeInstructions[mode]}\n${codingInstructions}\n${resumeInstructions}\n\nFOLLOW_UPS: [follow-up 1] | [follow-up 2] | [follow-up 3]`;
}

export async function generateAIResponse(
  question: string,
  config: AIProviderConfig,
  language: ProgrammingLanguage,
  resumeContext?: ResumeContext | null,
  additionalContext?: string,
  activeMode: 'quick' | 'interview' | 'deep' = 'interview'
): Promise<AIResponse> {
  const { category, difficulty } = classifyQuestion(question);
  const timestamp = new Date().toISOString();

  // Generate only the requested mode to save processing time (crucial for local LLMs)
  let quickAnswer = "Click 'Regenerate Answer' to generate this mode.";
  let interviewAnswer = "Click 'Regenerate Answer' to generate this mode.";
  let detailedAnswer = "Click 'Regenerate Answer' to generate this mode.";

  if (activeMode === 'quick') {
    quickAnswer = await callAI(
      question,
      config,
      'quick',
      category,
      language,
      resumeContext,
      additionalContext
    );
  } else if (activeMode === 'interview') {
    interviewAnswer = await callAI(
      question,
      config,
      'interview',
      category,
      language,
      resumeContext,
      additionalContext
    );
  } else if (activeMode === 'deep') {
    detailedAnswer = await callAI(
      question,
      config,
      'deep',
      category,
      language,
      resumeContext,
      additionalContext
    );
  }

  // Extract follow-up questions from detailed answer
  const followUpQuestions = extractFollowUps(detailedAnswer);

  // Extract coding solution if applicable
  let codingSolution: CodingSolution | undefined;
  if (['Coding', 'DSA'].includes(category)) {
    codingSolution = extractCodingSolution(detailedAnswer, language);
  }

  return {
    quickAnswer,
    interviewAnswer,
    detailedAnswer,
    codingSolution,
    category,
    difficulty,
    followUpQuestions,
    timestamp,
  };
}

async function callAI(
  question: string,
  config: AIProviderConfig,
  mode: 'quick' | 'interview' | 'deep',
  category: QuestionCategory,
  language: ProgrammingLanguage,
  resumeContext?: ResumeContext | null,
  additionalContext?: string
): Promise<string> {
  const systemPrompt = createSystemPrompt(config, mode, category, language, resumeContext);
  const userMessage = additionalContext
    ? `Question: ${question}\n\nAdditional Context:\n${additionalContext}`
    : `Question: ${question}`;

  switch (config.type) {
    case 'openai':
      return callOpenAI(config, systemPrompt, userMessage);
    case 'openrouter':
      return callOpenRouter(config, systemPrompt, userMessage);
    case 'ollama':
      return callOllama(config, systemPrompt, userMessage);
    case 'custom':
      return callCustomAPI(config, systemPrompt, userMessage);
    default:
      throw new Error(`Unsupported AI provider: ${config.type}`);
  }
}

async function callOpenAI(
  config: AIProviderConfig,
  systemPrompt: string,
  userMessage: string
): Promise<string> {
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify({
      model: config.model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userMessage },
      ],
      temperature: config.temperature,
      max_tokens: Math.min(config.maxTokens || 1800, 2500),
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`OpenAI API error: ${response.status} - ${err}`);
  }

  const data = await response.json();
  return data.choices?.[0]?.message?.content || 'No response generated.';
}

async function callOpenRouter(
  config: AIProviderConfig,
  systemPrompt: string,
  userMessage: string
): Promise<string> {
  const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${config.apiKey}`,
      'HTTP-Referer': 'ai-interview-assistant',
    },
    body: JSON.stringify({
      model: config.model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userMessage },
      ],
      stream: !!config.onChunk,
      temperature: config.temperature,
      max_tokens: Math.min(config.maxTokens || 1800, 2500),
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`OpenRouter API error: ${response.status} - ${err}`);
  }

  if (config.onChunk && response.body) {
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let fullContent = '';
    let buffer = '';
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';
      for (const line of lines) {
        if (!line.trim() || line === 'data: [DONE]') continue;
        if (line.startsWith('data: ')) {
          try {
            const parsed = JSON.parse(line.slice(6));
            const delta = parsed.choices?.[0]?.delta;
            if (delta && (delta.content || delta.reasoning)) {
              if (delta.reasoning) {
                if (!fullContent.includes('<think>')) fullContent += '<think>';
                fullContent += delta.reasoning;
              }
              if (delta.content) {
                if (fullContent.includes('<think>') && !fullContent.includes('</think>')) {
                  fullContent += '</think>\n\n';
                }
                fullContent += delta.content;
              }
              config.onChunk(fullContent);
            }
          } catch (_e) {}
        }
      }
    }
    return fullContent;
  }

  const data = await response.json();
  return data.choices?.[0]?.message?.content || 'No response generated.';
}

async function callOllama(
  config: AIProviderConfig,
  systemPrompt: string,
  userMessage: string
): Promise<string> {
  const endpoint = config.ollamaEndpoint || 'http://localhost:11434';
  const response = await fetch(`${endpoint}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: config.model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userMessage },
      ],
      stream: !!config.onChunk,
      options: {
        temperature: config.temperature,
        num_predict: config.maxTokens,
      },
    }),
  });

  if (!response.ok) {
    throw new Error(`Ollama error: ${response.status}`);
  }

  if (config.onChunk && response.body) {
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let fullContent = '';
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const chunk = decoder.decode(value, { stream: true });
      const lines = chunk.split('\n');
      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const parsed = JSON.parse(line);
          if (parsed.message?.content) {
            fullContent += parsed.message.content;
            config.onChunk(fullContent);
          }
        } catch (_e) {}
      }
    }
    return fullContent;
  }

  const data = await response.json();
  return data.message?.content || 'No response generated.';
}

async function callCustomAPI(
  config: AIProviderConfig,
  systemPrompt: string,
  userMessage: string
): Promise<string> {
  if (!config.customEndpoint) throw new Error('Custom API endpoint not configured');

  const response = await fetch(config.customEndpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(config.apiKey ? { Authorization: `Bearer ${config.apiKey}` } : {}),
    },
    body: JSON.stringify({
      model: config.model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userMessage },
      ],
      temperature: config.temperature,
      max_tokens: Math.min(config.maxTokens || 1800, 2500),
    }),
  });

  if (!response.ok) {
    throw new Error(`Custom API error: ${response.status}`);
  }

  const data = await response.json();
  return data.choices?.[0]?.message?.content || data.message?.content || 'No response generated.';
}

function extractFollowUps(text: string): string[] {
  const followUpSection = text.split(/\*\*Possible Follow-ups?:\*\*/i)[1];
  if (!followUpSection) return [];

  return followUpSection
    .split('\n')
    .map((line) => line.replace(/^[-*•\d.)\s]+/, '').trim())
    .filter((line) => line.length > 5 && line.endsWith('?'));
}

function extractCodingSolution(text: string, language: ProgrammingLanguage): CodingSolution {
  const codeMatch = text.match(
    /```(?:java|python|cpp|javascript|typescript|go|csharp|c\+\+|js|ts)?\n([\s\S]*?)```/
  );
  const timeMatch = text.match(/Time[:\s]*O\([^)]+\)/i);
  const spaceMatch = text.match(/Space[:\s]*O\([^)]+\)/i);

  return {
    problemUnderstanding: extractSection(text, 'Problem Understanding') || '',
    bruteForceApproach: extractSection(text, 'Brute Force') || '',
    optimizedApproach: extractSection(text, 'Optimized') || '',
    algorithm: extractSection(text, 'Algorithm') || '',
    code: codeMatch?.[1]?.trim() || '',
    language,
    timeComplexity: timeMatch?.[0] || 'See analysis above',
    spaceComplexity: spaceMatch?.[0] || 'See analysis above',
    edgeCases: extractListItems(text, 'Edge Cases'),
    optimizations: extractListItems(text, 'Optimization'),
    interviewExplanation: extractSection(text, 'Interview Explanation') || '',
  };
}

function extractSection(text: string, heading: string): string | null {
  const regex = new RegExp(
    `(?:#{1,4}\\s*)?${heading}[:\\s]*\\n([\\s\\S]*?)(?=\\n#{1,4}|\\n\\*\\*|$)`,
    'i'
  );
  const match = text.match(regex);
  return match?.[1]?.trim() || null;
}

function extractListItems(text: string, heading: string): string[] {
  const section = extractSection(text, heading);
  if (!section) return [];
  return section
    .split('\n')
    .map((line) => line.replace(/^[-*•\d.)\s]+/, '').trim())
    .filter((line) => line.length > 0);
}

export { TECH_TERMS };

export interface AIStreamCallbacks {
  onToken?: (token: string) => void;
  onSentence?: (sentence: string) => void;
  onComplete?: (fullResponse: string) => void | Promise<void>;
  onError?: (error: Error) => void;
  onDiagnostic?: (diagnostic: FallbackDiagnosticRecord) => void;
}

async function fetchCloudProviderResponse(
  electronAPI: Window['electronAPI'],
  request: {
    requestId: string;
    provider: 'groq' | 'openai' | 'openrouter';
    model: string;
    systemPrompt: string;
    question: string;
    temperature: number;
    maxTokens: number;
    stream: boolean;
  },
  signal: AbortSignal
): Promise<Response> {
  if (signal.aborted) {
    throw Object.assign(new Error('AI generation cancelled.'), { name: 'AbortError' });
  }
  const requestId = request.requestId;
  const encoder = new TextEncoder();
  let streamController: ReadableStreamDefaultController<Uint8Array> | null = null;
  let settled = false;
  let unsubscribeChunk = () => {};
  let unsubscribeDone = () => {};
  let unsubscribeError = () => {};

  const cleanup = () => {
    if (settled) return;
    settled = true;
    unsubscribeChunk();
    unsubscribeDone();
    unsubscribeError();
    signal.removeEventListener('abort', abortRequest);
  };

  const abortRequest = () => {
    void electronAPI.cancelCloudLLMStream(requestId).catch(() => undefined);
    try {
      streamController?.error(
        Object.assign(new Error('AI generation cancelled.'), { name: 'AbortError' })
      );
    } catch {}
    cleanup();
  };

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      streamController = controller;
    },
    cancel() {
      void electronAPI.cancelCloudLLMStream(requestId).catch(() => undefined);
      cleanup();
    },
  });

  unsubscribeChunk = electronAPI.onAIStreamChunk(({ requestId: id, chunk }) => {
    if (id !== requestId || settled || !streamController) return;
    streamController.enqueue(encoder.encode(chunk));
  });
  unsubscribeDone = electronAPI.onAIStreamDone(({ requestId: id }) => {
    if (id !== requestId || settled) return;
    try {
      streamController?.close();
    } catch {}
    cleanup();
  });
  unsubscribeError = electronAPI.onAIStreamError(({ requestId: id, name, message }) => {
    if (id !== requestId || settled) return;
    try {
      streamController?.error(Object.assign(new Error(message), { name }));
    } catch {}
    cleanup();
  });

  if (signal.aborted) abortRequest();
  else signal.addEventListener('abort', abortRequest, { once: true });

  try {
    const result = await electronAPI.startCloudLLMStream(request);
    if (!result.ok || !request.stream) {
      cleanup();
      return new Response(result.body || '', {
        status: result.status,
        statusText: result.statusText,
        headers: result.headers,
      });
    }
    return new Response(stream, {
      status: result.status,
      statusText: result.statusText,
      headers: result.headers,
    });
  } catch (error) {
    cleanup();
    throw error;
  }
}

export const MAX_RENDERER_LLM_RESPONSE_BYTES = 8 * 1024 * 1024;
export const MAX_RENDERER_LLM_ERROR_BYTES = 64 * 1024;

async function readResponseTextLimited(response: Response, maxBytes: number): Promise<string> {
  if (!response.body) return '';
  const reader = response.body.getReader();
  const decoder = new TextDecoder('utf-8');
  let bytesRead = 0;
  let text = '';
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytesRead += value.byteLength;
      if (bytesRead > maxBytes) {
        try {
          void reader.cancel('Response body exceeded configured size limit').catch(() => undefined);
        } catch {
          // Preserve the deterministic size-limit error if cancellation fails.
        }
        throw new RangeError(`AI provider response exceeded the ${maxBytes}-byte limit.`);
      }
      text += decoder.decode(value, { stream: true });
    }
    return text + decoder.decode();
  } finally {
    try {
      reader.releaseLock();
    } catch {
      // The stream may already have released its reader.
    }
  }
}

async function readResponseJsonLimited(response: Response, maxBytes: number): Promise<any> {
  const text = await readResponseTextLimited(response, maxBytes);
  try {
    return JSON.parse(text);
  } catch {
    throw new Error('AI provider returned invalid JSON.');
  }
}

export async function streamAnswer(
  question: string,
  config: AIProviderConfig,
  language: ProgrammingLanguage,
  callbacks: AIStreamCallbacks,
  signal?: AbortSignal,
  timeoutConfig: { overallTimeoutMs?: number; inactivityTimeoutMs?: number } = {}
): Promise<void> {
  const overallTimeoutMs = timeoutConfig.overallTimeoutMs ?? 60000;
  const inactivityTimeoutMs = timeoutConfig.inactivityTimeoutMs ?? 15000;
  const requestController = new AbortController();
  const abortFromCaller = () => requestController.abort(signal?.reason);
  if (signal?.aborted) requestController.abort(signal.reason);
  else signal?.addEventListener('abort', abortFromCaller, { once: true });
  const overallTimer = setTimeout(
    () => requestController.abort(new Error('Overall generation deadline exceeded (60s).')),
    overallTimeoutMs
  );
  const requestSignal = requestController.signal;
  let activeReader: ReadableStreamDefaultReader<Uint8Array> | null = null;
  const systemPrompt =
    config.systemPrompt || createSystemPrompt(config, 'interview', 'General', language, null);

  // Use tailored system prompt if explicitly provided; otherwise use assembled system prompt
  const lowLatencyPrompt = config.systemPrompt ? config.systemPrompt : systemPrompt;

  const url =
    config.type === 'openrouter'
      ? 'https://openrouter.ai/api/v1/chat/completions'
      : config.type === 'openai'
        ? 'https://api.openai.com/v1/chat/completions'
        : config.type === 'groq'
          ? 'https://api.groq.com/openai/v1/chat/completions'
          : config.customEndpoint || 'https://api.openai.com/v1/chat/completions';

  let cleanKey = (config.apiKey || '').trim();
  if (config.type === 'groq') {
    const match = cleanKey.match(/gsk_[A-Za-z0-9_-]+/);
    if (match) cleanKey = match[0];
  }

  const headers: any = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${cleanKey}`,
  };
  if (config.type === 'openrouter') headers['HTTP-Referer'] = 'ai-interview-assistant';

  // Authoritative model resolution & migration check
  const providerId = (config.type || 'groq') as AIProviderId;
  const resolution = resolveOrMigrateModel(providerId, config.model, 'llm');
  const effectiveModel = resolution.resolvedModel;

  let hasEmittedTokens = false;
  let parser: AIStreamParser | null = null;

  try {
    const electronAPI = typeof window !== 'undefined' ? window.electronAPI : undefined;
    const initialRequestBody = {
      model: effectiveModel,
      messages: [
        { role: 'system', content: lowLatencyPrompt },
        { role: 'user', content: question },
      ],
      stream: true,
      temperature: config.temperature,
      max_tokens: config.maxTokens,
    };
    const response =
      electronAPI?.startCloudLLMStream &&
      (config.type === 'groq' || config.type === 'openai' || config.type === 'openrouter')
        ? await fetchCloudProviderResponse(
            electronAPI,
            {
              requestId: crypto.randomUUID().replace(/[^a-zA-Z0-9_-]/g, ''),
              provider: config.type,
              model: effectiveModel,
              systemPrompt: lowLatencyPrompt,
              question,
              temperature: config.temperature,
              maxTokens: config.maxTokens,
              stream: true,
            },
            requestSignal
          )
        : await fetch(url, {
            method: 'POST',
            headers,
            body: JSON.stringify(initialRequestBody),
            signal: requestSignal,
          });

    let activeResponse = response;

    if (!activeResponse.ok) {
      let rawErrorBody: any = '';
      try {
        const raw = await readResponseTextLimited(activeResponse, MAX_RENDERER_LLM_ERROR_BYTES);
        try {
          rawErrorBody = JSON.parse(raw);
        } catch {
          rawErrorBody = raw;
        }
      } catch {
        rawErrorBody = 'Provider error response could not be read within the safe size limit.';
      }

      // Explicitly classify error: distinguish auth/quota/rate-limit from model-not-found
      const classifiedError = classifyAIError(
        providerId,
        effectiveModel,
        activeResponse.status,
        rawErrorBody,
        undefined,
        activeResponse.headers
      );

      // CRITICAL: NEVER silently fallback for invalid keys (401), forbidden (403),
      // billing (402), quota/rate-limits (429), or network dropouts.
      if (!classifiedError.isRecoverableByModelFallback) {
        throw classifiedError;
      }

      // Safe fallback ONLY for model-not-found (404) or decommissioned model errors
      const fallbackChain = getModelFallbackChain(providerId, effectiveModel, 'llm');
      let fallbackSucceeded = false;
      const visitedModels = new Set<string>([effectiveModel.toLowerCase()]);
      const fallbackDiagnostics: FallbackDiagnosticRecord[] = [];
      const MAX_FALLBACK_ATTEMPTS = 2;

      for (const fbModel of fallbackChain) {
        if (visitedModels.has(fbModel.toLowerCase())) continue;
        if (fallbackDiagnostics.length >= MAX_FALLBACK_ATTEMPTS) break;
        visitedModels.add(fbModel.toLowerCase());

        const diag = createSafeDiagnosticRecord(
          providerId,
          effectiveModel,
          fbModel,
          classifiedError.code,
          activeResponse.status,
          classifiedError.originalErrorDetail || '',
          false
        );

        console.warn(
          `[AI] Model '${effectiveModel}' failed with ${classifiedError.code}. Attempting safe fallback to '${fbModel}'...`
        );

        try {
          const fallbackBody = {
            model: fbModel,
            messages: [
              { role: 'system', content: lowLatencyPrompt },
              { role: 'user', content: question },
            ],
            stream: true,
            temperature: config.temperature,
            max_tokens: Math.min(config.maxTokens || 1500, 1500),
          };
          const fallbackRes =
            electronAPI?.startCloudLLMStream &&
            (config.type === 'groq' || config.type === 'openai' || config.type === 'openrouter')
              ? await fetchCloudProviderResponse(
                  electronAPI,
                  {
                    requestId: crypto.randomUUID().replace(/[^a-zA-Z0-9_-]/g, ''),
                    provider: config.type,
                    model: fbModel,
                    systemPrompt: lowLatencyPrompt,
                    question,
                    temperature: config.temperature,
                    maxTokens: Math.min(config.maxTokens || 1500, 1500),
                    stream: true,
                  },
                  requestSignal
                )
              : await fetch(url, {
                  method: 'POST',
                  headers,
                  body: JSON.stringify(fallbackBody),
                  signal: requestSignal,
                });

          if (fallbackRes.ok && fallbackRes.body) {
            activeResponse = fallbackRes;
            const successDiag = createSafeDiagnosticRecord(
              providerId,
              effectiveModel,
              fbModel,
              classifiedError.code,
              activeResponse.status,
              classifiedError.originalErrorDetail || '',
              true
            );
            fallbackDiagnostics.push(successDiag);
            callbacks.onDiagnostic?.(successDiag);
            fallbackSucceeded = true;
            break;
          } else {
            fallbackDiagnostics.push(diag);
            callbacks.onDiagnostic?.(diag);
          }
        } catch (fbErr: any) {
          if (requestSignal.aborted || fbErr?.name === 'AbortError') throw fbErr;
          fallbackDiagnostics.push(diag);
          callbacks.onDiagnostic?.(diag);
          console.warn(`[AI] Fallback to '${fbModel}' encountered error:`, fbErr?.message);
        }
      }

      if (!fallbackSucceeded && !activeResponse.ok) {
        (classifiedError as any).fallbackDiagnostics = fallbackDiagnostics;
        throw classifiedError;
      }
    }

    if (!activeResponse.body) throw new Error(`No response body`);

    const reader = activeResponse.body.getReader();
    activeReader = reader;
    const decoder = new TextDecoder('utf-8');
    parser = new AIStreamParser();
    const buffer = new SentenceBuffer();
    let sseBuffer = '';
    let responseBytesRead = 0;

    try {
      while (true) {
        if (requestSignal.aborted)
          throw Object.assign(new Error('Generation cancelled or timed out.'), {
            name: 'AbortError',
          });
        let readTimer: ReturnType<typeof setTimeout> | undefined;
        let readResult: ReadableStreamReadResult<Uint8Array>;
        let onAbort: (() => void) | undefined;
        try {
          const abortPromise = new Promise<never>((_, reject) => {
            onAbort = () =>
              reject(
                Object.assign(
                  new Error('AI request was cancelled or its overall deadline expired.'),
                  { name: 'AbortError' }
                )
              );
            if (requestSignal.aborted) onAbort();
            else requestSignal.addEventListener('abort', onAbort, { once: true });
          });
          const inactivityPromise = new Promise<never>((_, reject) => {
            readTimer = setTimeout(() => {
              const error = Object.assign(
                new Error(
                  'AI response stream stalled: no data received before the inactivity deadline.'
                ),
                { name: 'AbortError' }
              );
              requestController.abort(error);
              void reader.cancel(error);
              reject(error);
            }, inactivityTimeoutMs);
          });
          readResult = await Promise.race([reader.read(), abortPromise, inactivityPromise]);
        } finally {
          if (readTimer) clearTimeout(readTimer);
          if (onAbort) requestSignal.removeEventListener('abort', onAbort);
        }
        const { done, value } = readResult;
        if (done) {
          // The final SSE event is not guaranteed to end with a newline.
          sseBuffer += decoder.decode();
          const tail = sseBuffer.trim();
          if (tail.startsWith('data:')) {
            const jsonStr = tail.slice(5).trim();
            if (jsonStr && jsonStr !== '[DONE]') {
              const data = JSON.parse(jsonStr);
              if (data.error) {
                throw classifyAIError(
                  providerId,
                  effectiveModel,
                  activeResponse.status || 429,
                  data,
                  undefined,
                  activeResponse.headers
                );
              }
              const token = data.choices?.[0]?.delta?.content || '';
              if (token) {
                const cleanChunk = parser.parseChunk(token);
                if (cleanChunk) {
                  hasEmittedTokens = true;
                  callbacks.onToken?.(cleanChunk);
                  globalLatencyTracker.markFirstTokenOnce();
                  for (const sentence of buffer.push(cleanChunk)) callbacks.onSentence?.(sentence);
                }
              }
            }
          }
          break;
        }

        responseBytesRead += value.byteLength;
        if (responseBytesRead > MAX_RENDERER_LLM_RESPONSE_BYTES) {
          try {
            void reader
              .cancel('AI provider response exceeded configured size limit')
              .catch(() => undefined);
          } catch {
            // Preserve the response-size error if cancellation fails.
          }
          throw new RangeError(
            `AI provider response exceeded the ${MAX_RENDERER_LLM_RESPONSE_BYTES}-byte limit.`
          );
        }
        sseBuffer += decoder.decode(value, { stream: true });
        const lines = sseBuffer.split('\n');
        sseBuffer = lines.pop() || '';

        for (const rawLine of lines) {
          if (requestSignal.aborted)
            throw Object.assign(new Error('Generation cancelled or timed out.'), {
              name: 'AbortError',
            });
          const line = rawLine.trim();
          if (!line || line === 'data: [DONE]') continue;
          if (line.startsWith('data:') || line.startsWith('data: ')) {
            const jsonStr = line.startsWith('data: ') ? line.slice(6).trim() : line.slice(5).trim();
            if (!jsonStr || jsonStr === '[DONE]') continue;
            try {
              const data = JSON.parse(jsonStr);

              // 1. Detect provider error events delivered inside stream
              if (data.error) {
                const streamErr = classifyAIError(
                  providerId,
                  effectiveModel,
                  activeResponse.status || 429,
                  data,
                  undefined,
                  activeResponse.headers
                );
                throw streamErr;
              }

              const token = data.choices?.[0]?.delta?.content || '';
              if (!token) continue;

              const cleanChunk = parser.parseChunk(token);
              if (cleanChunk) {
                hasEmittedTokens = true;
                callbacks.onToken?.(cleanChunk);
                globalLatencyTracker.markFirstTokenOnce();

                const sentences = buffer.push(cleanChunk);
                for (const s of sentences) {
                  callbacks.onSentence?.(s);
                }
              }
            } catch (err: any) {
              if (err?.name === 'ClassifiedAIError' || err?.code) {
                throw err;
              }
              // ignore JSON parse errors for incomplete chunks
            }
          }
        }
      }

      if (requestSignal.aborted)
        throw Object.assign(new Error('Generation cancelled or timed out.'), {
          name: 'AbortError',
        });
      {
        const finalChunk = parser.flush();
        if (finalChunk) {
          callbacks.onToken?.(finalChunk);
          const sentences = buffer.push(finalChunk);
          for (const s of sentences) {
            callbacks.onSentence?.(s);
          }
        }

        const flushed = buffer.flush();
        for (const s of flushed) {
          callbacks.onSentence?.(s);
        }

        let cleanText = parser.getCleanText().trim();
        // Some provider/model combinations terminate an SSE stream without content deltas.
        // Make exactly one non-streaming recovery request before surfacing an empty answer.
        if (!cleanText) {
          const recoveryBody = {
            model: effectiveModel,
            messages: [
              { role: 'system', content: lowLatencyPrompt },
              { role: 'user', content: question },
            ],
            stream: false,
            temperature: config.temperature,
            max_tokens: config.maxTokens,
          };
          const recoveryResponse =
            electronAPI?.startCloudLLMStream &&
            (config.type === 'groq' || config.type === 'openai' || config.type === 'openrouter')
              ? await fetchCloudProviderResponse(
                  electronAPI,
                  {
                    requestId: crypto.randomUUID().replace(/[^a-zA-Z0-9_-]/g, ''),
                    provider: config.type,
                    model: effectiveModel,
                    systemPrompt: lowLatencyPrompt,
                    question,
                    temperature: config.temperature,
                    maxTokens: config.maxTokens,
                    stream: false,
                  },
                  requestSignal
                )
              : await fetch(url, {
                  method: 'POST',
                  headers,
                  body: JSON.stringify(recoveryBody),
                  signal: requestSignal,
                });
          if (recoveryResponse.ok) {
            const recoveryData = await readResponseJsonLimited(
              recoveryResponse,
              MAX_RENDERER_LLM_RESPONSE_BYTES
            );
            const recovered = recoveryData.choices?.[0]?.message?.content;
            if (typeof recovered === 'string' && recovered.trim()) {
              cleanText = recovered.trim();
              callbacks.onToken?.(cleanText);
              const recoveredSentences = buffer.push(cleanText);
              for (const sentence of recoveredSentences) callbacks.onSentence?.(sentence);
              for (const sentence of buffer.flush()) callbacks.onSentence?.(sentence);
            }
          }
        }
        if (!cleanText) {
          throw new Error(
            'AI stream closed without answer content; non-streaming recovery also returned empty.'
          );
        }

        await callbacks.onComplete?.(cleanText);
      }
    } finally {
      try {
        await reader.cancel();
      } catch (_) {}
      try {
        reader.releaseLock();
      } catch (_) {}
    }
  } catch (e: any) {
    if (e.name === 'AbortError') throw e;
    const timedOut = requestSignal.aborted;
    const sanitizedMsg = sanitizeDiagnosticSecret(e.message || String(e));
    const partialText = parser ? parser.getCleanText().trim() : '';
    const streamErr = (
      hasEmittedTokens
        ? new Error(
            `[AI Stream Error] Stream interrupted after partial token emission: ${sanitizedMsg}`
          )
        : e
    ) as any;
    if (hasEmittedTokens) {
      streamErr.hasEmittedTokens = true;
      streamErr.partialText = partialText;
      streamErr.originalError = e;
    }
    if (timedOut) streamErr.name = 'AbortError';
    callbacks.onError?.(streamErr);
    throw streamErr;
  } finally {
    clearTimeout(overallTimer);
    signal?.removeEventListener('abort', abortFromCaller);
    if (activeReader) {
      try {
        await activeReader.cancel();
      } catch (_) {}
      try {
        activeReader.releaseLock();
      } catch (_) {}
    }
  }
}

export async function generateAIAnswer(
  prompt: string,
  providerConfig?: Partial<AIProviderConfig>,
  language?: ProgrammingLanguage
): Promise<string> {
  const provider = (providerConfig?.type || 'groq') as AIProviderId;
  const resolution = resolveOrMigrateModel(provider, providerConfig?.model, 'llm');
  const config: AIProviderConfig = {
    type: provider,
    apiKey: providerConfig?.apiKey || 'mock-key',
    model: resolution.resolvedModel,
    temperature: providerConfig?.temperature ?? 0.7,
    maxTokens: providerConfig?.maxTokens || 1500,
    systemPrompt: providerConfig?.systemPrompt || '',
  };

  let full = '';
  await streamAnswer(prompt, config, (language || 'java') as ProgrammingLanguage, {
    onToken: (token) => {
      full += token;
    },
    onComplete: (completed) => {
      full = completed;
    },
  });
  return full;
}
