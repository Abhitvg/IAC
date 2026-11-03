import { CompetencyProfileService } from './CompetencyProfileService';
import { QuestionBank, QuestionEntry } from './QuestionBank';

export interface JDRequirementAnalysis {
  extractedTechStack: string[];
  mappedCurriculumTopicIds: string[];
  seniority: 'Junior' | 'Mid' | 'Senior' | 'Staff/Lead';
  gapAnalysis: {
    unassessedTopics: string[];
    weakTopicsNeedingRevision: string[];
    demonstratedStrengths: string[];
  };
}

export interface TargetedRoundSpecification {
  roundType: 'dsa_coding' | 'core_cs' | 'system_design' | 'behavioral' | 'role_specific';
  title: string;
  focusCurriculumTopicIds: string[];
  recommendedQuestions: QuestionEntry[];
  timeBudgetMinutes: number;
}

export interface TargetedInterviewPlan {
  roleTitle: string;
  companyName?: string;
  seniority: 'Junior' | 'Mid' | 'Senior' | 'Staff/Lead';
  rounds: TargetedRoundSpecification[];
  totalEstimatedMinutes: number;
  priorityTopicsToRevise: string[];
  disclaimer: string;
}

const KEYWORD_TO_TOPIC_MAP: Record<string, string[]> = {
  // Data Structures & Algorithms
  array: ['ds_arrays_strings'],
  string: ['ds_arrays_strings'],
  'linked list': ['ds_linked_lists'],
  stack: ['ds_stacks_queues'],
  queue: ['ds_stacks_queues'],
  'hash map': ['ds_hash_tables'],
  hashtable: ['ds_hash_tables'],
  dictionary: ['ds_hash_tables'],
  tree: ['ds_trees_bst'],
  bst: ['ds_trees_bst'],
  heap: ['ds_heaps'],
  'priority queue': ['ds_heaps'],
  trie: ['ds_tries'],
  graph: ['algo_graph_algorithms', 'ds_graphs'],
  'dynamic programming': ['algo_dynamic_programming'],
  greedy: ['algo_greedy'],
  'binary search': ['algo_binary_search'],
  sorting: ['algo_sorting'],
  recursion: ['algo_recursion'],
  backtracking: ['algo_backtracking'],
  'bit manipulation': ['algo_bit_manipulation'],

  // Core CS
  linux: ['cs_operating_systems'],
  'operating systems': ['cs_operating_systems'],
  posix: ['cs_operating_systems'],
  threads: ['cs_threads_concurrency'],
  concurrency: ['cs_threads_concurrency'],
  goroutine: ['cs_threads_concurrency'],
  multithreading: ['cs_threads_concurrency'],
  async: ['cs_threads_concurrency'],
  memory: ['cs_memory_management'],
  networking: ['cs_networking', 'cs_http_tcp'],
  tcp: ['cs_http_tcp', 'cs_networking'],
  http: ['cs_http_tcp'],
  websocket: ['cs_networking'],
  sql: ['cs_databases', 'cs_transactions'],
  postgres: ['cs_databases', 'cs_transactions'],
  postgresql: ['cs_databases', 'cs_transactions'],
  mysql: ['cs_databases', 'cs_transactions'],
  database: ['cs_databases'],
  acid: ['cs_transactions'],
  redis: ['cs_caching'],
  memcached: ['cs_caching'],
  cache: ['cs_caching'],
  caching: ['cs_caching'],
  distributed: ['cs_distributed_systems'],
  microservices: ['cs_distributed_systems'],
  kafka: ['cs_distributed_systems'],
  rabbitmq: ['cs_distributed_systems'],
  testing: ['cs_testing_debugging'],
  tdd: ['cs_testing_debugging'],

  // Software Engineering
  oop: ['se_oop_design_patterns'],
  'design patterns': ['se_oop_design_patterns'],
  solid: ['se_solid_principles'],
  'clean code': ['se_clean_code'],
  rest: ['se_api_design'],
  graphql: ['se_api_design'],
  grpc: ['se_api_design'],
  api: ['se_api_design'],
  'system design': ['se_system_design'],
  scalability: ['se_scalability'],
  'high availability': ['se_scalability'],
  reliability: ['se_scalability'],
};

export class JDInterviewMapper {
  /**
   * Analyzes job description text, extracts required technologies, and maps them to curriculum topics.
   */
  public static analyzeJD(
    jdText: string,
    competencyService: CompetencyProfileService = CompetencyProfileService.getInstance()
  ): JDRequirementAnalysis {
    const jdLower = (jdText || '').toLowerCase();
    const extractedStack: string[] = [];
    const mappedTopics = new Set<string>();

    for (const [kw, topicIds] of Object.entries(KEYWORD_TO_TOPIC_MAP)) {
      if (jdLower.includes(kw)) {
        if (!extractedStack.includes(kw)) {
          extractedStack.push(kw);
        }
        topicIds.forEach((id) => mappedTopics.add(id));
      }
    }

    // Default core topics if JD is brief
    if (mappedTopics.size === 0) {
      ['ds_arrays_strings', 'algo_dynamic_programming', 'se_system_design', 'cs_databases'].forEach(
        (id) => mappedTopics.add(id)
      );
    }

    // Determine seniority
    let seniority: 'Junior' | 'Mid' | 'Senior' | 'Staff/Lead' = 'Mid';
    if (
      jdLower.includes('staff') ||
      jdLower.includes('principal') ||
      jdLower.includes('architect') ||
      jdLower.includes('director')
    ) {
      seniority = 'Staff/Lead';
    } else if (jdLower.includes('senior') || jdLower.includes('lead') || jdLower.includes('sr.')) {
      seniority = 'Senior';
    } else if (
      jdLower.includes('junior') ||
      jdLower.includes('entry') ||
      jdLower.includes('associate')
    ) {
      seniority = 'Junior';
    }

    // Cross-reference with candidate competency profile
    const unassessedTopics: string[] = [];
    const weakTopics: string[] = [];
    const demonstratedStrengths: string[] = [];

    const mappedList = Array.from(mappedTopics);
    for (const topicId of mappedList) {
      const comp = competencyService.getTopicCompetency(topicId);
      if (!comp || comp.masteryStatus === 'NOT_ASSESSED') {
        unassessedTopics.push(topicId);
      } else if (
        comp.revisionStatus === 'NEEDS_REVISION' ||
        comp.masteryStatus === 'ATTEMPTED' ||
        comp.masteryStatus === 'INTRODUCED'
      ) {
        weakTopics.push(topicId);
      } else if (
        comp.masteryStatus === 'DEMONSTRATED' ||
        comp.masteryStatus === 'STRONGLY_DEMONSTRATED'
      ) {
        demonstratedStrengths.push(topicId);
      }
    }

    return {
      extractedTechStack: extractedStack,
      mappedCurriculumTopicIds: mappedList,
      seniority,
      gapAnalysis: {
        unassessedTopics,
        weakTopicsNeedingRevision: weakTopics,
        demonstratedStrengths,
      },
    };
  }

  /**
   * Generates a tailored, curriculum-grounded multi-round interview plan.
   */
  public static generateInterviewPlan(params: {
    jdText: string;
    roleTitle: string;
    companyName?: string;
    competencyService?: CompetencyProfileService;
  }): TargetedInterviewPlan {
    const analysis = this.analyzeJD(params.jdText, params.competencyService);
    const difficultyTier =
      analysis.seniority === 'Staff/Lead'
        ? 'expert'
        : analysis.seniority === 'Senior'
        ? 'advanced'
        : analysis.seniority === 'Mid'
        ? 'intermediate'
        : 'easy';

    const rounds: TargetedRoundSpecification[] = [];

    // 1. DSA Coding Round
    const dsaTopics = analysis.mappedCurriculumTopicIds.filter(
      (id) => id.startsWith('ds_') || id.startsWith('algo_')
    );
    const selectedDsaTopic =
      analysis.gapAnalysis.weakTopicsNeedingRevision.find((t) => t.startsWith('ds_') || t.startsWith('algo_')) ||
      analysis.gapAnalysis.unassessedTopics.find((t) => t.startsWith('ds_') || t.startsWith('algo_')) ||
      dsaTopics[0] ||
      'ds_arrays_strings';

    const dsaQuestion = QuestionBank.selectQuestionForCurriculumTopic(
      selectedDsaTopic,
      difficultyTier,
      'coding_problem'
    );

    rounds.push({
      roundType: 'dsa_coding',
      title: 'Data Structures & Algorithms Round',
      focusCurriculumTopicIds: [selectedDsaTopic],
      recommendedQuestions: [dsaQuestion],
      timeBudgetMinutes: 45,
    });

    // 2. Core CS Round
    const coreTopics = analysis.mappedCurriculumTopicIds.filter((id) => id.startsWith('cs_'));
    const selectedCoreTopic =
      analysis.gapAnalysis.weakTopicsNeedingRevision.find((t) => t.startsWith('cs_')) ||
      analysis.gapAnalysis.unassessedTopics.find((t) => t.startsWith('cs_')) ||
      coreTopics[0] ||
      'cs_operating_systems';

    const coreQuestion = QuestionBank.selectQuestionForCurriculumTopic(
      selectedCoreTopic,
      difficultyTier,
      'conceptual'
    );

    rounds.push({
      roundType: 'core_cs',
      title: 'Computer Science Fundamentals Round',
      focusCurriculumTopicIds: [selectedCoreTopic],
      recommendedQuestions: [coreQuestion],
      timeBudgetMinutes: 30,
    });

    // 3. System Design Round (for Mid, Senior, and Staff)
    if (analysis.seniority !== 'Junior') {
      const sysTopics = analysis.mappedCurriculumTopicIds.filter((id) => id.startsWith('se_'));
      const selectedSysTopic =
        analysis.gapAnalysis.weakTopicsNeedingRevision.find((t) => t.startsWith('se_')) ||
        sysTopics[0] ||
        'se_system_design';

      const sysQuestion = QuestionBank.selectQuestionForCurriculumTopic(
        selectedSysTopic,
        difficultyTier,
        'architecture_tradeoff'
      );

      rounds.push({
        roundType: 'system_design',
        title: 'System Design & Scalability Round',
        focusCurriculumTopicIds: [selectedSysTopic],
        recommendedQuestions: [sysQuestion],
        timeBudgetMinutes: 45,
      });
    }

    const priorityTopics = [
      ...analysis.gapAnalysis.weakTopicsNeedingRevision,
      ...analysis.gapAnalysis.unassessedTopics.slice(0, 3),
    ];

    return {
      roleTitle: params.roleTitle,
      companyName: params.companyName,
      seniority: analysis.seniority,
      rounds,
      totalEstimatedMinutes: rounds.reduce((sum, r) => sum + r.timeBudgetMinutes, 0),
      priorityTopicsToRevise: priorityTopics,
      disclaimer:
        'All interview questions and rounds are grounded in curriculum technical baselines and role requirements. IAC does not claim these are proprietary leaked company questions.',
    };
  }
}
