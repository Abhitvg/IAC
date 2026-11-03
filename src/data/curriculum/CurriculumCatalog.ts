import {
  CurriculumTopic,
  CurriculumConcept,
  CurriculumCategory,
  CurriculumValidationResult,
  CurriculumTopicSchema,
} from './types';
import { CURRICULUM_CATALOG } from './catalog';

export class CurriculumCatalogService {
  private static instance: CurriculumCatalogService | null = null;
  private topics: Map<string, CurriculumTopic> = new Map();
  private validationResult: CurriculumValidationResult | null = null;

  private constructor(catalog: CurriculumTopic[] = CURRICULUM_CATALOG) {
    this.loadCatalog(catalog);
  }

  public static getInstance(): CurriculumCatalogService {
    if (!this.instance) {
      this.instance = new CurriculumCatalogService();
    }
    return this.instance;
  }

  /**
   * Resets the singleton instance (useful for unit tests).
   */
  public static resetInstance(catalog?: CurriculumTopic[]): CurriculumCatalogService {
    this.instance = new CurriculumCatalogService(catalog);
    return this.instance;
  }

  private loadCatalog(catalog: CurriculumTopic[]): void {
    this.topics.clear();
    for (const rawTopic of catalog) {
      const topic: CurriculumTopic = {
        ...rawTopic,
        concepts: rawTopic.concepts && rawTopic.concepts.length > 0
          ? rawTopic.concepts
          : rawTopic.coreConcepts.map((text) => ({
              text,
              provenance: 'general_cs' as const,
              isUnverified: true,
              sourceReference: 'General computer science curriculum consensus; primary source unverified',
            })),
      };
      this.topics.set(topic.id, topic);
    }
    this.validationResult = this.validateCatalogInternal(catalog);
  }

  /**
   * Returns all topics in the curriculum.
   */
  public getAllTopics(): CurriculumTopic[] {
    return Array.from(this.topics.values());
  }

  /**
   * Retrieves a topic by its unique ID.
   */
  public getTopicById(id: string): CurriculumTopic | undefined {
    return this.topics.get(id);
  }

  /**
   * Returns topics belonging to a specific category.
   */
  public getTopicsByCategory(category: CurriculumCategory): CurriculumTopic[] {
    return this.getAllTopics().filter((t) => t.category === category);
  }

  /**
   * Returns the cached validation result of the catalog.
   */
  public getValidationResult(): CurriculumValidationResult {
    if (!this.validationResult) {
      this.validationResult = this.validateCatalogInternal(this.getAllTopics());
    }
    return this.validationResult;
  }

  /**
   * Performs complete topological prerequisite traversal for a given topic ID.
   * Returns an ordered array of prerequisite topics from foundational to target.
   * Throws an error if the topic does not exist or if a cycle is detected.
   */
  public getPrerequisiteOrder(targetTopicId: string): CurriculumTopic[] {
    const target = this.getTopicById(targetTopicId);
    if (!target) {
      throw new Error(`Topic with id "${targetTopicId}" not found in curriculum catalog.`);
    }

    const visited = new Set<string>();
    const visiting = new Set<string>();
    const order: CurriculumTopic[] = [];

    const dfs = (currentId: string) => {
      if (visiting.has(currentId)) {
        throw new Error(`Circular prerequisite dependency detected involving topic "${currentId}".`);
      }
      if (visited.has(currentId)) {
        return;
      }

      const node = this.getTopicById(currentId);
      if (!node) {
        throw new Error(`Unresolved prerequisite reference "${currentId}" from graph.`);
      }

      visiting.add(currentId);

      for (const prereqId of node.prerequisites) {
        dfs(prereqId);
      }

      visiting.delete(currentId);
      visited.add(currentId);
      order.push(node);
    };

    dfs(targetTopicId);
    return order;
  }

  /**
   * Validates a complete curriculum catalog for:
   * 1. Schema conformity of every topic.
   * 2. Uniqueness of topic IDs.
   * 3. Validity of all prerequisite references.
   * 4. Absence of circular dependencies (DAG invariant).
   * 5. Validity of all relatedTopic references.
   * 6. Accurate source attribution counts.
   */
  public validateCatalog(catalog: CurriculumTopic[] = this.getAllTopics()): CurriculumValidationResult {
    return this.validateCatalogInternal(catalog);
  }

  private validateCatalogInternal(catalog: CurriculumTopic[]): CurriculumValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];
    const topicIdMap = new Map<string, CurriculumTopic>();

    const categoryCounts: Record<CurriculumCategory, number> = {
      data_structures: 0,
      algorithms: 0,
      cs_fundamentals: 0,
      software_engineering: 0,
    };

    const conceptProvenanceCounts: Record<'ciu_derived' | 'iac_authored' | 'general_cs' | 'other', number> = {
      ciu_derived: 0,
      iac_authored: 0,
      general_cs: 0,
      other: 0,
    };

    let ciuDerivedCount = 0;
    let iacAddedCount = 0;
    let generalCsCount = 0;
    let totalConcepts = 0;

    // 1. Check schemas and ID uniqueness
    for (let i = 0; i < catalog.length; i++) {
      const topic = catalog[i];
      const parseResult = CurriculumTopicSchema.safeParse(topic);
      if (!parseResult.success) {
        errors.push(
          `Topic index ${i} (${topic?.id || 'unknown'}): Schema validation failed: ${parseResult.error.message}`
        );
        continue;
      }

      if (topicIdMap.has(topic.id)) {
        errors.push(`Duplicate topic ID detected: "${topic.id}". IDs must be strictly unique.`);
      } else {
        topicIdMap.set(topic.id, topic);
      }

      if (categoryCounts[topic.category] !== undefined) {
        categoryCounts[topic.category]++;
      }

      // Validate attribution coherence and reject misleading combinations
      if (topic.sourceAttribution.attributionType === 'ciu_derived') {
        if (!topic.sourceAttribution.inCodingInterviewUniversity) {
          errors.push(`Topic "${topic.id}" is marked "ciu_derived" but has inCodingInterviewUniversity=false.`);
        }
        if (!topic.sourceAttribution.ciuSection) {
          errors.push(`Topic "${topic.id}" is marked "ciu_derived" but lacks a traceable ciuSection.`);
        }
        if (!topic.sourceAttribution.ciuSectionReference) {
          errors.push(`Topic "${topic.id}" is marked "ciu_derived" but lacks a traceable ciuSectionReference.`);
        }
        ciuDerivedCount++;
      } else if (topic.sourceAttribution.attributionType === 'iac_authored') {
        if (topic.sourceAttribution.inCodingInterviewUniversity) {
          errors.push(`Topic "${topic.id}" is marked "iac_authored" but claims inCodingInterviewUniversity=true.`);
        }
        iacAddedCount++;
      } else if (topic.sourceAttribution.attributionType === 'general_cs') {
        generalCsCount++;
      }

      // Check concept-level provenance coherence
      if (topic.concepts) {
        for (const concept of topic.concepts) {
          totalConcepts++;
          if (conceptProvenanceCounts[concept.provenance] !== undefined) {
            conceptProvenanceCounts[concept.provenance]++;
          }
          if (concept.provenance === 'ciu_derived' && !concept.sourceReference && !concept.isUnverified) {
            errors.push(
              `Topic "${topic.id}" concept "${concept.text}" is marked ciu_derived without traceable sourceReference or isUnverified flag.`
            );
          }
        }
      }
    }

    // 2. Validate prerequisites and related topics exist
    for (const topic of topicIdMap.values()) {
      for (const prereqId of topic.prerequisites) {
        if (!topicIdMap.has(prereqId)) {
          errors.push(
            `Topic "${topic.id}" has invalid prerequisite "${prereqId}" which does not exist in catalog.`
          );
        }
      }

      for (const relatedId of topic.relatedTopics) {
        if (!topicIdMap.has(relatedId)) {
          warnings.push(
            `Topic "${topic.id}" references related topic "${relatedId}" which is not in catalog.`
          );
        }
      }
    }

    // 3. Verify Directed Acyclic Graph (DAG) property across all prerequisites
    const visited = new Set<string>();
    const currentPath = new Set<string>();

    const checkCycle = (nodeId: string, path: string[]) => {
      visited.add(nodeId);
      currentPath.add(nodeId);

      const node = topicIdMap.get(nodeId);
      if (node) {
        for (const prereqId of node.prerequisites) {
          if (!topicIdMap.has(prereqId)) continue;
          if (currentPath.has(prereqId)) {
            errors.push(
              `Cycle detected in prerequisite graph: ${[...path, nodeId, prereqId].join(' -> ')}`
            );
          } else if (!visited.has(prereqId)) {
            checkCycle(prereqId, [...path, nodeId]);
          }
        }
      }

      currentPath.delete(nodeId);
    };

    for (const nodeId of topicIdMap.keys()) {
      if (!visited.has(nodeId)) {
        checkCycle(nodeId, []);
      }
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
      totalTopics: topicIdMap.size,
      totalConcepts,
      categoryCounts,
      ciuDerivedCount,
      iacAddedCount,
      generalCsCount,
      conceptProvenanceCounts,
    };
  }

  /**
   * Generates a structured prompt string of the curriculum for LLM grounding.
   * Treats the catalog as a structured technical baseline, avoids claiming
   * inerrancy, evaluates candidates against established technical principles,
   * preserves concept provenance, and acknowledges uncertainty.
   */
  public generateGroundingPromptSection(): string {
    const lines: string[] = [
      '================================================================================',
      '=== TECHNICAL CURRICULUM GROUNDING SPECIFICATION & EVALUATION GUIDELINES ===',
      '================================================================================',
      'ROLE AND GROUNDING PRINCIPLES:',
      '1. TECHNICAL BASELINE: The curriculum topics, concepts, and failure patterns below',
      '   serve as a structured technical baseline to assist evaluation, NOT as an infallible',
      '   or independently verified authority.',
      '2. CANDIDATE EVALUATION: Evaluate candidate explanations and solutions against',
      '   established computer science and software engineering principles (e.g., asymptotic',
      '   complexity, concurrency safety, memory layout, standard protocols).',
      '3. PROVENANCE & DISTINCTION: Strictly distinguish curriculum reference material from',
      '   candidate-provided content. Candidate statements are unverified interview claims',
      '   to be assessed, not established facts.',
      '4. NO FABRICATION: Do not invent missing technical facts, RFC numbers, API contracts,',
      '   or source citations. If a concept is not covered in the curriculum or evidence, do not fabricate.',
      '5. ACKNOWLEDGE UNCERTAINTY: Where the curriculum or available evidence does not',
      '   provide enough information to verify a claim, explicitly acknowledge uncertainty',
      '   rather than guessing or assuming candidate correctness or error.',
      '================================================================================',
    ];

    const categories: Array<{ id: CurriculumCategory; label: string }> = [
      { id: 'data_structures', label: '1. Data Structures' },
      { id: 'algorithms', label: '2. Algorithms' },
      { id: 'cs_fundamentals', label: '3. Computer Science Fundamentals' },
      { id: 'software_engineering', label: '4. Software Engineering & Architecture' },
    ];

    for (const cat of categories) {
      lines.push(`\n## ${cat.label}`);
      const catTopics = this.getTopicsByCategory(cat.id);
      for (const topic of catTopics) {
        lines.push(`\n### Topic: [${topic.id}] ${topic.name} (${topic.difficulty}, relevance: ${topic.interviewRelevance})`);
        lines.push(`Topic Summary Attribution: ${topic.sourceAttribution.attributionType} (CIU Section: ${topic.sourceAttribution.ciuSection || 'N/A'})`);
        lines.push(`Description: ${topic.description}`);
        lines.push(`Concepts (with provenance):`);
        const conceptsList: CurriculumConcept[] = topic.concepts && topic.concepts.length > 0
          ? topic.concepts
          : topic.coreConcepts.map((text): CurriculumConcept => ({
              text,
              provenance: 'general_cs',
              isUnverified: true,
              sourceReference: 'General computer science curriculum consensus; primary source unverified',
            }));
        for (const concept of conceptsList) {
          const ref = concept.sourceReference ? ` [Source: ${concept.sourceReference}]` : (concept.isUnverified ? ' [Source: unverified]' : '');
          lines.push(`  - [${concept.provenance}] ${concept.text}${ref}`);
        }
        lines.push(`Common Candidate Misconceptions:`);
        for (const misconception of topic.commonMisconceptions) {
          lines.push(`  - ${misconception}`);
        }
        lines.push(`Expected Outcomes:`);
        for (const outcome of topic.expectedLearningOutcomes) {
          lines.push(`  - ${outcome}`);
        }
      }
    }

    lines.push('\n=== END TECHNICAL CURRICULUM GROUNDING SPECIFICATION ===');
    return lines.join('\n');
  }
}

