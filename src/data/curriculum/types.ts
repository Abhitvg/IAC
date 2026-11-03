import { z } from 'zod';

export type CurriculumCategory =
  | 'data_structures'
  | 'algorithms'
  | 'cs_fundamentals'
  | 'software_engineering';

export type TopicDifficulty = 'beginner' | 'easy' | 'intermediate' | 'advanced' | 'expert';

export type InterviewRelevance = 'core_must_know' | 'frequently_tested' | 'senior_staff_level';

/**
 * ============================================================================
 * CURRICULUM ATTRIBUTION & PROVENANCE SEMANTICS
 * ============================================================================
 *
 * 1. TOPIC-LEVEL PRIMARY ATTRIBUTION (`sourceAttribution.attributionType`):
 *    Represents the macro-level organizational alignment of the topic within
 *    the interview curriculum roadmap:
 *    - 'ciu_derived': The topic corresponds to a primary study subject in John
 *      Washam's Coding Interview University (CIU).
 *    - 'general_cs': The topic is a standard computer science subject grounded
 *      in established academic literature (e.g. Operating Systems, Databases,
 *      Networking) that CIU touches or references as prerequisites.
 *    - 'iac_authored': The topic is authored specifically for IAC's technical
 *      interview evaluation platform (e.g. Clean Code criteria, API Design).
 *
 * 2. MEANING OF `inCodingInterviewUniversity`:
 *    A boolean flag specifying whether the topic exists as a recognized syllabus
 *    heading or explicit section in the Coding Interview University repository
 *    (https://github.com/jwasham/coding-interview-university).
 *    CRITICAL: This flag does NOT imply that all concepts in the topic share the
 *    same origin or that CIU authored the underlying computer science principles.
 *
 * 3. CONCEPT-LEVEL PROVENANCE (`CurriculumConcept.provenance`):
 *    The fine-grained factual origin of each individual concept block:
 *    - 'ciu_derived': Concept specifically derived from CIU recommendations/links.
 *    - 'general_cs': Concept grounded in standard peer-reviewed CS textbooks
 *      (CLRS, OSTEP, Kurose & Ross, Silberschatz, Kleppmann).
 *    - 'other': Content migrated from legacy sources (e.g. GFG knowledge base),
 *      treated strictly as migrated interview prep material, not peer-reviewed literature.
 *    - 'iac_authored': Technical rubrics or criteria authored for IAC interviews.
 *
 * MIXED-SOURCE TOPICS:
 * Topics frequently contain a mixture of provenances (e.g., `cs_operating_systems`
 * contains academic OS process theory alongside migrated Linux container isolation
 * patterns; `ds_arrays_strings` contains CIU vector doubling alongside migrated Kadane
 * and general memory locality concepts). Topic attribution is a navigational summary,
 * never a claim of homogeneous concept origin.
 * ============================================================================
 */

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
  coreConcepts: string[]; // Convenience string list for simple string consumers (always preserved)
  concepts?: CurriculumConcept[]; // Granular concept-level provenance (optional on construction; auto-normalized)
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
  concepts: z.array(CurriculumConceptSchema).optional(),
  prerequisites: z.array(z.string()),
  difficulty: z.enum(['beginner', 'easy', 'intermediate', 'advanced', 'expert']),
  commonMisconceptions: z.array(z.string()),
  interviewRelevance: z.enum(['core_must_know', 'frequently_tested', 'senior_staff_level']),
  expectedLearningOutcomes: z.array(z.string().min(3)).min(1),
  relatedTopics: z.array(z.string()),
  sourceAttribution: SourceAttributionSchema,
  version: z.number().int().positive(),
}).transform((topic) => {
  // Backwards-compatibility normalization:
  // If concepts array is omitted by existing code constructing CurriculumTopic objects,
  // automatically populate it from coreConcepts as unverified general CS concepts.
  if (!topic.concepts || topic.concepts.length === 0) {
    topic.concepts = topic.coreConcepts.map((text) => ({
      text,
      provenance: 'general_cs' as const,
      isUnverified: true,
      sourceReference: 'General computer science curriculum consensus; primary source unverified',
    }));
  }
  return topic;
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

