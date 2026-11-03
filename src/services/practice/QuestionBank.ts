import { z } from 'zod';
import codingData from '../../data/questions/coding.json';
import systemDesignData from '../../data/questions/system_design.json';
import behavioralData from '../../data/questions/behavioral.json';
import { TopicMastery } from './types';
import {
  CurriculumQuestion,
  EvaluationCriteriaSchema,
  QuestionDifficultyTier,
  QuestionDifficultyTierSchema,
  TechnicalQuestionType,
  TechnicalQuestionTypeSchema,
  difficultyTierToNumeric,
  numericToDifficultyTier,
} from '../../data/curriculum/questions/types';
import { CURRICULUM_QUESTIONS } from '../../data/curriculum/questions/curriculumQuestions';
import { CurriculumQuestionGenerator } from '../../data/curriculum/questions/questionGenerator';
import { CurriculumCatalogService } from '../../data/curriculum/CurriculumCatalog';

export const QuestionEntrySchema = z.object({
  id: z.string().min(1),
  type: z.enum(['coding', 'system_design', 'behavioral', 'technical_concept']),
  topic: z.string().min(1),
  tags: z.array(z.string()),
  difficulty: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.literal(5)]),
  prompt: z.string().min(5),
  clarifyingInfo: z.string().optional().default(''),
  expectedPoints: z.array(z.string().min(1)).min(1),
  commonMistakes: z.array(z.string()).optional().default([]),
  followUps: z.array(z.string()).optional().default([]),
  rubricHooks: z.array(z.string()).optional().default([]),
  timeBudgetMinutes: z.number().min(1),
  // Enriched Curriculum Extensions (backward-compatible)
  curriculumTopicId: z.string().optional(),
  conceptReference: z.string().optional(),
  questionType: TechnicalQuestionTypeSchema.optional(),
  difficultyTier: QuestionDifficultyTierSchema.optional(),
  interviewObjective: z.string().optional(),
  expectedKnowledge: z.array(z.string()).optional().default([]),
  evaluationCriteria: EvaluationCriteriaSchema.optional(),
  relevantEdgeCases: z.array(z.string()).optional().default([]),
  expectedAnswerCharacteristics: z.array(z.string()).optional().default([]),
  followUpOpportunities: z.array(z.string()).optional().default([]),
});

export type QuestionEntry = z.infer<typeof QuestionEntrySchema>;

const LEGACY_TOPIC_TO_CURRICULUM_ID: Record<string, string> = {
  // Coding topics
  'sliding window': 'ds_arrays_strings',
  'two pointers': 'ds_arrays_strings',
  'intervals': 'ds_arrays_strings',
  'string parsing': 'ds_arrays_strings',
  'matrix traversal': 'ds_arrays_strings',
  'linked list': 'ds_linked_lists',
  'monotonic stack': 'ds_stacks_queues',
  'binary trees': 'ds_trees_bst',
  'binary search tree': 'ds_trees_bst',
  'heaps & priority queue': 'ds_heaps_priority_queues',
  'trie data structure': 'ds_tries',
  'disjoint set union': 'ds_sets_maps',
  'advanced data structures': 'ds_sets_maps',
  'graph traversal': 'algo_graph_algorithms',
  'graph shortest path': 'algo_graph_algorithms',
  'binary search': 'algo_binary_search',
  'backtracking': 'algo_backtracking',
  'greedy algorithms': 'algo_greedy',
  'dynamic programming': 'algo_dynamic_programming',
  'bit manipulation': 'algo_bit_manipulation',

  // System Design topics
  'distributed rate limiter': 'se_system_design',
  'ride sharing dispatch engine': 'se_system_design',
  'distributed video streaming': 'se_scalability_reliability',
  'distributed payment gateway': 'cs_distributed_systems',
  'metrics & time series database': 'cs_databases',
  'distributed web crawler': 'cs_distributed_systems',
  'distributed key-value store': 'cs_distributed_systems',
  'real-time chat & messaging': 'cs_networking',
  'distributed file storage (dropbox)': 'cs_distributed_systems',
  'leaderboard & ranking engine': 'cs_caching',
  'distributed job scheduler': 'cs_operating_systems',
  'collaborative real-time document editor': 'cs_distributed_systems',
  'social media news feed': 'se_system_design',
  'distributed log ingestion (elk / loki)': 'cs_distributed_systems',
  'distributed caching tier (memcached/redis)': 'cs_caching',
  'distributed notification service': 'se_system_design',
  'e-commerce flash sale system': 'se_scalability_reliability',
  'search autocomplete / typeahead': 'ds_tries',
  'url shortener & click analytics': 'se_system_design',
  'api gateway & service mesh': 'se_api_design',
};

export class QuestionBank {
  private static customQuestions: QuestionEntry[] = [];
  private static curriculumQuestions: CurriculumQuestion[] = [...CURRICULUM_QUESTIONS];

  /**
   * Resolves a legacy or text topic to a canonical CurriculumTopic ID.
   */
  public static mapLegacyTopicToCurriculumId(topicName: string): string | undefined {
    const normalized = (topicName || '').trim().toLowerCase();
    if (LEGACY_TOPIC_TO_CURRICULUM_ID[normalized]) {
      return LEGACY_TOPIC_TO_CURRICULUM_ID[normalized];
    }
    const catalog = CurriculumCatalogService.getInstance();
    const directTopic = catalog.getTopic(topicName);
    if (directTopic) return directTopic.id;

    const matched = catalog.getAllTopics().find(
      (t) => t.name.toLowerCase() === normalized || t.id.toLowerCase() === normalized
    );
    return matched?.id;
  }

  /**
   * Converts a rich CurriculumQuestion into a QuestionEntry for unified bank access.
   */
  public static curriculumToQuestionEntry(cq: CurriculumQuestion): QuestionEntry {
    const catalog = CurriculumCatalogService.getInstance();
    const topic = catalog.getTopic(cq.curriculumTopicId);
    const topicName = topic ? topic.name : cq.curriculumTopicId;

    let broadType: 'coding' | 'system_design' | 'behavioral' | 'technical_concept' =
      'technical_concept';
    if (cq.questionType === 'coding_problem') {
      broadType = 'coding';
    } else if (
      cq.questionType === 'architecture_tradeoff' ||
      cq.curriculumTopicId.startsWith('se_') ||
      cq.curriculumTopicId === 'cs_distributed_systems'
    ) {
      broadType = 'system_design';
    }

    return {
      id: cq.id,
      type: broadType,
      topic: topicName,
      tags: cq.tags,
      difficulty: cq.difficultyNumeric,
      prompt: cq.prompt,
      clarifyingInfo: cq.interviewObjective,
      expectedPoints: cq.expectedKnowledge,
      commonMistakes: cq.evaluationCriteria.failurePatterns,
      followUps: cq.followUpOpportunities,
      rubricHooks: cq.evaluationCriteria.rubricCriteria,
      timeBudgetMinutes: cq.timeBudgetMinutes,
      curriculumTopicId: cq.curriculumTopicId,
      conceptReference: cq.conceptReference,
      questionType: cq.questionType,
      difficultyTier: cq.difficultyTier,
      interviewObjective: cq.interviewObjective,
      expectedKnowledge: cq.expectedKnowledge,
      evaluationCriteria: cq.evaluationCriteria,
      relevantEdgeCases: cq.relevantEdgeCases,
      expectedAnswerCharacteristics: cq.expectedAnswerCharacteristics,
      followUpOpportunities: cq.followUpOpportunities,
    };
  }

  /**
   * Returns all loaded core questions from the question bank,
   * mapped with curriculumTopicId where resolvable.
   */
  public static getCoreQuestions(): QuestionEntry[] {
    const rawLegacy = [
      ...(codingData as QuestionEntry[]),
      ...(systemDesignData as QuestionEntry[]),
      ...(behavioralData as QuestionEntry[]),
    ];

    const mappedLegacy = rawLegacy.map((q) => {
      const resolvedCurriculumId =
        q.curriculumTopicId || this.mapLegacyTopicToCurriculumId(q.topic);
      const tier = q.difficultyTier || numericToDifficultyTier(q.difficulty);
      return {
        ...q,
        curriculumTopicId: resolvedCurriculumId,
        difficultyTier: tier,
      };
    });

    const mappedCurriculum = this.curriculumQuestions.map((cq) =>
      this.curriculumToQuestionEntry(cq)
    );

    return [...mappedLegacy, ...mappedCurriculum];
  }

  /**
   * Returns all available questions including custom-imported packs.
   */
  public static getAllQuestions(): QuestionEntry[] {
    return [...this.getCoreQuestions(), ...this.customQuestions];
  }

  /**
   * Returns raw rich CurriculumQuestions.
   */
  public static getCurriculumQuestions(): CurriculumQuestion[] {
    return [...this.curriculumQuestions];
  }

  public static getQuestionById(id: string): QuestionEntry | undefined {
    return this.getAllQuestions().find((q) => q.id === id);
  }

  public static getQuestionsByType(
    type: 'coding' | 'system_design' | 'behavioral' | 'technical_concept'
  ): QuestionEntry[] {
    return this.getAllQuestions().filter((q) => q.type === type);
  }

  /**
   * Retrieves all questions associated with a specific curriculum topic ID.
   */
  public static getQuestionsByCurriculumTopic(
    topicId: string,
    options?: {
      difficulty?: QuestionDifficultyTier | number;
      type?: TechnicalQuestionType;
    }
  ): QuestionEntry[] {
    const all = this.getAllQuestions().filter((q) => q.curriculumTopicId === topicId);
    if (!options) return all;

    return all.filter((q) => {
      if (options.difficulty !== undefined) {
        if (typeof options.difficulty === 'number' && q.difficulty !== options.difficulty) {
          return false;
        }
        if (
          typeof options.difficulty === 'string' &&
          q.difficultyTier !== options.difficulty &&
          q.difficulty !== difficultyTierToNumeric(options.difficulty)
        ) {
          return false;
        }
      }
      if (options.type && q.questionType !== options.type) {
        return false;
      }
      return true;
    });
  }

  /**
   * Selects or generates a question for an interview session on a given curriculum topic.
   */
  public static selectQuestionForCurriculumTopic(
    topicId: string,
    difficultyTier: QuestionDifficultyTier = 'intermediate',
    questionType?: TechnicalQuestionType,
    excludedIds: string[] = []
  ): QuestionEntry {
    const candidates = this.getQuestionsByCurriculumTopic(topicId, {
      difficulty: difficultyTier,
      type: questionType,
    }).filter((q) => !excludedIds.includes(q.id));

    if (candidates.length > 0) {
      return candidates[0];
    }

    // Try any difficulty for this topic
    const anyDiffCandidates = this.getQuestionsByCurriculumTopic(topicId).filter(
      (q) => !excludedIds.includes(q.id)
    );
    if (anyDiffCandidates.length > 0) {
      return anyDiffCandidates[0];
    }

    // Deterministically generate a verified question for this topic
    const generated = CurriculumQuestionGenerator.generateDeterministic({
      topicId,
      difficultyTier,
      questionType: questionType || 'conceptual',
    });
    this.curriculumQuestions.push(generated);
    return this.curriculumToQuestionEntry(generated);
  }

  /**
   * Selects an adaptive question based on:
   * 1. No repeats: Excludes any IDs already used in the session.
   * 2. Difficulty adaptation: Adjusts target difficulty based on previous score.
   * 3. Topic mastery priority: Prioritizes topics with lowest mastery scores.
   */
  public static selectAdaptiveQuestion(params: {
    type: 'coding' | 'system_design' | 'behavioral' | 'technical_concept';
    previousScore?: number;
    currentDifficulty?: number;
    excludedIds?: string[];
    topicMasteries?: TopicMastery[];
  }): QuestionEntry {
    const candidates = this.getQuestionsByType(params.type).filter(
      (q) => !(params.excludedIds || []).includes(q.id)
    );

    if (candidates.length === 0) {
      const fallbackList = this.getQuestionsByType(params.type);
      return fallbackList[0];
    }

    let targetDifficulty = params.currentDifficulty || 3;
    if (params.previousScore !== undefined) {
      if (params.previousScore >= 4.0) {
        targetDifficulty = Math.min(5, targetDifficulty + 1);
      } else if (params.previousScore <= 2.5) {
        targetDifficulty = Math.max(1, targetDifficulty - 1);
      }
    }

    const weakTopicNames = new Set(
      (params.topicMasteries || [])
        .filter((t) => t.masteryScore < 60)
        .sort((a, b) => a.masteryScore - b.masteryScore)
        .map((t) => t.topicName.toLowerCase())
    );

    // 1. Try matching both weak topic and exact target difficulty
    const weakAndTarget = candidates.filter(
      (q) =>
        q.difficulty === targetDifficulty &&
        (weakTopicNames.has(q.topic.toLowerCase()) ||
          q.tags.some((tag) => weakTopicNames.has(tag.toLowerCase())))
    );
    if (weakAndTarget.length > 0) {
      return weakAndTarget[0];
    }

    // 2. Try matching any question in weak topics
    const weakAny = candidates.filter(
      (q) =>
        weakTopicNames.has(q.topic.toLowerCase()) ||
        q.tags.some((tag) => weakTopicNames.has(tag.toLowerCase()))
    );
    if (weakAny.length > 0) {
      return weakAny[0];
    }

    // 3. Try matching exact target difficulty
    const targetDiffMatch = candidates.filter((q) => q.difficulty === targetDifficulty);
    if (targetDiffMatch.length > 0) {
      return targetDiffMatch[0];
    }

    // 4. Fallback to closest available difficulty
    candidates.sort(
      (a, b) =>
        Math.abs(a.difficulty - targetDifficulty) - Math.abs(b.difficulty - targetDifficulty)
    );
    return candidates[0];
  }

  /**
   * Imports and validates a custom question pack (JSON string or object array).
   */
  public static importCustomPack(rawPack: string | unknown[]): {
    success: boolean;
    importedCount: number;
    errors?: string[];
  } {
    let rawItems: unknown[];

    try {
      if (typeof rawPack === 'string') {
        rawItems = JSON.parse(rawPack);
      } else if (Array.isArray(rawPack)) {
        rawItems = rawPack;
      } else {
        return {
          success: false,
          importedCount: 0,
          errors: ['Custom pack must be a valid JSON array of questions.'],
        };
      }
    } catch (e: any) {
      return {
        success: false,
        importedCount: 0,
        errors: [`JSON parse error: ${e.message}`],
      };
    }

    if (!Array.isArray(rawItems) || rawItems.length === 0) {
      return {
        success: false,
        importedCount: 0,
        errors: ['Custom pack must contain at least one question.'],
      };
    }

    const errors: string[] = [];
    const validQuestions: QuestionEntry[] = [];
    const seenIds = new Set(this.getAllQuestions().map((q) => q.id));

    rawItems.forEach((item, index) => {
      const parsed = QuestionEntrySchema.safeParse(item);
      if (!parsed.success) {
        const issues = parsed.error.issues
          .map((i) => `${i.path.join('.')}: ${i.message}`)
          .join(', ');
        errors.push(`Question #${index + 1}: ${issues}`);
        return;
      }

      const q = parsed.data;
      if (seenIds.has(q.id)) {
        errors.push(`Question #${index + 1}: Duplicate question ID '${q.id}'`);
        return;
      }

      // If curriculumTopicId is supplied, validate it against the catalog
      if (q.curriculumTopicId) {
        const topic = CurriculumCatalogService.getInstance().getTopic(q.curriculumTopicId);
        if (!topic) {
          errors.push(
            `Question #${index + 1}: Invalid curriculumTopicId '${q.curriculumTopicId}'. Not found in catalog.`
          );
          return;
        }
      }

      seenIds.add(q.id);
      validQuestions.push(q);
    });

    if (errors.length > 0) {
      return {
        success: false,
        importedCount: 0,
        errors,
      };
    }

    this.customQuestions.push(...validQuestions);
    return {
      success: true,
      importedCount: validQuestions.length,
    };
  }

  public static resetCustomQuestions(): void {
    this.customQuestions = [];
    this.curriculumQuestions = [...CURRICULUM_QUESTIONS];
  }
}
