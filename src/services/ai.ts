import { AIStreamParser } from './AIStreamParser';
import { SentenceBuffer } from './SentenceBuffer';
import { globalLatencyTracker } from './LatencyTracker';
import { AIProviderConfig, AIResponse, CodingSolution, ProgrammingLanguage, QuestionCategory, Difficulty, ResumeContext } from '../types';

// ─── Technical Term Dictionary ───

const TECH_TERMS = [
  'React', 'Node.js', 'Next.js', 'MongoDB', 'PostgreSQL', 'AWS', 'Docker',
  'Kubernetes', 'Java', 'Python', 'C++', 'TypeScript', 'CodePipeline',
  'Lambda', 'EC2', 'S3', 'DynamoDB', 'Redis', 'GraphQL', 'REST', 'API',
  'OAuth', 'JWT', 'CORS', 'HTTPS', 'TCP', 'UDP', 'DNS', 'CDN',
  'CI/CD', 'DevOps', 'Git', 'GitHub', 'GitLab', 'Jenkins', 'Terraform',
  'Ansible', 'NGINX', 'Apache', 'Express', 'NestJS', 'Spring Boot',
  'Hibernate', 'JPA', 'JDBC', 'MySQL', 'SQLite', 'Cassandra',
  'Elasticsearch', 'Kafka', 'RabbitMQ', 'gRPC', 'WebSocket',
  'HashMap', 'TreeMap', 'LinkedList', 'Binary Tree', 'Graph',
  'Dynamic Programming', 'Greedy', 'BFS', 'DFS', 'Dijkstra',
  'Quick Sort', 'Merge Sort', 'Heap Sort', 'Binary Search',
  'Normalization', 'ACID', 'BASE', 'CAP Theorem', 'Sharding',
  'Microservices', 'Monolith', 'Load Balancer', 'Rate Limiting',
  'Caching', 'Memcached', 'Pub/Sub', 'Event Driven',
  'Virtual Memory', 'Process', 'Thread', 'Mutex', 'Semaphore',
  'Deadlock', 'Race Condition', 'Context Switch',
  'Polymorphism', 'Encapsulation', 'Inheritance', 'Abstraction',
  'SOLID', 'Design Patterns', 'Singleton', 'Factory', 'Observer',
  'Strategy', 'MVC', 'MVVM', 'Redux', 'Zustand', 'Vue', 'Angular',
  'Svelte', 'Tailwind', 'Bootstrap', 'Webpack', 'Vite', 'Babel',
];

// ─── Question Classification ───

const CATEGORY_KEYWORDS: Record<QuestionCategory, string[]> = {
  'Coding': ['code', 'write a function', 'implement', 'algorithm', 'solve', 'program', 'write code', 'coding'],
  'DSA': ['array', 'linked list', 'tree', 'graph', 'stack', 'queue', 'hash', 'sort', 'search', 'dynamic programming', 'greedy', 'two pointer', 'sliding window', 'binary search', 'recursion', 'backtracking', 'BFS', 'DFS', 'heap', 'trie', 'time complexity', 'space complexity', 'Big O'],
  'System Design': ['design', 'architecture', 'scalable', 'distributed', 'microservices', 'load balancer', 'cache', 'database design', 'API design', 'URL shortener', 'chat system', 'notification', 'rate limiter', 'high availability', 'fault tolerant', 'scale'],
  'DBMS': ['database', 'SQL', 'normalization', 'ACID', 'transaction', 'index', 'join', 'primary key', 'foreign key', 'relational', 'query', 'schema', 'NoSQL', 'MongoDB', 'PostgreSQL', 'MySQL', 'aggregate', 'group by', 'stored procedure', 'trigger', 'view'],
  'Operating Systems': ['process', 'thread', 'deadlock', 'memory', 'virtual memory', 'paging', 'scheduling', 'semaphore', 'mutex', 'file system', 'kernel', 'interrupt', 'context switch', 'race condition', 'operating system', 'OS'],
  'Computer Networks': ['TCP', 'UDP', 'HTTP', 'HTTPS', 'DNS', 'OSI', 'IP address', 'subnet', 'routing', 'firewall', 'proxy', 'VPN', 'bandwidth', 'latency', 'packet', 'socket', 'port', 'protocol', 'network'],
  'OOP': ['object oriented', 'OOP', 'class', 'inheritance', 'polymorphism', 'encapsulation', 'abstraction', 'interface', 'abstract class', 'SOLID', 'design pattern', 'singleton', 'factory', 'observer', 'strategy'],
  'Java': ['Java', 'JVM', 'JDK', 'Spring', 'Spring Boot', 'Hibernate', 'JPA', 'Maven', 'Gradle', 'Collections', 'Stream API', 'Multithreading in Java', 'Garbage Collection'],
  'Python': ['Python', 'Django', 'Flask', 'FastAPI', 'pip', 'virtualenv', 'decorator', 'generator', 'list comprehension', 'GIL', 'Pythonic'],
  'JavaScript': ['JavaScript', 'JS', 'ES6', 'closure', 'prototype', 'async await', 'promise', 'callback', 'event loop', 'hoisting', 'scope', 'this keyword', 'arrow function'],
  'React': ['React', 'hooks', 'useState', 'useEffect', 'component', 'JSX', 'Redux', 'context', 'virtual DOM', 'reconciliation', 'Next.js', 'SSR', 'SSG'],
  'Node.js': ['Node', 'Node.js', 'Express', 'NestJS', 'middleware', 'event loop', 'stream', 'buffer', 'cluster', 'npm', 'package'],
  'AWS': ['AWS', 'EC2', 'S3', 'Lambda', 'DynamoDB', 'CloudFront', 'SQS', 'SNS', 'ECS', 'EKS', 'IAM', 'VPC', 'RDS', 'CodePipeline', 'CloudWatch', 'Route 53'],
  'DevOps': ['Docker', 'Kubernetes', 'CI/CD', 'Jenkins', 'GitLab CI', 'GitHub Actions', 'Terraform', 'Ansible', 'monitoring', 'deployment', 'container', 'orchestration', 'pipeline'],
  'Behavioral': ['tell me about', 'describe a time', 'challenging', 'conflict', 'teamwork', 'leadership', 'failure', 'mistake', 'strength', 'weakness', 'why do you want', 'where do you see', 'motivation'],
  'Resume': ['resume', 'your project', 'your experience', 'tell me about your', 'walk me through', 'your background', 'your role', 'your contribution'],
  'Project': ['project', 'what did you build', 'architecture of your', 'tech stack', 'challenges in your', 'your application'],
  'HR': ['salary', 'notice period', 'relocation', 'joining', 'CTC', 'benefits', 'work from home', 'remote', 'hybrid', 'shift'],
  'General': [],
};

export function classifyQuestion(question: string): { category: QuestionCategory; difficulty: Difficulty } {
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
  const hardIndicators = ['optimize', 'most efficient', 'design a system', 'distributed', 'at scale', 'real-time', 'concurrent', 'advanced', 'complex'];
  const easyIndicators = ['what is', 'define', 'explain', 'difference between', 'list', 'types of', 'basic', 'simple'];

  if (hardIndicators.some(ind => lowerQ.includes(ind))) {
    difficulty = 'Hard';
  } else if (easyIndicators.some(ind => lowerQ.includes(ind))) {
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
    quick: 'Provide a concise 2-5 sentence answer suitable for speaking aloud in an interview. Be direct and clear.',
    interview: 'Provide a natural, well-structured answer that a candidate could explain verbally in an interview. Include key points, brief examples, and be conversational yet technical. Aim for 1-2 minutes of speaking time.',
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

  return `${basePrompt}\n\nCategory: ${category}\nMode: ${mode}\n${modeInstructions[mode]}\n${codingInstructions}\n${resumeInstructions}\n\nAlways end with 2-3 potential follow-up questions the interviewer might ask, prefixed with "**Possible Follow-ups:**"`;
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
    quickAnswer = await callAI(question, config, 'quick', category, language, resumeContext, additionalContext);
  } else if (activeMode === 'interview') {
    interviewAnswer = await callAI(question, config, 'interview', category, language, resumeContext, additionalContext);
  } else if (activeMode === 'deep') {
    detailedAnswer = await callAI(question, config, 'deep', category, language, resumeContext, additionalContext);
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

async function callOpenAI(config: AIProviderConfig, systemPrompt: string, userMessage: string): Promise<string> {
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify({
      model: config.model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userMessage },
      ],
      temperature: config.temperature,
      max_tokens: Math.min(config.maxTokens || 1000, 1000),
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`OpenAI API error: ${response.status} - ${err}`);
  }

  const data = await response.json();
  return data.choices?.[0]?.message?.content || 'No response generated.';
}

async function callOpenRouter(config: AIProviderConfig, systemPrompt: string, userMessage: string): Promise<string> {
  const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${config.apiKey}`,
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
      max_tokens: Math.min(config.maxTokens || 1000, 1000),
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
          } catch (e) {}
        }
      }
    }
    return fullContent;
  }

  const data = await response.json();
  return data.choices?.[0]?.message?.content || 'No response generated.';
}

async function callOllama(config: AIProviderConfig, systemPrompt: string, userMessage: string): Promise<string> {
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
        } catch (e) {}
      }
    }
    return fullContent;
  }

  const data = await response.json();
  return data.message?.content || 'No response generated.';
}

async function callCustomAPI(config: AIProviderConfig, systemPrompt: string, userMessage: string): Promise<string> {
  if (!config.customEndpoint) throw new Error('Custom API endpoint not configured');
  
  const response = await fetch(config.customEndpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(config.apiKey ? { 'Authorization': `Bearer ${config.apiKey}` } : {}),
    },
    body: JSON.stringify({
      model: config.model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userMessage },
      ],
      temperature: config.temperature,
      max_tokens: Math.min(config.maxTokens || 1000, 1000),
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
    .map(line => line.replace(/^[-*•\d.)\s]+/, '').trim())
    .filter(line => line.length > 5 && line.endsWith('?'));
}

function extractCodingSolution(text: string, language: ProgrammingLanguage): CodingSolution {
  const codeMatch = text.match(/```(?:java|python|cpp|javascript|typescript|go|csharp|c\+\+|js|ts)?\n([\s\S]*?)```/);
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
  const regex = new RegExp(`(?:#{1,4}\\s*)?${heading}[:\\s]*\\n([\\s\\S]*?)(?=\\n#{1,4}|\\n\\*\\*|$)`, 'i');
  const match = text.match(regex);
  return match?.[1]?.trim() || null;
}

function extractListItems(text: string, heading: string): string[] {
  const section = extractSection(text, heading);
  if (!section) return [];
  return section
    .split('\n')
    .map(line => line.replace(/^[-*•\d.)\s]+/, '').trim())
    .filter(line => line.length > 0);
}

export { TECH_TERMS };


export interface AIStreamCallbacks {
    onToken?: (token: string) => void;
    onSentence?: (sentence: string) => void;
    onComplete?: (fullResponse: string) => void;
    onError?: (error: Error) => void;
}

export async function streamAnswer(
    question: string,
    config: AIProviderConfig,
    language: ProgrammingLanguage,
    callbacks: AIStreamCallbacks,
    signal?: AbortSignal
): Promise<void> {
    const systemPrompt = createSystemPrompt(config, 'interview', 'General', language, null);
    
    // Low latency prompt override
    const lowLatencyPrompt = systemPrompt + "\n\nPRODUCE ONLY SHORT CONVERSATIONAL SENTENCES. 8-18 words per sentence. NO markdown. NO code blocks. NO headings.";
    
    const url = config.type === 'openrouter' ? 'https://openrouter.ai/api/v1/chat/completions' :
                config.type === 'openai' ? 'https://api.openai.com/v1/chat/completions' :
                config.type === 'groq' ? 'https://api.groq.com/openai/v1/chat/completions' :
                config.customEndpoint || 'https://api.openai.com/v1/chat/completions';
                
    const headers: any = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${config.apiKey}`,
    };
    if (config.type === 'openrouter') headers['HTTP-Referer'] = 'ai-interview-assistant';

    try {
        const response = await fetch(url, {
            method: 'POST',
            headers,
            body: JSON.stringify({
                model: config.model,
                messages: [
                    { role: 'system', content: lowLatencyPrompt },
                    { role: 'user', content: question }
                ],
                stream: true,
                temperature: config.temperature,
                max_tokens: config.maxTokens
            }),
            signal
        });
        
        if (!response.ok) {
            if (response.status === 429) {
                const retryAfter = response.headers.get('retry-after') || response.headers.get('x-ratelimit-reset-requests');
                throw new Error(`Rate limit exceeded (HTTP 429). Retry after ${retryAfter || 'a few'} seconds.`);
            }
            throw new Error(`Stream Error: ${response.status}`);
        }
        if (!response.body) throw new Error(`No response body`);
        
        const reader = response.body.getReader();
        const decoder = new TextDecoder('utf-8');
        let fullResponse = '';
        
        
        
        
        const parser = new AIStreamParser();
        const buffer = new SentenceBuffer();
        
        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            
            const chunk = decoder.decode(value, { stream: true });
            const lines = chunk.split('\n').filter(l => l.trim() !== '');
            
            for (const line of lines) {
                if (line === 'data: [DONE]') continue;
                if (line.startsWith('data: ')) {
                    try {
                        const data = JSON.parse(line.slice(6));
                        const token = data.choices[0]?.delta?.content || '';
                        
                        fullResponse += token;
                        callbacks.onToken?.(token);
                        if (!(callbacks as any)._firstTokenFired) { (callbacks as any)._firstTokenFired = true; globalLatencyTracker.mark('firstToken'); }
                        
                        const parsedToken = parser.parseChunk(token);
                        if (parsedToken) {
                            const sentences = buffer.push(parsedToken);
                            for (const s of sentences) {
                                callbacks.onSentence?.(s);
                            }
                        }
                    } catch (e) {
                        // ignore JSON parse errors for incomplete chunks
                    }
                }
            }
        }
        
        // flush
        const flushed = buffer.flush();
        for (const s of flushed) callbacks.onSentence?.(s);
        
        callbacks.onComplete?.(fullResponse);
    } catch (e: any) {
        if (e.name !== 'AbortError') {
            if (callbacks.onError) callbacks.onError(e);
            else throw e;
        }
    }
}
