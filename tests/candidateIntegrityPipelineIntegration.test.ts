import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as aiModule from '../src/services/ai';
import { AnswerGenerationService } from '../src/services/AnswerGenerationService';
import { InterviewEngine } from '../src/services/InterviewEngine';
import { useAppStore } from '../src/store/useAppStore';
import {
  CandidateKnowledgeBase,
  CandidateConfirmationWorkflow,
  FactualGroundingValidator,
} from '../src/services/candidateIntelligence';

describe('Complete Candidate-Integrity Pipeline Integration (Requirement 2)', () => {
  const answerService = AnswerGenerationService.getInstance();

  beforeEach(() => {
    vi.restoreAllMocks();
    // Provide a mocked API key so resolution succeeds
    vi.spyOn(answerService, 'resolveApiKey').mockResolvedValue('test-mock-api-key');

    // Reset store state
    const store = useAppStore.getState();
    store.setCurrentQuestion('');
    store.setCurrentAnswer('');
    store.setIsAnswerValidated(false);
    store.setAnswerValidationStatus('PENDING');
    store.setGroundingResult(null, []);
    store.setStatus('idle');
    store.setRecitalState('idle');
  });

  // TEST 1: All generated answers pass through factual grounding validation
  it('Pipeline 1: validates generated answers and flags ungrounded metric fabrication', async () => {
    const resumeText = `Projects:
DataMesh – Distributed event bus
Technologies: Go, Kafka
Achievements: Optimized message latency by 35%`;

    vi.spyOn(aiModule, 'streamAnswer').mockImplementation(async (_prompt, _config, _lang, callbacks) => {
      callbacks.onToken?.('In my project DataMesh, I scaled throughput to 50 million requests per second single-handedly.');
      callbacks.onComplete?.('In my project DataMesh, I scaled throughput to 50 million requests per second single-handedly.');
    });

    const result = await answerService.generateAnswer({
      requestId: 'test-req-1',
      type: 'interview',
      text: 'What scale did you achieve on DataMesh?',
      resumeText,
    });

    expect(result.status).toBe('FLAGGED');
    expect(result.isValidated).toBe(false);
    expect(result.validationStatus).toBe('FLAGGED');
    expect(result.groundingViolations.length).toBeGreaterThan(0);
    expect(result.structuredViolations.some((v) => v.category === 'metric_fabrication')).toBe(true);
    // Adjusted answer must qualify the ungrounded claim
    expect(result.cleanAnswer).not.toBe('In my project DataMesh, I scaled throughput to 50 million requests per second single-handedly.');
  });

  // TEST 1b: Grounded answers pass validation with status VALIDATED
  it('Pipeline 1b: verifies that accurately grounded answers pass validation with status VALIDATED', async () => {
    const resumeText = `Projects:
DataMesh – Distributed event bus
Technologies: Go, Kafka
Achievements: Optimized message latency by 35%`;

    vi.spyOn(aiModule, 'streamAnswer').mockImplementation(async (_prompt, _config, _lang, callbacks) => {
      callbacks.onToken?.('In DataMesh, we utilized Kafka to optimize message latency by 35%.');
      callbacks.onComplete?.('In DataMesh, we utilized Kafka to optimize message latency by 35%.');
    });

    const result = await answerService.generateAnswer({
      requestId: 'test-req-1b',
      type: 'interview',
      text: 'Tell me about the optimization achievements on DataMesh.',
      resumeText,
    });

    expect(result.status).toBe('VALIDATED');
    expect(result.isValidated).toBe(true);
    expect(result.validationStatus).toBe('VALIDATED');
    expect(result.groundingViolations).toHaveLength(0);
  });

  // TEST 2: Invalid answers cannot be displayed as validated responses in UI store
  it('Pipeline 2: ensures invalid or flagged answers cannot be displayed as validated in UI store', async () => {
    const store = useAppStore.getState();
    store.setResumeText(`Projects: CoreEngine\nTechnologies: Java`);

    vi.spyOn(aiModule, 'streamAnswer').mockImplementation(async (_prompt, _config, _lang, callbacks) => {
      callbacks.onToken?.('I handled 100 million concurrent users.');
      callbacks.onComplete?.('In CoreEngine, I handled 100 million concurrent users.');
    });

    await InterviewEngine.handleEvent({
      type: 'QUESTION_DETECTED',
      text: 'What was your peak concurrent load?',
      requestId: 'test-req-2',
    });

    const updatedState = useAppStore.getState();
    expect(updatedState.isAnswerValidated).toBe(false);
    expect(updatedState.answerValidationStatus).toBe('FLAGGED');
    expect(updatedState.groundingViolations.length).toBeGreaterThan(0);
  });

  // TEST 3: Streaming responses cannot bypass validation
  it('Pipeline 3: prevents streaming responses from bypassing validation prior to completion', async () => {
    let capturedDuringStreamIsValidated = true;
    let capturedDuringStreamValidationStatus = '';

    vi.spyOn(aiModule, 'streamAnswer').mockImplementation(async (_prompt, _config, _lang, callbacks) => {
      callbacks.onToken?.('Token 1: In CoreAPI ');
      // Check store state mid-stream
      capturedDuringStreamIsValidated = useAppStore.getState().isAnswerValidated;
      capturedDuringStreamValidationStatus = useAppStore.getState().answerValidationStatus;

      callbacks.onToken?.('Token 2: I served 40 million users.');
      callbacks.onComplete?.('In CoreAPI, I served 40 million users.');
    });

    await InterviewEngine.handleEvent({
      type: 'QUESTION_DETECTED',
      text: 'Describe your API scale.',
      requestId: 'test-req-3',
    });

    // Invariant: During streaming, isAnswerValidated MUST be false and status must be PENDING
    expect(capturedDuringStreamIsValidated).toBe(false);
    expect(capturedDuringStreamValidationStatus).toBe('PENDING');

    // Post-completion, because 40 million users is fabricated, validation must be FLAGGED
    expect(useAppStore.getState().isAnswerValidated).toBe(false);
    expect(useAppStore.getState().answerValidationStatus).toBe('FLAGGED');
  });

  // TEST 4: Retry and fallback paths cannot bypass validation
  it('Pipeline 4: enforces full grounding validation across retry and fallback paths', async () => {
    const store = useAppStore.getState();
    store.setCurrentQuestion('Explain Paxos consensus in distributed systems');

    // 4a: Retry / regeneration path
    vi.spyOn(aiModule, 'streamAnswer').mockImplementation(async (_prompt, _config, _lang, callbacks) => {
      callbacks.onToken?.('Paxos is a consensus protocol for reaching agreement.');
      callbacks.onComplete?.('Paxos is a consensus protocol for reaching agreement among a distributed cluster of nodes.');
    });

    await InterviewEngine.handleEvent({
      type: 'REGENERATE_ACTIVE_ANSWER',
    });

    // Valid conceptual explanation passes validation
    expect(useAppStore.getState().isAnswerValidated).toBe(true);
    expect(useAppStore.getState().answerValidationStatus).toBe('VALIDATED');

    // 4b: Fallback with empty knowledge base attempting to claim candidate achievements
    vi.spyOn(aiModule, 'streamAnswer').mockImplementation(async (_prompt, _config, _lang, callbacks) => {
      callbacks.onToken?.('In my Paxos implementation, I achieved 99.999% uptime for 10 million clients.');
      callbacks.onComplete?.('In my Paxos implementation, I achieved 99.999% uptime for 10 million clients.');
    });

    await InterviewEngine.handleEvent({
      type: 'REGENERATE_ACTIVE_ANSWER',
    });

    // Fabricated personal claims in conceptual fallback are strictly caught and FLAGGED
    expect(useAppStore.getState().isAnswerValidated).toBe(false);
    expect(useAppStore.getState().answerValidationStatus).toBe('FLAGGED');
  });

  // TEST 5: Provider errors cannot cause fabricated candidate experience
  it('Pipeline 5: fails closed on provider errors without hallucinating candidate details', async () => {
    vi.spyOn(aiModule, 'streamAnswer').mockImplementation(async () => {
      throw new Error('Groq upstream API error: 503 Service Unavailable');
    });

    const result = await answerService.generateAnswer({
      requestId: 'test-req-5',
      type: 'interview',
      text: 'Tell me about your distributed systems experience.',
      resumeText: 'Projects: StreamCore\nTechnologies: C++',
    });

    expect(result.status).toBe('FAILED');
    expect(result.isValidated).toBe(false);
    expect(result.validationStatus).toBe('FAILED');
    expect(result.groundingScore).toBe(0);

    // Invariant: Output must report error, never fabricate fake candidate skills or roles
    expect(result.cleanAnswer).toContain('failed');
    expect(result.cleanAnswer).not.toContain('Samantha');
    expect(result.cleanAnswer).not.toContain('CloudScale');
  });

  // TEST 6: Proposed designs cannot become past achievements
  it('Pipeline 6: prevents proposed designs from being claimed as completed past achievements', async () => {
    const kb = new CandidateKnowledgeBase(`Projects:
CloudRouter – Multi-region edge router
Technologies: Rust, Envoy`);

    // Add a proposed design to the project
    const project = kb.getProject('CloudRouter');
    expect(project).toBeDefined();
    if (project) {
      project.verificationStatus = 'PROPOSED_DESIGN';
      project.architecture = 'Active-Active Multi-Region Global Mesh';
    }

    // Answer claims this proposed design was already completed and scaled in production
    const answerClaim = 'In CloudRouter, I implemented Active-Active Multi-Region Global Mesh in production and scaled it to 50M requests.';
    const validation = FactualGroundingValidator.validateAnswer(answerClaim, kb, 'Tell me about CloudRouter');

    expect(validation.isGrounded).toBe(false);
    expect(validation.validationStatus).toBe('FLAGGED');
    expect(
      validation.structuredViolations.some(
        (v) => v.category === 'proposed_design_as_completed' || v.category === 'metric_fabrication'
      )
    ).toBe(true);
  });

  // TEST 7: Missing evidence remains UNKNOWN
  it('Pipeline 7: enforces that missing project evidence remains UNKNOWN and cannot be fabricated', () => {
    const resumeText = `Projects:
SimpleWorker – Background queue processor
Technologies: Python`;

    const kb = new CandidateKnowledgeBase(resumeText);
    const project = kb.getProject('SimpleWorker');
    expect(project).toBeDefined();

    // Verify unmentioned fields default to UNKNOWN
    expect(project?.architecture).toBe('UNKNOWN');
    expect(project?.databaseDesign).toBe('UNKNOWN');
    expect(project?.deployment).toBe('UNKNOWN');
    expect(project?.personalContribution).toBe('UNKNOWN');

    // Answer claims architecture and database that were UNKNOWN
    const answerClaim = 'For SimpleWorker, I architected a distributed Cassandra cluster deployed on AWS EKS.';
    const validation = FactualGroundingValidator.validateAnswer(answerClaim, kb, 'Describe SimpleWorker');

    expect(validation.isGrounded).toBe(false);
    expect(
      validation.structuredViolations.some(
        (v) => v.category === 'unverified_backend' || v.category === 'unverified_technology'
      )
    ).toBe(true);
  });

  // TEST 8: Candidate-confirmed facts require the intended confirmation workflow
  it('Pipeline 8: requires the intended CandidateConfirmationWorkflow to verify candidate claims', () => {
    const targetEntityId = 'project-event-streamer';

    // 8a: Direct bypass without ticket fails
    const bypassResult = CandidateConfirmationWorkflow.validateAndConsume(null as any, targetEntityId);
    expect(bypassResult).toBe(false);

    // 8b: Ticket issued for a different entity fails
    const wrongTicket = CandidateConfirmationWorkflow.issueTicket('other-entity');
    const wrongTargetResult = CandidateConfirmationWorkflow.validateAndConsume(wrongTicket, targetEntityId);
    expect(wrongTargetResult).toBe(false);

    // 8c: Legitimate ticket issued for target entity succeeds
    const validTicket = CandidateConfirmationWorkflow.issueTicket(targetEntityId, 'project_confirmation');
    expect(validTicket.ticketId).toBeTruthy();
    expect(validTicket.__tokenSignature).toContain(targetEntityId);

    const confirmationResult = CandidateConfirmationWorkflow.validateAndConsume(
      validTicket,
      targetEntityId,
      'project_confirmation'
    );
    expect(confirmationResult).toBe(true);

    // 8d: Ticket cannot be reused / replayed (consumed immediately)
    const replayResult = CandidateConfirmationWorkflow.validateAndConsume(
      validTicket,
      targetEntityId,
      'project_confirmation'
    );
    expect(replayResult).toBe(false);
  });
});
