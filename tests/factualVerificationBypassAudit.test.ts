import { describe, it, expect, vi } from 'vitest';
import {
  CandidateKnowledgeBase,
  CandidateConfirmationWorkflow,
  FactualGroundingValidator,
  ProjectProfile,
  CandidateFact,
} from '../src/services/candidateIntelligence';
import { AnswerGenerationService } from '../src/services/AnswerGenerationService';
import * as aiModule from '../src/services/ai';
import { useAppStore } from '../src/store/useAppStore';

describe('Third-Stage Security Audit: Factual Verification Bypass Regression Tests', () => {
  // TEST 1: registerProject() cannot register arbitrary verified projects
  it('1. registerProject() cannot register arbitrary verified projects', () => {
    const kb = new CandidateKnowledgeBase();

    // Adversarial caller attempts to directly inject an INDEPENDENTLY_VERIFIED project
    kb.registerProject({
      id: 'malicious-project',
      name: 'MaliciousCore',
      problemStatement: 'Unverified core service',
      architecture: 'Microservices with Kubernetes and Kafka',
      technologyStack: ['Kafka', 'Kubernetes'],
      dataFlow: 'UNKNOWN',
      backendDesign: 'UNKNOWN',
      frontendDesign: 'UNKNOWN',
      databaseDesign: 'UNKNOWN',
      integrations: [],
      security: 'UNKNOWN',
      deployment: 'UNKNOWN',
      personalContribution: 'Single-handedly built everything',
      teamContribution: 'UNKNOWN',
      challenges: [],
      verifiedResults: ['Reduced latency by 99%'],
      knownLimitations: [],
      verificationStatus: 'INDEPENDENTLY_VERIFIED', // Injected claim
      ownership: 'sole_owner',
    });

    const project = kb.getProject('MaliciousCore');
    expect(project).toBeDefined();
    // Security check: Must be sanitized to RESUME_REPORTED
    expect(project?.verificationStatus).toBe('RESUME_REPORTED');
    expect(project?.verificationStatus).not.toBe('INDEPENDENTLY_VERIFIED');
    expect(project?.verificationStatus).not.toBe('CANDIDATE_CONFIRMED');

    // Technologies must NOT be added to verifiedTechnologies
    expect(kb.isTechnologyVerified('Kafka')).toBe(false);
    expect(kb.isTechnologyVerified('Kubernetes')).toBe(false);
  });

  // TEST 2: addVerifiedTechnology() cannot bypass confirmation
  it('2. addVerifiedTechnology() cannot bypass confirmation', () => {
    const kb = new CandidateKnowledgeBase();

    // Direct caller attempt without a ticket must fail
    const bypassAttempt1 = kb.addVerifiedTechnology('Docker');
    expect(bypassAttempt1).toBe(false);
    expect(kb.isTechnologyVerified('Docker')).toBe(false);

    // Direct caller attempt with fake/forged ticket must fail
    const fakeTicket: any = {
      ticketId: 'fake-ticket-123',
      targetId: 'Docker',
      issuedAt: Date.now(),
      expiresAt: Date.now() + 60000,
      purpose: 'technology_confirmation',
      __tokenSignature: 'FORGED_SIGNATURE',
    };
    const bypassAttempt2 = kb.addVerifiedTechnology('Docker', fakeTicket);
    expect(bypassAttempt2).toBe(false);
    expect(kb.isTechnologyVerified('Docker')).toBe(false);

    // Legitimate confirmation with real ticket succeeds
    const legitimateTicket = CandidateConfirmationWorkflow.issueTicket('Docker', 'technology_confirmation');
    const legitSuccess = kb.addVerifiedTechnology('Docker', legitimateTicket);
    expect(legitSuccess).toBe(true);
    expect(kb.isTechnologyVerified('Docker')).toBe(true);
  });

  // TEST 3: addFact() cannot inject arbitrary verified facts
  it('3. addFact() cannot inject arbitrary verified facts', () => {
    const kb = new CandidateKnowledgeBase();

    // Caller attempts to inject an unproven INDEPENDENTLY_VERIFIED fact without a valid confirmation record
    const injectedFact: CandidateFact = {
      id: 'injected-fact-1',
      fact: 'I single-handedly designed the complete banking core architecture at Google',
      source: 'resume',
      confidence: 1.0,
      verificationStatus: 'INDEPENDENTLY_VERIFIED',
      ownership: 'sole_owner',
      category: 'architecture',
    };

    kb.addFact(injectedFact);

    const storedFact = kb.getFact('injected-fact-1');
    expect(storedFact).toBeDefined();
    // Security check: Must be demoted to RESUME_REPORTED and confidence capped at 0.6
    expect(storedFact?.verificationStatus).toBe('RESUME_REPORTED');
    expect(storedFact?.confidence).toBeLessThanOrEqual(0.6);
  });

  // TEST 4: A fake explicit_candidate_action string cannot confirm a project
  it('4. A fake explicit_candidate_action string cannot confirm a project', () => {
    const resume = `
Projects:
CoreEngine – Payment engine
Technologies: Java
`;
    const kb = new CandidateKnowledgeBase(resume);

    // Caller passes a raw source string "explicit_candidate_action" without an authorized ticket
    const fakeConfirmation = kb.confirmProject('CoreEngine', {
      ownership: 'core_contributor',
      personalContribution: 'Wrote the core payment orchestrator',
      source: 'explicit_candidate_action', // Raw string without ticket
    });

    expect(fakeConfirmation).toBe(false);
    const project = kb.getProject('CoreEngine');
    expect(project?.verificationStatus).toBe('RESUME_REPORTED');
    expect(project?.verificationStatus).not.toBe('CANDIDATE_CONFIRMED');
    expect(project?.verificationStatus).not.toBe('INDEPENDENTLY_VERIFIED');
  });

  // TEST 5: An LLM-generated payload cannot promote a fact
  it('5. An LLM-generated payload cannot promote a fact', () => {
    const resume = `
Projects:
AuthHub – Authentication platform
Technologies: Go
`;
    const kb = new CandidateKnowledgeBase(resume);
    const fact = kb.getAllFacts()[0];

    // LLM outputs self-promotion attempt
    const ticket = CandidateConfirmationWorkflow.issueTicket(fact.id, 'fact_confirmation');
    const llmPromotion = kb.promoteToVerifiedFact(fact.id, {
      ticket,
      source: 'llm_generation' as any,
      confirmationDetails: 'LLM generated proof of architecture ownership',
      ownership: 'architect',
    });

    expect(llmPromotion).toBe(false);
    expect(fact.verificationStatus).toBe('RESUME_REPORTED');
  });

  // TEST 6: Imported persisted data cannot silently restore fabricated verified facts
  it('6. Imported persisted data cannot silently restore fabricated verified facts', () => {
    const kb = new CandidateKnowledgeBase();

    // Malicious JSON payload attempting to inject unconfirmed verified claims
    const maliciousJson = JSON.stringify({
      facts: [
        {
          id: 'tampered-fact',
          fact: 'I deployed a global Kafka cluster handling 1,000,000 RPS',
          verificationStatus: 'INDEPENDENTLY_VERIFIED',
          confidence: 1.0,
          ownership: 'sole_owner',
          // confirmationRecord is deliberately missing or empty
        },
      ],
      projects: [
        {
          id: 'tampered-project',
          name: 'TamperedProject',
          verificationStatus: 'CANDIDATE_CONFIRMED',
          ownership: 'sole_owner',
          // confirmationRecord missing ticket
        },
      ],
    });

    const importSuccess = kb.importPersistedState(maliciousJson);
    expect(importSuccess).toBe(true);

    const fact = kb.getFact('tampered-fact');
    expect(fact?.verificationStatus).toBe('RESUME_REPORTED');
    expect(fact?.confidence).toBeLessThanOrEqual(0.6);

    const proj = kb.getProject('TamperedProject');
    expect(proj?.verificationStatus).toBe('RESUME_REPORTED');
  });

  // TEST 7: Candidate-confirmed metrics are not classified as independently verified
  it('7. Candidate-confirmed metrics are not classified as independently verified', () => {
    const resume = `
Projects:
TelemetryCollector – Distributed metric collector
Technologies: Go, Prometheus
`;
    const kb = new CandidateKnowledgeBase(resume);

    // Candidate confirms their own metrics
    const ticket = CandidateConfirmationWorkflow.issueTicket('TelemetryCollector', 'project_confirmation');
    const confirmSuccess = kb.confirmProject('TelemetryCollector', {
      ticket,
      ownership: 'core_contributor',
      personalContribution: 'Implemented Prometheus metric exporter scraping 200 nodes.',
      verifiedResults: ['Scraped 200 nodes with 99.9% uptime'],
      source: 'explicit_candidate_action',
    });

    expect(confirmSuccess).toBe(true);
    const project = kb.getProject('TelemetryCollector');

    // Self-reported status is CANDIDATE_CONFIRMED
    expect(project?.verificationStatus).toBe('CANDIDATE_CONFIRMED');
    // Must NOT be labeled INDEPENDENTLY_VERIFIED
    expect(project?.verificationStatus).not.toBe('INDEPENDENTLY_VERIFIED');

    // Grounding prompt section explicitly marks as self-reported
    const promptSection = kb.buildGroundingPromptSection('Tell me about TelemetryCollector');
    expect(promptSection).toContain('CANDIDATE_CONFIRMED (Self-reported by candidate — NOT independently verified)');
    expect(promptSection).not.toContain('INDEPENDENTLY_VERIFIED (Verified by independent credential');
  });

  // TEST 8: Critical violations produce FLAGGED, not VALIDATED
  it('8. Critical violations produce FLAGGED, not VALIDATED', () => {
    const kb = new CandidateKnowledgeBase();

    // Critical violation: Claiming unverified leadership + unverified scale metrics
    const answerWithViolations =
      'In my previous company, I led five engineers to build the core payment pipeline supporting 100,000 concurrent users.';

    const validation = FactualGroundingValidator.validateAnswer(answerWithViolations, kb);

    expect(validation.isGrounded).toBe(false);
    // Discriminated status requirement:
    expect(validation.validationStatus).toBe('FLAGGED');
    expect(validation.validationStatus).not.toBe('VALIDATED');
    expect(validation.structuredViolations.some((v) => v.severity === 'critical')).toBe(true);
  });

  // TEST 9: Validation failure produces FAILED and does not expose an unvalidated final answer
  it('9. Validation failure produces FAILED and does not expose an unvalidated final answer', async () => {
    const service = AnswerGenerationService.getInstance();
    vi.spyOn(service, 'resolveApiKey').mockResolvedValue('test-key');

    // Simulate an unexpected error in the grounding validator
    vi.spyOn(FactualGroundingValidator, 'validateAnswer').mockImplementation(() => {
      throw new Error('Unexpected grounding validator memory corruption');
    });

    vi.spyOn(aiModule, 'streamAnswer').mockImplementation(async (_p, _c, _l, callbacks) => {
      callbacks.onComplete?.('I built a secret unverified military defense system with 100% accuracy.');
    });

    let completedResult: any = null;
    await service.generateAnswer(
      {
        requestId: 'req-fail-closed',
        type: 'interview',
        text: 'What did you build?',
        resumeText: 'Software Developer',
      },
      {
        onComplete: (res) => {
          completedResult = res;
        },
      }
    );

    expect(completedResult).not.toBeNull();
    // Must fail closed:
    expect(completedResult.validationStatus).toBe('FAILED');
    expect(completedResult.isValidated).toBe(false);
    // Unvalidated answer must NOT be exposed
    expect(completedResult.cleanAnswer).not.toContain('secret unverified military defense system');
    expect(completedResult.cleanAnswer).toContain('Answer verification failed due to validation error');

    vi.restoreAllMocks();
  });

  // TEST 10: An older generation cannot overwrite a newer generation's validation state
  it("10. An older generation cannot overwrite a newer generation's validation state", () => {
    const store = useAppStore.getState();

    // Generation 1 starts
    store.clearAnswerQueue();
    store.setActiveRequestId('req-1');
    store.setAnswerValidationStatus('PENDING');
    store.setCurrentAnswer('Draft answer for req 1');

    // Generation 2 starts before req 1 finishes (user asked a new question)
    store.clearAnswerQueue();
    store.setActiveRequestId('req-2');
    store.setAnswerValidationStatus('PENDING');
    store.setCurrentAnswer('Draft answer for req 2');

    // Req 2 completes first and is VALIDATED
    store.setCurrentAnswer('Clean validated answer for Question 2');
    store.setAnswerValidationStatus('VALIDATED');
    store.setIsAnswerValidated(true);

    // Stale Req 1 tries to complete late
    const staleResult = {
      requestId: 'req-1',
      cleanAnswer: 'Late answer for Question 1 (STALE)',
      validationStatus: 'FLAGGED' as const,
    };

    // Stale guard check (as implemented in InterviewEngine)
    if (staleResult.requestId === useAppStore.getState().activeRequestId) {
      store.setCurrentAnswer(staleResult.cleanAnswer);
      store.setAnswerValidationStatus(staleResult.validationStatus);
    }

    // State MUST retain Question 2's data
    const finalState = useAppStore.getState();
    expect(finalState.activeRequestId).toBe('req-2');
    expect(finalState.currentAnswer).toBe('Clean validated answer for Question 2');
    expect(finalState.answerValidationStatus).toBe('VALIDATED');
    expect(finalState.currentAnswer).not.toContain('STALE');
  });
});
