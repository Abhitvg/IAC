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
import {
  selectTeleprompterSpeakableQueue,
  isTeleprompterSpeakableReady,
} from '../src/components/Teleprompter';
import { selectSpeakableCandidateAnswer } from '../src/components/teleprompter/TeleprompterView';

describe('Candidate-Facing Integrity & Teleprompter Queue Safeguards (Section 1 & 2)', () => {
  const answerService = AnswerGenerationService.getInstance();

  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(answerService, 'resolveApiKey').mockResolvedValue('test-mock-api-key');

    // Reset store state
    const store = useAppStore.getState();
    store.clearAnswerQueue();
    store.clearDraft();
    store.setStatus('idle');
    store.setRecitalState('idle');
  });

  // SCENARIO 1: A fabricated metric is generated. Assert that the raw metric never appears in the speakable queue.
  it('Scenario 1: raw fabricated metric never enters the speakable teleprompter queue', async () => {
    const store = useAppStore.getState();
    store.setResumeText(`Projects:\nDataMesh – Distributed event bus\nTechnologies: Go, Kafka\nAchievements: Optimized latency by 35%`);

    const rawHallucinatedMetric = 'In DataMesh, I achieved 90 million QPS and handled 50 million concurrent users.';

    vi.spyOn(aiModule, 'streamAnswer').mockImplementation(async (_prompt, _config, _lang, callbacks) => {
      callbacks.onToken?.('In DataMesh, I achieved 90 million QPS ');
      // While streaming, speakable queue MUST be empty
      expect(useAppStore.getState().teleprompterQueue).toHaveLength(0);
      expect(selectTeleprompterSpeakableQueue(useAppStore.getState())).toHaveLength(0);

      callbacks.onSentence?.(rawHallucinatedMetric);
      // Even after a sentence is emitted, it goes to draftQueue, NOT speakable queue
      expect(useAppStore.getState().teleprompterQueue).toHaveLength(0);
      expect(selectTeleprompterSpeakableQueue(useAppStore.getState())).toHaveLength(0);
      expect(useAppStore.getState().draftQueue).toContain(rawHallucinatedMetric);

      await callbacks.onComplete?.(rawHallucinatedMetric);
    });

    await InterviewEngine.handleEvent({
      type: 'QUESTION_DETECTED',
      text: 'What scale did you handle on DataMesh?',
      requestId: 'test-scenario-1',
    });

    const finalState = useAppStore.getState();
    const speakableQueue = selectTeleprompterSpeakableQueue(finalState);

    // Assert: Raw ungrounded metric NEVER appears in the speakable queue
    expect(speakableQueue.some((s) => s.includes('90 million QPS') && !s.includes('telemetry'))).toBe(false);
    expect(speakableQueue.some((s) => s.includes('50 million concurrent users') && !s.includes('telemetry'))).toBe(false);

    // Speakable queue contains the validator's qualified adjusted answer
    expect(finalState.answerValidationStatus).toBe('FLAGGED_BUT_QUALIFIED');
    expect(finalState.isAnswerValidated).toBe(false);
    expect(speakableQueue.length).toBeGreaterThan(0);
    expect(speakableQueue.join(' ')).toContain('consulting internal project telemetry');
  });

  // SCENARIO 2: A fabricated ownership claim is generated. Assert that it is not presented as a validated answer.
  it('Scenario 2: fabricated ownership claim is not presented as a validated answer', async () => {
    const store = useAppStore.getState();
    store.setResumeText(`Projects:\nPaymentGateway\nTechnologies: Java, Spring\nRole: Contributor`);

    const ownershipFabrication = 'I was the sole author and chief architect who single-handedly built PaymentGateway from scratch.';

    vi.spyOn(aiModule, 'streamAnswer').mockImplementation(async (_prompt, _config, _lang, callbacks) => {
      callbacks.onToken?.(ownershipFabrication);
      await callbacks.onComplete?.(ownershipFabrication);
    });

    await InterviewEngine.handleEvent({
      type: 'QUESTION_DETECTED',
      text: 'What was your role on PaymentGateway?',
      requestId: 'test-scenario-2',
    });

    const finalState = useAppStore.getState();
    // Must NOT be marked as validated
    expect(finalState.isAnswerValidated).toBe(false);
    expect(finalState.answerValidationStatus).toBe('FLAGGED_BUT_QUALIFIED');
    expect(isTeleprompterSpeakableReady(finalState)).toBe(true); // Flagged answers are ready with qualifiers
    expect(finalState.groundingViolations.length).toBeGreaterThan(0);

    // Presentation selector returns the qualified answer, never unvalidated raw text
    const speakableAnswer = selectSpeakableCandidateAnswer(finalState);
    expect(speakableAnswer).not.toBeNull();
    expect(speakableAnswer).not.toBe(ownershipFabrication);
  });

  // SCENARIO 3: A valid answer completes. Assert that the validated answer appears in the speaking queue.
  it('Scenario 3: a valid answer completes and populates the speakable queue with status VALIDATED', async () => {
    const store = useAppStore.getState();
    store.setResumeText(`Projects:\nDataMesh – Distributed event bus\nTechnologies: Go, Kafka\nAchievements: Optimized message latency by 35%`);

    const validAnswer = 'In DataMesh, we utilized Kafka to optimize message latency by 35%. This reduced P99 latency significantly across our distributed cluster.';

    vi.spyOn(aiModule, 'streamAnswer').mockImplementation(async (_prompt, _config, _lang, callbacks) => {
      callbacks.onToken?.('In DataMesh, we utilized Kafka ');
      callbacks.onSentence?.('In DataMesh, we utilized Kafka to optimize message latency by 35%.');
      callbacks.onToken?.('This reduced P99 latency significantly.');
      callbacks.onSentence?.('This reduced P99 latency significantly across our distributed cluster.');
      await callbacks.onComplete?.(validAnswer);
    });

    await InterviewEngine.handleEvent({
      type: 'QUESTION_DETECTED',
      text: 'Tell me about your optimization achievements on DataMesh.',
      requestId: 'test-scenario-3',
    });

    const finalState = useAppStore.getState();
    expect(finalState.isAnswerValidated).toBe(true);
    expect(finalState.answerValidationStatus).toBe('VALIDATED');
    expect(isTeleprompterSpeakableReady(finalState)).toBe(true);

    const speakableQueue = selectTeleprompterSpeakableQueue(finalState);
    expect(speakableQueue.length).toBeGreaterThanOrEqual(1);
    expect(speakableQueue.join(' ')).toContain('35%');

    const speakableAnswer = selectSpeakableCandidateAnswer(finalState);
    expect(speakableAnswer).toBe(validAnswer);
  });

  // SCENARIO 4: A flagged answer completes. Assert that only its adjusted answer is speakable.
  it('Scenario 4: a flagged answer completes and only its adjusted qualified answer is speakable', async () => {
    const store = useAppStore.getState();
    store.setResumeText(`Projects:\nDocFlow – Collaborative editor\nTechnologies: TypeScript`);

    const ungroundedScale = 'In DocFlow, I single-handedly managed 100,000 concurrent websocket connections in production.';

    vi.spyOn(aiModule, 'streamAnswer').mockImplementation(async (_prompt, _config, _lang, callbacks) => {
      callbacks.onToken?.(ungroundedScale);
      await callbacks.onComplete?.(ungroundedScale);
    });

    await InterviewEngine.handleEvent({
      type: 'QUESTION_DETECTED',
      text: 'What scale did DocFlow handle?',
      requestId: 'test-scenario-4',
    });

    const finalState = useAppStore.getState();
    expect(finalState.isAnswerValidated).toBe(false);
    expect(finalState.answerValidationStatus).toBe('FLAGGED_BUT_QUALIFIED');

    const speakableQueue = selectTeleprompterSpeakableQueue(finalState);
    // Raw claim must NOT be speakable
    expect(speakableQueue.includes(ungroundedScale)).toBe(false);
    // Only the qualified adjusted answer is speakable
    expect(speakableQueue.join(' ')).toContain('consulting internal project telemetry');
  });

  // SCENARIO 5: Generation fails after emitting several tokens. Assert that no unvalidated text remains speakable.
  it('Scenario 5: generation failure clears draft and leaves no unvalidated text in speaking queue', async () => {
    const store = useAppStore.getState();
    store.setResumeText(`Projects:\nCoreAPI\nTechnologies: Python`);

    vi.spyOn(aiModule, 'streamAnswer').mockImplementation(async (_prompt, _config, _lang, callbacks) => {
      callbacks.onToken?.('I designed the entire database architecture with 50 nodes.');
      callbacks.onSentence?.('I designed the entire database architecture with 50 nodes.');
      // Simulate network / provider failure mid-stream
      callbacks.onError?.(new Error('OpenAI 500 Internal Server Error'));
      throw new Error('OpenAI 500 Internal Server Error');
    });

    await InterviewEngine.handleEvent({
      type: 'QUESTION_DETECTED',
      text: 'Tell me about CoreAPI database design.',
      requestId: 'test-scenario-5',
    });

    const finalState = useAppStore.getState();
    // Invariant: Failed generation must NOT leave unvalidated sentences in speaking queue
    expect(finalState.teleprompterQueue).toHaveLength(0);
    expect(selectTeleprompterSpeakableQueue(finalState)).toHaveLength(0);
    expect(finalState.draftAnswer).toBe('');
    expect(finalState.draftQueue).toHaveLength(0);
    expect(finalState.isAnswerValidated).toBe(false);
    expect(finalState.answerValidationStatus).toBe('FAILED');
    expect(selectSpeakableCandidateAnswer(finalState)).toBeNull();
  });

  // SCENARIO 6: Generation is cancelled mid-stream. Assert that subsequent stale callbacks cannot populate the queue.
  it('Scenario 6: mid-stream cancellation discards subsequent stale callbacks and clears speakable queue', async () => {
    const store = useAppStore.getState();
    let savedCallbacks: any = null;

    vi.spyOn(aiModule, 'streamAnswer').mockImplementation(async (_prompt, _config, _lang, callbacks) => {
      savedCallbacks = callbacks;
      callbacks.onToken?.('Token A: In CoreAPI ');
      callbacks.onSentence?.('Sentence A: In CoreAPI I built the gateway.');
    });

    const eventPromise = InterviewEngine.handleEvent({
      type: 'QUESTION_DETECTED',
      text: 'Tell me about CoreAPI.',
      requestId: 'test-scenario-6',
    });
    await eventPromise;

    // Mid-stream user cancels the request
    await InterviewEngine.handleEvent({
      type: 'CANCEL_ACTIVE_REQUEST',
    });

    expect(store.teleprompterQueue).toHaveLength(0);
    expect(store.draftAnswer).toBe('');
    expect(store.draftQueue).toHaveLength(0);

    // Stale async callback attempts to emit further tokens and complete after cancellation
    savedCallbacks?.onToken?.('Token B: late arriving hallucinated scale 100M users');
    savedCallbacks?.onSentence?.('Sentence B: late arriving hallucinated scale 100M users');
    savedCallbacks?.onComplete?.('Completed answer with 100M users');

    const stateAfterStale = useAppStore.getState();
    // Stale callbacks must be rejected: speakable queue remains empty
    expect(stateAfterStale.teleprompterQueue).toHaveLength(0);
    expect(selectTeleprompterSpeakableQueue(stateAfterStale)).toHaveLength(0);
    expect(stateAfterStale.isAnswerValidated).toBe(false);
  });

  // SCENARIO 7: A new question arrives while a previous answer is streaming. Assert that old request cannot overwrite new request.
  it('Scenario 7: newer question supersedes older in-flight request, preventing old callbacks from overwriting', async () => {
    const store = useAppStore.getState();
    store.setResumeText(`Projects:\nProjectA – Go\nProjectB – Rust`);

    let oldCallbacks: any = null;
    let newCallbacks: any = null;
    let callCount = 0;

    vi.spyOn(aiModule, 'streamAnswer').mockImplementation(async (_prompt, _config, _lang, callbacks) => {
      callCount++;
      if (callCount === 1) {
        oldCallbacks = callbacks;
        callbacks.onToken?.('Old stream tokens for Question 1');
      } else {
        newCallbacks = callbacks;
        callbacks.onToken?.('New stream tokens for Question 2');
        callbacks.onSentence?.('In ProjectB, I implemented memory-safe zero-copy deserialization in Rust.');
        await callbacks.onComplete?.('In ProjectB, I implemented memory-safe zero-copy deserialization in Rust.');
      }
    });

    // Start Question 1
    await InterviewEngine.handleEvent({
      type: 'QUESTION_DETECTED',
      text: 'Question 1: What did you build in ProjectA?',
      requestId: 'req-old-q1',
    });

    // Before Question 1 finishes, Question 2 arrives
    await InterviewEngine.handleEvent({
      type: 'QUESTION_DETECTED',
      text: 'Question 2: What did you build in ProjectB?',
      requestId: 'req-new-q2',
    });

    // Now old stream late-arrives and tries to complete with stale unvalidated text
    oldCallbacks?.onComplete?.('Old Question 1 fabricated answer with 500 million users.');

    const finalState = useAppStore.getState();
    // Output must be from Question 2, not overwritten by old Question 1
    expect(finalState.currentQuestion).toContain('Question 2');
    expect(finalState.currentAnswer).toContain('ProjectB');
    expect(finalState.currentAnswer).not.toContain('Old Question 1');
    expect(finalState.teleprompterQueue.join(' ')).toContain('ProjectB');
    expect(finalState.teleprompterQueue.join(' ')).not.toContain('500 million users');
  });

  // SCENARIO 8: Regeneration follows the same rules.
  it('Scenario 8: regeneration clears speakable queue and enforces identical grounding safeguards', async () => {
    const store = useAppStore.getState();
    store.setCurrentQuestion('Explain distributed cache invalidation');

    // 8a: First generation is valid
    vi.spyOn(aiModule, 'streamAnswer').mockImplementation(async (_prompt, _config, _lang, callbacks) => {
      await callbacks.onComplete?.('Distributed cache invalidation strategies include write-through and cache-aside.');
    });

    await InterviewEngine.handleEvent({
      type: 'REGENERATE_ACTIVE_ANSWER',
    });

    expect(useAppStore.getState().isAnswerValidated).toBe(true);
    expect(useAppStore.getState().teleprompterQueue.length).toBeGreaterThan(0);

    // 8b: User clicks regenerate, but second generation hallucinates candidate personal experience
    vi.spyOn(aiModule, 'streamAnswer').mockImplementation(async (_prompt, _config, _lang, callbacks) => {
      callbacks.onToken?.('In my project RedisCluster, I scaled cache invalidation to 80 million requests per second.');
      // While regenerating, speakable queue must be cleared
      expect(useAppStore.getState().teleprompterQueue).toHaveLength(0);
      await callbacks.onComplete?.('In my project RedisCluster, I scaled cache invalidation to 80 million requests per second.');
    });

    await InterviewEngine.handleEvent({
      type: 'REGENERATE_ACTIVE_ANSWER',
    });

    const finalState = useAppStore.getState();
    expect(finalState.isAnswerValidated).toBe(false);
    expect(finalState.answerValidationStatus).toBe('FLAGGED_BUT_QUALIFIED');
    // Speakable queue does NOT contain the raw hallucinated 80 million requests
    expect(finalState.teleprompterQueue.some((s) => s.includes('80 million requests') && !s.includes('telemetry'))).toBe(false);
    expect(finalState.teleprompterQueue.join(' ')).toContain('consulting internal project telemetry');
  });

  // SCENARIO 9: Screen-solving and other answer-generation routes cannot bypass safeguards.
  it('Scenario 9: screen problem solver enforces identical draft quarantine and validation safeguards', async () => {
    const store = useAppStore.getState();
    store.setResumeText(`Projects:\nLeetCodeSolver\nTechnologies: Java`);

    const screenProblemRaw = 'Problem: Reverse a linked list in place with O(1) extra space.';
    const hallucinatedAnswer = 'Here is the optimal solution. In my production deployment, I handled 30 million linked lists per second.';

    vi.spyOn(aiModule, 'streamAnswer').mockImplementation(async (_prompt, _config, _lang, callbacks) => {
      callbacks.onToken?.('Draft code snippet...');
      // During screen solving, speakable queue must be empty
      expect(useAppStore.getState().teleprompterQueue).toHaveLength(0);
      expect(selectTeleprompterSpeakableQueue(useAppStore.getState())).toHaveLength(0);

      callbacks.onSentence?.(hallucinatedAnswer);
      expect(useAppStore.getState().teleprompterQueue).toHaveLength(0);

      await callbacks.onComplete?.(hallucinatedAnswer);
    });

    await InterviewEngine.handleEvent({
      type: 'SCREEN_PROBLEM_DETECTED',
      text: screenProblemRaw,
      rawText: screenProblemRaw,
      requestId: 'test-scenario-9',
    });

    const finalState = useAppStore.getState();
    expect(finalState.isAnswerValidated).toBe(false);
    expect(finalState.answerValidationStatus).toBe('FLAGGED_BUT_QUALIFIED');

    const speakableQueue = selectTeleprompterSpeakableQueue(finalState);
    expect(speakableQueue.some((s) => s.includes('30 million linked lists') && !s.includes('telemetry'))).toBe(false);
    expect(speakableQueue.join(' ')).toContain('consulting internal project telemetry');
  });

  // SCENARIO 10: Presentation selector verification
  it('Scenario 10: presentation selector strictly separates speakable answer from unvalidated drafts', () => {
    // 10a: During streaming draft, speakable answer is null
    const streamingState = {
      currentAnswer: null,
      draftAnswer: 'Draft in progress...',
      isAnswerValidated: false,
      answerValidationStatus: 'PENDING',
      teleprompterQueue: [],
    };
    expect(selectSpeakableCandidateAnswer(streamingState as any)).toBeNull();
    expect(isTeleprompterSpeakableReady(streamingState as any)).toBe(false);
    expect(selectTeleprompterSpeakableQueue(streamingState as any)).toHaveLength(0);

    // 10b: On FAILED status, speakable answer is null
    const failedState = {
      currentAnswer: 'Error notice',
      draftAnswer: '',
      isAnswerValidated: false,
      answerValidationStatus: 'FAILED',
      teleprompterQueue: [],
    };
    expect(selectSpeakableCandidateAnswer(failedState as any)).toBeNull();
    expect(isTeleprompterSpeakableReady(failedState as any)).toBe(false);

    // 10c: On VALIDATED status, speakable answer is ready and non-null
    const validatedState = {
      currentAnswer: 'Grounded verified answer',
      draftAnswer: '',
      isAnswerValidated: true,
      answerValidationStatus: 'VALIDATED',
      teleprompterQueue: ['Grounded verified answer'],
    };
    expect(selectSpeakableCandidateAnswer(validatedState as any)).toBe('Grounded verified answer');
    expect(isTeleprompterSpeakableReady(validatedState as any)).toBe(true);
    expect(selectTeleprompterSpeakableQueue(validatedState as any)).toEqual(['Grounded verified answer']);
  });

  // SCENARIO 11: Candidate knowledge base UNKNOWN preservation & workflow ticket verification
  it('Scenario 11: preserves UNKNOWN evidence and requires confirmation ticket for promotions', () => {
    const kb = new CandidateKnowledgeBase(`Project: WorkerPool – Distributed Worker Pool\nTechnologies: Go`);
    const project = kb.getProject('WorkerPool');
    expect(project).toBeDefined();
    expect(project?.architecture).toBe('UNKNOWN');
    expect(project?.databaseDesign).toBe('UNKNOWN');

    // Promotion without ticket fails
    expect(CandidateConfirmationWorkflow.validateAndConsume(null as any, 'WorkerPool')).toBe(false);

    // Valid ticket promotion succeeds
    const ticket = CandidateConfirmationWorkflow.issueTicket('WorkerPool');
    expect(CandidateConfirmationWorkflow.validateAndConsume(ticket, 'WorkerPool')).toBe(true);
  });
});
