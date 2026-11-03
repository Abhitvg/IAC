import { describe, it, expect, beforeEach } from 'vitest';
import {
  CompetencyProfileService,
  MasteryStatusSchema,
  RevisionStatusSchema,
} from '../src/services/practice/CompetencyProfileService';
import { TieredHint } from '../src/services/practice/types';

describe('Phase 5 — Evidence-Based Technical Competency Profile', () => {
  let service: CompetencyProfileService;

  beforeEach(() => {
    service = CompetencyProfileService.getInstance();
    service.resetProfile();
  });

  it('initializes competency records for all 37 curriculum topics in NOT_ASSESSED state', () => {
    const all = service.getAllCompetencies();
    expect(all.length).toBe(37);
    for (const topic of all) {
      expect(topic.masteryStatus).toBe('NOT_ASSESSED');
      expect(topic.revisionStatus).toBe('UP_TO_DATE');
      expect(topic.confidenceScore).toBe(0);
      expect(topic.history).toHaveLength(0);
    }
  });

  it('marks concept INTRODUCED without promoting to demonstrated mastery', () => {
    service.markConceptIntroduced('ds_arrays_strings');
    const comp = service.getTopicCompetency('ds_arrays_strings');
    expect(comp?.masteryStatus).toBe('INTRODUCED');
    expect(comp?.confidenceScore).toBe(10);
    expect(comp?.history).toHaveLength(0); // Reading/viewing produces no candidate performance evidence
  });

  it('records verified performance evidence and promotes to STRONGLY_DEMONSTRATED unassisted', () => {
    const res = service.recordAssessment({
      curriculumTopicId: 'ds_trees_bst',
      questionId: 'cq_trees_01',
      score: 4.8,
      hintsUsed: [],
      candidateQuoteOrSnippet: 'AVL trees enforce a height difference of at most 1, giving shallower max height.',
      sourceType: 'live_interview',
      rationale: 'Candidate articulated exact balancing invariants.',
    });

    expect(res.success).toBe(true);
    const comp = service.getTopicCompetency('ds_trees_bst');
    expect(comp?.masteryStatus).toBe('STRONGLY_DEMONSTRATED');
    expect(comp?.revisionStatus).toBe('UP_TO_DATE');
    expect(comp?.history).toHaveLength(1);
    expect(comp?.history[0].candidateQuoteOrSnippet).toContain('AVL trees enforce a height difference');
  });

  it('precludes STRONGLY_DEMONSTRATED when candidate required substantial tier 3 hints', () => {
    const tier3Hint: TieredHint = {
      tier: 3,
      title: 'Near-Solution Approach',
      content: 'Use an in-order traversal stack to reconstruct the BST.',
      penaltyPoints: 2.0,
    };

    const res = service.recordAssessment({
      curriculumTopicId: 'ds_trees_bst',
      questionId: 'cq_trees_01',
      score: 4.8, // High score but heavily assisted
      hintsUsed: [tier3Hint],
      candidateQuoteOrSnippet: 'Reconstructing the tree using the suggested traversal stack.',
      sourceType: 'coding_assessment',
    });

    expect(res.success).toBe(true);
    const comp = service.getTopicCompetency('ds_trees_bst');
    // Rule: Near-solution hint precludes STRONGLY_DEMONSTRATED
    expect(comp?.masteryStatus).toBe('DEMONSTRATED');
  });

  it('marks NEEDS_REVISION and ATTEMPTED when score falls below threshold', () => {
    service.recordAssessment({
      curriculumTopicId: 'algo_dynamic_programming',
      questionId: 'cq_dp_01',
      score: 1.8,
      candidateQuoteOrSnippet: 'I tried brute force recursion without caching states.',
      sourceType: 'coding_assessment',
    });

    const comp = service.getTopicCompetency('algo_dynamic_programming');
    expect(comp?.masteryStatus).toBe('ATTEMPTED');
    expect(comp?.revisionStatus).toBe('NEEDS_REVISION');

    const needingRevision = service.getTopicsNeedingRevision();
    expect(needingRevision.some((t) => t.curriculumTopicId === 'algo_dynamic_programming')).toBe(true);
  });

  it('strictly rejects AI-generated text or empty candidate quotes as evidence', () => {
    const aiRes = service.recordAssessment({
      curriculumTopicId: 'cs_databases',
      questionId: 'cq_db_01',
      score: 5.0,
      candidateQuoteOrSnippet: 'Perfect AI answer text.',
      sourceType: 'live_interview',
      isAiGeneratedText: true,
    });
    expect(aiRes.success).toBe(false);
    expect(aiRes.error).toContain('AI-generated text cannot be accepted');

    const emptyRes = service.recordAssessment({
      curriculumTopicId: 'cs_databases',
      questionId: 'cq_db_01',
      score: 5.0,
      candidateQuoteOrSnippet: '   ',
      sourceType: 'live_interview',
    });
    expect(emptyRes.success).toBe(false);
    expect(emptyRes.error).toContain('Candidate quote or code snippet is mandatory');
  });

  it('maintains append-only audit trail across multiple sessions', () => {
    service.recordAssessment({
      curriculumTopicId: 'cs_networking',
      questionId: 'cq_net_01',
      score: 2.0,
      candidateQuoteOrSnippet: 'TIME_WAIT is on the receiver side.',
      sourceType: 'live_interview',
    });

    service.recordAssessment({
      curriculumTopicId: 'cs_networking',
      questionId: 'cq_net_01_retry',
      score: 4.5,
      candidateQuoteOrSnippet: 'TIME_WAIT occurs on the active closer to drain delayed segments.',
      sourceType: 'live_interview',
    });

    const comp = service.getTopicCompetency('cs_networking');
    expect(comp?.history).toHaveLength(2);
    expect(comp?.attemptsCount).toBe(2);
    expect(comp?.masteryStatus).toBe('STRONGLY_DEMONSTRATED');
    expect(comp?.revisionStatus).toBe('UP_TO_DATE');
  });
});
