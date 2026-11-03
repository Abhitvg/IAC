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
