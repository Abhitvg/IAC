import { z } from 'zod';

export const TechnicalQuestionTypeSchema = z.enum([
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
]);

export type TechnicalQuestionType = z.infer<typeof TechnicalQuestionTypeSchema>;

export const QuestionDifficultyTierSchema = z.enum([
  'beginner',
  'easy',
  'intermediate',
  'advanced',
  'expert',
]);

export type QuestionDifficultyTier = z.infer<typeof QuestionDifficultyTierSchema>;

export const EvaluationCriteriaSchema = z.object({
  rubricCriteria: z.array(z.string().min(1)).min(1),
  expectedConcepts: z.array(z.string().min(1)).min(1),
  failurePatterns: z.array(z.string().min(1)).min(1),
});

export type EvaluationCriteria = z.infer<typeof EvaluationCriteriaSchema>;

export const CurriculumQuestionSchema = z.object({
  id: z.string().min(1),
  curriculumTopicId: z.string().min(1),
  conceptReference: z.string().optional(),
  questionType: TechnicalQuestionTypeSchema,
  difficultyTier: QuestionDifficultyTierSchema,
  difficultyNumeric: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.literal(5)]),
  prompt: z.string().min(10),
  interviewObjective: z.string().min(10),
  expectedKnowledge: z.array(z.string().min(1)).min(1),
  evaluationCriteria: EvaluationCriteriaSchema,
  relevantEdgeCases: z.array(z.string().min(1)).min(1),
  expectedAnswerCharacteristics: z.array(z.string().min(1)).min(1),
  followUpOpportunities: z.array(z.string().min(1)).min(1),
  timeBudgetMinutes: z.number().min(1).max(120),
  tags: z.array(z.string()).default([]),
});

export type CurriculumQuestion = z.infer<typeof CurriculumQuestionSchema>;

/**
 * Converts difficulty tier to numeric 1-5 scale.
 */
export function difficultyTierToNumeric(tier: QuestionDifficultyTier): 1 | 2 | 3 | 4 | 5 {
  switch (tier) {
    case 'beginner':
      return 1;
    case 'easy':
      return 2;
    case 'intermediate':
      return 3;
    case 'advanced':
      return 4;
    case 'expert':
      return 5;
  }
}

/**
 * Converts numeric 1-5 scale to difficulty tier.
 */
export function numericToDifficultyTier(num: number): QuestionDifficultyTier {
  if (num <= 1) return 'beginner';
  if (num === 2) return 'easy';
  if (num === 3) return 'intermediate';
  if (num === 4) return 'advanced';
  return 'expert';
}

