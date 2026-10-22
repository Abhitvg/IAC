import { describe, it, expect } from 'vitest';
import { ExplainerDrillService } from '../../src/services/practice/coach/ExplainerDrillService';
import {
  StructureAnalysisResult,
  ConcretenessAnalysisResult,
  DeliveryMetrics,
  TopicMastery,
  ExplainerAttempt,
} from '../../src/services/practice/types';

describe('ExplainerDrillService - Phase 4 Acceptance Tests', () => {
  const dummyDelivery: DeliveryMetrics = {
    durationSeconds: 60,
    wordCount: 130,
    speakingPaceWpm: 130,
    paceCategory: 'optimal',
    fillerWordsCount: 2,
    fillerPercentage: 1.5,
    fillerBreakdown: {},
    timeToFirstSentenceSeconds: 1.5,
    isRambling: false,
    deliveryScore: 4.0,
    deliveryFeedback: 'Great tempo',
  };

  const highStructure: StructureAnalysisResult = {
    headlineFirst: { met: true, quote: 'The core approach is X' },
    signposting: { met: true, quote: 'There are three points' },
    claimReasonExample: { count: 3, quotes: [] },
    tradeOffStated: { met: true, quote: 'However, memory overhead increases' },
    closingSummary: { met: true, quote: 'In summary, X stabilizes latency' },
    tangents: [],
    tangentRatio: 0,
    structureScore: 4,
    reasons: ['Strong structure'],
    answerLength: 500,
    wordCount: 120,
    sentenceCount: 5,
    timeToFirstClaimSeconds: 2,
  };

  const highConcreteness: ConcretenessAnalysisResult = {
    concreteExamplesCount: 2,
    concreteExamples: [{ quote: 'production cluster', description: 'desc' }],
    namedToolsOrTechnologies: [{ name: 'Redis', quote: 'Redis' }],
    quantitiesOrThresholds: [{ quantity: '10,000 QPS', quote: '10,000 QPS' }],
    workedExamplePresent: true,
    workedExampleQuote: 'for example',
    claimsWithoutSupport: [],
    concretenessScore: 4,
    reasons: ['Grounded with numbers'],
  };

  const lowStructure: StructureAnalysisResult = {
    ...highStructure,
    headlineFirst: { met: false, quote: '' },
    signposting: { met: false, quote: '' },
    structureScore: 2,
    reasons: ['Unstructured narrative'],
  };

  const lowConcreteness: ConcretenessAnalysisResult = {
    ...highConcreteness,
    quantitiesOrThresholds: [],
    namedToolsOrTechnologies: [],
    concretenessScore: 2,
    reasons: ['Abstract without metrics'],
  };

  it('enforces timer limits and flags overtime with timing deduction', () => {
    // 1. Within time limit
    const withinTimeAttempt = ExplainerDrillService.evaluateAttempt({
      topic: 'Distributed Caching',
      transcript: 'Valid explanation transcript',
      timeLimitSeconds: 60,
      elapsedSeconds: 52,
      structureAnalysis: highStructure,
      concretenessAnalysis: highConcreteness,
      delivery: dummyDelivery,
    });

    expect(withinTimeAttempt.stayedWithinTime).toBe(true);
    expect(withinTimeAttempt.elapsedSeconds).toBe(52);
    expect(withinTimeAttempt.timeLimitSeconds).toBe(60);

    // 2. Overtime violation
    const overtimeAttempt = ExplainerDrillService.evaluateAttempt({
      topic: 'Distributed Caching',
      transcript: 'Overtime explanation transcript',
      timeLimitSeconds: 90,
      elapsedSeconds: 98,
      structureAnalysis: highStructure,
      concretenessAnalysis: highConcreteness,
      delivery: dummyDelivery,
    });

    expect(overtimeAttempt.stayedWithinTime).toBe(false);
    expect(overtimeAttempt.elapsedSeconds).toBe(98);
    expect(overtimeAttempt.timeLimitSeconds).toBe(90);
    expect(overtimeAttempt.improvementTarget).toContain('You exceeded your 90s budget by 8s');
    // Overtime incurs 0.5 timing penalty
    expect(overtimeAttempt.compositeScore).toBeLessThan(withinTimeAttempt.compositeScore);
  });

  it('computes retry score deltas accurately between attempts', () => {
    const attempt1 = ExplainerDrillService.evaluateAttempt({
      topic: 'Event Loop',
      transcript: 'First attempt with low structure',
      timeLimitSeconds: 90,
      elapsedSeconds: 85,
      structureAnalysis: lowStructure, // score: 2
      concretenessAnalysis: lowConcreteness, // score: 2
      delivery: dummyDelivery,
    });

    expect(attempt1.attemptNumber).toBe(1);
    expect(attempt1.scoreDelta).toBeUndefined();

    // Retry on same topic with improved structure and concreteness
    const attempt2 = ExplainerDrillService.evaluateAttempt({
      topic: 'Event Loop',
      transcript: 'Second attempt with organized headline and numbers',
      timeLimitSeconds: 90,
      elapsedSeconds: 78,
      previousAttempt: attempt1,
      structureAnalysis: highStructure, // score: 4
      concretenessAnalysis: highConcreteness, // score: 4
      delivery: dummyDelivery,
    });

    expect(attempt2.attemptNumber).toBe(2);
    expect(attempt2.scoreDelta).toBeDefined();
    expect(attempt2.scoreDelta?.structureDelta).toBe(2); // 4 - 2 = +2
    expect(attempt2.scoreDelta?.concretenessDelta).toBe(2); // 4 - 2 = +2
    expect(attempt2.scoreDelta?.compositeDelta).toBeGreaterThan(1.0);
  });

  it('updates SpacedScheduler mastery ONLY when both structure and concreteness reach >= 4 in two consecutive attempts', () => {
    const initialMastery: TopicMastery = {
      topicId: 'weakness_distributed_caching',
      topicName: 'Distributed Caching',
      category: 'System Design',
      easeFactor: 1.8,
      intervalDays: 0,
      repetitions: 0,
      masteryScore: 15,
      nextReviewDate: Date.now(),
    };

    const makeAttempt = (
      id: string,
      s: number,
      c: number,
      timestamp: number
    ): ExplainerAttempt => ({
      id,
      topic: 'Distributed Caching',
      attemptNumber: 1,
      timestamp,
      dateKey: '2026-10-01',
      transcript: 'transcript',
      timeLimitSeconds: 90,
      elapsedSeconds: 80,
      stayedWithinTime: true,
      structureScore: s,
      concretenessScore: c,
      compositeScore: (s + c) / 2,
      delivery: dummyDelivery,
      improvementTarget: '',
    });

    // 1. Single passing attempt (attempt 1: 4 & 4) -> NOT improved yet (needs 2 consecutive)
    const att1 = makeAttempt('att_1', 4, 4, 1000);
    const step1 = ExplainerDrillService.updateMasteryFromAttempts(initialMastery, [att1]);
    expect(step1.improved).toBe(false);
    expect(step1.consecutivePassingCount).toBe(1);
    expect(step1.updatedMastery.masteryScore).toBe(15);

    // 2. Second attempt fails concreteness (attempt 2: 4 & 2) -> consecutive resets
    const att2 = makeAttempt('att_2', 4, 2, 2000);
    const step2 = ExplainerDrillService.updateMasteryFromAttempts(initialMastery, [att1, att2]);
    expect(step2.improved).toBe(false);
    expect(step2.consecutivePassingCount).toBe(0);
    expect(step2.updatedMastery.masteryScore).toBe(15);

    // 3. Third attempt passes (attempt 3: 4 & 4) -> 1 consecutive
    const att3 = makeAttempt('att_3', 4, 4, 3000);
    const step3 = ExplainerDrillService.updateMasteryFromAttempts(initialMastery, [
      att1,
      att2,
      att3,
    ]);
    expect(step3.improved).toBe(false);
    expect(step3.consecutivePassingCount).toBe(1);

    // 4. Fourth attempt passes (attempt 4: 5 & 4) -> TWO CONSECUTIVE PASSES! Mastery improves!
    const att4 = makeAttempt('att_4', 5, 4, 4000);
    const step4 = ExplainerDrillService.updateMasteryFromAttempts(initialMastery, [
      att1,
      att2,
      att3,
      att4,
    ]);
    expect(step4.improved).toBe(true);
    expect(step4.consecutivePassingCount).toBe(2);
    expect(step4.updatedMastery.repetitions).toBe(1);
    expect(step4.updatedMastery.masteryScore).toBeGreaterThan(15);
  });

  it('generates a concept card with all 4 required sections and non-authoritative disclaimer', async () => {
    const card = await ExplainerDrillService.generateConceptCard({
      topic: 'Operational Transformation',
    });

    expect(card.topic).toBe('Operational Transformation');
    expect(card.disclaimer).toBe('AI-generated, verify before relying on it');
    expect(card.coreIdea.length).toBeGreaterThan(20);
    expect(card.workedExample.length).toBeGreaterThan(15);
    expect(card.commonPitfall.length).toBeGreaterThan(15);
    expect(card.tradeOff.length).toBeGreaterThan(15);
    expect(card.isEditedByUser).toBe(false);
  });
});
