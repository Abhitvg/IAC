import { describe, it, expect, beforeEach } from 'vitest';
import { QuestionBank, QuestionEntrySchema } from '../src/services/practice/QuestionBank';
import {
  CurriculumQuestionSchema,
  QuestionDifficultyTier,
  TechnicalQuestionType,
  difficultyTierToNumeric,
  numericToDifficultyTier,
} from '../src/data/curriculum/questions/types';
import { CURRICULUM_QUESTIONS } from '../src/data/curriculum/questions/curriculumQuestions';
import { QuestionValidator } from '../src/data/curriculum/questions/questionValidator';
import { CurriculumQuestionGenerator } from '../src/data/curriculum/questions/questionGenerator';
import { CurriculumCatalogService } from '../src/data/curriculum/CurriculumCatalog';

describe('Phase 2 — Technical Interview Question Intelligence', () => {
  const catalog = CurriculumCatalogService.getInstance();

  beforeEach(() => {
    QuestionBank.resetCustomQuestions();
  });

  describe('1. Schema Validation & 10 Technical Question Types', () => {
    const expectedTypes: TechnicalQuestionType[] = [
      'conceptual',
      'definition_explanation',
      'coding_problem',
      'complexity_analysis',
      'debugging',
      'edge_case',
      'architecture_tradeoff',
      'real_world_scenario',
      'follow_up',
      'advanced_problem_solving',
    ];

    it('verifies that CURRICULUM_QUESTIONS covers all 10 technical question types', () => {
      const typesPresent = new Set(CURRICULUM_QUESTIONS.map((q) => q.questionType));
      for (const expectedType of expectedTypes) {
        expect(
          typesPresent.has(expectedType),
          `Missing technical question type in curated questions: ${expectedType}`
        ).toBe(true);
      }
    });

    it('validates every curated question against CurriculumQuestionSchema and QuestionValidator', () => {
      expect(CURRICULUM_QUESTIONS.length).toBeGreaterThanOrEqual(10);
      for (const q of CURRICULUM_QUESTIONS) {
        const schemaResult = CurriculumQuestionSchema.safeParse(q);
        expect(schemaResult.success, `Schema parse failed for question ${q.id}`).toBe(true);

        const valResult = QuestionValidator.validate(q);
        expect(
          valResult.valid,
          `Validation failed for ${q.id}: ${valResult.errors.join(', ')}`
        ).toBe(true);
      }
    });

    it('verifies difficulty tier mapping between 1-5 numeric scale and named tiers', () => {
      const tiers: QuestionDifficultyTier[] = [
        'beginner',
        'easy',
        'intermediate',
        'advanced',
        'expert',
      ];
      tiers.forEach((tier, index) => {
        const expectedNumeric = index + 1;
        expect(difficultyTierToNumeric(tier)).toBe(expectedNumeric);
        expect(numericToDifficultyTier(expectedNumeric)).toBe(tier);
      });
    });
  });

  describe('2. Topic Grounding & Question-Topic Mapping', () => {
    it('ensures every curated question maps to a valid CurriculumTopic in the 37-topic catalog', () => {
      const allTopicIds = new Set(catalog.getAllTopics().map((t) => t.id));

      for (const q of CURRICULUM_QUESTIONS) {
        expect(
          allTopicIds.has(q.curriculumTopicId),
          `Question ${q.id} references non-existent topic ID: ${q.curriculumTopicId}`
        ).toBe(true);
      }
    });

    it('resolves legacy question topics to valid curriculumTopicId', () => {
      const coreQuestions = QuestionBank.getCoreQuestions();
      expect(coreQuestions.length).toBeGreaterThan(60);

      // Verify coding questions resolve to canonical topics
      const slidingWindowQ = coreQuestions.find((q) => q.id === 'code_01');
      expect(slidingWindowQ).toBeDefined();
      expect(slidingWindowQ?.curriculumTopicId).toBe('ds_arrays_strings');
      expect(slidingWindowQ?.difficultyTier).toBe('easy');

      // Verify system design questions resolve to canonical topics
      const rateLimiterQ = coreQuestions.find((q) => q.topic === 'Distributed Rate Limiter');
      expect(rateLimiterQ).toBeDefined();
      expect(rateLimiterQ?.curriculumTopicId).toBe('se_system_design');
    });

    it('retrieves questions by curriculum topic ID via QuestionBank', () => {
      const arrayQuestions = QuestionBank.getQuestionsByCurriculumTopic('ds_arrays_strings');
      expect(arrayQuestions.length).toBeGreaterThanOrEqual(2);
      expect(arrayQuestions.every((q) => q.curriculumTopicId === 'ds_arrays_strings')).toBe(true);

      const sysDesignQuestions = QuestionBank.getQuestionsByCurriculumTopic('se_system_design');
      expect(sysDesignQuestions.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('3. Evaluation Criteria & Edge Case Invariants', () => {
    it('enforces non-empty rubric criteria, expected concepts, and failure patterns', () => {
      for (const q of CURRICULUM_QUESTIONS) {
        expect(q.evaluationCriteria.rubricCriteria.length).toBeGreaterThanOrEqual(2);
        expect(q.evaluationCriteria.expectedConcepts.length).toBeGreaterThanOrEqual(1);
        expect(q.evaluationCriteria.failurePatterns.length).toBeGreaterThanOrEqual(1);
        expect(q.relevantEdgeCases.length).toBeGreaterThanOrEqual(1);
        expect(q.expectedAnswerCharacteristics.length).toBeGreaterThanOrEqual(1);
        expect(q.followUpOpportunities.length).toBeGreaterThanOrEqual(1);
      }
    });

    it('rejects malformed questions with invalid curriculumTopicId or placeholder text', () => {
      const invalidTopicQ = {
        id: 'bad_01',
        curriculumTopicId: 'non_existent_topic_xyz',
        questionType: 'conceptual',
        difficultyTier: 'intermediate',
        difficultyNumeric: 3,
        prompt: 'Explain imaginary topic XYZ',
        interviewObjective: 'Assess non-existent topic',
        expectedKnowledge: ['Imaginary knowledge'],
        evaluationCriteria: {
          rubricCriteria: ['Valid rubric'],
          expectedConcepts: ['XYZ'],
          failurePatterns: ['None'],
        },
        relevantEdgeCases: ['Edge case 1'],
        expectedAnswerCharacteristics: ['Answer 1'],
        followUpOpportunities: ['Follow up 1'],
        timeBudgetMinutes: 15,
        tags: [],
      };

      const result = QuestionValidator.validate(invalidTopicQ);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes('non_existent_topic_xyz'))).toBe(true);

      // Placeholder test
      const placeholderQ = {
        ...invalidTopicQ,
        curriculumTopicId: 'ds_arrays_strings',
        evaluationCriteria: {
          rubricCriteria: ['TBD', 'TODO'],
          expectedConcepts: ['Arrays'],
          failurePatterns: ['None'],
        },
      };
      const placeholderResult = QuestionValidator.validate(placeholderQ);
      expect(placeholderResult.valid).toBe(false);
      expect(placeholderResult.errors.some((e) => e.includes('placeholder'))).toBe(true);
    });
  });

  describe('4. Deterministic Question Generation & LLM Prompting', () => {
    it('deterministically generates verified questions across all 37 curriculum topics', () => {
      const allTopics = catalog.getAllTopics();
      expect(allTopics.length).toBe(37);

      for (const topic of allTopics) {
        const generated = CurriculumQuestionGenerator.generateDeterministic({
          topicId: topic.id,
          questionType: 'conceptual',
          difficultyTier: 'intermediate',
        });

        expect(generated.curriculumTopicId).toBe(topic.id);
        expect(generated.prompt).toContain(topic.name);
        expect(generated.evaluationCriteria.rubricCriteria.length).toBeGreaterThanOrEqual(2);

        const val = QuestionValidator.validate(generated);
        expect(val.valid, `Generated question for ${topic.id} failed validation: ${val.errors.join(', ')}`).toBe(true);
      }
    });

    it('builds LLM question generation prompt grounded in curriculum baseline and misconceptions', () => {
      const prompt = CurriculumQuestionGenerator.buildLLMQuestionGenerationPrompt({
        topicId: 'ds_hash_tables',
        questionType: 'conceptual',
        difficultyTier: 'advanced',
      });

      expect(prompt).toContain('Hash Tables');
      expect(prompt).toContain('TECHNICAL CURRICULUM GROUNDING SPECIFICATION');
      expect(prompt).toContain('Common Candidate Misconceptions');
      expect(prompt).toContain('ds_hash_tables');
      expect(prompt).toContain('TARGET QUESTION PARAMETERS');
    });

    it('selects or creates question dynamically when requested via QuestionBank', () => {
      const q = QuestionBank.selectQuestionForCurriculumTopic(
        'cs_operating_systems',
        'intermediate',
        'debugging'
      );
      expect(q).toBeDefined();
      expect(q.curriculumTopicId).toBe('cs_operating_systems');
      expect(q.difficultyTier).toBe('intermediate');
    });
  });
});
