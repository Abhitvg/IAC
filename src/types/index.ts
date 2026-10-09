// ─── AI Provider Types ───

export type AIProviderType = 'openai' | 'openrouter' | 'ollama' | 'local' | 'custom' | 'groq';

export interface AIResponse {
  quickAnswer: string;
  interviewAnswer: string;
  detailedAnswer: string;
  codingSolution?: CodingSolution;
  category: QuestionCategory;
  difficulty: Difficulty;
  followUpQuestions: string[];
  timestamp: string;
}

export interface CodingSolution {
  problemUnderstanding: string;
  bruteForceApproach: string;
  optimizedApproach: string;
  algorithm: string;
  code: string;
  language: ProgrammingLanguage;
  timeComplexity: string;
  spaceComplexity: string;
  edgeCases: string[];
  optimizations: string[];
  interviewExplanation: string;
}

export interface AIProviderConfig {
  type: AIProviderType;
  apiKey?: string;
  model: string;
  temperature: number;
  maxTokens: number;
  systemPrompt: string;
  customEndpoint?: string;
  ollamaEndpoint?: string;
  onChunk?: (text: string) => void;
}

// ─── Question Types ───

export type QuestionCategory =
  | 'Coding'
  | 'DSA'
  | 'System Design'
  | 'DBMS'
  | 'Operating Systems'
  | 'Computer Networks'
  | 'OOP'
  | 'Java'
  | 'Python'
  | 'JavaScript'
  | 'React'
  | 'Node.js'
  | 'AWS'
  | 'DevOps'
  | 'Behavioral'
  | 'Resume'
  | 'Project'
  | 'HR'
  | 'General';

export type Difficulty = 'Easy' | 'Medium' | 'Hard';

export type ResponseMode = 'quick' | 'interview' | 'deep';

export type ProgrammingLanguage = 'java' | 'python' | 'cpp' | 'javascript' | 'typescript' | 'go' | 'csharp';

// ─── Recording Types ───

export interface Recording {
  id: string;
  filename: string;
  path: string;
  duration: number;
  timestamp: string;
  size: number;
}

// ─── Session Types ───

export interface InterviewSession {
  id: string;
  date: string;
  startTime: string;
  endTime?: string;
  questions: SessionQuestion[];
  recordingPath?: string;
  performance?: SessionPerformance;
}

export interface SessionQuestion {
  id: string;
  question: string;
  category: QuestionCategory;
  difficulty: Difficulty;
  answer: string;
  language?: ProgrammingLanguage;
  timestamp: string;
  responseTime: number; // seconds
}

export interface SessionPerformance {
  totalQuestions: number;
  categoryCounts: Record<string, number>;
  strongAreas: string[];
  weakAreas: string[];
  averageResponseTime: number;
  recommendations: string[];
}

// ─── Resume Types ───

export interface ResumeContext {
  raw: string;
  projects: string[];
  skills: string[];
  education: string[];
  experience: string[];
  technologies: string[];
  achievements: string[];
}

// ─── Browser Context Types ───

export interface BrowserContext {
  type: 'selected-text' | 'page-url' | 'copied-text' | 'extension-message';
  content: string;
  source: string;
  timestamp: string;
}

// ─── Settings Types ───

export interface AppSettings {
  aiProvider: AIProviderType;
  aiModel: string;
  whisperModel: string;
  preferredLanguage: ProgrammingLanguage;
  responseMode: ResponseMode;
  temperature: number;
  maxTokens: number;
  theme: 'dark' | 'light';
  audioFormat: 'wav' | 'webm';
  browserIntegration: boolean;
  alwaysOnTop: boolean;
  shortcuts: ShortcutMap;
  systemPrompt: string;
  customApiEndpoint: string;
  ollamaEndpoint: string;
}

export interface ShortcutMap {
  record: string;
  analyze: string;
  copyAnswer: string;
  quickAnswer: string;
  detailedAnswer: string;
  minimize: string;
  regenerate: string;
}

// ─── Pipeline Status Types ───

export type PipelineStage =
  | 'idle'
  | 'recording'
  | 'transcribing'
  | 'understanding'
  | 'generating'
  | 'ready'
  | 'error';

export interface PipelineStatus {
  stage: PipelineStage;
  progress: number;
  message: string;
  error?: string;
}

// ─── Electron API Types ───

export interface ElectronAPI {
  minimize: () => void;
  maximize: () => void;
  close: () => void;
  toggleAlwaysOnTop: () => void;
  isAlwaysOnTop: () => Promise<boolean>;
  getRecordingsDir: () => Promise<string>;
  getSessionsDir: () => Promise<string>;
  getUserDataPath: () => Promise<string>;
  openFileDialog: (options: any) => Promise<string | null>;
  readFile: (path: string) => Promise<Buffer>;
  writeFile: (path: string, data: any) => Promise<boolean>;
  listDir: (path: string) => Promise<Array<{ name: string; isDirectory: boolean; path: string }>>;
  deleteFile: (path: string) => Promise<boolean>;
  openExternal: (url: string) => Promise<void>;
  getSettings: () => Promise<AppSettings>;
  setSettings: (key: string, value: any) => Promise<boolean>;
  getApiKey: (service: string) => Promise<string | null>;
  setApiKey: (service: string, key: string) => Promise<boolean>;
  deleteApiKey: (service: string) => Promise<boolean>;
  startWsServer: () => Promise<{ port: number }>;
  stopWsServer: () => Promise<boolean>;
  onBrowserContext: (callback: (data: BrowserContext) => void) => () => void;
  platform: string;
}

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}
