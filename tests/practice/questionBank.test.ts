import { describe, it, expect, beforeEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import {
  QuestionBank,
  QuestionEntrySchema,
  QuestionEntry,
} from '../../src/services/practice/QuestionBank';
import { MockInterviewerEngine } from '../../src/services/practice/MockInterviewerEngine';
import { SpacedScheduler } from '../../src/services/practice/SpacedScheduler';
import { TopicMastery } from '../../src/services/practice/types';

describe('Phase 4 - Question Bank & Spaced Mastery Suite', () => {
  beforeEach(() => {
    QuestionBank.resetCustomQuestions();
  });

  describe('Schema Validator & Integrity Test', () => {
    it('validates all 60 core questions against schema and fails on duplicate ids, missing fields, or empty expectedPoints', () => {
      const coreQuestions = QuestionBank.getCoreQuestions();
      expect(coreQuestions.length).toBeGreaterThanOrEqual(60);

      const coding = coreQuestions.filter((q) => q.type === 'coding');
      const systemDesign = coreQuestions.filter((q) => q.type === 'system_design');
      const behavioral = coreQuestions.filter((q) => q.type === 'behavioral');

      expect(coding.length).toBeGreaterThanOrEqual(20);
      expect(systemDesign.length).toBeGreaterThanOrEqual(20);
      expect(behavioral.length).toBeGreaterThanOrEqual(20);

      const seenIds = new Set<string>();

      for (const q of coreQuestions) {
        // Safe parse with zod schema
        const result = QuestionEntrySchema.safeParse(q);
        expect(
          result.success,
          `Question ${q.id || 'unknown'} failed schema validation: ${JSON.stringify(
            result.error?.issues
          )}`
        ).toBe(true);

        // Fail CI on duplicate ids
        expect(seenIds.has(q.id), `Duplicate question ID detected: ${q.id}`).toBe(false);
        seenIds.add(q.id);

        // Fail CI on empty expectedPoints
        expect(
          q.expectedPoints.length,
          `Question ${q.id} has empty expectedPoints`
        ).toBeGreaterThan(0);
        for (const ep of q.expectedPoints) {
          expect(ep.trim().length).toBeGreaterThan(0);
        }

        // Difficulty must be 1 to 5
        expect(q.difficulty).toBeGreaterThanOrEqual(1);
        expect(q.difficulty).toBeLessThanOrEqual(5);

        // Prompt must be non-empty
        expect(q.prompt.trim().length).toBeGreaterThan(10);
      }
    });
  });

  describe('Custom Question Pack Import & Validation', () => {
    it('successfully imports valid custom question pack', () => {
      const customPack: QuestionEntry[] = [
        {
          id: 'custom_pack_q1',
          type: 'coding',
          topic: 'Bit Manipulation',
          tags: ['bitwise', 'custom'],
          difficulty: 3,
          prompt:
            'Given an array of integers, find the single non-duplicate element in O(1) space.',
          clarifyingInfo: 'Array length is odd.',
          expectedPoints: ['XOR all elements together', 'O(N) time and O(1) space'],
          commonMistakes: ['Using hash map'],
          followUps: ['What if every other element appears 3 times?'],
          rubricHooks: ['approach', 'complexity'],
          timeBudgetMinutes: 20,
        },
      ];

      const res = QuestionBank.importCustomPack(customPack);
      expect(res.success).toBe(true);
      expect(res.importedCount).toBe(1);

      const loaded = QuestionBank.getQuestionById('custom_pack_q1');
      expect(loaded).toBeDefined();
      expect(loaded?.topic).toBe('Bit Manipulation');
    });

    it('rejects custom pack with duplicate question IDs', () => {
      const duplicatePack = [
        {
          id: 'code_01', // Already exists in core questions!
          type: 'coding',
          topic: 'Sliding Window',
          tags: ['test'],
          difficulty: 2,
          prompt: 'Duplicate question prompt text.',
          clarifyingInfo: '',
          expectedPoints: ['Point 1'],
          commonMistakes: [],
          followUps: [],
          rubricHooks: [],
          timeBudgetMinutes: 20,
        },
      ];

      const res = QuestionBank.importCustomPack(duplicatePack);
      expect(res.success).toBe(false);
      expect(res.errors?.[0]).toContain("Duplicate question ID 'code_01'");
    });

    it('rejects custom pack with missing fields or empty expectedPoints', () => {
      const invalidPack = [
        {
          id: 'invalid_q',
          type: 'coding',
          topic: 'Arrays',
          tags: [],
          difficulty: 2,
          prompt: 'Test question',
          expectedPoints: [], // Empty expected points!
          timeBudgetMinutes: 15,
        },
      ];

      const res = QuestionBank.importCustomPack(invalidPack);
      expect(res.success).toBe(false);
      expect(res.errors?.length).toBeGreaterThan(0);
    });
  });

  describe('Dress Rehearsal Bank Integration & Adaptive Progression', () => {
    it('draws all questions exclusively from the question bank with zero repeats across a 45-minute dress rehearsal', () => {
      const session = MockInterviewerEngine.createSession('dress_rehearsal');
      const bankQuestions = QuestionBank.getAllQuestions();
      const bankPrompts = new Set(bankQuestions.map((q) => q.prompt));

      // 1. Initial icebreaker drawn from bank
      expect(session.questionHistory.length).toBe(1);
      expect(bankPrompts.has(session.currentQuestion)).toBe(true);
      const usedIds: string[] = [session.questionHistory[0].questionId!];
      expect(usedIds[0]).toBeTruthy();

      // 2. Advance to behavioral phase
      const p1 = MockInterviewerEngine.advanceRehearsalPhase('icebreaker', usedIds, 3.5);
      expect(p1.nextPhase).toBe('behavioral');
      expect(bankPrompts.has(p1.question)).toBe(true);
      expect(usedIds).not.toContain(p1.questionId);
      usedIds.push(p1.questionId);

      // 3. Advance to technical coding phase (with high score 4.5 -> adapts difficulty upwards)
      const p2 = MockInterviewerEngine.advanceRehearsalPhase('behavioral', usedIds, 4.5);
      expect(p2.nextPhase).toBe('technical');
      expect(bankPrompts.has(p2.question)).toBe(true);
      expect(usedIds).not.toContain(p2.questionId);
      usedIds.push(p2.questionId);

      // Verify difficulty adapted: should be difficulty >= 3
      const techQuestion = QuestionBank.getQuestionById(p2.questionId);
      expect(techQuestion?.difficulty).toBeGreaterThanOrEqual(3);

      // 4. Advance to system design phase (with low score 2.0 -> adapts difficulty downwards)
      const p3 = MockInterviewerEngine.advanceRehearsalPhase('technical', usedIds, 2.0);
      expect(p3.nextPhase).toBe('candidate_qa');
      expect(bankPrompts.has(p3.question)).toBe(true);
      expect(usedIds).not.toContain(p3.questionId);
      usedIds.push(p3.questionId);

      // 5. Advance to wrapup
      const p4 = MockInterviewerEngine.advanceRehearsalPhase('candidate_qa', usedIds, 4.0);
      expect(p4.nextPhase).toBe('wrapup');

      // Verify that all used questions are distinct
      expect(new Set(usedIds).size).toBe(usedIds.length);
    });
  });

  describe('SpacedScheduler Weakest Topics Selection Across 5 Simulated Sessions', () => {
    it("tracks mastery scores and picks tomorrow's practice set from the weakest topics after five simulated sessions", () => {
      let masteries: TopicMastery[] = SpacedScheduler.initializeDefaults();

      // 5 Simulated Sessions:
      // Candidate performs poorly (score 1.5 - 2.0) on Graph/Tree questions and Rate Limiting
      // Candidate performs well (score 4.5 - 5.0) on Sliding Window and Conflict Resolution
      const weakTopics = ['dsa_trees_graphs', 'sd_resilience'];
      const strongTopics = ['dsa_arrays_pointers', 'beh_conflict'];

      for (let sessionIndex = 0; sessionIndex < 5; sessionIndex++) {
        masteries = masteries.map((record) => {
          if (weakTopics.includes(record.topicId)) {
            return SpacedScheduler.recordAttempt(record, 1.8);
          }
          if (strongTopics.includes(record.topicId)) {
            return SpacedScheduler.recordAttempt(record, 4.8);
          }
          return record;
        });
      }

      // Check that weak topics have lower mastery score than strong topics
      const treeMastery = masteries.find((m) => m.topicId === 'dsa_trees_graphs')!;
      const arrayMastery = masteries.find((m) => m.topicId === 'dsa_arrays_pointers')!;
      expect(treeMastery.masteryScore).toBeLessThan(arrayMastery.masteryScore);

      // Call selectTomorrowPracticeSet
      const tomorrowSet = SpacedScheduler.selectTomorrowPracticeSet(masteries, 3);
      expect(tomorrowSet.length).toBe(3);

      // Tomorrow's practice set should be drawn from the weakest topics
      const tomorrowTopics = tomorrowSet.map((q) => q.topic.toLowerCase());
      const hasWeakTopic = tomorrowTopics.some(
        (t) =>
          t.includes('tree') ||
          t.includes('graph') ||
          t.includes('rate limit') ||
          t.includes('resilience')
      );

      expect(
        hasWeakTopic,
        `Expected tomorrow's practice set to include weakest topics, got: ${tomorrowTopics.join(
          ', '
        )}`
      ).toBe(true);
    });
  });
});
