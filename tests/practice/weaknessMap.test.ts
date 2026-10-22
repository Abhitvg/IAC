import { describe, it, expect } from 'vitest';
import { WeaknessMap } from '../../src/services/practice/feedback/WeaknessMap';
import { PlanGenerator } from '../../src/services/practice/feedback/PlanGenerator';
import { SpacedScheduler } from '../../src/services/practice/SpacedScheduler';
import { FeedbackRecord } from '../../src/services/practice/types';

describe('WeaknessMap - Phase 2 Acceptance & Integration Tests', () => {
  const fixedNow = 1790812800000; // 2026-10-01T00:00:00.000Z // Fixed timestamp for deterministic tests

  // Three distinct feedback reports all reporting a weakness on "structure"
  const fixtureReport1: FeedbackRecord = {
    id: 'report_1',
    date: '2026-09-14',
    company: 'Fintech Corp',
    role: 'Senior Backend Engineer',
    redactedText: 'The explanation regarding distributed cache failure was unstructured.',
    strengths: [{ topic: 'Concurrency', skill: 'knowledge', evidence: 'good Go concurrency' }],
    weaknesses: [
      {
        topic: 'Technical Explanation',
        skill: 'structure',
        severity: 2,
        evidence: 'explanation regarding distributed cache failure was unstructured',
        requestedFix: 'Provide a clear headline and step-by-step mechanism',
      },
      {
        topic: 'Cache Eviction',
        skill: 'concreteness',
        severity: 2,
        evidence: 'missed concrete examples of eviction',
        requestedFix: 'Cite concrete numbers',
      },
    ],
    sourceHash: 'hash_1',
    createdAt: fixedNow - 10 * 24 * 60 * 60 * 1000,
  };

  const fixtureReport2: FeedbackRecord = {
    id: 'report_2',
    date: '2026-09-10',
    company: 'Velocity E-Commerce',
    role: 'Staff Frontend Architect',
    redactedText: 'Candidate rambled and lacked structure in explaining trade-offs.',
    strengths: [{ topic: 'CSS', skill: 'knowledge', evidence: 'deep CSS layout understanding' }],
    weaknesses: [
      {
        topic: 'Technical Explanation',
        skill: 'structure',
        severity: 3,
        evidence: 'Candidate rambled and lacked structure in explaining trade-offs',
        requestedFix: 'Start with a direct trade-off summary before analyzing module federation',
      },
      {
        topic: 'Web Vitals',
        skill: 'concreteness',
        severity: 2,
        evidence: 'lacked concrete performance metrics',
        requestedFix: 'Quote specific LCP/INP targets',
      },
    ],
    sourceHash: 'hash_2',
    createdAt: fixedNow - 14 * 24 * 60 * 60 * 1000,
  };

  const fixtureReport3: FeedbackRecord = {
    id: 'report_3',
    date: '2026-09-01',
    company: 'CloudScale Hyperdrive',
    role: 'Principal Systems Engineer',
    redactedText: 'Architecture narrative lacked clear structure and jumped between topics.',
    strengths: [
      { topic: 'Architecture Diagramming', skill: 'structure', evidence: 'thorough diagram' },
    ],
    weaknesses: [
      {
        topic: 'Technical Explanation',
        skill: 'structure',
        severity: 2,
        evidence: 'Architecture narrative lacked clear structure and jumped between topics',
        requestedFix: 'Follow headline-first principle followed by signposted points',
      },
      {
        topic: 'Multi-Region Replication',
        skill: 'depth',
        severity: 2,
        evidence: 'shallow exploration of failure edge cases',
        requestedFix: 'Walk through CAP theorem trade-offs',
      },
    ],
    sourceHash: 'hash_3',
    createdAt: fixedNow - 23 * 24 * 60 * 60 * 1000,
  };

  it('ranks structure first and flags it recurring when present across three fixtures', () => {
    const result = WeaknessMap.aggregateFeedback([fixtureReport1, fixtureReport2, fixtureReport3], {
      now: fixedNow,
    });

    expect(result.rankedWeaknesses.length).toBeGreaterThan(0);

    const topWeakness = result.rankedWeaknesses[0];
    expect(topWeakness.skill).toBe('structure');
    expect(topWeakness.topic).toBe('Technical Explanation');
    expect(topWeakness.isRecurring).toBe(true);
    expect(topWeakness.reportCount).toBe(3);
    expect(topWeakness.score).toBeGreaterThan(15);

    // Verify it is also present in recurringWeaknesses list
    expect(result.recurringWeaknesses).toContainEqual(
      expect.objectContaining({
        topic: 'Technical Explanation',
        skill: 'structure',
        isRecurring: true,
      })
    );
  });

  it('weights recency with a 60-day half-life properly', () => {
    const dayMs = 24 * 60 * 60 * 1000;

    const recentRecord: FeedbackRecord = {
      id: 'recent_1',
      date: '2026-10-01',
      redactedText: 'Recent weakness',
      strengths: [],
      weaknesses: [
        {
          topic: 'Event Sourcing',
          skill: 'knowledge',
          severity: 2,
          evidence: 'Recent weakness',
          requestedFix: 'Study event sourcing',
        },
      ],
      sourceHash: 'recent_hash',
      createdAt: fixedNow,
    };

    const oldRecord: FeedbackRecord = {
      id: 'old_1',
      date: '2026-08-02', // 60 days before 2026-10-01
      redactedText: 'Old weakness',
      strengths: [],
      weaknesses: [
        {
          topic: 'Event Sourcing',
          skill: 'knowledge',
          severity: 2,
          evidence: 'Old weakness',
          requestedFix: 'Study event sourcing',
        },
      ],
      sourceHash: 'old_hash',
      createdAt: fixedNow - 60 * dayMs,
    };

    const resultRecent = WeaknessMap.aggregateFeedback([recentRecord], { now: fixedNow });
    const resultOld = WeaknessMap.aggregateFeedback([oldRecord], { now: fixedNow });

    const recentScore = resultRecent.rankedWeaknesses[0].score;
    const oldScore = resultOld.rankedWeaknesses[0].score;

    // After 60 days (one half-life), score should be approximately 50% (0.5x)
    expect(recentScore).toBeCloseTo(2.0, 1);
    expect(oldScore).toBeCloseTo(1.0, 1);
    expect(recentScore / oldScore).toBeCloseTo(2.0, 1);
  });

  it('maps topic aliases to question bank tags and lists missing content', () => {
    const reportWithOTAndEventLoop: FeedbackRecord = {
      id: 'custom_report',
      date: '2026-09-01',
      redactedText: 'Missing event loop knowledge and OT collaborative editing.',
      strengths: [],
      weaknesses: [
        {
          topic: 'OT',
          skill: 'knowledge',
          severity: 2,
          evidence: 'OT collaborative editing',
          requestedFix: 'Learn operational transformation vs crdt',
        },
        {
          topic: 'Event Loop',
          skill: 'knowledge',
          severity: 3,
          evidence: 'Missing event loop knowledge',
          requestedFix: 'Explain microtask queue vs macrotask execution phases',
        },
      ],
      sourceHash: 'alias_hash',
      createdAt: fixedNow,
    };

    const result = WeaknessMap.aggregateFeedback([reportWithOTAndEventLoop], { now: fixedNow });

    // "OT" maps to tag "ot" which matches question sd_14 in question bank
    const otWeakness = result.rankedWeaknesses.find((w) => w.topic.toLowerCase() === 'ot');
    expect(otWeakness).toBeDefined();
    expect(otWeakness?.hasMatchingQuestions).toBe(true);
    expect(otWeakness?.mappedQuestionTags).toContain('ot');

    // "Event Loop" has no matching question in question bank -> missing content
    expect(result.missingContentTopics).toContain('Event Loop');
  });

  it('seeds SpacedScheduler with lowered mastery and immediate due date', () => {
    const initialMasteries = SpacedScheduler.initializeDefaults();
    const result = WeaknessMap.aggregateFeedback([fixtureReport1], { now: fixedNow });

    const seededMasteries = SpacedScheduler.seedFromWeaknesses(
      initialMasteries,
      result.rankedWeaknesses,
      fixedNow
    );

    // Verify existing masteries were boosted/lowered
    const cachingMastery = seededMasteries.find((m) => m.topicId === 'sd_caching');
    expect(cachingMastery).toBeDefined();
    expect(cachingMastery?.masteryScore).toBeLessThanOrEqual(20);
    expect(cachingMastery?.intervalDays).toBe(0);
    expect(cachingMastery?.nextReviewDate).toBe(fixedNow);

    // Verify newly discovered topics were created
    const explanationMastery = seededMasteries.find((m) =>
      m.topicName.toLowerCase().includes('technical explanation')
    );
    expect(explanationMastery).toBeDefined();
    expect(explanationMastery?.masteryScore).toBeLessThanOrEqual(20);
    expect(explanationMastery?.intervalDays).toBe(0);
    expect(explanationMastery?.nextReviewDate).toBe(fixedNow);
  });

  it('generates a deterministic 7-day practice plan respecting daily time budgets', () => {
    const result = WeaknessMap.aggregateFeedback([fixtureReport1, fixtureReport2, fixtureReport3], {
      now: fixedNow,
    });

    // 1. Generate plan with default 90m budget
    const plan90 = PlanGenerator.generate7DayPlan(result, {
      maxDailyMinutes: 90,
      startDate: fixedNow,
    });

    expect(plan90.durationDays).toBe(7);
    expect(plan90.days.length).toBe(7);

    plan90.days.forEach((day) => {
      expect(day.totalTimeMinutes).toBeLessThanOrEqual(90);
      expect(day.drills.length).toBe(3);
      expect(day.drills[0].type).toBe('structure_drill');
      expect(day.drills[1].type).toBe('concreteness_drill');
      expect(day.drills[2].type).toBe('topic_mock');
    });

    // 2. Generate plan with 60m budget
    const plan60 = PlanGenerator.generate7DayPlan(result, {
      maxDailyMinutes: 60,
      startDate: fixedNow,
    });
    plan60.days.forEach((day) => {
      expect(day.totalTimeMinutes).toBeLessThanOrEqual(60);
    });

    // 3. Test Snapshot Determinism
    const planRun1 = PlanGenerator.generate7DayPlan(result, {
      maxDailyMinutes: 90,
      startDate: fixedNow,
    });
    const planRun2 = PlanGenerator.generate7DayPlan(result, {
      maxDailyMinutes: 90,
      startDate: fixedNow,
    });

    expect(JSON.stringify(planRun1)).toBe(JSON.stringify(planRun2));
    expect(planRun1).toMatchSnapshot();
  });
});
