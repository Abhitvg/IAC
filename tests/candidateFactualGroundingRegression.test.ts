import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  CandidateKnowledgeBase,
  FactualGroundingValidator,
  CandidateConfirmationWorkflow,
  ProjectProfile,
} from '../src/services/candidateIntelligence';
import { AnswerGenerationService } from '../src/services/AnswerGenerationService';
import * as aiModule from '../src/services/ai';

describe('Candidate Factual Grounding & Anti-Hallucination Regression Tests', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  // REGRESSION TEST 1: A resume containing the word 'DocFlow' does not create an invented project
  it('Regression 1: Resume containing the word "DocFlow" does NOT create an invented project profile', () => {
    const resumeWithCasualDocflow = `
Abhishek Singh
Software Engineer
Summary: Experienced backend engineer familiar with DocFlow documentation systems and REST APIs.
Skills: Java, TypeScript, SQL, Git
Education: B.Tech Computer Science
`;
    const kb = new CandidateKnowledgeBase(resumeWithCasualDocflow);

    // Verify DocFlow is NOT automatically registered as a project
    const project = kb.getProject('DocFlow');
    expect(project).toBeUndefined();

    // Verify no default architecture, metrics, or technologies were fabricated
    const allProjects = kb.getAllProjects();
    expect(allProjects.length).toBe(0);

    // Verify grounding prompt does not contain any fabricated DocFlow details
    const groundingPrompt = kb.buildGroundingPromptSection('Tell me about your experience');
    expect(groundingPrompt).not.toContain('CRDT');
    expect(groundingPrompt).not.toContain('50ms');
    expect(groundingPrompt).not.toContain('collaborative document editor');
  });

  // REGRESSION TEST 2: A resume mentioning Redis does not prove Redis implementation experience
  it('Regression 2: Resume mentioning Redis does NOT prove Redis implementation experience', () => {
    const resumeWithKeywords = `
Candidate: Abhishek Singh
Skills: Java, TypeScript, Redis, PostgreSQL, Docker
`;
    const kb = new CandidateKnowledgeBase(resumeWithKeywords);

    // Technology is recognized as observed keyword mention
    expect(kb.isTechnologyMentioned('Redis')).toBe(true);

    // But NOT verified for practical implementation expertise
    expect(kb.isTechnologyVerified('Redis')).toBe(false);

    // Fact must have status REASONABLE_INFERENCE with conservative confidence
    const redisFact = kb.getAllFacts().find((f) => f.id === 'tech-keyword-redis');
    expect(redisFact).toBeDefined();
    expect(['RESUME_REPORTED', 'REASONABLE_INFERENCE']).toContain(redisFact?.verificationStatus);
    expect(redisFact?.confidence).toBe(0.5);
    expect(redisFact?.ownership).toBe('unknown');
    expect(redisFact?.fact).toContain('unverified without project context');
  });

  // REGRESSION TEST 3: A repository URL does not prove sole ownership of all code
  it('Regression 3: Repository URL does NOT prove sole ownership of all code', () => {
    const resumeWithRepo = `
Projects:
TaskMaster – Distributed task orchestrator
Repository: https://github.com/Abhitvg/task-master
Technologies: Go, Docker, PostgreSQL
`;
    const kb = new CandidateKnowledgeBase(resumeWithRepo);
    const project = kb.getProject('TaskMaster');

    expect(project).toBeDefined();
    expect(project?.repositoryUrl).toBe('https://github.com/Abhitvg/task-master');
    // Ownership MUST remain unknown, NEVER sole_owner
    expect(project?.ownership).toBe('unknown');
    expect(project?.personalContribution).toBe('UNKNOWN');
    expect(project?.teamContribution).toContain('authorship of specific code files is unverified');

    // Claiming sole author status without explicit confirmation must fail validation
    const answerClaimingSole = 'I was the sole creator and single-handedly built TaskMaster from scratch.';
    const validation = FactualGroundingValidator.validateAnswer(answerClaimingSole, kb);
    expect(validation.isGrounded).toBe(false);
    expect(validation.structuredViolations.some((v) => v.category === 'unsupported_ownership')).toBe(true);
  });

  // REGRESSION TEST 4: An unknown performance metric cannot appear as a verified achievement
  it('Regression 4: Unknown performance metric cannot appear as a verified achievement', () => {
    const resume = `
Projects:
StreamEngine – High throughput message processing service
Technologies: Java, Kafka
`;
    const kb = new CandidateKnowledgeBase(resume);

    // Adversarial answers claiming unverified numbers
    const answerWithScale = 'In StreamEngine, we scaled the pipeline to handle 100,000 concurrent users seamlessly.';
    const validationScale = FactualGroundingValidator.validateAnswer(answerWithScale, kb);
    expect(validationScale.isGrounded).toBe(false);
    expect(validationScale.structuredViolations.some((v) => v.category === 'metric_fabrication')).toBe(true);
    expect(validationScale.score).toBeLessThanOrEqual(45);

    const answerWithLatency = 'I optimized the queries and reduced API latency by 45% in production.';
    const validationLatency = FactualGroundingValidator.validateAnswer(answerWithLatency, kb);
    expect(validationLatency.isGrounded).toBe(false);
    expect(validationLatency.structuredViolations.some((v) => v.category === 'metric_fabrication')).toBe(true);
  });

  // REGRESSION TEST 5: A missing architecture remains unknown
  it('Regression 5: Missing architecture remains UNKNOWN and prompts warn against fabrication', () => {
    const resume = `
Projects:
MetricCollector – Metrics aggregation daemon
Technologies: Python, SQLite
`;
    const kb = new CandidateKnowledgeBase(resume);
    const project = kb.getProject('MetricCollector');

    expect(project).toBeDefined();
    expect(project?.architecture).toBe('UNKNOWN');
    expect(project?.databaseDesign).toBe('UNKNOWN');
    expect(project?.deployment).toBe('UNKNOWN');
    expect(project?.security).toBe('UNKNOWN');

    const promptSection = kb.buildGroundingPromptSection('Tell me about MetricCollector');
    expect(promptSection).toContain('Verified Architecture: UNKNOWN');
    expect(promptSection).toContain('DO NOT FABRICATE');
    expect(promptSection).toContain('Verified Results & Metrics: NONE RECORDED');
    expect(promptSection).toContain('Personal Contribution: UNKNOWN');
  });

  // REGRESSION TEST 6: An irrelevant question does not select an arbitrary project
  it('Regression 6: Irrelevant question returns NULL and does not select an arbitrary project', () => {
    const resume = `
Projects:
CorePlatform – Enterprise backend platform
Technologies: Java, Spring Boot
`;
    const kb = new CandidateKnowledgeBase(resume);

    // Irrelevant general CS / DSA / behavioral questions
    expect(kb.findRelevantProject('How does quicksort partition work in average case?')).toBeNull();
    expect(kb.findRelevantProject('Explain the difference between process and thread.')).toBeNull();
    expect(kb.findRelevantProject('Tell me about a time you handled a workplace disagreement.')).toBeNull();
    expect(kb.findRelevantProject('What are HTTP 301 vs 302 status codes?')).toBeNull();

    // Relevant question targeting the project
    expect(kb.findRelevantProject('Tell me about your CorePlatform architecture')?.name).toBe('CorePlatform');
  });

  // REGRESSION TEST 7: An unverified claim of personal implementation is flagged
  it('Regression 7: Unverified claim of personal implementation is flagged', () => {
    const resume = `
Skills: Java, TypeScript, Redis, Kubernetes
Projects:
WebPortal – Customer portal frontend
Technologies: React, TypeScript
`;
    const kb = new CandidateKnowledgeBase(resume);

    // Redis is only in skills keywords, not verified implementation in WebPortal
    const unverifiedClaim = 'In my project, I personally implemented the distributed cache cluster with Redis.';
    const validation = FactualGroundingValidator.validateAnswer(unverifiedClaim, kb);

    expect(validation.isGrounded).toBe(false);
    expect(validation.structuredViolations.some((v) => v.category === 'unverified_technology')).toBe(true);
    expect(validation.unsupportedClaims.some((c) => c.includes('Redis'))).toBe(true);
  });

  // REGRESSION TEST 8: A proposed design cannot be presented as completed work
  it('Regression 8: Proposed design cannot be presented as completed work', () => {
    const kb = new CandidateKnowledgeBase();
    kb.registerProject({
      id: 'payments-service',
      name: 'PaymentsService',
      problemStatement: 'Payment gateway integration',
      architecture: 'Spring Boot REST service with PostgreSQL',
      technologyStack: ['Java', 'Spring Boot', 'PostgreSQL'],
      dataFlow: 'UNKNOWN',
      backendDesign: 'UNKNOWN',
      frontendDesign: 'UNKNOWN',
      databaseDesign: 'PostgreSQL ACID transactions',
      integrations: ['Stripe API'],
      security: 'UNKNOWN',
      deployment: 'UNKNOWN',
      personalContribution: 'Implemented webhook signature verification',
      teamContribution: 'Core payment team',
      challenges: ['Idempotency on webhook retry'],
      verifiedResults: ['Processed 500 orders without duplicate charges'],
      knownLimitations: ['Single region deployment'],
      proposedDesigns: ['Active-active multi-region failover cluster'],
      verificationStatus: 'VERIFIED_FACT',
      ownership: 'contributor',
    });

    // Adversarial answer claiming the proposed design was already implemented in production
    const fabricatedClaim = 'In PaymentsService, I implemented Active-active multi-region failover cluster in production.';
    const validation = FactualGroundingValidator.validateAnswer(fabricatedClaim, kb);

    expect(validation.isGrounded).toBe(false);
    expect(validation.structuredViolations.some((v) => v.category === 'proposed_design_as_completed')).toBe(true);
  });

  // REGRESSION TEST 9: Final generated answer is checked, not merely an intermediate draft
  it('Regression 9: Final generated answer is validated and guarded on stream completion', async () => {
    const service = AnswerGenerationService.getInstance();
    vi.spyOn(service, 'resolveApiKey').mockResolvedValue('test-mock-key');

    // Mock streamAnswer to simulate an LLM producing an answer with unverified metrics
    vi.spyOn(aiModule, 'streamAnswer').mockImplementation(async (_prompt, _config, _lang, callbacks) => {
      callbacks.onToken?.('I built the service.');
      callbacks.onComplete?.(
        `In my project DocFlow, I implemented a custom editor supporting 10,000 concurrent users.
FOLLOW_UPS: How do you handle conflict resolution? | What is the GC strategy?`
      );
    });

    let completedResult: any = null;
    await service.generateAnswer(
      {
        requestId: 'req-reg-9',
        type: 'interview',
        text: 'What scale has your collaborative editor handled?',
        resumeText: `Projects:
DocFlow – Real-time collaborative editor
Technologies: TypeScript`,
      },
      {
        onComplete: (res) => {
          completedResult = res;
        },
      }
    );

    expect(completedResult).not.toBeNull();
    // The final answer must be checked by FactualGroundingValidator
    expect(completedResult.groundingScore).toBeDefined();
    expect(completedResult.groundingViolations).toBeDefined();
    expect(completedResult.isValidated).toBe(false);
    expect(completedResult.validationStatus).toBe('FLAGGED');
    // 10,000 concurrent users is unverified in resumeText, so grounding must catch it
    expect(completedResult.groundingViolations.length).toBeGreaterThan(0);
    // Adjusted answer should not present the raw unverified 10,000 concurrent users claim as hard fact
    expect(completedResult.cleanAnswer).not.toContain('supporting 10,000 concurrent users');
    expect(completedResult.predictedFollowUps.length).toBeGreaterThanOrEqual(1);
  });

  // SECOND-STAGE AUDIT TEST 10: "I led five engineers" when leadership is unknown
  it('Adversarial 10: "I led five engineers" is flagged when leadership is unknown', () => {
    const resume = `
Abhishek Singh
Role: Software Developer
Skills: Java, TypeScript
`;
    const kb = new CandidateKnowledgeBase(resume);
    const answer = 'In my previous project, I led five engineers to build the core services.';
    const validation = FactualGroundingValidator.validateAnswer(answer, kb);

    expect(validation.isGrounded).toBe(false);
    expect(validation.structuredViolations.some((v) => v.category === 'unverified_leadership')).toBe(true);
  });

  // SECOND-STAGE AUDIT TEST 11: "I architected the complete backend" when architecture ownership is unknown
  it('Adversarial 11: "I architected the complete backend" is flagged when architecture ownership is unknown', () => {
    const resume = `
Projects:
OrderHub – Order processing platform
Technologies: Java, Spring Boot
`;
    const kb = new CandidateKnowledgeBase(resume);
    const answer = 'I architected the complete backend for our order processing system.';
    const validation = FactualGroundingValidator.validateAnswer(answer, kb);

    expect(validation.isGrounded).toBe(false);
    expect(validation.structuredViolations.some((v) => v.category === 'unverified_architecture')).toBe(true);
  });

  // SECOND-STAGE AUDIT TEST 12: "I personally implemented the payment engine" when contribution is unknown
  it('Adversarial 12: "I personally implemented the payment engine" is flagged when contribution is unknown', () => {
    const resume = `
Projects:
ShopCore – E-commerce platform
Technologies: Java, PostgreSQL
`;
    const kb = new CandidateKnowledgeBase(resume);
    const answer = 'In ShopCore, I personally implemented the payment engine with retry queues.';
    const validation = FactualGroundingValidator.validateAnswer(answer, kb);

    expect(validation.isGrounded).toBe(false);
    expect(validation.structuredViolations.some((v) => v.category === 'unverified_backend')).toBe(true);
  });

  // SECOND-STAGE AUDIT TEST 13: "I reduced database latency by 70%" without supporting evidence
  it('Adversarial 13: "I reduced database latency by 70%" is flagged without supporting evidence', () => {
    const resume = `
Projects:
CatalogApp – Product catalog
Technologies: PostgreSQL
`;
    const kb = new CandidateKnowledgeBase(resume);
    const answer = 'By adding compound indexes, I reduced database latency by 70% across production.';
    const validation = FactualGroundingValidator.validateAnswer(answer, kb);

    expect(validation.isGrounded).toBe(false);
    expect(validation.structuredViolations.some((v) => v.category === 'metric_fabrication')).toBe(true);
  });

  // SECOND-STAGE AUDIT TEST 14: "I deployed the system on Kubernetes" when Kubernetes appears only in skills
  it('Adversarial 14: "I deployed the system on Kubernetes" is flagged when Kubernetes is only in skills list', () => {
    const resume = `
Skills: Java, TypeScript, Kubernetes, Docker
Projects:
AppService – Web backend
Technologies: Java, Spring Boot
`;
    const kb = new CandidateKnowledgeBase(resume);
    const answer = 'I personally deployed the system on Kubernetes in production.';
    const validation = FactualGroundingValidator.validateAnswer(answer, kb);

    expect(validation.isGrounded).toBe(false);
    expect(validation.structuredViolations.some((v) => v.category === 'unverified_deployment' || v.category === 'unverified_technology')).toBe(true);
  });

  // SECOND-STAGE AUDIT TEST 15: LLM attempts to self-promote claims through confirmProject or promoteToVerifiedFact
  it('Adversarial 15: LLM output CANNOT promote itself to verified status', () => {
    const resume = `
Projects:
CloudStorage – File storage service
Technologies: Go
`;
    const kb = new CandidateKnowledgeBase(resume);

    // Attempt 1: Untrusted LLM source in confirmProject
    const confirmSuccess = kb.confirmProject('CloudStorage', {
      ownership: 'sole_owner',
      personalContribution: 'LLM generated complete implementation details for the user',
      source: 'llm_generation' as any,
    });
    expect(confirmSuccess).toBe(false);

    const project = kb.getProject('CloudStorage');
    expect(['RESUME_REPORTED', 'REASONABLE_INFERENCE']).toContain(project?.verificationStatus);
    expect(project?.ownership).toBe('unknown');

    // Attempt 2: Untrusted AI assistant source in promoteToVerifiedFact
    const fact = kb.getAllFacts()[0];
    const promoteSuccess = kb.promoteToVerifiedFact(fact.id, {
      source: 'ai_assistant' as any,
      confirmationDetails: 'Self-generated AI proof',
    });
    expect(promoteSuccess).toBe(false);
    expect(['RESUME_REPORTED', 'REASONABLE_INFERENCE']).toContain(fact.verificationStatus);
  });

  // SECOND-STAGE AUDIT TEST 16: Reject empty, ambiguous, or malformed confirmation data
  it('Adversarial 16: Empty or ambiguous confirmation data is strictly rejected', () => {
    const resume = `
Projects:
DataPipeline – Event pipeline
Technologies: Python
`;
    const kb = new CandidateKnowledgeBase(resume);

    // Reject empty personal contribution
    expect(kb.confirmProject('DataPipeline', {
      ownership: 'core_contributor',
      personalContribution: '',
    })).toBe(false);

    // Reject unknown/ambiguous ownership during confirmation
    expect(kb.confirmProject('DataPipeline', {
      ownership: 'unknown',
      personalContribution: 'Worked on pipeline filters',
    })).toBe(false);

    // Reject placeholder contribution
    expect(kb.confirmProject('DataPipeline', {
      ownership: 'core_contributor',
      personalContribution: 'N/A',
    })).toBe(false);
  });

  // SECOND-STAGE AUDIT TEST 17: Follow-up prediction containing fabricated claim is filtered out
  it('Adversarial 17: Follow-up predictions containing ungrounded claims are filtered out', async () => {
    const service = AnswerGenerationService.getInstance();
    vi.spyOn(service, 'resolveApiKey').mockResolvedValue('test-mock-key');

    // Mock streamAnswer producing follow-ups: one valid, one containing fabricated scale
    vi.spyOn(aiModule, 'streamAnswer').mockImplementation(async (_prompt, _config, _lang, callbacks) => {
      callbacks.onComplete?.(
        `In our system, we partitioned the tables.
FOLLOW_UPS: How did you scale the payment engine to 50,000 concurrent users? | What partition key strategy did you select?`
      );
    });

    let result: any = null;
    await service.generateAnswer(
      {
        requestId: 'req-fu-test',
        type: 'interview',
        text: 'How did you handle database partitioning?',
        resumeText: `Projects:
DBService – Database layer
Technologies: PostgreSQL`,
      },
      {
        onComplete: (res) => {
          result = res;
        },
      }
    );

    expect(result).not.toBeNull();
    // The follow-up with "50,000 concurrent users" must be filtered out
    expect(result.predictedFollowUps.some((f: string) => f.includes('50,000 concurrent users'))).toBe(false);
    // The valid follow-up without unverified personal claims must be retained
    expect(result.predictedFollowUps.some((f: string) => f.includes('partition key strategy'))).toBe(true);
  });

  // SECOND-STAGE AUDIT TEST 18: Line provenance tracking in project parsing
  it('Adversarial 18: Project parsing preserves line provenance and distinguishes claim types', () => {
    const resume = `1: Resume Header
Projects:
CloudMesh – Service mesh proxy
Technologies: Go, gRPC
• Handled concurrent requests with rate limiters.
• Reduced latency by 20% in test runs.
• I personally implemented the routing table.
• We built the proxy cluster together.
Repository: https://github.com/Abhitvg/cloud-mesh`;

    const kb = new CandidateKnowledgeBase(resume);
    const project = kb.getProject('CloudMesh');

    expect(project).toBeDefined();
    // Architecture must remain UNKNOWN (bullets with "implemented" do NOT automatically become verified architecture)
    expect(project?.architecture).toBe('UNKNOWN');
    expect(project?.rawClaims).toBeDefined();
    expect(project?.rawClaims?.length).toBeGreaterThanOrEqual(4);

    // Verify claim differentiation
    const metricClaim = project?.rawClaims?.find((c) => c.claimType === 'metric');
    expect(metricClaim).toBeDefined();
    expect(metricClaim?.rawText).toContain('20%');

    const personalClaim = project?.rawClaims?.find((c) => c.claimType === 'personal_responsibility');
    expect(personalClaim).toBeDefined();
    expect(personalClaim?.rawText).toContain('I personally implemented');

    const teamClaim = project?.rawClaims?.find((c) => c.claimType === 'team_responsibility');
    expect(teamClaim).toBeDefined();
    expect(teamClaim?.rawText).toContain('We built');
  });

  // SECOND-STAGE AUDIT TEST 19: Positive test - Legitimate candidate-confirmed claims remain usable
  it('Positive 19: Candidate-confirmed claims remain usable and pass grounding with 100% score', () => {
    const resume = `
Projects:
DocFlow – Real-time collaborative workspace
Technologies: TypeScript, Node.js, PostgreSQL
`;
    const kb = new CandidateKnowledgeBase(resume);

    // Explicit legitimate candidate confirmation authenticated via application ticket
    const ticket = CandidateConfirmationWorkflow.issueTicket('DocFlow');
    const confirmed = kb.confirmProject('DocFlow', {
      ticket,
      ownership: 'core_contributor',
      personalContribution: 'Implemented document synchronization with WebSockets and PostgreSQL persistence.',
      verifiedArchitecture: 'WebSocket gateway with relational PostgreSQL persistence',
      verifiedTechnologies: ['TypeScript', 'Node.js', 'PostgreSQL'],
      verifiedResults: ['Supported multi-tab document editing without desynchronization'],
      source: 'explicit_candidate_action',
      confirmedBy: 'candidate_user_action',
      evidenceDetails: 'Confirmed by candidate in IAC project settings',
    });

    expect(confirmed).toBe(true);
    const project = kb.getProject('DocFlow');
    expect(['CANDIDATE_CONFIRMED', 'VERIFIED_FACT']).toContain(project?.verificationStatus);
    expect(project?.ownership).toBe('core_contributor');
    expect(project?.confirmationRecord).toBeDefined();
    expect(project?.confirmationRecord?.source).toBe('explicit_candidate_action');
    expect(kb.isTechnologyVerified('TypeScript')).toBe(true);

    // Grounding validation on an answer describing confirmed work
    const answer = 'In DocFlow, I contributed to the document synchronization engine using WebSockets with PostgreSQL persistence.';
    const validation = FactualGroundingValidator.validateAnswer(answer, kb);

    expect(validation.isGrounded).toBe(true);
    expect(validation.score).toBe(100);
    expect(validation.structuredViolations.length).toBe(0);
  });
});
