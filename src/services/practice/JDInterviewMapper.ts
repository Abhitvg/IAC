import { CompetencyProfileService } from './CompetencyProfileService';
import { QuestionBank, QuestionEntry, QuestionEntrySchema } from './QuestionBank';

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
  java: ['se_oop_design_patterns', 'cs_threads_concurrency'],
  'spring boot': ['se_api_design', 'se_clean_code', 'cs_testing_debugging'],
  terraform: ['se_system_design', 'cs_testing_debugging'],
  'infrastructure as code': ['se_system_design', 'cs_testing_debugging'],
  aws: ['se_system_design', 'se_scalability'],
  docker: ['cs_operating_systems', 'cs_distributed_systems'],
  kubernetes: ['cs_distributed_systems', 'se_scalability'],
  k8s: ['cs_distributed_systems', 'se_scalability'],
  jenkins: ['cs_testing_debugging'],
  'ci/cd': ['cs_testing_debugging'],
  'unit testing': ['cs_testing_debugging'],
  'integration testing': ['cs_testing_debugging'],

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


function buildPlatformRoleQuestions(
  jdText: string,
  seniority: JDRequirementAnalysis['seniority']
): QuestionEntry[] {
  const jd = (jdText || '').toLowerCase();
  const difficulty = seniority === 'Junior' ? 2 : seniority === 'Mid' ? 3 : seniority === 'Senior' ? 4 : 5;
  const questions: QuestionEntry[] = [];

  if (/\bjava\b|\bspring boot\b|\bmicroservices?\b/i.test(jd)) {
    questions.push(QuestionEntrySchema.parse({
      id: 'role-java-spring-microservices',
      type: 'technical_concept',
      topic: 'Java, Spring Boot, and Microservices',
      tags: ['Java', 'Spring Boot', 'Microservices', 'REST API'],
      difficulty,
      prompt:
        'How would you structure a Spring Boot microservice that exposes a REST API? Explain dependency injection, request validation, exception handling, transaction boundaries, and how you would test it.',
      expectedPoints: [
        'Separate controller, service, and persistence responsibilities with clear contracts.',
        'Use constructor injection and validate input at the API boundary.',
        'Return consistent error responses and keep transaction scope explicit.',
        'Cover service logic with unit tests and persistence/API behavior with integration tests.',
        'Explain timeouts, idempotency, and failure handling when another service is involved.',
      ],
      followUps: [
        'How would you prevent duplicate requests from applying the same change twice?',
        'Where would you place transaction boundaries?',
        'What belongs in a unit test versus an integration test?',
      ],
      timeBudgetMinutes: 12,
      curriculumTopicId: 'se_api_design',
    }));
  }

  if (/\bterraform\b|\binfrastructure as code\b|\bjenkins\b|\bci\s*\/\s*cd\b/i.test(jd)) {
    questions.push(QuestionEntrySchema.parse({
      id: 'role-terraform-jenkins-cicd',
      type: 'technical_concept',
      topic: 'Terraform and CI/CD',
      tags: ['Terraform', 'Jenkins', 'CI/CD', 'Infrastructure as Code'],
      difficulty,
      prompt:
        'Design a Jenkins pipeline for a Java service that tests the code and provisions infrastructure with Terraform. Walk through the stages, state management, approval boundaries, and rollback strategy.',
      expectedPoints: [
        'Run formatting, initialization, validation, unit/integration tests, and security checks before release.',
        'Build and publish an immutable artifact rather than rebuilding separately in each environment.',
        'Use reusable Terraform modules, pinned providers, remote state, and state locking.',
        'Review the Terraform plan before an approved apply; do not conflate plan with apply.',
        'Promote through environments, verify health, and define deployment and infrastructure recovery paths.',
      ],
      followUps: [
        'How do you detect and handle Terraform drift?',
        'How would you prevent two pipeline runs from changing the same state concurrently?',
        'What should happen if deployment succeeds but a post-deploy health check fails?',
      ],
      timeBudgetMinutes: 12,
      curriculumTopicId: 'cs_testing_debugging',
    }));
  }

  if (/\baws\b|\bdocker\b|\bkubernetes\b|\bk8s\b|\biaas\b/i.test(jd)) {
    questions.push(QuestionEntrySchema.parse({
      id: 'role-aws-docker-kubernetes',
      type: 'technical_concept',
      topic: 'AWS, Docker, and Kubernetes',
      tags: ['AWS', 'Docker', 'Kubernetes', 'IaaS', 'Reliability'],
      difficulty,
      prompt:
        'How would you deploy a containerized Java microservice on AWS using Docker and Kubernetes? Explain identity and networking boundaries, health checks, resource controls, observability, and rollback.',
      expectedPoints: [
        'Build a minimal, trusted image and run the service as a non-root user.',
        'Apply least-privilege IAM and restrict network exposure to required paths.',
        'Use Kubernetes Deployments and Services with readiness/liveness probes and resource requests/limits.',
        'Keep configuration and secrets outside the image and apply suitable access controls.',
        'Use rolling deployment health verification, logs/metrics/traces, and a tested rollback path.',
      ],
      followUps: [
        'What is the difference between readiness and liveness probes?',
        'How would you diagnose repeated pod restarts?',
        'How would you scale the service while protecting its database?',
      ],
      timeBudgetMinutes: 12,
      curriculumTopicId: 'se_scalability',
    }));
  }

  return questions;
}


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
      const matchesKeyword =
        kw === 'java' ? /\bjava\b/i.test(jdLower) : jdLower.includes(kw);
      if (matchesKeyword) {
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
      jdLower.includes('associate') ||
      /\b1\s*(?:-|–|to)\s*2\s*years?\b/i.test(jdLower)
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

    // Early-career roles can still require platform architecture discussion when
    // the posting explicitly asks for cloud, microservices, IaC, or orchestration.
    const hasPlatformArchitectureScope =
      /\b(terraform|kubernetes|docker|microservices?|platform|infrastructure|cloud|aws|iaas)\b/i.test(
        params.jdText || ''
      );

    // 3. System Design Round
    if (analysis.seniority !== 'Junior' || hasPlatformArchitectureScope) {
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

    const platformQuestions = buildPlatformRoleQuestions(params.jdText, analysis.seniority);
    if (platformQuestions.length > 0) {
      rounds.push({
        roundType: 'role_specific',
        title: 'Java, Cloud & Delivery Platform Engineering',
        focusCurriculumTopicIds: Array.from(
          new Set(platformQuestions.map((question) => question.curriculumTopicId || ''))
        ).filter(Boolean),
        recommendedQuestions: platformQuestions,
        timeBudgetMinutes: 35,
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
