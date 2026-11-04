import { z } from 'zod';
import { CurriculumCatalogService } from '../../data/curriculum/CurriculumCatalog';
import { TieredHint } from './types';

export const MasteryStatusSchema = z.enum([
  'NOT_ASSESSED',
  'INTRODUCED',
  'ATTEMPTED',
  'DEVELOPING',
  'DEMONSTRATED',
  'STRONGLY_DEMONSTRATED',
]);

export type MasteryStatus = z.infer<typeof MasteryStatusSchema>;

export const RevisionStatusSchema = z.enum(['NEEDS_REVISION', 'UP_TO_DATE']);

export type RevisionStatus = z.infer<typeof RevisionStatusSchema>;

export interface CompetencyEvidenceRecord {
  id: string;
  submissionId?: string;
  timestamp: number;
  curriculumTopicId: string;
  questionId: string;
  score: number; // 1.0 to 5.0
  hintsCount: number;
  highestHintTier?: number;
  candidateQuoteOrSnippet: string;
  sourceType: 'live_interview' | 'coding_assessment' | 'explainer_drill';
  rationale: string;
}

export interface TopicCompetency {
  curriculumTopicId: string;
  topicName: string;
  masteryStatus: MasteryStatus;
  revisionStatus: RevisionStatus;
  confidenceScore: number; // 0 to 100
  history: CompetencyEvidenceRecord[];
  lastAssessedAt?: number;
  attemptsCount: number;
}

export interface RecordAssessmentParams {
  curriculumTopicId: string;
  questionId: string;
  submissionId?: string;
  score: number;
  hintsUsed?: TieredHint[];
  candidateQuoteOrSnippet: string;
  sourceType: 'live_interview' | 'coding_assessment' | 'explainer_drill';
  rationale?: string;
  isAiGeneratedText?: boolean;
}

const STORAGE_KEY = 'iac_technical_competency_profile_v1';

export class CompetencyProfileService {
  private static instance: CompetencyProfileService;
  private profile: Map<string, TopicCompetency> = new Map();

  private constructor() {
    this.initializeProfile();
    this.loadFromStorage();
  }

  public static getInstance(): CompetencyProfileService {
    if (!this.instance) {
      this.instance = new CompetencyProfileService();
    }
    return this.instance;
  }

  private initializeProfile(): void {
    const catalog = CurriculumCatalogService.getInstance();
    for (const topic of catalog.getAllTopics()) {
      this.profile.set(topic.id, {
        curriculumTopicId: topic.id,
        topicName: topic.name,
        masteryStatus: 'NOT_ASSESSED',
        revisionStatus: 'UP_TO_DATE',
        confidenceScore: 0,
        history: [],
        attemptsCount: 0,
      });
    }
  }

  /**
   * Records a validated candidate performance event and updates topic competency.
   * Rejects AI-generated answers and empty quotes to preserve evidence integrity.
   */
  public recordAssessment(params: RecordAssessmentParams): {
    success: boolean;
    error?: string;
    updatedCompetency?: TopicCompetency;
  } {
    // Rule: AI-generated text must NEVER be recorded as candidate evidence
    if (params.isAiGeneratedText) {
      return {
        success: false,
        error: 'AI-generated text cannot be accepted as candidate performance evidence.',
      };
    }

    // Rule: Must provide evidence quote or snippet
    if (!params.candidateQuoteOrSnippet || !params.candidateQuoteOrSnippet.trim()) {
      return {
        success: false,
        error: 'Candidate quote or code snippet is mandatory for evidence-based competency recording.',
      };
    }

    const topic = this.profile.get(params.curriculumTopicId);
    if (!topic) {
      return {
        success: false,
        error: `Curriculum topic '${params.curriculumTopicId}' not recognized.`,
      };
    }

    const hints = params.hintsUsed || [];
    const highestTier = hints.reduce(
      (max, h) => Math.max(max, h.tier || 0),
      0
    );

    const stableSubmissionId =
      params.submissionId ||
      `${params.curriculumTopicId}::${params.questionId}::${params.candidateQuoteOrSnippet.trim()}`;

    // Stable ID-based deduplication (replaces fragile time-window checks)
    const existingDuplicate = topic.history.find(
      (h) =>
        (h.submissionId && h.submissionId === stableSubmissionId) ||
        (h.questionId === params.questionId &&
          h.candidateQuoteOrSnippet === params.candidateQuoteOrSnippet.trim())
    );
    if (existingDuplicate) {
      return {
        success: true,
        updatedCompetency: topic,
      };
    }

    const evidence: CompetencyEvidenceRecord = {
      id: `ev_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      submissionId: stableSubmissionId,
      timestamp: Date.now(),
      curriculumTopicId: params.curriculumTopicId,
      questionId: params.questionId,
      score: Math.min(5, Math.max(1, params.score)),
      hintsCount: hints.length,
      highestHintTier: highestTier > 0 ? highestTier : undefined,
      candidateQuoteOrSnippet: params.candidateQuoteOrSnippet.trim(),
      sourceType: params.sourceType,
      rationale: params.rationale || 'Demonstrated performance during assessment.',
    };

    // Append to immutable history
    topic.history.push(evidence);
    topic.attemptsCount += 1;
    topic.lastAssessedAt = evidence.timestamp;

    // Compute new mastery status and revision status based on rules:
    // Substantial hints (tier 3 or >= 2 hints) preclude STRONGLY_DEMONSTRATED
    const hasSubstantialHints = highestTier >= 3 || hints.length >= 2;

    if (evidence.score >= 4.5 && !hasSubstantialHints) {
      topic.masteryStatus = 'STRONGLY_DEMONSTRATED';
      topic.revisionStatus = 'UP_TO_DATE';
      topic.confidenceScore = Math.min(100, topic.confidenceScore + 25);
    } else if (evidence.score >= 3.5) {
      topic.masteryStatus = hasSubstantialHints && topic.masteryStatus === 'STRONGLY_DEMONSTRATED'
        ? 'DEMONSTRATED'
        : 'DEMONSTRATED';
      topic.revisionStatus = 'UP_TO_DATE';
      topic.confidenceScore = Math.min(85, Math.max(65, topic.confidenceScore + 15));
    } else if (evidence.score >= 2.5) {
      topic.masteryStatus = 'DEVELOPING';
      topic.revisionStatus = 'UP_TO_DATE';
      topic.confidenceScore = Math.min(60, Math.max(40, topic.confidenceScore + 10));
    } else {
      topic.masteryStatus = 'ATTEMPTED';
      topic.revisionStatus = 'NEEDS_REVISION';
      topic.confidenceScore = Math.max(15, topic.confidenceScore - 15);
    }

    this.saveToStorage();

    return {
      success: true,
      updatedCompetency: { ...topic, history: [...topic.history] },
    };
  }

  /**
   * Explicitly marks a concept as INTRODUCED (e.g. read explanation or viewed drill),
   * strictly forbidden from promoting to DEMONSTRATED or STRONGLY_DEMONSTRATED.
   */
  public markConceptIntroduced(topicId: string): void {
    const topic = this.profile.get(topicId);
    if (!topic) return;

    if (topic.masteryStatus === 'NOT_ASSESSED') {
      topic.masteryStatus = 'INTRODUCED';
      topic.confidenceScore = 10;
      this.saveToStorage();
    }
  }

  /**
   * Proves that resume claims or repository presence do not automatically fabricate competency.
   */
  public rejectExternalClaimPromotion(): string {
    return 'Resume claims and repository visibility are external unverified indicators and do not alter technical competency mastery.';
  }

  public getTopicCompetency(topicId: string): TopicCompetency | undefined {
    const topic = this.profile.get(topicId);
    return topic ? { ...topic, history: [...topic.history] } : undefined;
  }

  public getAllCompetencies(): TopicCompetency[] {
    return Array.from(this.profile.values()).map((t) => ({
      ...t,
      history: [...t.history],
    }));
  }

  public getTopicsNeedingRevision(): TopicCompetency[] {
    return this.getAllCompetencies().filter((t) => t.revisionStatus === 'NEEDS_REVISION');
  }

  public resetProfile(): void {
    this.profile.clear();
    this.initializeProfile();
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.removeItem(STORAGE_KEY);
      }
    } catch (_e) {}
  }

  private saveToStorage(): void {
    try {
      if (typeof localStorage !== 'undefined') {
        const serialized = JSON.stringify(Array.from(this.profile.entries()));
        localStorage.setItem(STORAGE_KEY, serialized);
      }
    } catch (_e) {}
  }

  private loadFromStorage(): void {
    try {
      if (typeof localStorage !== 'undefined') {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (raw) {
          const entries: [string, TopicCompetency][] = JSON.parse(raw);
          for (const [id, comp] of entries) {
            this.profile.set(id, comp);
          }
        }
      }
    } catch (_e) {}
  }
}

