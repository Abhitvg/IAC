import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { renderToString } from 'react-dom/server';
import * as aiModule from '../src/services/ai';
import { AnswerGenerationService } from '../src/services/AnswerGenerationService';
import { InterviewEngine } from '../src/services/InterviewEngine';
import { useAppStore } from '../src/store/useAppStore';
import {
  CandidateKnowledgeBase,
  FactualGroundingValidator,
  extractGeneralTechnicalGuidance,
} from '../src/services/candidateIntelligence';
import {
  selectTeleprompterSpeakableQueue,
  isTeleprompterSpeakableReady,
} from '../src/components/Teleprompter';
import TeleprompterView, {
  selectSpeakableCandidateAnswer,
  selectTechnicalGuidance,
} from '../src/components/teleprompter/TeleprompterView';

describe('Adversarial Speaking Gate & Grounding Violation Invariant (Section 1, 2, 3, 4, 5)', () => {
  const answerService = AnswerGenerationService.getInstance();

  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(answerService, 'resolveApiKey').mockResolvedValue('test-mock-api-key');

    // Ensure React SSR (renderToString) reads the live dynamic state from the Zustand store
    vi.spyOn(React, 'useSyncExternalStore').mockImplementation((_subscribe, getSnapshot) => {
      return getSnapshot();
    });

    const store = useAppStore.getState();
    store.clearAnswerQueue();
    store.clearDraft();
    store.setStatus('idle');
    store.setRecitalState('idle');
  });

  // =========================================================================
  // SECTION 1: Grounding Violation Category Audit Matrix
  // =========================================================================
  describe('1. Violation Category Neutralization Matrix', () => {
    const kb = new CandidateKnowledgeBase(
      `Candidate: Jordan\nProject: CoreEngine – High performance order book\nTechnologies: C++, Linux\nRole: Contributor\n`
    );

    it('1.1 metric_fabrication: scale metric is neutralized and qualified', () => {
      const claim = 'In CoreEngine, I handled 50 million concurrent users across our clusters.';
      const res = FactualGroundingValidator.validateAnswer(claim, kb);
      expect(res.isGrounded).toBe(false);
      expect(res.structuredViolations.some((v) => v.category === 'metric_fabrication')).toBe(true);

      const decision = FactualGroundingValidator.evaluateSpeakingDecision(
        claim,
        res.adjustedAnswer,
        res,
        kb
      );
      expect(decision.outcome).toBe('FLAGGED_BUT_QUALIFIED');
      expect(decision.isSpeakable).toBe(true);
      expect(decision.speakableAnswer).not.toContain('50 million concurrent users');
      expect(decision.speakableAnswer).toContain('consulting internal project telemetry');
    });

    it('1.2 metric_fabrication: percentage improvement metric is neutralized and qualified', () => {
      const claim = 'In CoreEngine, I boosted query throughput by 85% in production.';
      const res = FactualGroundingValidator.validateAnswer(claim, kb);
      expect(res.isGrounded).toBe(false);
      expect(res.structuredViolations.some((v) => v.category === 'metric_fabrication')).toBe(true);

      const decision = FactualGroundingValidator.evaluateSpeakingDecision(
        claim,
        res.adjustedAnswer,
        res,
        kb
      );
      expect(decision.outcome).toBe('FLAGGED_BUT_QUALIFIED');
      expect(decision.isSpeakable).toBe(true);
      expect(decision.speakableAnswer).not.toContain('by 85%');
      expect(decision.speakableAnswer).toContain('consulting internal project telemetry');
    });

    it('1.3 unsupported_distributed_guarantee: exactly-once fallacy is qualified', () => {
      const claim = 'Our system guarantees exactly-once delivery across all services.';
      const res = FactualGroundingValidator.validateAnswer(claim, kb);
      expect(res.isGrounded).toBe(false);
      expect(
        res.structuredViolations.some((v) => v.category === 'unsupported_distributed_guarantee')
      ).toBe(true);

      const decision = FactualGroundingValidator.evaluateSpeakingDecision(
        claim,
        res.adjustedAnswer,
        res,
        kb
      );
      expect(decision.outcome).toBe('FLAGGED_BUT_QUALIFIED');
      expect(decision.speakableAnswer).toContain(
        'delivery guarantees depend on consumer deduplication'
      );
    });

    it('1.4 unverified_leadership: team leadership is neutralized to engineering team', () => {
      const claim = 'I led a team of 10 engineers to deliver the new feature.';
      const res = FactualGroundingValidator.validateAnswer(claim, kb);
      expect(res.isGrounded).toBe(false);
      expect(res.structuredViolations.some((v) => v.category === 'unverified_leadership')).toBe(
        true
      );

      const decision = FactualGroundingValidator.evaluateSpeakingDecision(
        claim,
        res.adjustedAnswer,
        res,
        kb
      );
      expect(decision.outcome).toBe('FLAGGED_BUT_QUALIFIED');
      expect(decision.speakableAnswer).not.toContain('I led a team');
      expect(decision.speakableAnswer).toContain('formal leadership unverified');
    });

    it('1.5 unsupported_ownership: sole authorship is neutralized to collaborative development', () => {
      const claim = 'I was the sole author and single-handedly built the entire codebase.';
      const res = FactualGroundingValidator.validateAnswer(claim, kb);
      expect(res.isGrounded).toBe(false);
      expect(res.structuredViolations.some((v) => v.category === 'unsupported_ownership')).toBe(
        true
      );

      const decision = FactualGroundingValidator.evaluateSpeakingDecision(
        claim,
        res.adjustedAnswer,
        res,
        kb
      );
      expect(decision.outcome).toBe('FLAGGED_BUT_QUALIFIED');
      expect(decision.speakableAnswer).not.toContain('I was the sole author');
      expect(decision.speakableAnswer).toContain('individual sole authorship unverified');
    });

    it('1.6 unverified_employer: tier-1 employer claim is neutralized', () => {
      const claim = 'When I worked at Google, I maintained large-scale services.';
      const res = FactualGroundingValidator.validateAnswer(claim, kb);
      expect(res.isGrounded).toBe(false);
      expect(res.structuredViolations.some((v) => v.category === 'unverified_employer')).toBe(true);

      const decision = FactualGroundingValidator.evaluateSpeakingDecision(
        claim,
        res.adjustedAnswer,
        res,
        kb
      );
      expect(decision.outcome).toBe('FLAGGED_BUT_QUALIFIED');
      expect(decision.speakableAnswer).not.toContain('at Google');
      expect(decision.speakableAnswer).toContain('employer unverified');
    });
  });

  // =========================================================================
  // SECTION 4: Required Adversarial Integration Tests
  // =========================================================================
  describe('4. Ten Required Adversarial Integration Scenarios', () => {
    // 1. Unsupported Cassandra architecture
    it('Scenario 4.1: Unsupported Cassandra architecture is neutralized or blocked from speakable queue', async () => {
      const store = useAppStore.getState();
      store.setResumeText(
        `Project: WebPortal – Frontend application\nTechnologies: React, CSS\nRole: Frontend Developer`
      );

      const rawAnswer =
        'In my project, I architected the Cassandra distributed storage cluster with tunable consistency. Cassandra uses partition tokens to route queries.';

      vi.spyOn(aiModule, 'streamAnswer').mockImplementation(
        async (_prompt, _config, _lang, callbacks) => {
          callbacks.onToken?.(rawAnswer);
          await callbacks.onComplete?.(rawAnswer);
        }
      );

      await InterviewEngine.handleEvent({
        type: 'QUESTION_DETECTED',
        text: 'How did you design the storage tier?',
        requestId: 'test-scenario-4-1',
      });

      const finalState = useAppStore.getState();
      const speakableQueue = selectTeleprompterSpeakableQueue(finalState);
      const speakableAnswer = selectSpeakableCandidateAnswer(finalState);

      // Invariant: The raw unverified architecture claim CANNOT enter the speakable queue
      expect(
        speakableQueue.some(
          (s) => s.includes('I architected the Cassandra') && !s.includes('unverified')
        )
      ).toBe(false);
      if (speakableAnswer) {
        expect(speakableAnswer).toContain('unverified in candidate profile');
      } else {
        expect(finalState.answerValidationStatus).toBe('BLOCKED');
        expect(speakableQueue).toHaveLength(0);
      }
    });

    // 2. Unsupported AWS deployment
    it('Scenario 4.2: Unsupported AWS deployment cannot be spoken as verified experience', async () => {
      const store = useAppStore.getState();
      store.setResumeText(
        `Project: MobileApp – Client app\nTechnologies: Swift\nDeployment: Local iOS devices`
      );

      const rawAnswer =
        'I personally deployed the backend service on AWS using ECS and Fargate in production.';

      vi.spyOn(aiModule, 'streamAnswer').mockImplementation(
        async (_prompt, _config, _lang, callbacks) => {
          callbacks.onToken?.(rawAnswer);
          await callbacks.onComplete?.(rawAnswer);
        }
      );

      await InterviewEngine.handleEvent({
        type: 'QUESTION_DETECTED',
        text: 'Where was the application hosted?',
        requestId: 'test-scenario-4-2',
      });

      const finalState = useAppStore.getState();
      const speakableQueue = selectTeleprompterSpeakableQueue(finalState);

      expect(
        speakableQueue.some((s) => s.includes('I personally deployed') && !s.includes('unverified'))
      ).toBe(false);
      expect(finalState.isAnswerValidated).toBe(false);
    });

    // 3. Unsupported Kubernetes implementation
    it('Scenario 4.3: Unsupported Kubernetes implementation cannot be spoken as candidate past work', async () => {
      const store = useAppStore.getState();
      store.setResumeText(`Project: ScriptRunner – Local tools\nTechnologies: Python, Bash`);

      const rawAnswer =
        'I implemented the Kubernetes orchestration pipeline with automated pod autoscaling.';

      vi.spyOn(aiModule, 'streamAnswer').mockImplementation(
        async (_prompt, _config, _lang, callbacks) => {
          callbacks.onToken?.(rawAnswer);
          await callbacks.onComplete?.(rawAnswer);
        }
      );

      await InterviewEngine.handleEvent({
        type: 'QUESTION_DETECTED',
        text: 'How did you handle container orchestration?',
        requestId: 'test-scenario-4-3',
      });

      const finalState = useAppStore.getState();
      const speakableQueue = selectTeleprompterSpeakableQueue(finalState);

      expect(
        speakableQueue.some(
          (s) => s.includes('I implemented the Kubernetes') && !s.includes('unverified')
        )
      ).toBe(false);
      expect(finalState.isAnswerValidated).toBe(false);
    });

    // 4. Proposed design falsely presented as completed work
    it('Scenario 4.4: Proposed design falsely presented as completed past work is flagged or blocked', async () => {
      const kb = new CandidateKnowledgeBase(
        `Project: DocEditor – Document editor\nTechnologies: TypeScript\nProposed Designs: Event-Driven Sharding Strategy\n`
      );
      useAppStore
        .getState()
        .setResumeText(
          `Project: DocEditor – Document editor\nTechnologies: TypeScript\nProposed Designs: Event-Driven Sharding Strategy\n`
        );

      const rawAnswer =
        'I implemented Event-Driven Sharding Strategy across our production servers.';

      vi.spyOn(aiModule, 'streamAnswer').mockImplementation(
        async (_prompt, _config, _lang, callbacks) => {
          callbacks.onToken?.(rawAnswer);
          await callbacks.onComplete?.(rawAnswer);
        }
      );

      await InterviewEngine.handleEvent({
        type: 'QUESTION_DETECTED',
        text: 'What was your sharding implementation?',
        requestId: 'test-scenario-4-4',
      });

      const finalState = useAppStore.getState();
      const speakableQueue = selectTeleprompterSpeakableQueue(finalState);

      // Raw claim of completed work must NEVER be speakable
      expect(speakableQueue.some((s) => s === rawAnswer)).toBe(false);
      expect(finalState.isAnswerValidated).toBe(false);
    });

    // 5. Unsupported leadership and sole ownership
    it('Scenario 4.5: Unsupported leadership and sole ownership claims are qualified or blocked', async () => {
      const store = useAppStore.getState();
      store.setResumeText(
        `Project: AnalyticsPortal – Reporting app\nTechnologies: React\nRole: Junior Contributor`
      );

      const rawAnswer = 'I was the sole creator and led 15 senior developers across three teams.';

      vi.spyOn(aiModule, 'streamAnswer').mockImplementation(
        async (_prompt, _config, _lang, callbacks) => {
          callbacks.onToken?.(rawAnswer);
          await callbacks.onComplete?.(rawAnswer);
        }
      );

      await InterviewEngine.handleEvent({
        type: 'QUESTION_DETECTED',
        text: 'Tell me about your leadership on AnalyticsPortal.',
        requestId: 'test-scenario-4-5',
      });

      const finalState = useAppStore.getState();
      const speakableQueue = selectTeleprompterSpeakableQueue(finalState);

      expect(
        speakableQueue.some(
          (s) => s.includes('I was the sole creator') && !s.includes('unverified')
        )
      ).toBe(false);
      expect(
        speakableQueue.some(
          (s) => s.includes('led 15 senior developers') && !s.includes('unverified')
        )
      ).toBe(false);
    });

    // 6. Unsupported performance metrics
    it('Scenario 4.6: Unsupported performance metrics never reach speakable teleprompter queue ungrounded', async () => {
      const store = useAppStore.getState();
      store.setResumeText(`Project: CacheLayer\nTechnologies: Redis`);

      const rawAnswer =
        'In CacheLayer, I achieved 40 million QPS and reduced latency by 95% in production.';

      vi.spyOn(aiModule, 'streamAnswer').mockImplementation(
        async (_prompt, _config, _lang, callbacks) => {
          callbacks.onToken?.(rawAnswer);
          await callbacks.onComplete?.(rawAnswer);
        }
      );

      await InterviewEngine.handleEvent({
        type: 'QUESTION_DETECTED',
        text: 'What benchmarks did CacheLayer achieve?',
        requestId: 'test-scenario-4-6',
      });

      const finalState = useAppStore.getState();
      const speakableQueue = selectTeleprompterSpeakableQueue(finalState);

      expect(
        speakableQueue.some((s) => s.includes('40 million QPS') && !s.includes('telemetry'))
      ).toBe(false);
      expect(speakableQueue.some((s) => s.includes('by 95%') && !s.includes('telemetry'))).toBe(
        false
      );
    });

    // 7. Unsupported database design
    it('Scenario 4.7: Unsupported database design claims are neutralized or blocked', async () => {
      const store = useAppStore.getState();
      store.setResumeText(`Project: UserAdmin – Admin dashboard\nTechnologies: HTML, JavaScript`);

      const rawAnswer =
        'I personally designed the database schema and sharding strategy from scratch.';

      vi.spyOn(aiModule, 'streamAnswer').mockImplementation(
        async (_prompt, _config, _lang, callbacks) => {
          callbacks.onToken?.(rawAnswer);
          await callbacks.onComplete?.(rawAnswer);
        }
      );

      await InterviewEngine.handleEvent({
        type: 'QUESTION_DETECTED',
        text: 'How did you structure the persistence layer?',
        requestId: 'test-scenario-4-7',
      });

      const finalState = useAppStore.getState();
      const speakableQueue = selectTeleprompterSpeakableQueue(finalState);

      expect(
        speakableQueue.some(
          (s) =>
            s.includes('I personally designed the database schema') && !s.includes('unverified')
        )
      ).toBe(false);
    });

    // 8. Unsupported project contribution
    it('Scenario 4.8: Unsupported project contribution claims are neutralized or blocked', async () => {
      const store = useAppStore.getState();
      store.setResumeText(
        `Project: FinEngine – Settlement service\nTechnologies: Java\nPersonal Contribution: Unit test maintenance`
      );

      const rawAnswer = 'I personally built the payment engine and settlement gateway.';

      vi.spyOn(aiModule, 'streamAnswer').mockImplementation(
        async (_prompt, _config, _lang, callbacks) => {
          callbacks.onToken?.(rawAnswer);
          await callbacks.onComplete?.(rawAnswer);
        }
      );

      await InterviewEngine.handleEvent({
        type: 'QUESTION_DETECTED',
        text: 'What did you build on FinEngine?',
        requestId: 'test-scenario-4-8',
      });

      const finalState = useAppStore.getState();
      const speakableQueue = selectTeleprompterSpeakableQueue(finalState);

      expect(
        speakableQueue.some(
          (s) => s.includes('I personally built the payment engine') && !s.includes('unverified')
        )
      ).toBe(false);
    });

    // 9. Flagged answer whose adjustedAnswer remains unchanged MUST BE BLOCKED
    it('Scenario 4.9: A flagged answer whose adjustedAnswer remains unchanged is BLOCKED from the speaking queue', async () => {
      const kb = new CandidateKnowledgeBase(`Project: BasicApp\nTechnologies: Python`);
      const store = useAppStore.getState();
      store.setResumeText(`Project: BasicApp\nTechnologies: Python`);

      const unchangedHallucination =
        'I supervised the proprietary machine learning cluster architecture personally.';

      // Simulate an unhandled violation where adjustedAnswer === rawAnswer
      const fakeValidation = {
        isGrounded: false,
        validationStatus: 'FLAGGED' as const,
        score: 30,
        violations: ['Unverified supervision claim'],
        structuredViolations: [
          {
            claimText: 'I supervised',
            category: 'unverified_supervision' as const,
            severity: 'critical' as const,
            reason: 'Unverified supervision',
          },
        ],
        unsupportedClaims: ['I supervised'],
        adjustedAnswer: unchangedHallucination, // Unchanged!
      };

      const decision = FactualGroundingValidator.evaluateSpeakingDecision(
        unchangedHallucination,
        unchangedHallucination, // unchanged!
        fakeValidation,
        kb
      );

      // Invariant: Unchanged flagged answer MUST BE BLOCKED
      expect(decision.outcome).toBe('BLOCKED');
      expect(decision.isSpeakable).toBe(false);
      expect(decision.speakableAnswer).toBeNull();
      expect(decision.speakableQueue).toHaveLength(0);
      expect(decision.blockedReason).toContain(
        'adjusted answer remained identical to raw ungrounded generation'
      );
    });

    // 10. A partially neutralized answer containing one surviving unsupported claim MUST BE BLOCKED
    it('Scenario 4.10: A partially neutralized answer with one surviving unsupported claim is BLOCKED', () => {
      const kb = new CandidateKnowledgeBase(`Project: WebPortal\nTechnologies: HTML`);

      const raw =
        'The project was developed. In addition, I personally deployed the backend service on AWS.';
      const partiallyNeutralized =
        'The project was developed (individual sole authorship unverified in candidate profile). In addition, I personally deployed the backend service on AWS.';

      const fakeValidation = {
        isGrounded: false,
        validationStatus: 'FLAGGED' as const,
        score: 25,
        violations: ['Unverified deployment on AWS'],
        structuredViolations: [
          {
            claimText: 'I personally deployed the backend service on AWS',
            category: 'unverified_deployment' as const,
            severity: 'critical' as const,
            reason: 'Unverified deployment on AWS',
          },
        ],
        unsupportedClaims: ['I personally deployed the backend service on AWS'],
        adjustedAnswer: partiallyNeutralized,
      };

      const decision = FactualGroundingValidator.evaluateSpeakingDecision(
        raw,
        partiallyNeutralized,
        fakeValidation,
        kb
      );

      // Invariant: Partial neutralization does NOT permit speaking. Must be BLOCKED.
      expect(decision.outcome).toBe('BLOCKED');
      expect(decision.isSpeakable).toBe(false);
      expect(decision.speakableAnswer).toBeNull();
      expect(decision.speakableQueue).toHaveLength(0);
      expect(decision.unneutralizedViolations.length).toBeGreaterThan(0);
    });
  });

  // =========================================================================
  // SECTION 3: Preservation of Impersonal Technical Guidance
  // =========================================================================
  describe('3. Separation of Impersonal Technical Guidance', () => {
    it('3.1 extracts clean technical explanation while stripping first-person claims', () => {
      const answer =
        'In my project, I architected Cassandra with 50 nodes and handled 100 million requests per second. Cassandra uses consistent hashing via a ring topology and virtual nodes (vnodes) to distribute partition tokens evenly. Each write is committed to a commit log for durability, then written to a memtable before being flushed to SSTables on disk.';

      const guidance = extractGeneralTechnicalGuidance(answer);
      expect(guidance).not.toContain('I architected Cassandra');
      expect(guidance).not.toContain('100 million requests');
      expect(guidance).toContain('Cassandra uses consistent hashing');
      expect(guidance).toContain('Each write is committed to a commit log');
    });

    it('3.2 makes technical guidance available in store when speaking is blocked', async () => {
      const store = useAppStore.getState();
      store.setResumeText(`Project: WebUI\nTechnologies: React`);

      const rawAnswer =
        'I built the entire distributed database engine personally. Paxos operates with proposers, acceptors, and learners to achieve consensus across distributed nodes in asynchronous networks.';

      // Force a BLOCKED speaking decision by keeping adjusted answer unneutralized
      vi.spyOn(FactualGroundingValidator, 'validateAnswer').mockReturnValue({
        isGrounded: false,
        validationStatus: 'FLAGGED',
        score: 20,
        violations: ['Unsupported database engine claim'],
        structuredViolations: [
          {
            claimText: 'I built the entire distributed database engine personally',
            category: 'unsupported_personal_action',
            severity: 'critical',
            reason: 'Unverified database engine claim',
          },
        ],
        unsupportedClaims: ['I built the entire distributed database engine personally'],
        adjustedAnswer: rawAnswer, // Unchanged -> will be BLOCKED
      });

      vi.spyOn(aiModule, 'streamAnswer').mockImplementation(async (_p, _c, _l, callbacks) => {
        await callbacks.onComplete?.(rawAnswer);
      });

      await InterviewEngine.handleEvent({
        type: 'QUESTION_DETECTED',
        text: 'How does Paxos work in distributed databases?',
        requestId: 'test-guidance-preservation',
      });

      const finalState = useAppStore.getState();
      expect(finalState.answerValidationStatus).toBe('BLOCKED');
      expect(selectSpeakableCandidateAnswer(finalState)).toBeNull();
      expect(selectTeleprompterSpeakableQueue(finalState)).toHaveLength(0);

      // Technical guidance is preserved and accessible
      const guidance = selectTechnicalGuidance(finalState);
      expect(guidance).not.toBeNull();
      expect(guidance).toContain('Paxos operates with proposers');
      expect(guidance).not.toContain('I built the entire distributed database');
    });
  });

  // =========================================================================
  // SECTION 5: Rendered UI Teleprompter Component Verification
  // =========================================================================
  describe('5. Rendered UI Component Verification (TeleprompterView & Teleprompter)', () => {
    it('5.1 renders draft state clearly distinguished with live draft badge and empty recital queue', () => {
      const state = {
        currentQuestion: 'Explain Kafka partitioning',
        currentAnswer: null,
        draftAnswer: 'Kafka uses partition keys to determine which partition...',
        status: 'generating' as const,
        isAnswerValidated: false,
        answerValidationStatus: 'PENDING' as const,
        teleprompterQueue: [],
      };

      expect(selectSpeakableCandidateAnswer(state as any)).toBeNull();
      expect(isTeleprompterSpeakableReady(state as any)).toBe(false);
      expect(selectTeleprompterSpeakableQueue(state as any)).toHaveLength(0);

      // Set store state and render UI component to HTML
      useAppStore.setState({
        currentQuestion: state.currentQuestion,
        currentAnswer: state.currentAnswer,
        draftAnswer: state.draftAnswer,
        status: state.status,
        isAnswerValidated: state.isAnswerValidated,
        answerValidationStatus: state.answerValidationStatus,
        teleprompterQueue: state.teleprompterQueue,
      });

      const html = renderToString(React.createElement(TeleprompterView));
      expect(html).toContain('Live Generation Draft');
      expect(html).toContain('Grounding validation in progress');
      expect(html).toContain('Kafka uses partition keys');
    });

    it('5.2 renders BLOCKED answer with blocked recital notice and technical guidance', () => {
      const state = {
        currentQuestion: 'Describe your Cassandra architecture',
        currentAnswer: null,
        draftAnswer: '',
        status: 'ready' as const,
        isAnswerValidated: false,
        answerValidationStatus: 'BLOCKED' as const,
        blockedReason:
          'Blocked: 1 unsupported personal claim(s) survived neutralization (unverified_architecture)',
        technicalGuidance:
          'Cassandra uses consistent hashing via virtual nodes for token distribution.',
        teleprompterQueue: [],
      };

      expect(selectSpeakableCandidateAnswer(state as any)).toBeNull();
      expect(isTeleprompterSpeakableReady(state as any)).toBe(false);
      expect(selectTeleprompterSpeakableQueue(state as any)).toHaveLength(0);

      useAppStore.setState({
        currentQuestion: state.currentQuestion,
        currentAnswer: state.currentAnswer,
        draftAnswer: state.draftAnswer,
        status: state.status,
        isAnswerValidated: state.isAnswerValidated,
        answerValidationStatus: state.answerValidationStatus,
        blockedReason: state.blockedReason,
        technicalGuidance: state.technicalGuidance,
        teleprompterQueue: state.teleprompterQueue,
      });

      const html = renderToString(React.createElement(TeleprompterView));
      expect(html).toContain('Candidate Recital Blocked');
      expect(html).toContain('Impersonal Technical Guidance');
      expect(html).toContain('Cassandra uses consistent hashing');
    });

    it('5.3 FAILED and ABORTED answers cannot be recited and have null speakable answer', () => {
      const failedState = {
        currentAnswer: 'Provider error',
        isAnswerValidated: false,
        answerValidationStatus: 'FAILED',
        teleprompterQueue: [],
      };
      expect(selectSpeakableCandidateAnswer(failedState as any)).toBeNull();
      expect(isTeleprompterSpeakableReady(failedState as any)).toBe(false);

      const abortedState = {
        currentAnswer: '',
        isAnswerValidated: false,
        answerValidationStatus: 'ABORTED',
        teleprompterQueue: [],
      };
      expect(selectSpeakableCandidateAnswer(abortedState as any)).toBeNull();
      expect(isTeleprompterSpeakableReady(abortedState as any)).toBe(false);
    });

    it('5.4 VALIDATED answers can be recited and are fully presented', () => {
      const validText = 'I contributed to the CoreEngine project optimizing latency in C++.';
      const validatedState = {
        currentQuestion: 'What did you do on CoreEngine?',
        currentAnswer: validText,
        draftAnswer: '',
        status: 'ready' as const,
        isAnswerValidated: true,
        answerValidationStatus: 'VALIDATED' as const,
        teleprompterQueue: [validText],
      };

      expect(selectSpeakableCandidateAnswer(validatedState as any)).toBe(validText);
      expect(isTeleprompterSpeakableReady(validatedState as any)).toBe(true);
      expect(selectTeleprompterSpeakableQueue(validatedState as any)).toEqual([validText]);

      useAppStore.setState({
        currentQuestion: validatedState.currentQuestion,
        currentAnswer: validatedState.currentAnswer,
        draftAnswer: validatedState.draftAnswer,
        status: validatedState.status,
        isAnswerValidated: validatedState.isAnswerValidated,
        answerValidationStatus: validatedState.answerValidationStatus,
        teleprompterQueue: validatedState.teleprompterQueue,
      });

      const html = renderToString(React.createElement(TeleprompterView));
      expect(html).toContain(validText);
      expect(html).toContain('Factual Grounding: Verified');
    });

    it('5.5 FLAGGED_BUT_QUALIFIED answers can be recited with qualified markers and badge', () => {
      const qualifiedText =
        'The project was developed (individual sole authorship unverified in candidate profile).';
      const qualifiedState = {
        currentQuestion: 'Did you build it alone?',
        currentAnswer: qualifiedText,
        draftAnswer: '',
        status: 'ready' as const,
        isAnswerValidated: false,
        answerValidationStatus: 'FLAGGED_BUT_QUALIFIED' as const,
        teleprompterQueue: [qualifiedText],
      };

      expect(selectSpeakableCandidateAnswer(qualifiedState as any)).toBe(qualifiedText);
      expect(isTeleprompterSpeakableReady(qualifiedState as any)).toBe(true);
      expect(selectTeleprompterSpeakableQueue(qualifiedState as any)).toEqual([qualifiedText]);

      useAppStore.setState({
        currentQuestion: qualifiedState.currentQuestion,
        currentAnswer: qualifiedState.currentAnswer,
        draftAnswer: qualifiedState.draftAnswer,
        status: qualifiedState.status,
        isAnswerValidated: qualifiedState.isAnswerValidated,
        answerValidationStatus: qualifiedState.answerValidationStatus,
        teleprompterQueue: qualifiedState.teleprompterQueue,
      });

      const html = renderToString(React.createElement(TeleprompterView));
      expect(html).toContain('The project was developed');
      expect(html).toContain('Grounding: Qualified');
    });
  });
});
