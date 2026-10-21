import { create } from "zustand";
import {
  MockSessionState,
  MockRoundType,
  InterviewPersona,
  BehavioralStory,
  TopicMastery,
  CompanyPracticePlan,
  TieredHint,
  RubricEvaluation,
  DeliveryMetrics,
} from "../services/practice/types";
import { MockInterviewerEngine } from "../services/practice/MockInterviewerEngine";
import { CoachingEngine } from "../services/practice/CoachingEngine";
import { StoryBank } from "../services/practice/StoryBank";
import { SpacedScheduler } from "../services/practice/SpacedScheduler";
import { CompanyPlanGenerator } from "../services/practice/CompanyPlanGenerator";

interface PracticeState {
  activeView: "teleprompter" | "mock_gym";
  activeTab: "arena" | "story_bank" | "spaced_drills" | "company_prep" | "delivery_trends";
  activeSession: MockSessionState | null;
  sessionHistory: MockSessionState[];
  storyBank: BehavioralStory[];
  topicMasteries: TopicMastery[];
  companyPlans: CompanyPracticePlan[];
  activeCompanyPlan: CompanyPracticePlan | null;

  // Active answer draft in practice room
  currentCandidateAnswer: string;
  speakingStartTime: number | null;
  activeHintsUsed: TieredHint[];
  availableHints: TieredHint[];
  interruptionBanner: string | null;

  // Actions
  setActiveView: (view: "teleprompter" | "mock_gym") => void;
  setActiveTab: (tab: "arena" | "story_bank" | "spaced_drills" | "company_prep" | "delivery_trends") => void;
  startMockSession: (
    roundType: MockRoundType,
    persona?: InterviewPersona,
    interruptionEnabled?: boolean
  ) => void;
  tickTimer: () => void;
  setCurrentCandidateAnswer: (text: string) => void;
  requestHint: (tier: 1 | 2 | 3) => void;
  submitCurrentAnswer: () => void;
  dismissInterruption: () => void;
  endSession: () => void;

  // Story bank actions
  loadStoryBankFromResume: (resumeText: string) => void;
  saveStory: (story: BehavioralStory) => void;
  deleteStory: (id: string) => void;

  // Spaced scheduler actions
  recordTopicScore: (topicId: string, score: number) => void;

  // Company prep actions
  createCompanyPlan: (
    companyName: string,
    role: string,
    jd: string,
    resume: string,
    days?: 7 | 14
  ) => void;
  toggleDrillCompleted: (planIndex: number, dayNumber: number) => void;
  addCompanyNote: (companyName: string, roundName: string, note: string) => void;
}

const STORAGE_KEYS = {
  SESSIONS: "ai_practice_sessions_v1",
  STORIES: "ai_practice_stories_v1",
  TOPICS: "ai_practice_topics_v1",
  PLANS: "ai_practice_company_plans_v1",
};

function loadStored<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch (e) {
    return fallback;
  }
}

function persist<T>(key: string, data: T) {
  try {
    localStorage.setItem(key, JSON.stringify(data));
  } catch (e) {
    console.error("Storage persist error for", key, e);
  }
}

export const usePracticeStore = create<PracticeState>((set, get) => ({
  activeView: "teleprompter",
  activeTab: "arena",
  activeSession: null,
  sessionHistory: loadStored<MockSessionState[]>(STORAGE_KEYS.SESSIONS, []),
  storyBank: loadStored<BehavioralStory[]>(STORAGE_KEYS.STORIES, []),
  topicMasteries: loadStored<TopicMastery[]>(
    STORAGE_KEYS.TOPICS,
    SpacedScheduler.initializeDefaults()
  ),
  companyPlans: loadStored<CompanyPracticePlan[]>(STORAGE_KEYS.PLANS, []),
  activeCompanyPlan: null,

  currentCandidateAnswer: "",
  speakingStartTime: null,
  activeHintsUsed: [],
  availableHints: [],
  interruptionBanner: null,

  setActiveView: (view) => set({ activeView: view }),
  setActiveTab: (tab) => set({ activeTab: tab }),

  startMockSession: (roundType, persona = "strict_big_tech", interruptionEnabled = true) => {
    const session = MockInterviewerEngine.createSession(roundType, persona, interruptionEnabled);
    const category = session.questionHistory[0]?.category || "behavioral";
    const availableHints = CoachingEngine.getTieredHints(session.currentQuestion, category);

    set({
      activeSession: session,
      currentCandidateAnswer: "",
      speakingStartTime: Date.now(),
      activeHintsUsed: [],
      availableHints,
      interruptionBanner: null,
      activeTab: "arena",
    });
  },

  tickTimer: () => {
    const { activeSession, speakingStartTime, currentCandidateAnswer } = get();
    if (!activeSession || !activeSession.isActive) return;

    const newTime = Math.max(0, activeSession.timeRemainingSeconds - 1);
    let interviewerThinking = Math.max(0, activeSession.interviewerThinkingSeconds - 1);

    // Check interruption trigger if enabled
    let banner = get().interruptionBanner;
    if (
      activeSession.interruptionEnabled &&
      !banner &&
      speakingStartTime &&
      currentCandidateAnswer.length > 30
    ) {
      const elapsedSpeaking = (Date.now() - speakingStartTime) / 1000;
      const interruptCheck = MockInterviewerEngine.checkInterruptionTrigger(
        elapsedSpeaking,
        currentCandidateAnswer,
        activeSession.persona
      );
      if (interruptCheck.shouldInterrupt) {
        banner = interruptCheck.promptText;
      }
    }

    set({
      activeSession: {
        ...activeSession,
        timeRemainingSeconds: newTime,
        interviewerThinkingSeconds: interviewerThinking,
      },
      interruptionBanner: banner,
    });
  },

  setCurrentCandidateAnswer: (text) => set({ currentCandidateAnswer: text }),

  requestHint: (tier) => {
    const { availableHints, activeHintsUsed } = get();
    const hint = availableHints.find((h) => h.tier === tier);
    if (!hint) return;

    if (!activeHintsUsed.some((h) => h.tier === tier)) {
      set({ activeHintsUsed: [...activeHintsUsed, hint] });
    }
  },

  submitCurrentAnswer: () => {
    const { activeSession, currentCandidateAnswer, speakingStartTime, activeHintsUsed, topicMasteries } = get();
    if (!activeSession || !activeSession.isActive) return;

    const durationSeconds = speakingStartTime ? (Date.now() - speakingStartTime) / 1000 : 45;
    const updatedSession = MockInterviewerEngine.processAnswerSubmission(
      activeSession,
      currentCandidateAnswer,
      durationSeconds,
      activeHintsUsed
    );

    // Update topic mastery in spaced repetition table
    const lastQuestion = activeSession.currentQuestion;
    const topicId = SpacedScheduler.identifyTopicForQuestion(lastQuestion);
    const lastEval = updatedSession.questionHistory[updatedSession.questionHistory.length - (updatedSession.isActive ? 2 : 1)]?.evaluation;

    let updatedTopics = topicMasteries;
    if (lastEval) {
      updatedTopics = topicMasteries.map((t) =>
        t.topicId === topicId ? SpacedScheduler.recordAttempt(t, lastEval.overallScore) : t
      );
      persist(STORAGE_KEYS.TOPICS, updatedTopics);
    }

    // If session just ended, add to history
    let newHistory = get().sessionHistory;
    if (!updatedSession.isActive) {
      newHistory = [updatedSession, ...newHistory].slice(0, 30);
      persist(STORAGE_KEYS.SESSIONS, newHistory);
    }

    // Refresh available hints for next question if continuing
    const nextCategory = updatedSession.questionHistory[updatedSession.questionHistory.length - 1]?.category || "behavioral";
    const availableHints = CoachingEngine.getTieredHints(updatedSession.currentQuestion, nextCategory);

    set({
      activeSession: updatedSession,
      sessionHistory: newHistory,
      topicMasteries: updatedTopics,
      currentCandidateAnswer: "",
      speakingStartTime: Date.now(),
      activeHintsUsed: [],
      availableHints,
      interruptionBanner: null,
    });
  },

  dismissInterruption: () => set({ interruptionBanner: null }),

  endSession: () => {
    const { activeSession, sessionHistory } = get();
    if (!activeSession) return;

    const terminatedSession: MockSessionState = {
      ...activeSession,
      isActive: false,
      overallScorecard: MockInterviewerEngine.generateConsolidatedScorecard(activeSession),
    };

    const newHistory = [terminatedSession, ...sessionHistory].slice(0, 30);
    persist(STORAGE_KEYS.SESSIONS, newHistory);

    set({
      activeSession: terminatedSession,
      sessionHistory: newHistory,
    });
  },

  loadStoryBankFromResume: (resumeText) => {
    const extracted = StoryBank.extractStoriesFromResume(resumeText);
    const existing = get().storyBank;

    // Merge by title avoiding duplicates
    const existingTitles = new Set(existing.map((s) => s.title));
    const newStories = extracted.filter((s) => !existingTitles.has(s.title));
    const combined = [...existing, ...newStories];

    persist(STORAGE_KEYS.STORIES, combined);
    set({ storyBank: combined });
  },

  saveStory: (story) => {
    const existing = get().storyBank;
    const index = existing.findIndex((s) => s.id === story.id);
    let updated: BehavioralStory[];
    if (index >= 0) {
      updated = [...existing];
      updated[index] = story;
    } else {
      updated = [story, ...existing];
    }
    persist(STORAGE_KEYS.STORIES, updated);
    set({ storyBank: updated });
  },

  deleteStory: (id) => {
    const updated = get().storyBank.filter((s) => s.id !== id);
    persist(STORAGE_KEYS.STORIES, updated);
    set({ storyBank: updated });
  },

  recordTopicScore: (topicId, score) => {
    const updated = get().topicMasteries.map((t) =>
      t.topicId === topicId ? SpacedScheduler.recordAttempt(t, score) : t
    );
    persist(STORAGE_KEYS.TOPICS, updated);
    set({ topicMasteries: updated });
  },

  createCompanyPlan: (companyName, role, jd, resume, days = 7) => {
    const plan = CompanyPlanGenerator.generatePlan(companyName, role, jd, resume, days);
    const existing = get().companyPlans;
    const updated = [plan, ...existing.filter((p) => p.companyName.toLowerCase() !== companyName.toLowerCase())];
    persist(STORAGE_KEYS.PLANS, updated);
    set({ companyPlans: updated, activeCompanyPlan: plan, activeTab: "company_prep" });
  },

  toggleDrillCompleted: (planIndex, dayNumber) => {
    const plans = [...get().companyPlans];
    const plan = plans[planIndex];
    if (!plan) return;

    const drill = plan.dailyDrills.find((d) => d.day === dayNumber);
    if (drill) {
      drill.completed = !drill.completed;
      persist(STORAGE_KEYS.PLANS, plans);
      set({ companyPlans: plans, activeCompanyPlan: plan });
    }
  },

  addCompanyNote: (companyName, roundName, note) => {
    const plans = [...get().companyPlans];
    const index = plans.findIndex((p) => p.companyName.toLowerCase() === companyName.toLowerCase());
    if (index >= 0) {
      plans[index] = CompanyPlanGenerator.addRoundNote(plans[index], roundName, note);
      persist(STORAGE_KEYS.PLANS, plans);
      set({ companyPlans: plans, activeCompanyPlan: plans[index] });
    }
  },
}));
