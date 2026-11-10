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

export type ResponseMode = 'coding' | 'interview' | 'quiz' | 'quick' | 'deep';

export type QuestionIntent =
  | 'definition'
  | 'conceptual'
  | 'comparison'
  | 'implementation'
  | 'troubleshooting'
  | 'coding'
  | 'system_design'
  | 'distributed_systems'
  | 'databases_sql'
  | 'os_networking'
  | 'runtime_internals'
  | 'cloud_devops'
  | 'testing_reliability'
  | 'security'
  | 'behavioral'
  | 'resume'
  | 'quiz'
  | 'follow_up';

export type ProgrammingLanguage =
  'java' | 'python' | 'cpp' | 'javascript' | 'typescript' | 'go' | 'csharp';

// ─── Workspace Types ───

export interface InterviewWorkspace {
  id: string;
  name: string;
  company: string;
  role: string;
  jobDescription: string;
  interviewRound?:
    'technical_screen' | 'coding' | 'system_design' | 'behavioral' | 'hiring_manager' | 'final';
  interviewDate?: string;
  responseLanguage: string;
  candidateProfileVersion?: string;
  notes?: string;
  createdAt: number;
  updatedAt: number;
}

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

export interface ModelMigrationNotice {
  timestamp: number;
  previousModel: string;
  newModel: string;
  reason: string;
  dismissed?: boolean;
}

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
  lastModelMigrationNotice?: ModelMigrationNotice | null;
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
  'idle' | 'recording' | 'transcribing' | 'understanding' | 'generating' | 'ready' | 'error';

export interface PipelineStatus {
  stage: PipelineStage;
  progress: number;
  message: string;
  error?: string;
}

// ─── Electron API Types ───

export interface ElectronAPI {
  toggleVisibility?: () => void;
  hideWindow?: () => void;
  showWindow?: () => void;
  minimize: () => void;
  maximize: () => void;
  close: () => void;
  quitApp?: () => void;
  toggleAlwaysOnTop: () => void;
  isAlwaysOnTop: () => Promise<boolean>;
  setContentProtection?: (enable: boolean) => Promise<boolean>;
  isContentProtected?: () => Promise<boolean>;
  toggleContentProtection?: () => void;
  setWindowOpacity?: (opacity: number) => Promise<boolean>;
  getWindowOpacity?: () => Promise<number>;
  setWindowSize?: (width: number, height: number) => Promise<boolean>;
  getWindowSize?: () => Promise<{ width: number; height: number }>;
  setWindowPosition?: (x: number, y: number) => Promise<boolean>;
  getWindowPosition?: () => Promise<{ x: number; y: number }>;
  setIgnoreMouseEvents?: (ignore: boolean, options?: { forward?: boolean }) => Promise<boolean>;
  getRecordingsDir: () => Promise<string>;
  getSessionsDir: () => Promise<string>;
  getUserDataPath: () => Promise<string>;
  openFileDialog: (options?: any) => Promise<string | null>;
  readFile: (path: string) => Promise<Buffer>;
  parsePdf: (arrayBuffer: ArrayBuffer) => Promise<string>;
  parseDocx: (arrayBuffer: ArrayBuffer) => Promise<string>;
  writeFile: (path: string, data: any) => Promise<boolean>;
  listDir: (path: string) => Promise<Array<{ name: string; isDirectory: boolean; path: string }>>;
  deleteFile: (path: string) => Promise<boolean>;
  resolveDns?: (hostname: string) => Promise<Array<{ address: string; family: number }>>;
  safeFetchPinned?: (options: any) => Promise<any>;
  openExternal: (url: string) => Promise<void>;
  getSettings: () => Promise<AppSettings>;
  setSettings: (key: string, value: any) => Promise<boolean>;
  transcribeCloudAudio: (request: {
    requestId: string;
    provider: 'groq' | 'openai';
    model: string;
    audio: Uint8Array;
    language?: string;
    prompt?: string;
  }) => Promise<{
    cancelled?: boolean;
    text: string;
    language?: string;
    duration?: number;
    segments?: Array<{ start: number; end: number; text: string }>;
  }>;
  cancelCloudTranscription: (requestId: string) => Promise<boolean>;
  startCloudLLMStream: (request: {
    requestId: string;
    provider: 'groq' | 'openai' | 'openrouter';
    model: string;
    systemPrompt: string;
    question: string;
    temperature: number;
    maxTokens: number;
    stream: boolean;
  }) => Promise<{
    ok: boolean;
    status: number;
    statusText: string;
    headers: Record<string, string>;
    body?: string;
    usedSecondaryKey?: boolean;
  }>;
  cancelCloudLLMStream: (requestId: string) => Promise<boolean>;
  onAIStreamChunk: (callback: (payload: { requestId: string; chunk: string }) => void) => () => void;
  onAIStreamDone: (callback: (payload: { requestId: string }) => void) => () => void;
  onAIStreamError: (
    callback: (payload: { requestId: string; name: string; message: string }) => void
  ) => () => void;
  getApiKey: (service: string) => Promise<string | null>;
  setApiKey: (service: string, key: string) => Promise<boolean>;
  hasApiKey: (service: string) => Promise<boolean>;
  deleteApiKey: (service: string) => Promise<boolean>;
  listConfiguredKeys: () => Promise<Record<string, boolean>>;
  preflightAI: (
    provider: 'groq' | 'openai' | 'openrouter',
    model: string
  ) => Promise<{ valid: boolean; code?: string; message?: string; latencyMs?: number }>;
  getWsInfo: () => Promise<{ port: number; tokenPreview: string }>;
  copyWsToken: () => Promise<boolean>;
  startWsServer: () => Promise<{ port: number; tokenPreview?: string }>;
  stopWsServer: () => Promise<boolean>;
  onBrowserContext: (callback: (data: BrowserContext) => void) => () => void;
  onTriggerScreenCapture?: (callback: () => void) => () => void;
  onTriggerAppendScreenCapture?: (callback: () => void) => () => void;
  onTriggerAutoType?: (callback: () => void) => () => void;
  onTriggerAutoTypeText?: (callback: () => void) => () => void;
  captureScreenAndOCR?: (
    mode?: 'fullscreen' | 'snip'
  ) => Promise<{ success: boolean; text?: string; cancelled?: boolean; error?: string }>;
  appendScreenCaptureAndOCR?: (mode?: 'fullscreen' | 'snip') => Promise<{
    success: boolean;
    text?: string;
    cancelled?: boolean;
    error?: string;
    appended?: boolean;
  }>;
  getLastOcrText?: () => Promise<string>;
  setLastOcrText?: (text: string) => Promise<boolean>;
  ocrImageFile?: (filePath: string) => Promise<{ success: boolean; text?: string; error?: string }>;
  getOcrEngineInfo?: () => Promise<{
    available: boolean;
    platform: string;
    engine: string;
    maxPages: number;
    maxFileSizeMb: number;
  }>;
  autoTypeCode?: (
    code: string,
    delayMs?: number
  ) => Promise<{ success: boolean; method?: string; error?: string; warning?: string }>;
  inspectRepository?: (request: any) => Promise<any>;
  inspectDocument?: (request: any) => Promise<any>;
  verifyIndependentAudit?: (attestation: any) => Promise<any>;
  verifyInspectionSeal?: (result: any) => Promise<boolean>;
  copyToClipboard?: (text: string) => Promise<{ success: boolean; error?: string }>;
  readClipboard?: () => Promise<string>;
  platform: string;
}

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}
