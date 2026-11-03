import { z } from 'zod';

export type CurriculumCategory =
  | 'data_structures'
  | 'algorithms'
  | 'cs_fundamentals'
  | 'software_engineering';

export type TopicDifficulty = 'beginner' | 'easy' | 'intermediate' | 'advanced' | 'expert';

export type InterviewRelevance = 'core_must_know' | 'frequently_tested' | 'senior_staff_level';

export type AttributionType = 'ciu_derived' | 'iac_authored' | 'general_cs';

export interface SourceAttribution {
  attributionType: AttributionType;
  inCodingInterviewUniversity: boolean;
  ciuSection?: string;
  ciuSectionReference?: string;
  iacAdditionNote?: string;
  referenceNotes?: string;
}

export type ConceptProvenance = 'ciu_derived' | 'iac_authored' | 'general_cs' | 'other';

export interface CurriculumConcept {
  text: string;
  provenance: ConceptProvenance;
  sourceReference?: string;
  isUnverified?: boolean;
  notes?: string;
}

export const CurriculumConceptSchema = z.object({
  text: z.string().min(3),
  provenance: z.enum(['ciu_derived', 'iac_authored', 'general_cs', 'other']),
  sourceReference: z.string().optional(),
  isUnverified: z.boolean().optional(),
  notes: z.string().optional(),
});

export interface CurriculumTopic {
  id: string;
  name: string;
  category: CurriculumCategory;
  subcategory: string;
  description: string;
  coreConcepts: string[]; // Convenience string list for simple string consumers
  concepts: CurriculumConcept[]; // Granular concept-level provenance
  prerequisites: string[]; // Valid topic IDs
  difficulty: TopicDifficulty;
  commonMisconceptions: string[];
  interviewRelevance: InterviewRelevance;
  expectedLearningOutcomes: string[];
  relatedTopics: string[]; // Valid topic IDs
  sourceAttribution: SourceAttribution;
  version: number;
}

export const SourceAttributionSchema = z.object({
  attributionType: z.enum(['ciu_derived', 'iac_authored', 'general_cs']),
  inCodingInterviewUniversity: z.boolean(),
  ciuSection: z.string().optional(),
  ciuSectionReference: z.string().optional(),
  iacAdditionNote: z.string().optional(),
  referenceNotes: z.string().optional(),
});

export const CurriculumTopicSchema = z.object({
  id: z.string().min(3).regex(/^[a-z0-9_]+$/, 'ID must be lowercase alphanumeric with underscores'),
  name: z.string().min(2),
  category: z.enum(['data_structures', 'algorithms', 'cs_fundamentals', 'software_engineering']),
  subcategory: z.string().min(2),
  description: z.string().min(10),
  coreConcepts: z.array(z.string().min(3)).min(1),
  concepts: z.array(CurriculumConceptSchema).min(1),
  prerequisites: z.array(z.string()),
  difficulty: z.enum(['beginner', 'easy', 'intermediate', 'advanced', 'expert']),
  commonMisconceptions: z.array(z.string()),
  interviewRelevance: z.enum(['core_must_know', 'frequently_tested', 'senior_staff_level']),
  expectedLearningOutcomes: z.array(z.string().min(3)).min(1),
  relatedTopics: z.array(z.string()),
  sourceAttribution: SourceAttributionSchema,
  version: z.number().int().positive(),
});

export type ValidatedCurriculumTopic = z.infer<typeof CurriculumTopicSchema>;

export interface CurriculumValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  totalTopics: number;
  totalConcepts: number;
  categoryCounts: Record<CurriculumCategory, number>;
  ciuDerivedCount: number;
  iacAddedCount: number;
  generalCsCount: number;
  conceptProvenanceCounts: Record<ConceptProvenance, number>;
}

