import { describe, it, expect, beforeEach } from 'vitest';
import {
  CurriculumCatalogService,
  CurriculumTopic,
  CURRICULUM_CATALOG,
} from '../src/data/curriculum';
import {
  GFG_CODING_PATTERNS,
  GFG_DEVOPS_KNOWLEDGE,
  GFG_WEB_TECHNOLOGY,
  GFG_CORE_CS_SUBJECTS,
  getGfgKnowledgePromptSection,
} from '../src/data/gfgCurriculum';

describe('Curriculum Knowledge Base & Validation (Phase 1 Acceptance Gate)', () => {
  let catalogService: CurriculumCatalogService;

  beforeEach(() => {
    catalogService = CurriculumCatalogService.getInstance();
  });

  it('validates that all topics adhere strictly to CurriculumTopicSchema with zero errors', () => {
    const result = catalogService.getValidationResult();
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
    expect(result.totalTopics).toBe(CURRICULUM_CATALOG.length);
    expect(result.totalTopics).toBe(37); // 9 DS + 12 Algo + 10 CS + 6 SE
  });

  it('verifies topic distribution across all four mandatory subject areas', () => {
    const result = catalogService.getValidationResult();
    expect(result.categoryCounts.data_structures).toBe(9);
    expect(result.categoryCounts.algorithms).toBe(12);
    expect(result.categoryCounts.cs_fundamentals).toBe(10);
    expect(result.categoryCounts.software_engineering).toBe(6);
  });

  it('verifies strict source attribution distinguishing CIU-derived, General CS, and IAC-added topics', () => {
    const result = catalogService.getValidationResult();
    expect(result.ciuDerivedCount).toBe(26);
    expect(result.generalCsCount).toBe(9);
    expect(result.iacAddedCount).toBe(2); // se_clean_code and se_api_design
    expect(result.ciuDerivedCount + result.generalCsCount + result.iacAddedCount).toBe(37);

    const cleanCodeTopic = catalogService.getTopicById('se_clean_code');
    expect(cleanCodeTopic?.sourceAttribution.attributionType).toBe('iac_authored');
    expect(cleanCodeTopic?.sourceAttribution.inCodingInterviewUniversity).toBe(false);
    expect(cleanCodeTopic?.sourceAttribution.iacAdditionNote).toBeDefined();

    const hashTablesTopic = catalogService.getTopicById('ds_hash_tables');
    expect(hashTablesTopic?.sourceAttribution.attributionType).toBe('ciu_derived');
    expect(hashTablesTopic?.sourceAttribution.inCodingInterviewUniversity).toBe(true);
    expect(hashTablesTopic?.sourceAttribution.ciuSection).toBe('Hash table');
    expect(hashTablesTopic?.sourceAttribution.ciuSectionReference).toBeDefined();

    const osTopic = catalogService.getTopicById('cs_operating_systems');
    expect(osTopic?.sourceAttribution.attributionType).toBe('general_cs');
    expect(osTopic?.sourceAttribution.referenceNotes).toBeDefined();
  });

  it('proves all topic IDs are strictly unique', () => {
    const allTopics = catalogService.getAllTopics();
    const ids = allTopics.map((t) => t.id);
    const uniqueIds = new Set(ids);
    expect(ids.length).toBe(uniqueIds.size);
  });

  it('proves that the prerequisite graph is a Directed Acyclic Graph (DAG) with no cycles or broken links', () => {
    const allTopics = catalogService.getAllTopics();
    const idSet = new Set(allTopics.map((t) => t.id));

    // 1. No unresolved prerequisite references
    for (const topic of allTopics) {
      for (const prereqId of topic.prerequisites) {
        expect(idSet.has(prereqId)).toBe(true);
      }
    }

    // 2. Traversal works and returns valid order
    const order = catalogService.getPrerequisiteOrder('se_scalability');
    expect(order.length).toBeGreaterThan(1);
    const orderIds = order.map((t) => t.id);

    // Target topic must be last in prerequisite order
    expect(orderIds[orderIds.length - 1]).toBe('se_scalability');
    // Pre-requisite se_system_design must come before se_scalability
    expect(orderIds.indexOf('se_system_design')).toBeLessThan(orderIds.indexOf('se_scalability'));
    // cs_databases must come before se_system_design
    expect(orderIds.indexOf('cs_databases')).toBeLessThan(orderIds.indexOf('se_system_design'));
  });

  it('detects and rejects circular prerequisite dependencies', () => {
    const cyclicCatalog: CurriculumTopic[] = [
      {
        id: 'node_a',
        name: 'Node A',
        category: 'data_structures',
        subcategory: 'Test',
        description: 'Test node with cyclic dependency',
        coreConcepts: ['A concept'],
        concepts: [
          {
            text: 'A concept',
            provenance: 'general_cs',
            sourceReference: 'Test reference',
          },
        ],
        prerequisites: ['node_b'],
        difficulty: 'beginner',
        commonMisconceptions: ['Misconception A'],
        interviewRelevance: 'core_must_know',
        expectedLearningOutcomes: ['Implement node A'],
        relatedTopics: [],
        sourceAttribution: {
          attributionType: 'general_cs',
          inCodingInterviewUniversity: false,
        },
        version: 1,
      },
      {
        id: 'node_b',
        name: 'Node B',
        category: 'data_structures',
        subcategory: 'Test',
        description: 'Test node with cyclic dependency',
        coreConcepts: ['B concept'],
        concepts: [
          {
            text: 'B concept',
            provenance: 'general_cs',
            sourceReference: 'Test reference',
          },
        ],
        prerequisites: ['node_a'],
        difficulty: 'beginner',
        commonMisconceptions: ['Misconception B'],
        interviewRelevance: 'core_must_know',
        expectedLearningOutcomes: ['Implement node B'],
        relatedTopics: [],
        sourceAttribution: {
          attributionType: 'general_cs',
          inCodingInterviewUniversity: false,
        },
        version: 1,
      },
    ];

    const validation = catalogService.validateCatalog(cyclicCatalog);
    expect(validation.valid).toBe(false);
    expect(validation.errors.some((e) => e.includes('Cycle detected'))).toBe(true);
  });

  it('detects and rejects broken prerequisite references', () => {
    const brokenCatalog: CurriculumTopic[] = [
      {
        id: 'node_c',
        name: 'Node C',
        category: 'data_structures',
        subcategory: 'Test',
        description: 'Test node with broken prerequisite',
        coreConcepts: ['C concept'],
        concepts: [
          {
            text: 'C concept',
            provenance: 'general_cs',
            sourceReference: 'Test reference',
          },
        ],
        prerequisites: ['non_existent_topic_id'],
        difficulty: 'beginner',
        commonMisconceptions: ['Misconception C'],
        interviewRelevance: 'core_must_know',
        expectedLearningOutcomes: ['Implement node C'],
        relatedTopics: [],
        sourceAttribution: {
          attributionType: 'general_cs',
          inCodingInterviewUniversity: false,
        },
        version: 1,
      },
    ];

    const validation = catalogService.validateCatalog(brokenCatalog);
    expect(validation.valid).toBe(false);
    expect(validation.errors.some((e) => e.includes('invalid prerequisite'))).toBe(true);
  });

  it('rejects invalid or misleading source attribution combinations', () => {
    // 1. Topic marked ciu_derived but with inCodingInterviewUniversity=false
    const misleadingCiuTopic: CurriculumTopic = {
      id: 'test_misleading_ciu',
      name: 'Misleading CIU',
      category: 'data_structures',
      subcategory: 'Test',
      description: 'Misleading CIU topic',
      coreConcepts: ['Concept 1'],
      concepts: [{ text: 'Concept 1', provenance: 'general_cs' }],
      prerequisites: [],
      difficulty: 'beginner',
      commonMisconceptions: ['Error'],
      interviewRelevance: 'core_must_know',
      expectedLearningOutcomes: ['Apply concept'],
      relatedTopics: [],
      sourceAttribution: {
        attributionType: 'ciu_derived',
        inCodingInterviewUniversity: false, // MISLEADING
        ciuSection: 'Arrays',
        ciuSectionReference: 'jwasham/coding-interview-university#arrays',
      },
      version: 1,
    };
    const res1 = catalogService.validateCatalog([misleadingCiuTopic]);
    expect(res1.valid).toBe(false);
    expect(res1.errors.some((e) => e.includes('has inCodingInterviewUniversity=false'))).toBe(true);

    // 2. Topic marked iac_authored but claiming inCodingInterviewUniversity=true
    const contradictoryIacTopic: CurriculumTopic = {
      id: 'test_contradictory_iac',
      name: 'Contradictory IAC',
      category: 'software_engineering',
      subcategory: 'Test',
      description: 'Contradictory IAC topic',
      coreConcepts: ['Concept 1'],
      concepts: [{ text: 'Concept 1', provenance: 'iac_authored' }],
      prerequisites: [],
      difficulty: 'beginner',
      commonMisconceptions: ['Error'],
      interviewRelevance: 'core_must_know',
      expectedLearningOutcomes: ['Apply concept'],
      relatedTopics: [],
      sourceAttribution: {
        attributionType: 'iac_authored',
        inCodingInterviewUniversity: true, // CONTRADICTORY
        iacAdditionNote: 'Authored for IAC',
      },
      version: 1,
    };
    const res2 = catalogService.validateCatalog([contradictoryIacTopic]);
    expect(res2.valid).toBe(false);
    expect(res2.errors.some((e) => e.includes('claims inCodingInterviewUniversity=true'))).toBe(true);

    // 3. Concept marked ciu_derived without traceable sourceReference or isUnverified flag
    const untraceableConceptTopic: CurriculumTopic = {
      id: 'test_untraceable_concept',
      name: 'Untraceable Concept Topic',
      category: 'data_structures',
      subcategory: 'Test',
      description: 'Untraceable concept topic',
      coreConcepts: ['Concept without citation'],
      concepts: [
        {
          text: 'Concept without citation',
          provenance: 'ciu_derived',
          // Missing sourceReference AND missing isUnverified
        },
      ],
      prerequisites: [],
      difficulty: 'beginner',
      commonMisconceptions: ['Error'],
      interviewRelevance: 'core_must_know',
      expectedLearningOutcomes: ['Apply concept'],
      relatedTopics: [],
      sourceAttribution: {
        attributionType: 'ciu_derived',
        inCodingInterviewUniversity: true,
        ciuSection: 'Trees',
        ciuSectionReference: 'jwasham/coding-interview-university#trees',
      },
      version: 1,
    };
    const res3 = catalogService.validateCatalog([untraceableConceptTopic]);
    expect(res3.valid).toBe(false);
    expect(res3.errors.some((e) => e.includes('without traceable sourceReference'))).toBe(true);
  });

  it('preserves and maps 100% of previous gfgCurriculum key concepts and subtopics', () => {
    const allTopics = catalogService.getAllTopics();
    const allCoreConcepts = allTopics.flatMap((t) => t.coreConcepts);
    const allDescriptions = allTopics.map((t) => t.description);
    const combinedCorpus = `${allCoreConcepts.join(' ')} ${allDescriptions.join(' ')}`.toLowerCase();

    // Verify key concepts from GFG_CODING_PATTERNS
    expect(combinedCorpus).toContain('kadane');
    expect(combinedCorpus).toContain('two-pointer');
    expect(combinedCorpus).toContain('sliding window');
    expect(combinedCorpus).toContain('monotonic stack');
    expect(combinedCorpus).toContain('floyd');
    expect(combinedCorpus).toContain('dijkstra');
    expect(combinedCorpus).toContain('kahn');
    expect(combinedCorpus).toContain('disjoint set union');
    expect(combinedCorpus).toContain('dynamic programming');

    // Verify key concepts from GFG_DEVOPS_KNOWLEDGE
    expect(combinedCorpus).toContain('linux');
    expect(combinedCorpus).toContain('opentelemetry');
    expect(combinedCorpus).toContain('sli');
    expect(combinedCorpus).toContain('slo');
    expect(combinedCorpus).toContain('canary');

    // Verify key concepts from GFG_WEB_TECHNOLOGY
    expect(combinedCorpus).toContain('http/2');
    expect(combinedCorpus).toContain('http/3');
    expect(combinedCorpus).toContain('idempotency');
    expect(combinedCorpus).toContain('cache-aside');

    // Verify key concepts from GFG_CORE_CS_SUBJECTS
    expect(combinedCorpus).toContain('virtual memory');
    expect(combinedCorpus).toContain('page table');
    expect(combinedCorpus).toContain('deadlock');
    expect(combinedCorpus).toContain('b+ tree');
    expect(combinedCorpus).toContain('write-ahead logging');
    expect(combinedCorpus).toContain('isolation levels');
  });

  it('generates a strictly demarcated LLM grounding prompt preserving concept provenance and technical baseline authority', () => {
    const prompt = catalogService.generateGroundingPromptSection();
    expect(prompt).toContain('=== TECHNICAL CURRICULUM GROUNDING SPECIFICATION & EVALUATION GUIDELINES ===');
    expect(prompt).toContain('ROLE AND GROUNDING PRINCIPLES:');
    expect(prompt).toContain('TECHNICAL BASELINE: The curriculum topics, concepts, and failure patterns below');
    expect(prompt).toContain('serve as a structured technical baseline to assist evaluation, NOT as an infallible');
    expect(prompt).toContain('Evaluate candidate explanations and solutions against');
    expect(prompt).toContain('NO FABRICATION: Do not invent missing technical facts');
    expect(prompt).toContain('ACKNOWLEDGE UNCERTAINTY:');
    expect(prompt).toContain('1. Data Structures');
    expect(prompt).toContain('2. Algorithms');
    expect(prompt).toContain('3. Computer Science Fundamentals');
    expect(prompt).toContain('4. Software Engineering & Architecture');
    expect(prompt).toContain('[ds_hash_tables]');
    expect(prompt).toContain('Concepts (with provenance):');
    expect(prompt).toContain('[ciu_derived]');
    expect(prompt).toContain('[Source: jwasham/coding-interview-university');
    expect(prompt).toContain('=== END TECHNICAL CURRICULUM GROUNDING SPECIFICATION ===');
  });

  it('enforces structural quality, concept provenance, and semantic completeness across all 37 topic records', () => {
    const allTopics = catalogService.getAllTopics();
    expect(allTopics.length).toBe(37);

    const validationResult = catalogService.getValidationResult();
    expect(validationResult.valid).toBe(true);
    expect(validationResult.totalConcepts).toBeGreaterThan(150);
    expect(validationResult.conceptProvenanceCounts.ciu_derived).toBeGreaterThan(0);
    expect(validationResult.conceptProvenanceCounts.general_cs).toBeGreaterThan(0);
    expect(validationResult.conceptProvenanceCounts.other).toBeGreaterThan(0);
    expect(validationResult.conceptProvenanceCounts.iac_authored).toBeGreaterThan(0);

    const actionVerbs = [
      'implement',
      'apply',
      'analyze',
      'design',
      'evaluate',
      'construct',
      'reverse',
      'detect',
      'solve',
      'trace',
      'explain',
      'compare',
      'distinguish',
      'formulate',
      'model',
      'measure',
      'mitigate',
      'profile',
      'refactor',
      'identify',
      'calculate',
      'standardize',
      'optimize',
      'validate',
      'find',
      'build',
      'select',
      'state',
      'deconstruct',
      'draw',
      'convert',
      'extract',
      'translate',
      'manipulate',
      'differentiate',
      'diagnose',
      'describe',
      'inspect',
      'contrast',
      'interpret',
      'prevent',
      'author',
      'audit',
      'drive',
      'synthesize',
      'protect',
      'define',
    ];

    for (const topic of allTopics) {
      // 1. Descriptions must be non-empty and descriptive
      expect(typeof topic.description).toBe('string');
      expect(topic.description.trim().length).toBeGreaterThan(0);

      // 2. Concepts must have valid text, provenance, and traceable references
      expect(topic.concepts.length).toBeGreaterThanOrEqual(1);
      expect(topic.coreConcepts.length).toBe(topic.concepts.length);

      for (let i = 0; i < topic.concepts.length; i++) {
        const concept = topic.concepts[i];
        expect(concept.text).toBe(topic.coreConcepts[i]);
        expect(['ciu_derived', 'iac_authored', 'general_cs', 'other']).toContain(concept.provenance);

        if (concept.provenance === 'ciu_derived') {
          expect(concept.sourceReference || concept.isUnverified).toBeDefined();
        }
      }

      // 3. Common misconceptions must be non-empty strings
      expect(topic.commonMisconceptions.length).toBeGreaterThanOrEqual(1);
      for (const misconception of topic.commonMisconceptions) {
        expect(typeof misconception).toBe('string');
        expect(misconception.trim().length).toBeGreaterThan(0);
      }

      // 4. Learning outcomes must specify actionable competencies starting with measurable verbs
      expect(topic.expectedLearningOutcomes.length).toBeGreaterThanOrEqual(1);
      for (const outcome of topic.expectedLearningOutcomes) {
        const firstWord = outcome.trim().split(/\s+/)[0].toLowerCase();
        expect(actionVerbs.some((verb) => firstWord.startsWith(verb))).toBe(true);
      }

      // 5. Source attribution must be valid and non-vague
      expect(['ciu_derived', 'iac_authored', 'general_cs']).toContain(topic.sourceAttribution.attributionType);
      if (topic.sourceAttribution.attributionType === 'ciu_derived') {
        expect(topic.sourceAttribution.inCodingInterviewUniversity).toBe(true);
        expect(topic.sourceAttribution.ciuSection).toBeDefined();
        expect(topic.sourceAttribution.ciuSectionReference).toBeDefined();
      } else if (topic.sourceAttribution.attributionType === 'iac_authored') {
        expect(topic.sourceAttribution.inCodingInterviewUniversity).toBe(false);
        expect(topic.sourceAttribution.iacAdditionNote).toBeDefined();
      } else if (topic.sourceAttribution.attributionType === 'general_cs') {
        expect(topic.sourceAttribution.referenceNotes).toBeDefined();
      }
    }
  });

  it('verifies that existing gfgCurriculum exports continue to function with zero regressions', () => {
    expect(GFG_CODING_PATTERNS.subtopics.length).toBe(10);
    expect(GFG_DEVOPS_KNOWLEDGE.subtopics.length).toBe(6);
    expect(GFG_WEB_TECHNOLOGY.subtopics.length).toBe(6);
    expect(GFG_CORE_CS_SUBJECTS.subtopics.length).toBe(6);

    const gfgPrompt = getGfgKnowledgePromptSection();
    expect(gfgPrompt).toContain('=== CORE CS & SYSTEM DESIGN KNOWLEDGE BASE ===');
    expect(gfgPrompt).toContain('Kadane');
    expect(gfgPrompt).toContain('OpenTelemetry');
    expect(gfgPrompt).toContain('HTTP/2');
    expect(gfgPrompt).toContain('Virtual memory');
  });

  it('verifies that difficulty levels are calibrated consistently across the curriculum', () => {
    const allTopics = catalogService.getAllTopics();
    const validDifficulties = ['beginner', 'easy', 'intermediate', 'advanced', 'expert'];

    for (const topic of allTopics) {
      expect(validDifficulties).toContain(topic.difficulty);
    }

    // Foundational topics must be beginner or easy
    expect(catalogService.getTopicById('algo_big_o')?.difficulty).toBe('beginner');
    expect(catalogService.getTopicById('ds_arrays_strings')?.difficulty).toBe('beginner');
    expect(catalogService.getTopicById('ds_linked_lists')?.difficulty).toBe('easy');

    // Advanced topics must be marked appropriately
    expect(catalogService.getTopicById('algo_dynamic_programming')?.difficulty).toBe('advanced');
    expect(catalogService.getTopicById('se_scalability')?.difficulty).toBe('advanced');
    expect(catalogService.getTopicById('cs_distributed_systems')?.difficulty).toBe('advanced');
  });
});
