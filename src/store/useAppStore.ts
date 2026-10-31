import { copyToClipboard } from '../utils/clipboard';
import {
  DEFAULT_RESUME,
  DEFAULT_JOB_DESCRIPTION,
  DEFAULT_TARGET_ROLE,
} from '../services/candidatePersona';
import { create } from 'zustand';
import { InterviewEngine } from '../services/InterviewEngine';
import { InterviewWorkspace } from '../types';

export type InterviewStatus =
  | 'idle'
  | 'listening'
  | 'question_detected'
  | 'transcribing'
  | 'analyzing'
  | 'generating'
  | 'ready'
  | 'paused'
  | 'error';

export type RecitalState = 'idle' | 'listening' | 'reciting' | 'interrupted';

export interface DiagnosticState {
  micActive: boolean;
  currentDb: number;
  speechDetected: boolean;
  blobSize: number;
  mimeType: string;
  whisperStatus: string;
  latestTranscript: string;
  questionMatched: boolean;
  recitalState?: RecitalState;
  lastInterruption?: string | null;
}

export interface QuestionHistoryItem {
  question: string;
  answer: string | null;
  confidence?: 'high' | 'medium' | 'low' | null;
  timestamp?: number;
}

export interface TranscriptMessage {
  id: string;
  speaker: 'interviewer' | 'assistant' | 'user' | 'unknown';
  text: string;
  timestamp: number;
}

export type TeleprompterFontSize = 'small' | 'medium' | 'large' | 'xlarge';

interface InterviewState {
  isInterviewFocusMode: boolean;
  setInterviewFocusMode: (focus: boolean) => void;
  toggleInterviewFocusMode: () => void;
  teleprompterFontSize: TeleprompterFontSize;
  setTeleprompterFontSize: (size: TeleprompterFontSize) => void;
  isAutoScrolling: boolean;
  setIsAutoScrolling: (scrolling: boolean) => void;
  scrollSpeed: number;
  setScrollSpeed: (speed: number) => void;
  windowOpacity: number;
  setWindowOpacity: (opacity: number) => void;
  status: InterviewStatus;
  currentQuestion: string | null;
  currentAnswer: string | null;
  isAnswerValidated: boolean;
  answerValidationStatus: 'PENDING' | 'VALIDATED' | 'FLAGGED' | 'FAILED' | 'ABORTED';
  groundingScore: number | null;
  groundingViolations: string[];
  activeRequestId: string | null;
  setIsAnswerValidated: (isValidated: boolean) => void;
  setAnswerValidationStatus: (status: 'PENDING' | 'VALIDATED' | 'FLAGGED' | 'FAILED' | 'ABORTED') => void;
  setGroundingResult: (score: number | null, violations: string[]) => void;
  setActiveRequestId: (id: string | null) => void;
  transcript: TranscriptMessage[];
  answerSentences: string[];
  followUps: string[];
  isGenerating: boolean; // For legacy compatibility
  isRecording: boolean; // For legacy compatibility

  setStatus: (s: InterviewStatus) => void;
  setCurrentQuestion: (q: string) => void;
  setCurrentAnswer: (a: string | null) => void;
  appendAnswerToken: (token: string) => void;
  addTranscript: (msg: TranscriptMessage) => void;

  teleprompterQueue: string[];
  currentSentenceIndex: number;
  generationId: number;
  enqueueSentences: (s: string[]) => void;
  incrementGenerationId: () => void;

  clearAnswerQueue: () => void;
  clearAndResetToListen: () => void;
  toggleRecording: () => void;
  analyzeTranscript: () => void;

  // Conversation Memory (rolling context window)
  conversationHistory: Array<{
    question: string;
    answer: string;
    category: string;
    timestamp: number;
  }>;
  addToConversationHistory: (entry: { question: string; answer: string; category: string }) => void;
  clearConversationHistory: () => void;

  // History Stack & Incomplete Question Continuation
  questionHistory: QuestionHistoryItem[];
  redoQuestionHistory: QuestionHistoryItem[];
  isIncompleteQuestionMode: boolean;
  speechPauseTolerance: number;
  pushToQuestionHistory: (item: QuestionHistoryItem) => void;
  restorePreviousQuestion: () => boolean;
  redoQuestion: () => boolean;
  setIsIncompleteQuestionMode: (incomp: boolean) => void;
  markQuestionIncomplete: () => void;
  setSpeechPauseTolerance: (ms: number) => void;

  // Answer Confidence & Follow-Up Predictions
  answerConfidence: 'high' | 'medium' | 'low' | null;
  setAnswerConfidence: (c: 'high' | 'medium' | 'low' | null) => void;
  predictedFollowUps: string[];
  setPredictedFollowUps: (followUps: string[]) => void;

  // Candidate Recital & Interruption State
  recitalState: RecitalState;
  lastInterruption: string | null;
  setRecitalState: (s: RecitalState) => void;
  setLastInterruption: (text: string | null) => void;
  doneAnswering: () => void;

  // Candidate Persona: Resume & Job Description
  resumeText: string;
  jobDescriptionText: string;
  targetRole: string;
  resumeModalOpen: boolean;
  setResumeText: (text: string) => void;
  setJobDescriptionText: (text: string) => void;
  setTargetRole: (role: string) => void;
  setResumeModalOpen: (open: boolean) => void;
  setToast: (msg: string | null) => void;

  // Interview Workspaces
  workspaces: InterviewWorkspace[];
  activeWorkspaceId: string | null;
  createWorkspace: (ws: Omit<InterviewWorkspace, 'id' | 'createdAt' | 'updatedAt'>) => string;
  setActiveWorkspace: (id: string | null) => void;
  deleteWorkspace: (id: string) => void;
  updateWorkspace: (id: string, updates: Partial<InterviewWorkspace>) => void;

  // UI states
  settingsOpen: boolean;
  sessionsOpen: boolean;
  loadSettings: () => void;
  loadSessionHistory: () => Promise<void>;
  saveSession: (session: any) => Promise<void>;
  deleteSession: (sessionId: string) => Promise<void>;

  copyAnswer: () => void | Promise<void>;
  copyCodeOnly: () => boolean | Promise<boolean>;
  responseMode: 'coding' | 'interview' | 'quiz';
  setResponseMode: (mode: 'coding' | 'interview' | 'quiz') => void;
  regenerateAnswer: () => void;
  sessionHistory: any[];
  currentPerformance: any;
  setSessionsOpen: (open: boolean) => void;
  settings: any;
  updateSetting: (k: string, v: any) => void;
  setSettingsOpen: (open: boolean) => void;
  clearAllData: () => Promise<void>;
  toast: any;
  currentResponse: any;
  diagnosticState: DiagnosticState;
  updateDiagnostics: (updates: Partial<DiagnosticState>) => void;
  selectedAudioDeviceId: string;
  setSelectedAudioDeviceId: (id: string) => void;
}

let _pendingTokens = '';
let _tokenBatchTimeout: any = null;

export const useAppStore = create<InterviewState>((set, get) => ({
  isInterviewFocusMode: false,
  setInterviewFocusMode: (isInterviewFocusMode) => set({ isInterviewFocusMode }),
  toggleInterviewFocusMode: () => set((state) => ({ isInterviewFocusMode: !state.isInterviewFocusMode })),
  teleprompterFontSize: 'medium',
  setTeleprompterFontSize: (teleprompterFontSize) => set({ teleprompterFontSize }),
  isAutoScrolling: true,
  setIsAutoScrolling: (isAutoScrolling) => set({ isAutoScrolling }),
  scrollSpeed: 0.6,
  setScrollSpeed: (scrollSpeed) => set({ scrollSpeed }),
  windowOpacity: (() => {
    try {
      const saved = localStorage.getItem('teleprompter_opacity');
      if (saved) return parseFloat(saved);
    } catch {}
    return 0.35;
  })(),
  setWindowOpacity: (windowOpacity) => {
    try {
      localStorage.setItem('teleprompter_opacity', String(windowOpacity));
    } catch {}
    set({ windowOpacity });
    try {
      if (typeof window !== 'undefined' && window.electronAPI?.setWindowOpacity) {
        window.electronAPI.setWindowOpacity(windowOpacity);
      }
    } catch {}
  },
  selectedAudioDeviceId: (() => {
    try {
      return localStorage.getItem('interview_audio_device_id') || '';
    } catch {}
    return '';
  })(),
  setSelectedAudioDeviceId: (selectedAudioDeviceId: string) => {
    try {
      localStorage.setItem('interview_audio_device_id', selectedAudioDeviceId);
    } catch {}
    set({ selectedAudioDeviceId });
  },
  status: 'idle',
  currentQuestion: null,
  currentAnswer: null,
  isAnswerValidated: false,
  answerValidationStatus: 'PENDING',
  activeRequestId: null,
  groundingScore: null,
  groundingViolations: [],
  setIsAnswerValidated: (isAnswerValidated) => set({ isAnswerValidated }),
  setAnswerValidationStatus: (answerValidationStatus) => set({ answerValidationStatus }),
  setActiveRequestId: (activeRequestId) => set({ activeRequestId }),
  setGroundingResult: (groundingScore, groundingViolations) => set({ groundingScore, groundingViolations }),
  transcript: [],
  answerSentences: [],
  followUps: [],
  isGenerating: false,
  isRecording: false,

  // Conversation Memory — rolling last 5 Q&A pairs for context threading
  conversationHistory: [],
  addToConversationHistory: (entry) =>
    set((state) => {
      const history = [...state.conversationHistory, { ...entry, timestamp: Date.now() }];
      // Keep only last 5 for context window efficiency
      return { conversationHistory: history.slice(-5) };
    }),
  clearConversationHistory: () => set({ conversationHistory: [] }),

  questionHistory: [],
  redoQuestionHistory: [],
  isIncompleteQuestionMode: false,
  speechPauseTolerance: (() => {
    try {
      const saved = localStorage.getItem('interview_speech_pause_tolerance');
      if (saved) {
        const parsed = parseInt(saved, 10);
        if (!isNaN(parsed) && parsed >= 400) return parsed;
      }
    } catch {}
    return 1000;
  })(),

  pushToQuestionHistory: (item) =>
    set((state) => {
      const last = state.questionHistory[state.questionHistory.length - 1];
      if (last && last.question.trim() === item.question.trim()) {
        return state;
      }
      const updated = [...state.questionHistory, { ...item, timestamp: Date.now() }].slice(-25);
      return { questionHistory: updated, redoQuestionHistory: [] };
    }),

  restorePreviousQuestion: () => {
    InterviewEngine.abortActiveGeneration();
    const { questionHistory, redoQuestionHistory, currentQuestion, currentAnswer, answerConfidence } = get();
    if (!questionHistory || questionHistory.length === 0) {
      get().setToast('⚠️ No previous question in history');
      return false;
    }
    const historyCopy = [...questionHistory];
    const prevItem = historyCopy.pop()!;

    const redoCopy = [...redoQuestionHistory];
    if (currentQuestion && currentQuestion.trim() !== '') {
      redoCopy.push({
        question: currentQuestion,
        answer: currentAnswer,
        confidence: answerConfidence,
        timestamp: Date.now(),
      });
    }

    set({
      questionHistory: historyCopy,
      redoQuestionHistory: redoCopy.slice(-25),
      currentQuestion: prevItem.question,
      currentAnswer: prevItem.answer,
      answerConfidence: prevItem.confidence || null,
      status: 'ready',
      recitalState: 'reciting',
      isIncompleteQuestionMode: false,
    });
    get().setToast(`⬅️ Restored: "${prevItem.question.slice(0, 36)}..."`);
    return true;
  },

  redoQuestion: () => {
    InterviewEngine.abortActiveGeneration();
    const { questionHistory, redoQuestionHistory, currentQuestion, currentAnswer, answerConfidence } = get();
    if (!redoQuestionHistory || redoQuestionHistory.length === 0) {
      return false;
    }
    const redoCopy = [...redoQuestionHistory];
    const nextItem = redoCopy.pop()!;

    const historyCopy = [...questionHistory];
    if (currentQuestion && currentQuestion.trim() !== '') {
      historyCopy.push({
        question: currentQuestion,
        answer: currentAnswer,
        confidence: answerConfidence,
        timestamp: Date.now(),
      });
    }

    set({
      questionHistory: historyCopy.slice(-25),
      redoQuestionHistory: redoCopy,
      currentQuestion: nextItem.question,
      currentAnswer: nextItem.answer,
      answerConfidence: nextItem.confidence || null,
      status: 'ready',
      recitalState: 'reciting',
      isIncompleteQuestionMode: false,
    });
    get().setToast(`➡️ Restored forward: "${nextItem.question.slice(0, 36)}..."`);
    return true;
  },

  setIsIncompleteQuestionMode: (isIncompleteQuestionMode: boolean) =>
    set({ isIncompleteQuestionMode }),

  markQuestionIncomplete: () => {
    InterviewEngine.abortActiveGeneration();
    set({
      isIncompleteQuestionMode: true,
      status: 'listening',
      recitalState: 'listening',
    });
    get().setToast('⏳ "Still speaking" mode on — speech will append to this question.');
  },

  setSpeechPauseTolerance: (ms: number) => {
    const clamped = Math.max(400, Math.min(3500, ms));
    try {
      localStorage.setItem('interview_speech_pause_tolerance', String(clamped));
    } catch {}
    set({ speechPauseTolerance: clamped });
    get().setToast(`⏱️ Speech pause tolerance: ${clamped}ms`);
  },

  // Answer Confidence & Follow-Up Predictions
  answerConfidence: null,
  setAnswerConfidence: (answerConfidence) => set({ answerConfidence }),
  predictedFollowUps: [],
  setPredictedFollowUps: (predictedFollowUps) => set({ predictedFollowUps }),

  recitalState: 'idle',
  lastInterruption: null,
  setRecitalState: (recitalState) => set({ recitalState }),
  setLastInterruption: (lastInterruption) => set({ lastInterruption }),
  doneAnswering: () => {
    set({
      recitalState: 'listening',
      status: 'listening',
    });
    get().setToast('Ready for next interviewer question');
  },

  resumeText: DEFAULT_RESUME,
  jobDescriptionText: DEFAULT_JOB_DESCRIPTION,
  targetRole: DEFAULT_TARGET_ROLE,
  resumeModalOpen: false,

  workspaces: [],
  activeWorkspaceId: null,

  createWorkspace: (wsData) => {
    const id = 'ws-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6);
    const newWs: InterviewWorkspace = {
      ...wsData,
      id,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    const updated = [newWs, ...get().workspaces];
    try {
      localStorage.setItem('interview_workspaces_v1', JSON.stringify(updated));
    } catch {}
    set({
      workspaces: updated,
      activeWorkspaceId: id,
      targetRole: newWs.role,
      jobDescriptionText: newWs.jobDescription,
    });
    return id;
  },

  setActiveWorkspace: (id) => {
    if (!id) {
      set({
        activeWorkspaceId: null,
        targetRole: '',
        jobDescriptionText: '',
      });
      return;
    }
    const ws = get().workspaces.find((w) => w.id === id);
    if (ws) {
      set({
        activeWorkspaceId: id,
        targetRole: ws.role,
        jobDescriptionText: ws.jobDescription,
      });
    }
  },

  deleteWorkspace: (id) => {
    const updated = get().workspaces.filter((w) => w.id !== id);
    const nextActive = get().activeWorkspaceId === id ? updated[0]?.id || null : get().activeWorkspaceId;
    try {
      localStorage.setItem('interview_workspaces_v1', JSON.stringify(updated));
    } catch {}
    if (nextActive) {
      const nextWs = updated.find((w) => w.id === nextActive);
      set({
        workspaces: updated,
        activeWorkspaceId: nextActive,
        targetRole: nextWs?.role || '',
        jobDescriptionText: nextWs?.jobDescription || '',
      });
    } else {
      set({
        workspaces: updated,
        activeWorkspaceId: null,
        targetRole: '',
        jobDescriptionText: '',
      });
    }
  },

  updateWorkspace: (id, updates) => {
    const updated = get().workspaces.map((w) =>
      w.id === id ? { ...w, ...updates, updatedAt: Date.now() } : w
    );
    try {
      localStorage.setItem('interview_workspaces_v1', JSON.stringify(updated));
    } catch {}
    const active = updated.find((w) => w.id === get().activeWorkspaceId);
    set({
      workspaces: updated,
      ...(active ? { targetRole: active.role, jobDescriptionText: active.jobDescription } : {}),
    });
  },

  setResumeText: (resumeText: string) => {
    try {
      localStorage.setItem('candidate_resume', resumeText);
    } catch {}
    set({ resumeText });
  },
  setJobDescriptionText: (jobDescriptionText: string) => {
    try {
      localStorage.setItem('target_job_description', jobDescriptionText);
    } catch {}
    set({ jobDescriptionText });
  },
  setTargetRole: (targetRole: string) => {
    try {
      localStorage.setItem('target_role', targetRole);
    } catch {}
    set({ targetRole });
  },
  setResumeModalOpen: (resumeModalOpen: boolean) => set({ resumeModalOpen }),
  setToast: (toast: string | null) => {
    set({ toast });
    if (toast) setTimeout(() => set({ toast: null }), 3000);
  },

  settingsOpen: false,
  sessionsOpen: false,

  setStatus: (s) => {
    set({
      status: s,
      isRecording:
        s === 'listening' || s === 'transcribing' || s === 'analyzing' || s === 'generating',
      isGenerating: s === 'analyzing' || s === 'generating',
    });
  },

  setCurrentQuestion: (q) => set({ currentQuestion: q }),
  setCurrentAnswer: (a) => {
    _pendingTokens = '';
    if (_tokenBatchTimeout) {
      clearTimeout(_tokenBatchTimeout);
      _tokenBatchTimeout = null;
    }
    set({ currentAnswer: a });
  },
  appendAnswerToken: (token) => {
    _pendingTokens += token;
    if (!_tokenBatchTimeout) {
      _tokenBatchTimeout = setTimeout(() => {
        const batch = _pendingTokens;
        _pendingTokens = '';
        _tokenBatchTimeout = null;
        set((state) => ({ currentAnswer: (state.currentAnswer || '') + batch }));
      }, 25);
    }
  },

  addTranscript: (msg) => set((state) => ({ transcript: [...state.transcript, msg] })),

  teleprompterQueue: [],
  currentSentenceIndex: 0,
  generationId: 0,
  enqueueSentences: (s) => set({ teleprompterQueue: s, currentSentenceIndex: 0 }),
  incrementGenerationId: () => set((state) => ({ generationId: state.generationId + 1 })),

  clearAnswerQueue: () =>
    set({
      teleprompterQueue: [],
      currentSentenceIndex: 0,
      answerSentences: [],
      currentAnswer: null,
      isAnswerValidated: false,
      answerValidationStatus: 'PENDING',
      activeRequestId: null,
      groundingScore: null,
      groundingViolations: [],
      currentQuestion: null,
      recitalState: 'listening',
    }),

  clearAndResetToListen: () => {
    const { currentQuestion, currentAnswer, answerConfidence } = get();
    if (currentQuestion && currentQuestion.trim() !== '') {
      get().pushToQuestionHistory({
        question: currentQuestion,
        answer: currentAnswer,
        confidence: answerConfidence,
      });
    }
    get().clearAnswerQueue();
    get().setToast('✨ Teleprompter cleared (⌘Z to restore). Ready for next question.');
    get().updateDiagnostics({
      whisperStatus: 'Ready for question (mic active)',
      latestTranscript: '',
      questionMatched: false,
    });
  },

  toggleRecording: () => {
    const { status } = get();
    if (
      status === 'listening' ||
      status === 'transcribing' ||
      status === 'analyzing' ||
      status === 'generating'
    ) {
      InterviewEngine.handleEvent({ type: 'STOP_LISTENING' });
      get().setStatus('idle');
      set({ recitalState: 'idle' });
    } else {
      InterviewEngine.handleEvent({ type: 'START_LISTENING' });
      set({ recitalState: 'listening' });
    }
  },

  analyzeTranscript: () => {
    const transcript = get().transcript;
    const lastMsg =
      transcript.length > 0
        ? transcript[transcript.length - 1].text
        : get().diagnosticState.latestTranscript;
    if (lastMsg && lastMsg !== '(empty)') {
      InterviewEngine.handleEvent({ type: 'QUESTION_DETECTED', text: lastMsg });
    }
  },

  loadSettings: async () => {
    try {
      if (typeof window !== 'undefined' && window.electronAPI?.getSettings) {
        try {
          const electronSettings = await window.electronAPI.getSettings();
          if (electronSettings && typeof electronSettings === 'object') {
            set((state) => ({
              settings: { ...state.settings, ...electronSettings },
            }));
          }
        } catch {}
      }
      const savedResume = localStorage.getItem('candidate_resume');
      const savedJD = localStorage.getItem('target_job_description');
      const savedRole = localStorage.getItem('target_role');
      const savedMode = localStorage.getItem('interview_response_mode');
      const savedTolerance = localStorage.getItem('interview_speech_pause_tolerance');
      if (savedTolerance) {
        const parsed = parseInt(savedTolerance, 10);
        if (!isNaN(parsed) && parsed >= 400) {
          set({ speechPauseTolerance: parsed });
        }
      }

      // Clean up ancient legacy dummy placeholder mock strings if present
      const isLegacyMock =
        savedResume &&
        (savedResume.includes('CloudScale') || savedResume.includes('TechNova'));
      const activeResume = isLegacyMock ? '' : (savedResume || '');
      if (isLegacyMock && typeof localStorage !== 'undefined') {
        try {
          localStorage.removeItem('candidate_resume');
        } catch {}
      }

      let loadedWorkspaces: InterviewWorkspace[] = [];
      try {
        const rawWs = localStorage.getItem('interview_workspaces_v1');
        if (rawWs) {
          const parsedWs = JSON.parse(rawWs);
          if (Array.isArray(parsedWs)) loadedWorkspaces = parsedWs;
        }
      } catch {}

      set({
        resumeText: activeResume,
        workspaces: loadedWorkspaces,
        activeWorkspaceId: loadedWorkspaces[0]?.id || null,
        jobDescriptionText:
          !savedJD ||
          savedJD.includes('IBM Consulting Demo Sample') ||
          savedJD.includes('Global Enterprise Cloud Mock')
            ? ''
            : savedJD,
        targetRole:
          !savedRole ||
          savedRole === 'Legacy Sample Developer'
            ? ''
            : savedRole,
        responseMode:
          savedMode === 'coding' || savedMode === 'interview' || savedMode === 'quiz'
            ? savedMode
            : 'coding',
      });
    } catch {}
  },
  loadSessionHistory: async () => {
    try {
      const sessions: any[] = [];
      if (
        typeof window !== 'undefined' &&
        window.electronAPI?.getSessionsDir &&
        window.electronAPI?.listDir &&
        window.electronAPI?.readFile
      ) {
        try {
          const sessionsDir = await window.electronAPI.getSessionsDir();
          const entries = await window.electronAPI.listDir(sessionsDir);
          if (Array.isArray(entries)) {
            for (const entry of entries) {
              if (entry.name.endsWith('.json') && !entry.isDirectory) {
                try {
                  const buffer = await window.electronAPI.readFile(entry.path);
                  const str = new TextDecoder().decode(buffer);
                  const sessionData = JSON.parse(str);
                  if (sessionData && sessionData.id) {
                    sessions.push(sessionData);
                  }
                } catch {}
              }
            }
          }
        } catch {}
      }

      if (sessions.length === 0 && typeof localStorage !== 'undefined') {
        try {
          const local = localStorage.getItem('iac_session_history');
          if (local) {
            const parsed = JSON.parse(local);
            if (Array.isArray(parsed)) {
              sessions.push(...parsed);
            }
          }
        } catch {}
      }

      sessions.sort((a, b) => (b.startTime || 0) - (a.startTime || 0));
      set({ sessionHistory: sessions });
    } catch {}
  },

  saveSession: async (session: any) => {
    if (!session || !session.id) return;
    try {
      const current = get().sessionHistory;
      const updated = [session, ...current.filter((s) => s.id !== session.id)].slice(0, 50);
      set({ sessionHistory: updated });

      if (typeof localStorage !== 'undefined') {
        try {
          localStorage.setItem('iac_session_history', JSON.stringify(updated));
        } catch {}
      }

      if (
        typeof window !== 'undefined' &&
        window.electronAPI?.getSessionsDir &&
        window.electronAPI?.writeFile
      ) {
        try {
          const sessionsDir = await window.electronAPI.getSessionsDir();
          const sessionPath = `${sessionsDir}/${session.id}.json`;
          const data = JSON.stringify(session, null, 2);
          await window.electronAPI.writeFile(sessionPath, data);
        } catch {}
      }
    } catch {}
  },

  deleteSession: async (sessionId: string) => {
    try {
      const updated = get().sessionHistory.filter((s) => s.id !== sessionId);
      set({ sessionHistory: updated });

      if (typeof localStorage !== 'undefined') {
        try {
          localStorage.setItem('iac_session_history', JSON.stringify(updated));
        } catch {}
      }

      if (
        typeof window !== 'undefined' &&
        window.electronAPI?.getSessionsDir &&
        window.electronAPI?.deleteFile
      ) {
        try {
          const sessionsDir = await window.electronAPI.getSessionsDir();
          await window.electronAPI.deleteFile(`${sessionsDir}/${sessionId}.json`);
        } catch {}
      }
    } catch {}
  },

  copyAnswer: async () => {
    const ans = get().currentAnswer;
    if (ans) {
      await copyToClipboard(ans);
      set({ toast: 'Answer copied to clipboard!' });
      setTimeout(() => set({ toast: null }), 2500);
    }
  },
  copyCodeOnly: async () => {
    const ans = get().currentAnswer;
    if (!ans) return false;
    const match = ans.match(/```[a-zA-Z0-9_#+-]*[^\n\r]*\r?\n([\s\S]*?)(?:```|$)/);
    if (match && match[1]) {
      await copyToClipboard(match[1].trim());
      set({ toast: '💻 Code copied to clipboard!' });
      setTimeout(() => set({ toast: null }), 2500);
      return true;
    } else {
      await copyToClipboard(ans);
      set({ toast: 'Answer copied to clipboard!' });
      setTimeout(() => set({ toast: null }), 2500);
      return false;
    }
  },
  responseMode: (() => {
    try {
      const saved = localStorage.getItem('interview_response_mode');
      if (saved === 'coding' || saved === 'interview' || saved === 'quiz') return saved;
    } catch {}
    return 'coding';
  })(),
  setResponseMode: (responseMode) => {
    try {
      localStorage.setItem('interview_response_mode', responseMode);
    } catch {}
    set({ responseMode: responseMode as any });
  },
  regenerateAnswer: () => {
    const { currentQuestion } = get();
    if (currentQuestion && currentQuestion.trim()) {
      InterviewEngine.handleEvent({ type: 'REGENERATE_ACTIVE_ANSWER' });
      get().setToast('🔄 Regenerating answer...');
    } else {
      get().setToast('⚠️ No question to regenerate');
    }
  },
  sessionHistory: [],
  currentPerformance: null,
  setSessionsOpen: (o) => set({ sessionsOpen: o }),
  settings: (() => {
    let lang = 'Java';
    try {
      const saved = localStorage.getItem('preferred_coding_language');
      if (saved) lang = saved;
    } catch {}
    return {
      aiProvider: 'groq',
      aiModel: 'openai/gpt-oss-120b',
      whisperModel: 'whisper-large-v3-turbo',
      temperature: 0.2,
      maxTokens: 2000,
      type: 'groq',
      preferredLanguage: lang,
    };
  })(),
  updateSetting: (key: string, val: any) => {
    if (key === 'preferredLanguage') {
      try {
        localStorage.setItem('preferred_coding_language', String(val));
      } catch {}
    }
    set((state) => ({
      settings: { ...state.settings, [key]: val },
    }));
  },
  setSettingsOpen: (o) => set({ settingsOpen: o }),
  clearAllData: async () => {
    InterviewEngine.cancelAllActiveWork();
    try {
      const audio = (await import('../services/audio')).AudioRecorder.getInstance();
      await audio.stop(false);
    } catch {}

    if (typeof localStorage !== 'undefined') {
      try {
        localStorage.removeItem('iac_session_history');
        localStorage.removeItem('interview_transcript');
        localStorage.removeItem('conversation_history');
      } catch {}
    }

    if (
      typeof window !== 'undefined' &&
      window.electronAPI?.getSessionsDir &&
      window.electronAPI?.listDir &&
      window.electronAPI?.deleteFile
    ) {
      try {
        const dir = await window.electronAPI.getSessionsDir();
        const files = await window.electronAPI.listDir(dir);
        if (Array.isArray(files)) {
          for (const f of files) {
            if (f.name.endsWith('.json')) {
              await window.electronAPI.deleteFile(f.path).catch(() => {});
            }
          }
        }
      } catch {}
    }

    set({
      transcript: [],
      questionHistory: [],
      redoQuestionHistory: [],
      conversationHistory: [],
      sessionHistory: [],
      currentQuestion: null,
      currentAnswer: null,
      teleprompterQueue: [],
      currentSentenceIndex: 0,
      status: 'idle',
      recitalState: 'idle',
      isIncompleteQuestionMode: false,
      answerConfidence: null,
      predictedFollowUps: [],
    });

    get().setToast('🧹 All interview data, transcripts & session history cleared.');
  },
  toast: null,
  diagnosticState: {
    micActive: false,
    currentDb: -100,
    speechDetected: false,
    blobSize: 0,
    mimeType: '',
    whisperStatus: 'idle',
    latestTranscript: '',
    questionMatched: false,
    recitalState: 'idle',
    lastInterruption: null,
  },
  updateDiagnostics: (updates) =>
    set((state) => ({ diagnosticState: { ...state.diagnosticState, ...updates } })),
  currentResponse: { interviewAnswer: '', followUpQuestions: [] },
}));
