import { describe, it, expect } from 'vitest';
import {
  CandidateKnowledgeBase,
  FactualGroundingValidator,
  CandidateConfirmationWorkflow,
  ProjectProfile,
  isCandidateOrIndependentlyVerified,
} from '../src/services/candidateIntelligence';

describe('Candidate Integrity, Provenance Preservation & Anti-Hallucination Gate (Requirement 5)', () => {
  // 1. OCR output is never promoted into candidate-confirmed personal experience automatically
  it('Invariant 1: OCR output is strictly unverified and requires explicit human confirmation before promotion', () => {
    const rawOcrResumeText = `
CANDIDATE: Samantha Vance
ROLE: Lead Site Reliability Architect
SKILLS: Kubernetes, Prometheus, Terraform, Golang
EXPERIENCE: Designed multi-region failover architecture at Global Media Corp.
`;
    const kb = new CandidateKnowledgeBase(rawOcrResumeText);

    // Initial fact extraction from document / OCR
    const facts = kb.getAllFacts();
    expect(facts.length).toBeGreaterThan(0);

    for (const fact of facts) {
      // Must be unverified or self-reported
      expect(isCandidateOrIndependentlyVerified(fact.verificationStatus)).toBe(false);
      expect(['RESUME_REPORTED', 'REASONABLE_INFERENCE', 'UNKNOWN']).toContain(fact.verificationStatus);
    }

    // Attempting to treat raw OCR as confirmed experience must fail verification check
    expect(kb.isTechnologyVerified('Kubernetes')).toBe(false);
    expect(kb.isTechnologyVerified('Golang')).toBe(false);

    // In order to confirm, a cryptographic confirmation ticket must be issued and validated
    const ticket = CandidateConfirmationWorkflow.issueTicket('Samantha Vance', 'fact_confirmation');
    expect(ticket.ticketId).toBeTruthy();

    // Confirming without a valid ticket fails
    const invalidTicketResult = CandidateConfirmationWorkflow.validateAndConsume(
      null,
      'Samantha Vance',
      'fact_confirmation'
    );
    expect(invalidTicketResult).toBe(false);

    // Valid ticket validates exactly once
    const validTicketResult = CandidateConfirmationWorkflow.validateAndConsume(
      ticket,
      'Samantha Vance',
      'fact_confirmation'
    );
    expect(validTicketResult).toBe(true);

    // Replay attack with same ticket is strictly blocked
    const replayResult = CandidateConfirmationWorkflow.validateAndConsume(
      ticket,
      'Samantha Vance',
      'fact_confirmation'
    );
    expect(replayResult).toBe(false);
  });

  // 2. Resume claims retain their evidence provenance
  it('Invariant 2: Resume claims retain their evidence provenance without artificial promotion', () => {
    const resumeText = `
Candidate: Marcus Sterling
Project: PaymentGateway
Summary: Built a payment processing service handling transactions.
Skills: Java, PostgreSQL
`;
    const kb = new CandidateKnowledgeBase(resumeText);
    const facts = kb.getAllFacts();

    const techFacts = facts.filter((f) => f.category === 'technology');
    expect(techFacts.length).toBeGreaterThan(0);

    for (const tf of techFacts) {
      // Status must not be repository verified or independently proven
      expect(tf.verificationStatus).toBe('RESUME_REPORTED');
      expect(tf.verificationStatus).not.toBe('REPOSITORY_SUPPORTED');
      expect(tf.verificationStatus).not.toBe('INDEPENDENTLY_VERIFIED');
      expect(isCandidateOrIndependentlyVerified(tf.verificationStatus)).toBe(false);
    }
  });

  // 3. OCR uncertainty does not become a factual candidate claim
  it('Invariant 3: OCR uncertainty and partial mentions do not produce high-confidence factual claims', () => {
    const uncertainOcrText = `
Candidate: Alex Doe
Skills: Java, Py... (unclear scan)
Experience: Contributed to ... distributed sys... throughput approx 4...
`;
    const kb = new CandidateKnowledgeBase(uncertainOcrText);

    // No phantom metric or full technology is hallucinated from truncated OCR tokens
    const facts = kb.getAllFacts();
    const metricFacts = facts.filter((f) => f.category === 'metric');
    expect(metricFacts.length).toBe(0);

    // Any inferred fact has low bounded confidence (<= 0.6)
    for (const f of facts) {
      expect(f.confidence).toBeLessThanOrEqual(0.6);
    }
  });

  // 4. Missing evidence remains UNKNOWN
  it('Invariant 4: Missing evidence remains strictly UNKNOWN across all architecture and ownership fields', () => {
    const sparseProject: ProjectProfile = {
      name: 'EventRelay',
      technologies: ['Kafka'],
      architecture: 'UNKNOWN',
      dataFlow: 'UNKNOWN',
      backendDesign: 'UNKNOWN',
      frontendDesign: 'UNKNOWN',
      databaseDesign: 'UNKNOWN',
      security: 'UNKNOWN',
      deployment: 'UNKNOWN',
      personalContribution: 'UNKNOWN',
      teamContribution: 'UNKNOWN',
      verificationStatus: 'UNKNOWN',
      challenges: [],
      outcomes: [],
      metrics: [],
    };

    const kb = new CandidateKnowledgeBase('');
    kb.registerProject(sparseProject);

    const retrieved = kb.getProject('EventRelay');
    expect(retrieved).toBeDefined();
    expect(retrieved?.personalContribution).toBe('UNKNOWN');
    expect(retrieved?.teamContribution).toBe('UNKNOWN');
    expect(retrieved?.architecture).toBe('UNKNOWN');
    expect(retrieved?.security).toBe('UNKNOWN');
    expect(retrieved?.deployment).toBe('UNKNOWN');
    expect(retrieved?.databaseDesign).toBe('UNKNOWN');

    // Grounding prompt must explicitly denote unknown fields and forbid inventing details
    const groundingSection = kb.buildGroundingPromptSection('How did you deploy EventRelay?');
    expect(groundingSection).toContain('UNKNOWN');
    expect(groundingSection).toContain('NEVER invent architecture or metrics');
    expect(groundingSection).toContain('ZERO INVENTED CLAIMS');
  });

  // 5. Proposed designs remain PROPOSED_DESIGN
  it('Invariant 5: Proposed system designs remain PROPOSED_DESIGN and are not confused with past achievements', () => {
    const hypotheticalDesign: ProjectProfile = {
      name: 'GlobalTelemetryAggregator',
      technologies: ['ClickHouse', 'Vector'],
      architecture: 'Multi-tiered time-series aggregation tree',
      dataFlow: 'Edge collectors -> Vector -> ClickHouse cluster',
      backendDesign: 'Golang microservices',
      frontendDesign: 'UNKNOWN',
      databaseDesign: 'Partitioned ClickHouse merge-tree engine',
      security: 'mTLS between agents',
      deployment: 'Kubernetes daemonset',
      personalContribution: 'Proposed architecture for hypothetical scalability challenge',
      teamContribution: 'UNKNOWN',
      verificationStatus: 'PROPOSED_DESIGN',
      challenges: ['High ingestion write lock contention'],
      outcomes: [],
      metrics: [],
    };

    const kb = new CandidateKnowledgeBase('');
    kb.registerProject(hypotheticalDesign);

    // Initial registration forces unverified status
    const project = kb.getProject('GlobalTelemetryAggregator');
    expect(project).toBeDefined();
    expect(isCandidateOrIndependentlyVerified(project?.verificationStatus)).toBe(false);

    // Validator rejects claiming personal production ownership over a proposed or unverified design
    const dishonestAnswer = 'In my previous company, I built and deployed the GlobalTelemetryAggregator in production with 100,000 concurrent users.';
    const validation = FactualGroundingValidator.validateAnswer(
      dishonestAnswer,
      kb,
      'Tell me about GlobalTelemetryAggregator'
    );

    expect(validation.isGrounded).toBe(false);
    expect(validation.unsupportedClaims.length).toBeGreaterThan(0);
    expect(validation.validationStatus).not.toBe('VALIDATED');
  });

  // 6. The answer generator cannot convert a technical explanation into a claim that the candidate personally implemented it
  it('Invariant 6: Technical explanations of concepts are permitted, but personal implementation claims without evidence fail validation', () => {
    // Candidate knows basic backend engineering, but has NO evidence of implementing Raft consensus in production
    const resume = `
Candidate: Jordan Lee
Role: Backend Engineer
Skills: Python, Django, REST APIs, PostgreSQL
`;
    const kb = new CandidateKnowledgeBase(resume);

    // Case A: Pure technical concept explanation -> VALID (Explaining technical theory is fully allowed)
    const conceptualAnswer = `
Raft is a consensus algorithm designed for understandability. It organizes state machine replication through an elected leader.
The leader accepts log entries from clients, replicates them across follower nodes, and commits them once a majority have acknowledged.
If the leader heartbeat times out, followers initiate a new election with randomized election timeouts.
`;
    const conceptualResult = FactualGroundingValidator.validateAnswer(
      conceptualAnswer,
      kb,
      'How does Raft consensus work?'
    );
    // Conceptual explanations do not make unsupported personal experience claims
    expect(conceptualResult.isGrounded).toBe(true);
    expect(conceptualResult.validationStatus).toBe('VALIDATED');

    // Case B: Answer falsely claiming the candidate personally authored/implemented Raft in production -> INVALID & REJECTED
    const fabricatedClaimAnswer = `
When I scaled our core backend, I built and deployed a Raft consensus cluster in production handling 100,000 concurrent requests.
`;
    const fabricatedResult = FactualGroundingValidator.validateAnswer(
      fabricatedClaimAnswer,
      kb,
      'How does Raft consensus work?'
    );
    expect(fabricatedResult.isGrounded).toBe(false);
    expect(fabricatedResult.validationStatus).not.toBe('VALIDATED');
    expect(
      fabricatedResult.unsupportedClaims.some(
        (c) =>
          c.toLowerCase().includes('100,000') ||
          c.toLowerCase().includes('concurrent') ||
          c.toLowerCase().includes('requests')
      )
    ).toBe(true);
  });
});
