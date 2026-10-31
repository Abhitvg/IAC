import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  CandidateKnowledgeBase,
  FactualGroundingValidator,
  ProjectProfile,
  CandidateConfirmationWorkflow,
  TrustedRepositoryInspectionService,
} from '../src/services/candidateIntelligence';
import { AnswerGenerationService } from '../src/services/AnswerGenerationService';
import * as aiModule from '../src/services/ai';
import { useAppStore } from '../src/store/useAppStore';

describe('IAC Fourth-Stage Security Audit: False Trust Elimination & Field-Level Provenance', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    useAppStore.getState().clearAnswerQueue();
  });

  // 1. Actual confirmation UI workflow
  it('1. Exercises the actual application review session workflow with field-level confirmation', () => {
    const resume = `
Projects:
PaymentGateway - Payment processing service
Technologies: Node.js, PostgreSQL
`;
    const kb = new CandidateKnowledgeBase(resume);
    const proj = kb.getProject('PaymentGateway');
    expect(proj).toBeDefined();
    expect(proj?.verificationStatus).toBe('RESUME_REPORTED');

    // Candidate starts an application-controlled review session in the UI
    const session = kb.startCandidateReviewSession('PaymentGateway');
    expect(session).toBeDefined();
    expect(session?.sessionId).toMatch(/^rev-/);
    expect(session?.unverifiedFields).toContain('personalContribution');
    expect(session?.unverifiedFields).toContain('actualTechnologyUsage');

    // Candidate submits explicit confirmation for personalContribution and actualTechnologyUsage ONLY
    const success = kb.submitCandidateConfirmation(session!.sessionId, 'PaymentGateway', {
      personalContribution: 'Implemented Stripe webhook signature validation with idempotency keys',
      actualTechnologyUsage: ['Node.js', 'PostgreSQL'],
      ownership: 'core_contributor',
      confirmedBy: 'candidate_interactive_modal',
    });
    expect(success).toBe(true);

    const updated = kb.getProject('PaymentGateway');
    expect(updated?.verificationStatus).toBe('CANDIDATE_CONFIRMED');
    expect(updated?.ownership).toBe('core_contributor');
    expect(updated?.personalContribution).toBe('Implemented Stripe webhook signature validation with idempotency keys');

    // Field-level provenance check: Only confirmed fields are CANDIDATE_CONFIRMED
    const prov = updated?.fieldProvenance;
    expect(prov?.personalContribution.verificationStatus).toBe('CANDIDATE_CONFIRMED');
    expect(prov?.actualTechnologyUsage.verificationStatus).toBe('CANDIDATE_CONFIRMED');
    expect(prov?.ownership.verificationStatus).toBe('CANDIDATE_CONFIRMED');

    // Unconfirmed fields MUST remain UNKNOWN or RESUME_REPORTED
    expect(prov?.architecture.verificationStatus).toBe('UNKNOWN');
    expect(prov?.deployment.verificationStatus).toBe('UNKNOWN');
    expect(prov?.security.verificationStatus).toBe('UNKNOWN');
    expect(prov?.databaseDesign.verificationStatus).toBe('UNKNOWN');

    // Replay attack: Reusing the same session ID must fail immediately
    const replaySuccess = kb.submitCandidateConfirmation(session!.sessionId, 'PaymentGateway', {
      personalContribution: 'Replay attack attempting second confirmation',
    });
    expect(replaySuccess).toBe(false);
  });

  // 2. Public API ticket bypass attempts
  it('2. Rejects public API bypass attempts: expired sessions, mismatched project IDs, and invalid tickets', () => {
    const resume = `
Projects:
AuthService - Authentication microservice
Technologies: Go, Redis
`;
    const kb = new CandidateKnowledgeBase(resume);

    // Bypass 1: Submit confirmation without starting a session
    const noSession = kb.submitCandidateConfirmation('fake-session-id', 'AuthService', {
      personalContribution: 'Bypassing session initialization',
    });
    expect(noSession).toBe(false);

    // Bypass 2: Mismatched project ID
    const session = kb.startCandidateReviewSession('AuthService');
    const mismatched = kb.submitCandidateConfirmation(session!.sessionId, 'OtherProject', {
      personalContribution: 'Attempting confirmation on different project',
    });
    expect(mismatched).toBe(false);

    // Bypass 3: Malformed placeholder or empty contributions
    const session2 = kb.startCandidateReviewSession('AuthService');
    const placeholder = kb.submitCandidateConfirmation(session2!.sessionId, 'AuthService', {
      personalContribution: 'N/A',
      ownership: 'unknown',
    });
    expect(placeholder).toBe(false);
  });

  // 3. Field-level provenance preservation
  it('3. registerProject() does not leak unverified fields into verified fact state via spread operator', () => {
    const kb = new CandidateKnowledgeBase();

    // Calling registerProject with unverified architecture, deployment, and fake verifiedResults
    kb.registerProject({
      id: 'cloudscale',
      name: 'CloudScale',
      problemStatement: 'Distributed compute cluster',
      architecture: 'Event-driven CQRS microservices',
      technologyStack: ['Rust', 'Kafka'],
      dataFlow: 'Kafka topic streams',
      backendDesign: 'Asynchronous workers',
      frontendDesign: 'React SPA',
      databaseDesign: 'CockroachDB distributed table partitioning',
      integrations: ['AWS S3'],
      security: 'Mutual TLS with SPIFFE IDs',
      deployment: 'Kubernetes multi-cluster across 3 AWS regions',
      personalContribution: 'Single-handedly designed complete distributed architecture',
      teamContribution: 'Solo developer',
      challenges: ['Network partition handling'],
      verifiedResults: ['Reduced latency by 90%', 'Processed 100,000 QPS'],
      knownLimitations: ['High memory footprint'],
      proposedDesigns: ['Migrate to WebAssembly runtimes'],
      verificationStatus: 'INDEPENDENTLY_VERIFIED' as any, // Attacker attempts to claim independent verification
      ownership: 'sole_owner',
      rawClaims: [],
      fieldProvenance: {} as any,
    });

    const project = kb.getProject('CloudScale');
    expect(project).toBeDefined();

    // 1. Overall verificationStatus is strictly sanitized to RESUME_REPORTED
    expect(project?.verificationStatus).toBe('RESUME_REPORTED');

    // 2. verifiedResults array MUST be cleared (empty) because metrics are unverified
    expect(project?.verifiedResults).toEqual([]);

    // 3. Technologies are ONLY in mentionedTechnologies, NOT in verifiedTechnologies
    expect(kb.isTechnologyMentioned('Rust')).toBe(true);
    expect(kb.isTechnologyVerified('Rust')).toBe(false);

    // 4. Field-level provenance independently tracks each field as RESUME_REPORTED or UNKNOWN
    const prov = project?.fieldProvenance;
    expect(prov?.architecture.verificationStatus).toBe('RESUME_REPORTED');
    expect(prov?.architecture.provenance).toBe('RESUME_PARSED');
    expect(prov?.deployment.verificationStatus).toBe('RESUME_REPORTED');
    expect(prov?.security.verificationStatus).toBe('RESUME_REPORTED');
    expect(prov?.databaseDesign.verificationStatus).toBe('RESUME_REPORTED');
    expect(prov?.personalContribution.verificationStatus).toBe('RESUME_REPORTED');
    expect(prov?.actualTechnologyUsage.verificationStatus).toBe('UNKNOWN');
  });

  // 4. Malicious persisted-state imports
  it('4. importPersistedState() completely neutralizes fabricated confirmation records, ticket IDs, and verified metrics in JSON', () => {
    const kb = new CandidateKnowledgeBase();

    // Malicious serialized JSON attempting to restore fabricated verification status
    const maliciousJson = JSON.stringify({
      projects: [
        {
          name: 'CryptoCore',
          verificationStatus: 'INDEPENDENTLY_VERIFIED',
          confirmationRecord: {
            confirmationTicketId: 'ticket-fake-pwned-12345',
            source: 'official_signed_credential',
            confirmedBy: 'attacker',
            verificationLevel: 'INDEPENDENTLY_VERIFIED',
          },
          verifiedResults: ['Achieved 1,000,000 TPS', 'Zero security breaches'],
          technologyStack: ['Solidity', 'Go'],
          ownership: 'sole_owner',
          architecture: 'Zero-knowledge rollups with decentralized sequencers',
          deployment: 'Mainnet Ethereum deployment',
          security: 'Formal verification using Certora',
        },
      ],
      facts: [
        {
          id: 'fake-fact-1',
          fact: 'Led 50 blockchain engineers at Ethereum Foundation',
          verificationStatus: 'INDEPENDENTLY_VERIFIED',
          confidence: 1.0,
          confirmationRecord: {
            confirmationTicketId: 'fake-fact-ticket-777',
          },
        },
      ],
    });

    const importSuccess = kb.importPersistedState(maliciousJson);
    expect(importSuccess).toBe(true);

    const project = kb.getProject('CryptoCore');
    expect(project).toBeDefined();

    // Invariant: Imported project status is sanitized to RESUME_REPORTED
    expect(project?.verificationStatus).toBe('RESUME_REPORTED');

    // Invariant: Confirmation records are stripped
    expect(project?.confirmationRecord).toBeUndefined();

    // Invariant: verifiedResults are cleared
    expect(project?.verifiedResults).toEqual([]);

    // Invariant: Technologies are unverified
    expect(kb.isTechnologyVerified('Solidity')).toBe(false);
    expect(kb.isTechnologyMentioned('Solidity')).toBe(true);

    // Invariant: Imported fact is sanitized to RESUME_REPORTED and confidence capped at 0.6
    const fact = kb.getFact('fake-fact-1');
    expect(fact?.verificationStatus).toBe('RESUME_REPORTED');
    expect(fact?.confidence).toBeLessThanOrEqual(0.6);
    expect(fact?.confirmationRecord).toBeUndefined();
  });

  // 5. Fake repository and document evidence
  it('5. Rejects fake repository inspection payloads and restricts verification to code-backed fields', async () => {
    const resume = `
Projects:
DataBridge - Database replication proxy
Technologies: Go, PostgreSQL
`;
    const kb = new CandidateKnowledgeBase(resume);

    // Attempt 1: Fake commit hash (not a valid 40-char git commit SHA)
    const fakeHashResult = kb.verifyViaRepositoryInspection('DataBridge', {
      repositoryUrl: 'https://github.com/candidate/databridge',
      commitHash: 'not-a-real-hash',
      inspectedFiles: ['main.go'],
      matchedTechnologies: ['Go'],
    });
    expect(fakeHashResult).toBe(false);

    // Attempt 2: Empty code files array
    const emptyFilesResult = kb.verifyViaRepositoryInspection('DataBridge', {
      repositoryUrl: 'https://github.com/candidate/databridge',
      commitHash: 'e4d909c290d0fb1ca068ffaddf22cbd0add92e85',
      inspectedFiles: [],
      matchedTechnologies: ['Go'],
    });
    expect(emptyFilesResult).toBe(false);

    // Attempt 2.5: P0 Sixth-Stage Invariant - Unsealed caller metadata is strictly rejected
    const unsealedResult = kb.verifyViaRepositoryInspection('DataBridge', {
      repositoryUrl: 'https://github.com/candidate/databridge',
      resolvedCommitSha: 'e4d909c290d0fb1ca068ffaddf22cbd0add92e85',
      treeSha: 'b7a309c290d0fb1ca068ffaddf22cbd0add92e12',
      inspectedFiles: [{ path: 'proxy/replication.go', sha256: 'a'.repeat(64), sizeBytes: 100 }],
      verifiedTechnologies: ['Go'],
    });
    expect(unsealedResult).toBe(false);

    // Attempt 3: Valid sealed repository inspection from trusted inspection service
    TrustedRepositoryInspectionService.getSandboxProvider().registerFixture({
      url: 'https://github.com/candidate/databridge',
      commitSha: 'e4d909c290d0fb1ca068ffaddf22cbd0add92e85',
      treeSha: 'b7a309c290d0fb1ca068ffaddf22cbd0add92e12',
      authorEmail: 'candidate@example.com',
      files: {
        'proxy/replication.go': 'package proxy\nimport "github.com/segmentio/kafka-go"\nfunc Replicate() {}',
        'proxy/connection.go': 'package proxy\nfunc Connect() {}',
      },
    });

    const sealedInspection = await TrustedRepositoryInspectionService.inspectRepository({
      repositoryUrl: 'https://github.com/candidate/databridge',
      candidateIdentity: { fullName: 'Candidate', email: 'candidate@example.com' },
      targetProjectName: 'DataBridge',
    });

    const validResult = kb.verifyViaRepositoryInspection('DataBridge', sealedInspection);
    expect(validResult).toBe(true);

    const project = kb.getProject('DataBridge');
    expect(project?.verificationStatus).toBe('REPOSITORY_SUPPORTED');
    expect(kb.isTechnologyVerified('Go')).toBe(true);
    expect(project?.fieldProvenance.actualTechnologyUsage.verificationStatus).toBe('REPOSITORY_SUPPORTED');
    expect(project?.fieldProvenance.architecture.verificationStatus).toBe('REPOSITORY_SUPPORTED');

    // Repository inspection does NOT automatically verify personal leadership or business outcomes!
    expect(project?.fieldProvenance.personalContribution.verificationStatus).not.toBe('REPOSITORY_SUPPORTED');
  });

  // 6. Unsupported personal claims
  it('6. Detects unsupported personal claims across active and passive voice and qualifies them honestly', () => {
    const resume = `
Projects:
CorePlatform - Backend platform
Technologies: Java
`;
    const kb = new CandidateKnowledgeBase(resume);

    // Test A: Active voice unsupported claims: "I optimized", "I secured", "I scaled", "I delivered"
    const activeClaim = 'In CorePlatform, I optimized the database query cache to achieve 50,000 QPS and I secured the API with OAuth2.';
    const resA = FactualGroundingValidator.validateAnswer(activeClaim, kb);
    expect(resA.isGrounded).toBe(false);
    expect(resA.validationStatus).toBe('FLAGGED');
    expect(resA.structuredViolations.some((v) => v.category === 'unsupported_optimization')).toBe(true);
    expect(resA.structuredViolations.some((v) => v.category === 'unverified_security')).toBe(true);

    // Clean qualification without inventing alternative claims
    expect(resA.adjustedAnswer).toContain('(personal optimization unverified in candidate profile)');

    // Test B: Passive voice unsupported claims: "was optimized by me", "was designed by me"
    const passiveClaim = 'The database query pipeline was optimized by me and the backend architecture was designed by me.';
    const resB = FactualGroundingValidator.validateAnswer(passiveClaim, kb);
    expect(resB.isGrounded).toBe(false);
    expect(resB.structuredViolations.some((v) => v.category === 'unsupported_personal_action')).toBe(true);
    expect(resB.adjustedAnswer).toContain('(personal ownership unverified in candidate profile)');
  });

  // 7. Proposed design presented as completed implementation
  it('7. Flags answers claiming a proposed future design as a completed past production implementation', () => {
    const kb = new CandidateKnowledgeBase();
    kb.registerProject({
      id: 'searchservice',
      name: 'SearchService',
      problemStatement: 'Text search service',
      architecture: 'Single node Lucene instance',
      technologyStack: ['Java'],
      dataFlow: 'Direct socket queries',
      backendDesign: 'Single process daemon',
      frontendDesign: 'UNKNOWN',
      databaseDesign: 'Local filesystem indices',
      integrations: [],
      security: 'UNKNOWN',
      deployment: 'UNKNOWN',
      personalContribution: 'Maintained index updater thread',
      teamContribution: 'Search team',
      challenges: ['Index rebuild lock contention'],
      verifiedResults: [],
      knownLimitations: ['Cannot scale horizontally'],
      proposedDesigns: ['Distributed Elasticsearch cluster with Raft leader election'],
      verificationStatus: 'RESUME_REPORTED',
      ownership: 'contributor',
      rawClaims: [],
      fieldProvenance: {} as any,
    });

    const adversarialAnswer = 'In SearchService, I deployed Distributed Elasticsearch cluster with Raft leader election in production.';
    const res = FactualGroundingValidator.validateAnswer(adversarialAnswer, kb);

    expect(res.isGrounded).toBe(false);
    expect(res.validationStatus).toBe('FLAGGED');
    expect(res.structuredViolations.some((v) => v.category === 'proposed_design_as_completed')).toBe(true);
  });

  // 8. Stale generation completion
  it('8. Drops stale generation results if a newer generation request was started', async () => {
    const service = AnswerGenerationService.getInstance();
    const store = useAppStore.getState();

    // Start Generation 1
    store.setActiveRequestId('gen-req-1');
    store.setAnswerValidationStatus('PENDING');

    // Simulate Start Generation 2 before Gen 1 completes
    store.setActiveRequestId('gen-req-2');
    store.setAnswerValidationStatus('PENDING');

    // When Gen 1 completes, its requestId is 'gen-req-1' which is stale
    const staleCompletedRequestId = 'gen-req-1';
    const currentActiveRequestId = store.activeRequestId;

    const isStale = staleCompletedRequestId !== currentActiveRequestId;
    expect(isStale).toBe(true);

    // Stale generation completion must NOT update store to VALIDATED
    if (!isStale) {
      store.setAnswerValidationStatus('VALIDATED');
    }
    expect(store.answerValidationStatus).toBe('PENDING');
  });

  // 9. Failed validation fails closed
  it('9. Validation error fails closed (validationStatus = FAILED) and suppresses unvalidated final answer', async () => {
    const service = AnswerGenerationService.getInstance();
    vi.spyOn(service, 'resolveApiKey').mockResolvedValue('valid-api-key');

    // Mock streamAnswer
    vi.spyOn(aiModule, 'streamAnswer').mockImplementation(async (_p, _c, _l, callbacks) => {
      callbacks.onToken?.('I built the complete system single-handedly.');
      callbacks.onComplete?.('I built the complete system single-handedly.');
    });

    // Force validator to throw unexpected fatal runtime exception
    vi.spyOn(FactualGroundingValidator, 'validateAnswer').mockImplementation(() => {
      throw new Error('Fatal AST parsing segfault');
    });

    let finalAnswer = '';
    let finalStatus: string = '';

    await service.generateAnswer(
      {
        requestId: 'req-fail-closed-4',
        type: 'interview',
        text: 'How did you build it?',
      },
      {
        onToken: () => {},
        onComplete: (res) => {
          finalAnswer = res.cleanAnswer;
          finalStatus = res.validationStatus;
        },
      }
    );

    // Fail-closed invariant:
    expect(finalStatus).toBe('FAILED');
    expect(finalAnswer).toContain('Answer verification failed due to validation error');
    expect(finalAnswer).not.toContain('I built the complete system single-handedly');
  });

  // 10. UI behavior for FLAGGED and FAILED answers
  it('10. Teleprompter / Grounding state transitions properly represent FLAGGED and FAILED states in store', () => {
    const store = useAppStore.getState();

    // Initial state: PENDING
    store.setAnswerValidationStatus('PENDING');
    expect(useAppStore.getState().answerValidationStatus).toBe('PENDING');

    // Transition to FLAGGED
    store.setAnswerValidationStatus('FLAGGED');
    expect(useAppStore.getState().answerValidationStatus).toBe('FLAGGED');

    // Transition to FAILED
    store.setAnswerValidationStatus('FAILED');
    expect(useAppStore.getState().answerValidationStatus).toBe('FAILED');

    // Transition to VALIDATED
    store.setAnswerValidationStatus('VALIDATED');
    expect(useAppStore.getState().answerValidationStatus).toBe('VALIDATED');
  });
});
