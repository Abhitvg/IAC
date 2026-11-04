import { CurriculumCatalogService } from '../CurriculumCatalog';
import {
  CurriculumQuestion,
  CurriculumQuestionSchema,
  difficultyTierToNumeric,
} from './types';

export interface QuestionValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

export class QuestionValidator {
  /**
   * Strictly validates a question against schema and the CurriculumCatalog.
   */
  public static validate(question: unknown): QuestionValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    const parsed = CurriculumQuestionSchema.safeParse(question);
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        errors.push(`${issue.path.join('.')}: ${issue.message}`);
      }
      return { valid: false, errors, warnings };
    }

    const q: CurriculumQuestion = parsed.data;

    // Validate curriculum topic existence
    const catalog = CurriculumCatalogService.getInstance();
    const topic = catalog.getTopic(q.curriculumTopicId);
    if (!topic) {
      errors.push(
        `Invalid curriculumTopicId '${q.curriculumTopicId}'. Must exist in CurriculumCatalog.`
      );
    } else {
      // If conceptReference is specified, verify it relates to topic concepts
      if (q.conceptReference) {
        const topicConceptsLower = topic.coreConcepts.map((c) => c.toLowerCase());
        const refLower = q.conceptReference.toLowerCase();
        const matchesConcept = topicConceptsLower.some(
          (c) => c.includes(refLower) || refLower.includes(c)
        );
        if (!matchesConcept) {
          warnings.push(
            `conceptReference '${q.conceptReference}' does not directly match any core concept in topic '${topic.id}'.`
          );
        }
      }
    }

    // Verify consistency between difficultyTier and difficultyNumeric
    const expectedNumeric = difficultyTierToNumeric(q.difficultyTier);
    if (q.difficultyNumeric !== expectedNumeric) {
      errors.push(
        `Difficulty mismatch: difficultyTier '${q.difficultyTier}' expects numeric ${expectedNumeric}, but received ${q.difficultyNumeric}.`
      );
    }

    // Reject generic boilerplate in evaluationCriteria
    const boilerplate = ['n/a', 'none', 'todo', 'tbd', 'placeholder', 'as above'];
    for (const crit of q.evaluationCriteria.rubricCriteria) {
      if (boilerplate.includes(crit.toLowerCase().trim())) {
        errors.push(`evaluationCriteria.rubricCriteria contains invalid placeholder: "${crit}"`);
      }
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
    };
  }
}

