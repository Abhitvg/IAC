import { DeterministicSignals } from './scoring/DeterministicSignals';
export type InterviewPersona = 'strict_big_tech' | 'startup_pragmatist' | 'friendly_recruiter';

export type MockRoundType =
  | 'dress_rehearsal' // Complete 45-minute loop
  | 'dsa_coding'
  | 'system_design'
  | 'behavioral'
  | 'role_specific';

export type RehearsalPhase =
  | 'icebreaker' // 3 min
  | 'behavioral' // 10 min
  | 'technical' // 22 min
  | 'candidate_qa' // 5 min
  | 'wrapup'; // 5 min

export interface RubricDimension {
  name: string;
  category: 'coding' | 'system_design' | 'behavioral';
  score: number; // 1 to 5
  maxScore: number;
  weight: number;
  feedback: string;
  evidenceQuote?: string; // Exact quote from candidate answer
  missingAspect?: string;
  penaltyDeduction?: number;
  matchType?: string;
}

export interface RubricEvaluation {
  overallScore: number; // 1.0 to 5.0
  percentage: number; // 0 to 100
  dimensions: RubricDimension[];
  topLeverageFixes: string[];
  modelAnswer: string;
  diffMissingPoints: string[];
  assessedAt: number;
  uncertainty?: string;
  isHeuristicEstimate?: boolean;
  confidenceBanner?: string;
  signals?: DeterministicSignals;
  estimatedCostUsd?: number;
  latencyMs?: number;
}

export interface DeliveryMetrics {
  durationSeconds: number;
  wordCount: number;
  speakingPaceWpm: number;
  paceCategory: 'slow' | 'optimal' | 'fast';
  fillerWordsCount: number;
  fillerPercentage: number;
  fillerBreakdown: Record<string, number>;
  timeToFirstSentenceSeconds: number;
  isRambling: boolean; // Answer > 120 seconds without structured milestones
  deliveryScore: number; // 1 to 5
  deliveryFeedback: string;
}

export type HintTier = 1 | 2 | 3;

export interface TieredHint {
  tier: HintTier;
  title: 'Gentle Nudge' | 'Specific Hint' | 'Near-Solution Approach';
  content: string;
  penaltyPoints: number; // e.g. 0.5, 1.0, 2.0
}

export type BehavioralCompetency =
  'leadership' | 'conflict' | 'failure_postmortem' | 'ambiguity' | 'high_impact_scale';

export interface BehavioralStory {
  id: string;
  title: string;
  companyProject: string;
  situation: string;
  task: string;
  action: string;
  result: string;
  metrics: string[];
  competencies: BehavioralCompetency[];
  lastUsedTimestamp?: number;
}

export interface TopicMastery {
  topicId: string;
  topicName: string;
  category: 'DSA' | 'System Design' | 'Behavioral' | 'Core CS';
  easeFactor: number; // SM-2 ease factor, initial 2.5
  intervalDays: number;
  repetitions: number;
  masteryScore: number; // 0 - 100%
  lastReviewedDate?: number;
  nextReviewDate: number;
}

export interface CompanyPracticePlan {
  companyName: string;
  targetRole: string;
  jobDescriptionText: string;
  extractedStack: string[];
  seniority: 'Junior' | 'Mid' | 'Senior' | 'Staff/Lead';
  likelyRoundThemes: string[];
  resumeGapAnalysis: {
    matchedStrengths: string[];
    missingCompetencies: string[];
    recommendedFocusAreas: string[];
  };
  durationDays: 7 | 14;
  dailyDrills: Array<{
    day: number;
    title: string;
    focusCategory: string;
    targetExercise: string;
    completed: boolean;
  }>;
  persistentNotes: string[];
  createdAt: number;
}

export interface MockSessionState {
  isActive: boolean;
  roundType: MockRoundType;
  rehearsalPhase?: RehearsalPhase;
  persona: InterviewPersona;
  totalTimeSeconds: number;
  timeRemainingSeconds: number;
  interruptionEnabled: boolean;
  isInterviewerSpeaking: boolean;
  interviewerThinkingSeconds: number; // Simulated pause after candidate finishes
  currentQuestion: string;
  questionHistory: Array<{
    question: string;
    category: string;
    isFollowUp: boolean;
    candidateTranscript: string;
    evaluation?: RubricEvaluation;
    delivery?: DeliveryMetrics;
    hintsUsed: TieredHint[];
    interruptionCount?: number;
    probeCount?: number;
    questionId?: string;
  }>;
  isOfflineInterviewer?: boolean;
  overallScorecard?: {
    finalRating: 'Strong No Hire' | 'No Hire' | 'Leaning Hire' | 'Hire' | 'Strong Hire';
    averageScore: number;
    codingScore?: number;
    systemDesignScore?: number;
    behavioralScore?: number;
    deliveryScore: number;
    keyStrengths: string[];
    topImprovementPriorities: string[];
  };
}

// ═══════════════════════════════════════════════════════════════════
// Feedback Import & Weakness Analysis Types
// ═══════════════════════════════════════════════════════════════════

export type FeedbackSkill =
  'knowledge' | 'structure' | 'concreteness' | 'depth' | 'delivery' | 'other';

export interface FeedbackStrength {
  topic: string;
  skill: FeedbackSkill;
  evidence: string;
}

export interface FeedbackWeakness {
  topic: string;
  skill: FeedbackSkill;
  severity: 1 | 2 | 3;
  evidence: string;
  requestedFix: string;
}

export interface FeedbackRecord {
  id: string;
  date: string;
  company?: string;
  role?: string;
  roundType?: MockRoundType | string;
  rawText?: string;
  redactedText: string;
  strengths: FeedbackStrength[];
  weaknesses: FeedbackWeakness[];
  overallTone?: string;
  uncertainty?: string;
  sourceHash: string;
  isEstimated?: boolean;
  createdAt: number;
}

export interface RankedWeakness {
  id: string;
  topic: string;
  rawTopics: string[];
  skill: FeedbackSkill;
  severity: number;
  score: number;
  reportCount: number;
  isRecurring: boolean;
  lastReportedDate: number;
  evidenceQuotes: string[];
  requestedFixes: string[];
  mappedQuestionTags: string[];
  hasMatchingQuestions: boolean;
}

export interface WeaknessMapResult {
  rankedWeaknesses: RankedWeakness[];
  recurringWeaknesses: RankedWeakness[];
  missingContentTopics: string[];
  skillBreakdown: Record<FeedbackSkill, number>;
  totalReportsAnalyzed: number;
}

export interface WeaknessPlanDrill {
  id: string;
  type: 'structure_drill' | 'concreteness_drill' | 'topic_mock';
  title: string;
  targetTopic: string;
  instructions: string;
  timeBudgetMinutes: number;
  completed: boolean;
}

export interface WeaknessPlanDay {
  day: number;
  totalTimeMinutes: number;
  drills: [WeaknessPlanDrill, WeaknessPlanDrill, WeaknessPlanDrill];
}

export interface WeaknessPracticePlan {
  id: string;
  createdAt: number;
  durationDays: 7;
  maxDailyMinutes: number;
  rankedWeaknessesSnapshot: RankedWeakness[];
  days: WeaknessPlanDay[];
}
