import { DEFAULT_RESUME, DEFAULT_JOB_DESCRIPTION, DEFAULT_TARGET_ROLE } from '../services/candidatePersona';
import { create } from 'zustand';
import { InterviewEngine } from '../services/InterviewEngine';

export type InterviewStatus = "idle" | "listening" | "question_detected" | "transcribing" | "analyzing" | "generating" | "ready" | "paused" | "error";

export type RecitalState = "idle" | "listening" | "reciting" | "interrupted";

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

export interface TranscriptMessage {
    id: string;
    speaker: "interviewer" | "assistant" | "user" | "unknown";
    text: string;
    timestamp: number;
}

export type TeleprompterFontSize = 'small' | 'medium' | 'large' | 'xlarge';

interface InterviewState {
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
    toggleRecording: () => void;
    analyzeTranscript: () => void;
    
    // Conversation Memory (rolling context window)
    conversationHistory: Array<{ question: string; answer: string; category: string; timestamp: number }>;
    addToConversationHistory: (entry: { question: string; answer: string; category: string }) => void;
    clearConversationHistory: () => void;
    
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

    // UI states
    settingsOpen: boolean;
    sessionsOpen: boolean;
    loadSettings: () => void;
    loadSessionHistory: () => void;

    copyAnswer: () => void;
    copyCodeOnly: () => boolean;
    responseMode: 'coding' | 'interview' | 'quiz';
    setResponseMode: (mode: 'coding' | 'interview' | 'quiz') => void;
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
    selectedAudioDeviceId: string;
    setSelectedAudioDeviceId: (id: string) => void;
}

let _pendingTokens = "";
let _tokenBatchTimeout: any = null;

export const useAppStore = create<InterviewState>((set, get) => ({
    teleprompterFontSize: 'medium',
    setTeleprompterFontSize: (teleprompterFontSize) => set({ teleprompterFontSize }),
    isAutoScrolling: true,
    setIsAutoScrolling: (isAutoScrolling) => set({ isAutoScrolling }),
    scrollSpeed: 0.6,
    setScrollSpeed: (scrollSpeed) => set({ scrollSpeed }),
    windowOpacity: (() => {
        try {
            const saved = localStorage.getItem("teleprompter_opacity");
            if (saved) return parseFloat(saved);
        } catch (_) {}
        return 0.35;
    })(),
    setWindowOpacity: (windowOpacity) => {
        try { localStorage.setItem("teleprompter_opacity", String(windowOpacity)); } catch (_) {}
        set({ windowOpacity });
    },
    selectedAudioDeviceId: (() => {
        try {
            return localStorage.getItem("interview_audio_device_id") || "";
        } catch (_) {}
        return "";
    })(),
    setSelectedAudioDeviceId: (selectedAudioDeviceId: string) => {
        try {
            localStorage.setItem("interview_audio_device_id", selectedAudioDeviceId);
        } catch (_) {}
        set({ selectedAudioDeviceId });
    },
    status: "idle",
    currentQuestion: null,
    currentAnswer: null,
    transcript: [],
    answerSentences: [],
    followUps: [],
    isGenerating: false,
    isRecording: false,

    // Conversation Memory — rolling last 5 Q&A pairs for context threading
    conversationHistory: [],
    addToConversationHistory: (entry) => set((state) => {
        const history = [...state.conversationHistory, { ...entry, timestamp: Date.now() }];
        // Keep only last 5 for context window efficiency
        return { conversationHistory: history.slice(-5) };
    }),
    clearConversationHistory: () => set({ conversationHistory: [] }),
    
    // Answer Confidence & Follow-Up Predictions
    answerConfidence: null,
    setAnswerConfidence: (answerConfidence) => set({ answerConfidence }),
    predictedFollowUps: [],
    setPredictedFollowUps: (predictedFollowUps) => set({ predictedFollowUps }),
    
    recitalState: "idle",
    lastInterruption: null,
    setRecitalState: (recitalState) => set({ recitalState }),
    setLastInterruption: (lastInterruption) => set({ lastInterruption }),
    doneAnswering: () => {
        set({
            recitalState: "listening",
            status: "listening"
        });
        get().setToast("Ready for next interviewer question");
    },
    
    resumeText: DEFAULT_RESUME,
    jobDescriptionText: DEFAULT_JOB_DESCRIPTION,
    targetRole: DEFAULT_TARGET_ROLE,
    resumeModalOpen: false,

    setResumeText: (resumeText: string) => {
        try { localStorage.setItem('candidate_resume', resumeText); } catch (_) {}
        set({ resumeText });
    },
    setJobDescriptionText: (jobDescriptionText: string) => {
        try { localStorage.setItem('target_job_description', jobDescriptionText); } catch (_) {}
        set({ jobDescriptionText });
    },
    setTargetRole: (targetRole: string) => {
        try { localStorage.setItem('target_role', targetRole); } catch (_) {}
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
            isRecording: s === 'listening' || s === 'transcribing' || s === 'analyzing' || s === 'generating',
            isGenerating: s === 'analyzing' || s === 'generating'
        });
    },
    
    setCurrentQuestion: (q) => set({ currentQuestion: q }),
    setCurrentAnswer: (a) => {
        _pendingTokens = "";
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
                _pendingTokens = "";
                _tokenBatchTimeout = null;
                set(state => ({ currentAnswer: (state.currentAnswer || "") + batch }));
            }, 25);
        }
    },
    
    addTranscript: (msg) => set(state => ({ transcript: [...state.transcript, msg] })),
    
    teleprompterQueue: [],
    currentSentenceIndex: 0,
    generationId: 0,
    enqueueSentences: (s) => set({ teleprompterQueue: s, currentSentenceIndex: 0 }),
    incrementGenerationId: () => set(state => ({ generationId: state.generationId + 1 })),

    clearAnswerQueue: () => set({ teleprompterQueue: [], currentSentenceIndex: 0, answerSentences: [], currentAnswer: null }),
    
    toggleRecording: () => {
        const { status } = get();
        if (status === 'listening' || status === 'transcribing' || status === 'analyzing' || status === 'generating') {
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
        const lastMsg = transcript.length > 0
            ? transcript[transcript.length - 1].text
            : get().diagnosticState.latestTranscript;
        if (lastMsg && lastMsg !== '(empty)') {
            InterviewEngine.handleEvent({ type: 'QUESTION_DETECTED', text: lastMsg });
        }
    },
    
    loadSettings: () => {
        try {
            const savedResume = localStorage.getItem('candidate_resume');
            const savedJD = localStorage.getItem('target_job_description');
            const savedRole = localStorage.getItem('target_role');
            const savedMode = localStorage.getItem('interview_response_mode');
            
            // If stored resume is legacy/dummy placeholder, reset to Abhishek Singh verified resume
            const isLegacy = !savedResume || savedResume.includes('CloudScale') || savedResume.includes('TechNova') || !savedResume.includes('ABHISHEK SINGH') || savedResume.includes('IAC – AI Interview Assistant') || !savedResume.includes('Quorum');
            const activeResume = isLegacy ? DEFAULT_RESUME : savedResume;
            if (isLegacy && typeof localStorage !== 'undefined') {
                try { localStorage.setItem('candidate_resume', DEFAULT_RESUME); } catch(_) {}
            }

            set({
                resumeText: activeResume,
                jobDescriptionText: (!savedJD || savedJD.includes('IBM Consulting') || savedJD.includes('Global Enterprise Cloud')) ? DEFAULT_JOB_DESCRIPTION : savedJD,
                targetRole: (!savedRole || savedRole === 'Application Developer' || savedRole === 'Senior DevOps & Cloud Engineer') ? DEFAULT_TARGET_ROLE : savedRole,
                responseMode: (savedMode === 'coding' || savedMode === 'interview' || savedMode === 'quiz') ? savedMode : 'coding'
            });
        } catch (_) {}
    },
    loadSessionHistory: () => {},

    copyAnswer: () => {
        const ans = get().currentAnswer;
        if (ans) {
            navigator.clipboard.writeText(ans);
            set({ toast: 'Answer copied to clipboard!' });
            setTimeout(() => set({ toast: null }), 2500);
        }
    },
    copyCodeOnly: () => {
        const ans = get().currentAnswer;
        if (!ans) return false;
        const match = ans.match(/```[a-zA-Z0-9_#+-]*[^\n\r]*\r?\n([\s\S]*?)(?:```|$)/);
        if (match && match[1]) {
            navigator.clipboard.writeText(match[1].trim());
            set({ toast: '💻 Code copied to clipboard!' });
            setTimeout(() => set({ toast: null }), 2500);
            return true;
        } else {
            navigator.clipboard.writeText(ans);
            set({ toast: 'Answer copied to clipboard!' });
            setTimeout(() => set({ toast: null }), 2500);
            return false;
        }
    },
    responseMode: (() => {
        try {
            const saved = localStorage.getItem('interview_response_mode');
            if (saved === 'coding' || saved === 'interview' || saved === 'quiz') return saved;
        } catch (_) {}
        return 'coding';
    })(),
    setResponseMode: (responseMode) => {
        try { localStorage.setItem('interview_response_mode', responseMode); } catch (_) {}
        set({ responseMode: responseMode as any });
    },
    regenerateAnswer: () => {},
    sessionHistory: [],
    currentPerformance: null,
    setSessionsOpen: (o) => set({sessionsOpen: o}),
    settings: (() => {
        let lang = "Java";
        try {
            const saved = localStorage.getItem("preferred_coding_language");
            if (saved) lang = saved;
        } catch (_) {}
        return {
            temperature: 0.2,
            maxTokens: 2000,
            type: "groq",
            preferredLanguage: lang
        };
    })(),
    updateSetting: (key: string, val: any) => {
        if (key === "preferredLanguage") {
            try { localStorage.setItem("preferred_coding_language", String(val)); } catch (_) {}
        }
        set((state) => ({
            settings: { ...state.settings, [key]: val }
        }));
    },
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
        recitalState: 'idle',
        lastInterruption: null
    },
    updateDiagnostics: (updates) => set((state) => ({ diagnosticState: { ...state.diagnosticState, ...updates } })),
    currentResponse: { interviewAnswer: '', followUpQuestions: [] },
}));
