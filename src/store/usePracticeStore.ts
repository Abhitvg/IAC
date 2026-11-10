import { create } from 'zustand';
import {
  MockSessionState,
  MockRoundType,
  InterviewPersona,
  InterviewPressure,
  BehavioralStory,
  TopicMastery,
  CompanyPracticePlan,
  TieredHint,
  FeedbackRecord,
  WeaknessPracticePlan,
  ExplainerAttempt,
  ConceptCard,
} from '../services/practice/types';
import { ExplainerDrillService } from '../services/practice/coach/ExplainerDrillService';
import { WeaknessMap } from '../services/practice/feedback/WeaknessMap';
import { MockInterviewerEngine } from '../services/practice/MockInterviewerEngine';
import { CoachingEngine } from '../services/practice/CoachingEngine';
import { StoryBank } from '../services/practice/StoryBank';
import { SpacedScheduler } from '../services/practice/SpacedScheduler';
import { QuestionBank } from '../services/practice/QuestionBank';
import { CompanyPlanGenerator } from '../services/practice/CompanyPlanGenerator';
import { CompetencyProfileService } from '../services/practice/CompetencyProfileService';
import { CurriculumCatalogService } from '../data/curriculum/CurriculumCatalog';
import { createPracticeLLMCaller } from '../services/practice/createPracticeLLMCaller';

interface PracticeState {
  activeView: 'teleprompter' | 'mock_gym' | 'career_ops';
  activeTab:
    | 'arena'
    | 'story_bank'
    | 'spaced_drills'
    | 'company_prep'
    | 'delivery_trends'
    | 'feedback'
    | 'weakness_map'
    | 'explainer_drill'
    | 'progress';
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
  setActiveView: (view: 'teleprompter' | 'mock_gym' | 'career_ops') => void;
  setActiveTab: (
    tab:
      | 'arena'
      | 'story_bank'
      | 'spaced_drills'
      | 'company_prep'
      | 'delivery_trends'
      | 'feedback'
      | 'weakness_map'
      | 'explainer_drill'
  ) => void;
  startMockSession: (
    roundType: MockRoundType,
    persona?: InterviewPersona,
    interruptionEnabled?: boolean,
    pressure?: InterviewPressure,
    topicId?: string,
    difficulty?: string | number
  ) => void;
  tickTimer: () => void;
  setCurrentCandidateAnswer: (text: string) => void;
  requestHint: (tier: 1 | 2 | 3) => void;
  submitCurrentAnswer: () => Promise<void>;
  dismissInterruption: () => void;
  endSession: () => void;
  discardActiveSession: () => void;
  isEvaluatingAnswer: boolean;
  evaluationError: string | null;

  // Story bank actions
  loadStoryBankFromResume: (resumeText: string) => void;
  saveStory: (story: BehavioralStory) => void;
  deleteStory: (id: string) => void;
  importCustomQuestionPack: (pack: string | unknown[]) => {
    success: boolean;
    importedCount: number;
    errors?: string[];
  };

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
  feedbackRecords: FeedbackRecord[];
  addFeedbackRecord: (record: FeedbackRecord) => { success: boolean; duplicate?: boolean };
  updateFeedbackRecord: (record: FeedbackRecord) => void;
  deleteFeedbackRecord: (id: string) => void;
  clearAllFeedback: () => void;
  deleteAllFeedbackAndPracticeData: () => { success: boolean; failedKeys: string[] };
  weaknessPlan: WeaknessPracticePlan | null;
  setWeaknessPlan: (plan: WeaknessPracticePlan) => void;
  seedSchedulerFromWeaknesses: () => void;
  toggleWeaknessDrillCompleted: (day: number, drillId: string) => void;
  explainerAttempts: ExplainerAttempt[];
  conceptCards: Record<string, ConceptCard>;
  activeExplainerTopic: string;
  setActiveExplainerTopic: (topic: string) => void;
  recordExplainerAttempt: (attempt: ExplainerAttempt) => void;
  saveConceptCard: (card: ConceptCard) => void;
}

const STORAGE_KEYS = {
  ACTIVE_SESSION: 'ai_practice_active_session_v1',
  SESSIONS: 'ai_practice_sessions_v1',
  STORIES: 'ai_practice_stories_v1',
  TOPICS: 'ai_practice_topics_v1',
  PLANS: 'ai_practice_company_plans_v1',
  FEEDBACK: 'ai_practice_feedback_v1',
  WEAKNESS_PLAN: 'ai_practice_weakness_plan_v1',
  EXPLAINER_ATTEMPTS: 'ai_practice_explainer_attempts_v1',
  CONCEPT_CARDS: 'ai_practice_concept_cards_v1',
};

function loadStored<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch (_e) {
    return fallback;
  }
}

function persist<T>(key: string, data: T) {
  try {
    localStorage.setItem(key, JSON.stringify(data));
  } catch (e) {
    console.error('Storage persist error for', key, e);
  }
}

function isValidMockSessionState(data: any): data is MockSessionState {
  return (
    data !== null &&
    typeof data === 'object' &&
    typeof data.isActive === 'boolean' &&
    typeof data.roundType === 'string' &&
    typeof data.persona === 'string' &&
    typeof data.totalTimeSeconds === 'number' &&
    typeof data.timeRemainingSeconds === 'number' &&
    typeof data.currentQuestion === 'string' &&
    Array.isArray(data.questionHistory)
  );
}

function loadStoredSession(): MockSessionState | null {
  const loaded = loadStored<any>(STORAGE_KEYS.ACTIVE_SESSION, null);
  if (!loaded) return null;
  if (!isValidMockSessionState(loaded)) {
    console.warn('Corrupted or malformed active session state detected. Discarding.');
    persist(STORAGE_KEYS.ACTIVE_SESSION, null);
    return null;
  }
  return loaded;
}

export const usePracticeStore = create<PracticeState>((set, get) => ({
  activeView: 'mock_gym',
  activeTab: 'arena',
  activeSession: loadStoredSession(),
  isEvaluatingAnswer: false,
  evaluationError: null,
  sessionHistory: loadStored<MockSessionState[]>(STORAGE_KEYS.SESSIONS, []),
  storyBank: loadStored<BehavioralStory[]>(STORAGE_KEYS.STORIES, []),
  topicMasteries: loadStored<TopicMastery[]>(
    STORAGE_KEYS.TOPICS,
    SpacedScheduler.initializeDefaults()
  ),
  companyPlans: loadStored<CompanyPracticePlan[]>(STORAGE_KEYS.PLANS, []),
  activeCompanyPlan: null,
  feedbackRecords: loadStored<FeedbackRecord[]>(STORAGE_KEYS.FEEDBACK, []),
  weaknessPlan: loadStored<WeaknessPracticePlan | null>(STORAGE_KEYS.WEAKNESS_PLAN, null),
  explainerAttempts: loadStored<ExplainerAttempt[]>(STORAGE_KEYS.EXPLAINER_ATTEMPTS, []),
  conceptCards: loadStored<Record<string, ConceptCard>>(STORAGE_KEYS.CONCEPT_CARDS, {}),
  activeExplainerTopic: 'Distributed Caching',

  currentCandidateAnswer: '',
  speakingStartTime: null,
  activeHintsUsed: [],
  availableHints: [],
  interruptionBanner: null,

  setActiveView: (view) => set({ activeView: view }),
  setActiveTab: (tab) => set({ activeTab: tab }),

  startMockSession: (
    roundType,
    persona = 'strict_big_tech',
    interruptionEnabled = false,
    pressure = 'normal',
    topicId,
    difficulty
  ) => {
    const session = MockInterviewerEngine.createSession(
      roundType,
      persona,
      interruptionEnabled,
      get().topicMasteries,
      pressure,
      get().feedbackRecords,
      { topicId, difficulty }
    );
    const category = session.questionHistory[0]?.category || 'behavioral';
    const availableHints = CoachingEngine.getTieredHints(session.currentQuestion, category);

    persist(STORAGE_KEYS.ACTIVE_SESSION, session);

    set({
      activeSession: session,
      currentCandidateAnswer: '',
      speakingStartTime: Date.now(),
      activeHintsUsed: [],
      availableHints,
      interruptionBanner: null,
      activeTab: 'arena',
      isEvaluatingAnswer: false,
      evaluationError: null,
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

  submitCurrentAnswer: async () => {
    const {
      activeSession,
      currentCandidateAnswer,
      speakingStartTime,
      activeHintsUsed,
      topicMasteries,
      isEvaluatingAnswer,
    } = get();
    if (!activeSession || !activeSession.isActive || isEvaluatingAnswer) return;

    set({ isEvaluatingAnswer: true, evaluationError: null });

    const durationSeconds = speakingStartTime ? (Date.now() - speakingStartTime) / 1000 : 45;

    let updatedSession: MockSessionState;
    try {
      let llmCaller: ((prompt: string, model: string) => Promise<string>) | undefined;
      if (typeof window !== 'undefined') {
        llmCaller = createPracticeLLMCaller(window.electronAPI);
      }

      updatedSession = await MockInterviewerEngine.processAnswerSubmissionAsync(
        activeSession,
        currentCandidateAnswer,
        durationSeconds,
        activeHintsUsed,
        llmCaller
      );
    } catch (err: any) {
      console.warn('Asynchronous turn processing failed, falling back to heuristic engine:', err);
      updatedSession = MockInterviewerEngine.processAnswerSubmission(
        activeSession,
        currentCandidateAnswer,
        durationSeconds,
        activeHintsUsed
      );
    }

    // Update topic mastery in spaced repetition table (backward compatibility)
    const lastQuestion = activeSession.currentQuestion;
    const topicId = SpacedScheduler.identifyTopicForQuestion(lastQuestion);
    const lastItemIndex = updatedSession.questionHistory.length - (updatedSession.isActive ? 2 : 1);
    const lastItem = updatedSession.questionHistory[lastItemIndex];
    const lastEval = lastItem?.evaluation;

    let updatedTopics = topicMasteries;
    if (lastEval) {
      updatedTopics = topicMasteries.map((t) =>
        t.topicId === topicId ? SpacedScheduler.recordAttempt(t, lastEval.overallScore) : t
      );
      persist(STORAGE_KEYS.TOPICS, updatedTopics);
    }

    // 3. Competency Assessment Integration (Phase 5)
    if (lastEval && currentCandidateAnswer.trim().length > 0) {
      const targetTopicId =
        lastItem.curriculumTopicId ||
        (lastItem.questionId
          ? QuestionBank.getQuestionById(lastItem.questionId)?.curriculumTopicId
          : undefined) ||
        QuestionBank.mapLegacyTopicToCurriculumId(lastItem.category) ||
        updatedSession.selectedTopicId;

      if (targetTopicId && CurriculumCatalogService.getInstance().getTopic(targetTopicId)) {
        const isCodingRound =
          lastItem.category === 'coding' || updatedSession.roundType === 'dsa_coding';
        const submissionId = `turn_${lastItemIndex}_${lastItem.questionId || 'q'}_${targetTopicId}`;
        CompetencyProfileService.getInstance().recordAssessment({
          curriculumTopicId: targetTopicId,
          questionId: lastItem.questionId || `turn_${lastItemIndex}`,
          submissionId,
          score: lastEval.overallScore,
          hintsUsed: activeHintsUsed,
          candidateQuoteOrSnippet: currentCandidateAnswer.trim(),
          sourceType: isCodingRound ? 'coding_assessment' : 'live_interview',
          rationale:
            lastEval.diffMissingPoints?.[0] ||
            lastItem.codingEvaluation?.summaryFeedback ||
            'Evaluated from live practice session turn.',
          isAiGeneratedText: false,
        });
      }
    }

    // If session just ended, add to history and clear active session storage
    let newHistory = get().sessionHistory;
    if (!updatedSession.isActive) {
      newHistory = [updatedSession, ...newHistory].slice(0, 30);
      persist(STORAGE_KEYS.SESSIONS, newHistory);
      persist(STORAGE_KEYS.ACTIVE_SESSION, null);
    } else {
      persist(STORAGE_KEYS.ACTIVE_SESSION, updatedSession);
    }

    // Refresh available hints for next question if continuing
    const nextCategory =
      updatedSession.questionHistory[updatedSession.questionHistory.length - 1]?.category ||
      'behavioral';
    const availableHints = CoachingEngine.getTieredHints(
      updatedSession.currentQuestion,
      nextCategory
    );

    set({
      activeSession: updatedSession,
      sessionHistory: newHistory,
      topicMasteries: updatedTopics,
      currentCandidateAnswer: '',
      speakingStartTime: Date.now(),
      activeHintsUsed: [],
      availableHints,
      interruptionBanner: null,
      isEvaluatingAnswer: false,
      evaluationError: null,
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
    persist(STORAGE_KEYS.ACTIVE_SESSION, null);

    set({
      activeSession: terminatedSession,
      sessionHistory: newHistory,
    });
  },

  discardActiveSession: () => {
    persist(STORAGE_KEYS.ACTIVE_SESSION, null);
    set({
      activeSession: null,
      currentCandidateAnswer: '',
      isEvaluatingAnswer: false,
      evaluationError: null,
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

  importCustomQuestionPack: (pack) => {
    return QuestionBank.importCustomPack(pack);
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
    const updated = [
      plan,
      ...existing.filter((p) => p.companyName.toLowerCase() !== companyName.toLowerCase()),
    ];
    persist(STORAGE_KEYS.PLANS, updated);
    set({ companyPlans: updated, activeCompanyPlan: plan, activeTab: 'company_prep' });
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

  addFeedbackRecord: (record) => {
    const existing = get().feedbackRecords;
    if (existing.some((r) => r.sourceHash === record.sourceHash)) {
      return { success: false, duplicate: true };
    }
    const updated = [record, ...existing];
    persist(STORAGE_KEYS.FEEDBACK, updated);
    set({ feedbackRecords: updated });
    return { success: true };
  },

  updateFeedbackRecord: (record) => {
    const existing = get().feedbackRecords;
    const updated = existing.map((r) => (r.id === record.id ? record : r));
    persist(STORAGE_KEYS.FEEDBACK, updated);
    set({ feedbackRecords: updated });
  },

  deleteFeedbackRecord: (id) => {
    const updated = get().feedbackRecords.filter((r) => r.id !== id);
    persist(STORAGE_KEYS.FEEDBACK, updated);
    set({ feedbackRecords: updated });
  },

  setWeaknessPlan: (plan) => {
    persist(STORAGE_KEYS.WEAKNESS_PLAN, plan);
    set({ weaknessPlan: plan });
  },

  seedSchedulerFromWeaknesses: () => {
    const records = get().feedbackRecords;
    const weaknessResult = WeaknessMap.aggregateFeedback(records);
    const currentMasteries = get().topicMasteries;
    const updatedMasteries = SpacedScheduler.seedFromWeaknesses(
      currentMasteries,
      weaknessResult.rankedWeaknesses
    );
    persist(STORAGE_KEYS.TOPICS, updatedMasteries);
    set({ topicMasteries: updatedMasteries });
  },

  setActiveExplainerTopic: (topic) => set({ activeExplainerTopic: topic }),

  recordExplainerAttempt: (attempt) => {
    const attempts = [attempt, ...get().explainerAttempts];
    persist(STORAGE_KEYS.EXPLAINER_ATTEMPTS, attempts);
    set({ explainerAttempts: attempts });

    // Feed into SpacedScheduler mastery upgrade rule (requires 2 consecutive attempts with structure >= 4 & concreteness >= 4)
    const masteries = [...get().topicMasteries];
    const topicLower = attempt.topic.toLowerCase();
    const mIdx = masteries.findIndex(
      (m) =>
        m.topicName.toLowerCase() === topicLower || m.topicId.toLowerCase().includes(topicLower)
    );

    if (mIdx !== -1) {
      const attemptsForTopic = attempts.filter((a) => a.topic.toLowerCase() === topicLower);
      const { updatedMastery, improved } = ExplainerDrillService.updateMasteryFromAttempts(
        masteries[mIdx],
        attemptsForTopic
      );
      if (improved) {
        masteries[mIdx] = updatedMastery;
        persist(STORAGE_KEYS.TOPICS, masteries);
        set({ topicMasteries: masteries });
      }
    }
  },

  saveConceptCard: (card) => {
    const cards = { ...get().conceptCards, [card.topic.toLowerCase()]: card };
    persist(STORAGE_KEYS.CONCEPT_CARDS, cards);
    set({ conceptCards: cards });
  },

  toggleWeaknessDrillCompleted: (day, drillId) => {
    const currentPlan = get().weaknessPlan;
    if (!currentPlan) return;
    const updatedDays = currentPlan.days.map((d) => {
      if (d.day !== day) return d;
      const updatedDrills = d.drills.map((drill) =>
        drill.id === drillId ? { ...drill, completed: !drill.completed } : drill
      ) as [any, any, any];
      return { ...d, drills: updatedDrills };
    });
    const updatedPlan: WeaknessPracticePlan = { ...currentPlan, days: updatedDays };
    persist(STORAGE_KEYS.WEAKNESS_PLAN, updatedPlan);
    set({ weaknessPlan: updatedPlan });
  },

  clearAllFeedback: () => {
    persist(STORAGE_KEYS.FEEDBACK, []);
    set({ feedbackRecords: [] });
  },

  deleteAllFeedbackAndPracticeData: () => {
    const failedKeys: string[] = [];

    if (typeof localStorage !== 'undefined') {
      for (const key of Object.values(STORAGE_KEYS)) {
        try {
          localStorage.removeItem(key);
          if (localStorage.getItem(key) !== null) failedKeys.push(key);
        } catch (error) {
          console.error('[PracticeStore] Failed to remove persisted data key:', key, error);
          failedKeys.push(key);
        }
      }
    }

    // Always clear sensitive in-memory state; the caller must not report full success
    // while a persisted key remains.
    set({
      activeSession: null,
      sessionHistory: [],
      storyBank: [],
      topicMasteries: [],
      companyPlans: [],
      activeCompanyPlan: null,
      currentCandidateAnswer: '',
      speakingStartTime: null,
      activeHintsUsed: [],
      availableHints: [],
      interruptionBanner: null,
      feedbackRecords: [],
      weaknessPlan: null,
      explainerAttempts: [],
      conceptCards: {},
      activeExplainerTopic: '',
    });

    return { success: failedKeys.length === 0, failedKeys };
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
