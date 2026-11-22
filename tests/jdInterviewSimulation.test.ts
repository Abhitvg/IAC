import { describe, it, expect, beforeEach } from 'vitest';
import { JDInterviewMapper } from '../src/services/practice/JDInterviewMapper';
import { CompetencyProfileService } from '../src/services/practice/CompetencyProfileService';
import { CompanyPlanGenerator } from '../src/services/practice/CompanyPlanGenerator';

describe('Phase 6 — Adaptive Interview Intelligence & JD Simulation', () => {
  let competencyService: CompetencyProfileService;

  beforeEach(() => {
    competencyService = CompetencyProfileService.getInstance();
    competencyService.resetProfile();
  });

  const sampleSeniorJD = `
We are seeking a Senior Backend Distributed Systems Engineer.
Requirements:
- Strong experience with Golang or Python, building high-throughput microservices.
- Deep understanding of distributed systems, concurrency, goroutines, and Kafka event streaming.
- Proficiency with PostgreSQL, ACID transactions, and Redis caching.
- Solid understanding of Linux operating systems, memory management, and TCP/IP networking.
- Experience with large-scale System Design and 99.99% scalability and reliability.
- Solid grasp of data structures and algorithms (trees, dynamic programming).
`;

  it('extracts technical stack and maps to canonical curriculum topics', () => {
    const analysis = JDInterviewMapper.analyzeJD(sampleSeniorJD, competencyService);

    expect(analysis.seniority).toBe('Senior');
    expect(analysis.extractedTechStack).toContain('microservices');
    expect(analysis.extractedTechStack).toContain('redis');
    expect(analysis.extractedTechStack).toContain('postgres');
    expect(analysis.extractedTechStack).toContain('concurrency');

    // Canonical curriculum topic mappings
    expect(analysis.mappedCurriculumTopicIds).toContain('cs_distributed_systems');
    expect(analysis.mappedCurriculumTopicIds).toContain('cs_threads_concurrency');
    expect(analysis.mappedCurriculumTopicIds).toContain('cs_databases');
    expect(analysis.mappedCurriculumTopicIds).toContain('cs_caching');
    expect(analysis.mappedCurriculumTopicIds).toContain('cs_operating_systems');
    expect(analysis.mappedCurriculumTopicIds).toContain('se_system_design');
    expect(analysis.mappedCurriculumTopicIds).toContain('se_scalability');
  });

  it('cross-references JD requirements with candidate competency gaps', () => {
    // Simulate candidate having demonstrated trees, but weak in dynamic programming and caching
    competencyService.recordAssessment({
      curriculumTopicId: 'ds_trees_bst',
      questionId: 'cq_trees_01',
      score: 4.5,
      candidateQuoteOrSnippet: 'AVL trees strictly maintain balance factor <= 1.',
      sourceType: 'live_interview',
    });

    competencyService.recordAssessment({
      curriculumTopicId: 'algo_dynamic_programming',
      questionId: 'cq_dp_01',
      score: 2.0,
      candidateQuoteOrSnippet: 'I missed the memoization table states.',
      sourceType: 'coding_assessment',
    });

    const analysis = JDInterviewMapper.analyzeJD(sampleSeniorJD, competencyService);

    expect(analysis.gapAnalysis.demonstratedStrengths).toContain('ds_trees_bst');
    expect(analysis.gapAnalysis.weakTopicsNeedingRevision).toContain('algo_dynamic_programming');
    expect(analysis.gapAnalysis.unassessedTopics).toContain('cs_distributed_systems');
  });

  it('generates multi-round interview plan tailored to role requirements and candidate gaps', () => {
    const plan = JDInterviewMapper.generateInterviewPlan({
      jdText: sampleSeniorJD,
      roleTitle: 'Senior Backend Engineer',
      companyName: 'Stripe',
      competencyService,
    });

    expect(plan.roleTitle).toBe('Senior Backend Engineer');
    expect(plan.seniority).toBe('Senior');
    expect(plan.rounds.length).toBeGreaterThanOrEqual(3);

    // Verify round types
    const roundTypes = plan.rounds.map((r) => r.roundType);
    expect(roundTypes).toContain('dsa_coding');
    expect(roundTypes).toContain('core_cs');
    expect(roundTypes).toContain('system_design');

    // Verify questions are grounded
    for (const round of plan.rounds) {
      expect(round.recommendedQuestions.length).toBeGreaterThanOrEqual(1);
      const q = round.recommendedQuestions[0];
      expect(q.prompt).toBeDefined();
      expect(q.curriculumTopicId).toBeDefined();
    }

    // Verify disclaimer exists
    expect(plan.disclaimer).toContain('grounded in curriculum technical baselines');
    expect(plan.disclaimer).toContain('IAC does not claim these are proprietary leaked company questions');
  });


  it('maps the Sophos platform-engineering brief and generates a focused role-specific round', () => {
    const sophosJD = `
      The Software Engineer will facilitate and automate continuous feature builds for multiple
      development teams. Build Java and Spring Boot microservices and public REST APIs.
      Customize Terraform automation and work with AWS, Docker, Kubernetes, Jenkins, and CI/CD.
      Write automated unit and integration tests in CI/CD pipelines and support IaaS.
      Carry out the SDLC in an Agile team and address customer defects within defined SLAs.
      Requires 1-2 years of development experience.
    `;

    const analysis = JDInterviewMapper.analyzeJD(sophosJD, competencyService);
    expect(analysis.seniority).toBe('Junior');
    expect(analysis.extractedTechStack).toContain('java');
    expect(analysis.extractedTechStack).toContain('spring boot');
    expect(analysis.extractedTechStack).toContain('terraform');
    expect(analysis.extractedTechStack).toContain('aws');
    expect(analysis.extractedTechStack).toContain('docker');
    expect(analysis.extractedTechStack).toContain('kubernetes');
    expect(analysis.extractedTechStack).toContain('jenkins');
    expect(analysis.extractedTechStack).toContain('ci/cd');

    expect(analysis.mappedCurriculumTopicIds).toContain('se_api_design');
    expect(analysis.mappedCurriculumTopicIds).toContain('se_oop_design_patterns');
    expect(analysis.mappedCurriculumTopicIds).toContain('cs_testing_debugging');
    expect(analysis.mappedCurriculumTopicIds).toContain('cs_distributed_systems');
    expect(analysis.mappedCurriculumTopicIds).toContain('se_scalability');

    const plan = JDInterviewMapper.generateInterviewPlan({
      jdText: sophosJD,
      roleTitle: 'Software Engineer - DevOps / Cloud Platform',
      companyName: 'Sophos',
      competencyService,
    });
    const roleRound = plan.rounds.find((round) => round.roundType === 'role_specific');

    expect(plan.seniority).toBe('Junior');
    expect(plan.rounds.map((round) => round.roundType)).toContain('system_design');
    expect(roleRound).toBeDefined();
    expect(roleRound?.recommendedQuestions).toHaveLength(3);
    expect(roleRound?.title).toContain('Platform Engineering');
    expect(roleRound?.recommendedQuestions.map((question) => question.curriculumTopicId)).toEqual([
      'se_api_design',
      'cs_testing_debugging',
      'se_scalability',
    ]);
    expect(roleRound?.recommendedQuestions[1].prompt).toContain('Terraform');
    expect(roleRound?.recommendedQuestions[2].prompt).toContain('Kubernetes');
  });

  it('does not classify JavaScript as Java in the JD skill map', () => {
    const analysis = JDInterviewMapper.analyzeJD(
      'Build browser interfaces with JavaScript and TypeScript.',
      competencyService
    );
    expect(analysis.extractedTechStack).not.toContain('java');
  });

  it('generates curriculum interview plan via CompanyPlanGenerator extension', () => {
    const plan = CompanyPlanGenerator.generateCurriculumInterviewPlan(
      'Uber',
      'Senior Distributed Systems Engineer',
      sampleSeniorJD
    );

    expect(plan.seniority).toBe('Senior');
    expect(plan.rounds.length).toBeGreaterThanOrEqual(3);
    expect(plan.companyName).toBe('Uber');
  });
});

