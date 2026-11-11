/**
 * CareerOps Job Search, Evaluation & Application Intelligence Engine
 * Inspired by career-ops open-source architecture (A-H Evaluation, 1-5 Fit Scoring,
 * ATS Resume Tailoring, Cover Letters, and Outreach Drafts).
 */

export interface WeightedRequirement {
  requirement: string;
  weight: 'critical' | 'high' | 'medium';
  fit: 'strong' | 'partial' | 'gap';
  evidence: string;
}

export interface JobEvaluationReport {
  score: number; // 1.0 to 5.0
  recommendation: 'apply' | 'skip';
  verdictHeadline: string;
  summary: string;
  weightedRequirements: WeightedRequirement[];
  levelStrategy: string;
  identifiedGaps: string[];
  strategicAngle: string;
  compensationEstimate: {
    estimatedRange: string;
    analysis: string;
  };
  workAuthAlert?: string;
  topInterviewStories: string[];
}

export type ApplicationStatus =
  | 'scouted'
  | 'evaluated'
  | 'applied'
  | 'interviewing'
  | 'offer'
  | 'rejected'
  | 'archived';

export interface FormQuestionRecord {
  questionId: string;
  questionText: string;
  answer: string;
  isCopied: boolean;
  copiedAt?: number;
  characterCount: number;
}

export interface JobApplication {
  id: string;
  company: string;
  role: string;
  url?: string;
  salaryRange?: string;
  location?: string;
  workType?: 'remote' | 'hybrid' | 'onsite';
  status: ApplicationStatus;
  score?: number | null; // 1.0 to 5.0, or null/0 if not yet evaluated
  recommendation?: 'apply' | 'skip' | 'unevaluated';
  jdText: string;
  evaluationReport?: JobEvaluationReport;
  tailoredResume?: string;
  coverLetter?: string;
  outreachNote?: string;
  formAnswers?: Record<string, FormQuestionRecord>;
  createdAt: number;
  updatedAt: number;
  appliedAt?: number;
  notes?: string;
  isDemo?: boolean;
}

export interface CareerOpsStats {
  totalTracked: number;
  scoutedCount: number;
  evaluatedCount: number;
  appliedCount: number;
  interviewingCount: number;
  offerCount: number;
  rejectedCount: number;
  avgScore: number;
  highFitCount: number; // score >= 4.0
}


export interface CareerOpsSource {
  id: string;
  label: string;
  url: string;
  keywords: string[];
  enabled: boolean;
  lastCheckedAt?: number;
  lastError?: string;
}
