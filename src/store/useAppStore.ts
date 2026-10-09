import { create } from 'zustand';
import { InterviewEngine } from '../services/InterviewEngine';

export type InterviewStatus = "idle" | "listening" | "question_detected" | "transcribing" | "analyzing" | "generating" | "ready" | "paused" | "error";

export interface DiagnosticState {
    micActive: boolean;
    currentDb: number;
    speechDetected: boolean;
    blobSize: number;
    mimeType: string;
    whisperStatus: string;
    latestTranscript: string;
    questionMatched: boolean;
}

export interface TranscriptMessage {
    id: string;
    speaker: "interviewer" | "assistant" | "user" | "unknown";
    text: string;
    timestamp: number;
}

interface InterviewState {
    status: InterviewStatus;
    currentQuestion: string | null;
    currentAnswer: string | null;
    transcript: TranscriptMessage[];
    answerSentences: string[];
    followUps: string[];
    isGenerating: boolean; // For legacy compatibility
    isRecording: boolean; // For legacy compatibility
    
    setStatus: (s: InterviewStatus) => void;
    setCurrentQuestion: (q: string) => void;
    addTranscript: (msg: TranscriptMessage) => void;
    
    teleprompterQueue: string[];
    currentSentenceIndex: number;
    generationId: number;
    enqueueSentences: (s: string[]) => void;
    incrementGenerationId: () => void;

    clearAnswerQueue: () => void;
    toggleRecording: () => void;
    analyzeTranscript: () => void;
    
    // UI states
    settingsOpen: boolean;
    sessionsOpen: boolean;
    loadSettings: () => void;
    loadSessionHistory: () => void;

    copyAnswer: () => void;
    setResponseMode: (mode: string) => void;
    regenerateAnswer: () => void;
    sessionHistory: any[];
    currentPerformance: any;
    setSessionsOpen: (open: boolean) => void;
    settings: any;
    updateSetting: (k: string, v: any) => void;
    setSettingsOpen: (open: boolean) => void;
    clearAllData: () => void;
    toast: any;
    currentResponse: any;
    diagnosticState: DiagnosticState;
    updateDiagnostics: (updates: Partial<DiagnosticState>) => void;

}

export const useAppStore = create<InterviewState>((set, get) => ({
    status: "idle",
    currentQuestion: null,
    currentAnswer: null,
    transcript: [],
    answerSentences: [],
    followUps: [],
    isGenerating: false,
    isRecording: false,
    
    settingsOpen: false,
    sessionsOpen: false,
    
    setStatus: (s) => {
        set({ 
            status: s, 
            isRecording: s === 'listening',
            isGenerating: s === 'analyzing' || s === 'generating'
        });
    },
    
    setCurrentQuestion: (q) => set({ currentQuestion: q }),
    
    addTranscript: (msg) => set(state => ({ transcript: [...state.transcript, msg] })),
    
    
    teleprompterQueue: [],
    currentSentenceIndex: 0,
    generationId: 0,
    enqueueSentences: (s) => set({ teleprompterQueue: s, currentSentenceIndex: 0 }),
    incrementGenerationId: () => set(state => ({ generationId: state.generationId + 1 })),

    clearAnswerQueue: () => set({ teleprompterQueue: [], currentSentenceIndex: 0, answerSentences: [], currentAnswer: null }),
    
    toggleRecording: () => {
        const { status } = get();
        if (status === 'listening') {
            InterviewEngine.handleEvent({ type: 'STOP_LISTENING' });
            get().setStatus('idle');
        } else {
            InterviewEngine.handleEvent({ type: 'START_LISTENING' });
        }
    },
    
    analyzeTranscript: () => {
        const transcript = get().transcript;
        if (transcript.length === 0) return; // Do nothing if no transcript
        const lastMsg = transcript[transcript.length - 1].text;
        InterviewEngine.handleEvent({ type: 'QUESTION_DETECTED', text: lastMsg });
    },
    
    loadSettings: () => {},
    loadSessionHistory: () => {},

    copyAnswer: () => {},
    setResponseMode: () => {},
    regenerateAnswer: () => {},
    sessionHistory: [],
    currentPerformance: null,
    setSessionsOpen: (o) => set({sessionsOpen: o}),
    settings: { temperature: 0.7, maxTokens: 1000, type: 'local', endpoint: 'http://localhost:8080/inference' },
    updateSetting: () => {},
    setSettingsOpen: (o) => set({settingsOpen: o}),
    clearAllData: () => {},
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
    },
    updateDiagnostics: (updates) => set((state) => ({ diagnosticState: { ...state.diagnosticState, ...updates } })),
    currentResponse: { interviewAnswer: '', followUpQuestions: [] },

}));