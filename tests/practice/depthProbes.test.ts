import { describe, it, expect } from 'vitest';
import { MockInterviewerEngine } from '../../src/services/practice/MockInterviewerEngine';
import { InterviewerService } from '../../src/services/practice/InterviewerService';
import { FeedbackRecord, ExtractedWeakness } from '../../src/services/practice/types';

describe('Phase 5 - Follow-up Depth Probes & Pressure Settings', () => {
  const otFixtureWeakness: ExtractedWeakness = {
    topic: 'OT',
    skill: 'depth',
    severity: 2,
    evidence: 'explanation of OT was too theoretical without implementation specifics',
    requestedFix: 'needs concrete OT example',
  };

  const otFeedbackRecord: FeedbackRecord = {
    id: 'fb-ot-1',
    date: '2026-04-10',
    company: 'CollabCorp',
    role: 'Staff Infrastructure Engineer',
    roundType: 'system_design',
    redactedText: 'Candidate did well on websockets, but explanation of OT was too theoretical without implementation specifics.',
    sourceHash: 'collab-ot-hash-001',
    strengths: [
      {
        topic: 'Websockets',
        skill: 'knowledge',
        evidence: 'Candidate did well on websockets',
      },
    ],
    weaknesses: [otFixtureWeakness],
  };

  describe('Task 1 & 2: Targeted Depth Probes & Verbatim Evidence Validation', () => {
    it('asks for a concrete example on the first probe when fixture weakness specifies "needs concrete OT example"', () => {
      const candidateAnswer =
        'In our collaborative document architecture, we used Operational Transformation to reconcile concurrent character insertions across active clients.';

      // Generate targeted probe for the OT weakness
      const probeResult = MockInterviewerEngine.generateTargetedWeaknessProbe(
        candidateAnswer,
        otFixtureWeakness
      );

      // Acceptance: must ask for a concrete example
      expect(probeResult.spoken.toLowerCase()).toContain('concrete');
      expect(probeResult.spoken.toLowerCase()).toContain('example');

      // Acceptance: must reference candidate's own words
      expect(probeResult.spoken).toContain('Operational Transformation');
      expect(probeResult.evidence).toBe('Operational Transformation');

      // Acceptance: validated verbatim as a substring of candidate answer
      const isValid = InterviewerService.validateEvidence(probeResult.evidence, candidateAnswer);
      expect(isValid).toBe(true);
    });

    it('generates targeted probe through InterviewerService with offline fallback', () => {
      const candidateAnswer =
        'We coordinated live edits using Operational Transformation algorithm over persistent WebSocket channels.';

      const turn = InterviewerService.generateOfflineFallback({
        lastAnswer: candidateAnswer,
        question_json: { id: 'sd_ot', prompt: 'Design a collaborative document editor like Google Docs with OT.' },
        interview_type: 'system_design',
        currentProbesCount: 0,
        targetWeakness: otFixtureWeakness,
      });

      expect(turn.action).toBe('probe');
      expect(turn.spoken.toLowerCase()).toContain('concrete');
      expect(turn.spoken.toLowerCase()).toContain('example');
      expect(turn.spoken).toContain(turn.evidence);
      expect(InterviewerService.validateEvidence(turn.evidence, candidateAnswer)).toBe(true);
    });

    it('generates targeted probe using findMatchingWeakness from FeedbackRecords', () => {
      const questionPrompt = 'Design a real-time collaborative document editing system using OT';
      const matched = MockInterviewerEngine.findMatchingWeakness(
        questionPrompt,
        'system_design',
        [otFeedbackRecord]
      );

      expect(matched).toBeDefined();
      expect(matched?.topic).toBe('OT');
      expect(matched?.requestedFix).toBe('needs concrete OT example');

      const candidateAnswer = 'I applied OT transformation matrices to serialize state.';
      const probe = MockInterviewerEngine.generateTargetedWeaknessProbe(candidateAnswer, matched!);
      expect(probe.spoken.toLowerCase()).toContain('concrete');
      expect(probe.spoken.toLowerCase()).toContain('example');
      expect(probe.evidence).toBe('OT');
    });

    it('tailors probes according to different requestedFix types', () => {
      const answer = 'We put a Redis caching layer to handle high read QPS and store user session tokens.';

      // 1. Specific numbers
      const numberWeakness: ExtractedWeakness = {
        topic: 'caching',
        skill: 'depth',
        severity: 2,
        evidence: 'no numbers provided',
        requestedFix: 'provide specific numbers and latency metrics',
      };
      const probeNumbers = MockInterviewerEngine.generateTargetedWeaknessProbe(answer, numberWeakness);
      expect(probeNumbers.spoken.toLowerCase()).toMatch(/number|metric|latency|threshold/);
      expect(InterviewerService.validateEvidence(probeNumbers.evidence, answer)).toBe(true);

      // 2. Tool names
      const toolWeakness: ExtractedWeakness = {
        topic: 'caching',
        skill: 'concreteness',
        severity: 2,
        evidence: 'did not name libraries',
        requestedFix: 'name specific tools and technologies',
      };
      const probeTools = MockInterviewerEngine.generateTargetedWeaknessProbe(answer, toolWeakness);
      expect(probeTools.spoken.toLowerCase()).toMatch(/tool|technolog/);
      expect(InterviewerService.validateEvidence(probeTools.evidence, answer)).toBe(true);

      // 3. State design
      const stateWeakness: ExtractedWeakness = {
        topic: 'caching',
        skill: 'depth',
        severity: 2,
        evidence: 'state flow was vague',
        requestedFix: 'detail state design and schema',
      };
      const probeState = MockInterviewerEngine.generateTargetedWeaknessProbe(answer, stateWeakness);
      expect(probeState.spoken.toLowerCase()).toMatch(/state design|data model/);
      expect(InterviewerService.validateEvidence(probeState.evidence, answer)).toBe(true);

      // 4. Failure handling
      const failureWeakness: ExtractedWeakness = {
        topic: 'caching',
        skill: 'depth',
        severity: 3,
        evidence: 'no failover discussed',
        requestedFix: 'explain failure handling and node crash recovery',
      };
      const probeFailure = MockInterviewerEngine.generateTargetedWeaknessProbe(answer, failureWeakness);
      expect(probeFailure.spoken.toLowerCase()).toMatch(/failure|recovery|crash/);
      expect(InterviewerService.validateEvidence(probeFailure.evidence, answer)).toBe(true);

      // 5. Ordering
      const orderWeakness: ExtractedWeakness = {
        topic: 'caching',
        skill: 'depth',
        severity: 2,
        evidence: 'ordering ambiguity',
        requestedFix: 'clarify ordering guarantees and concurrency',
      };
      const probeOrder = MockInterviewerEngine.generateTargetedWeaknessProbe(answer, orderWeakness);
      expect(probeOrder.spoken.toLowerCase()).toMatch(/ordering|synchronization|concurrent/);
      expect(InterviewerService.validateEvidence(probeOrder.evidence, answer)).toBe(true);
    });
  });

  describe('Task 2: Two-Probe Cap per Question', () => {
    it('strictly enforces the two-probe cap in InterviewerService.generateTurn', async () => {
      const candidateAnswer = 'I added an index to the database.';

      // Attempt turn when 2 probes have already been asked
      const turn = await InterviewerService.generateTurn({
        persona_name: 'Jordan',
        persona_style: 'rigorous',
        interview_type: 'system_design',
        question_json: { id: 'q1', prompt: 'Design database scaling' },
        rolling_transcript: '',
        lastAnswer: candidateAnswer,
        currentProbesCount: 2, // 2 probes already performed
      });

      expect(turn.action).toBe('move_on');
      expect(turn.spoken).toContain("Let's move on");
      expect(turn.reason).toContain('Maximum 2 probes reached');
    });

    it('strictly enforces the two-probe cap during MockInterviewerEngine session progression', () => {
      // Create session with recorded weakness
      const session = MockInterviewerEngine.createSession(
        'system_design',
        'strict_big_tech',
        false,
        undefined,
        'high', // High pressure: would probe aggressively if uncapped
        [otFeedbackRecord]
      );

      // Turn 0: Answer root question
      const answer0 = 'I built an editor using Operational Transformation to sync documents.';
      const afterAnswer0 = MockInterviewerEngine.processAnswerSubmission(
        session,
        answer0,
        45,
        []
      );

      // Check probe 1 was created
      expect(afterAnswer0.questionHistory.length).toBe(2);
      expect(afterAnswer0.questionHistory[1].isFollowUp).toBe(true);
      expect(afterAnswer0.questionHistory[1].probeCount).toBe(1);
      // Probe 1 asks for concrete example due to OT weakness
      expect(afterAnswer0.questionHistory[1].question.toLowerCase()).toContain('concrete');

      // Turn 1: Candidate answers probe 1
      const answer1 = 'For concurrent insertions at position 4 and 5, client A adds character X and client B shifts by 1.';
      const afterAnswer1 = MockInterviewerEngine.processAnswerSubmission(
        afterAnswer0,
        answer1,
        35,
        []
      );

      // Check probe 2 was created (high pressure allows 2nd probe)
      expect(afterAnswer1.questionHistory.length).toBe(3);
      expect(afterAnswer1.questionHistory[2].isFollowUp).toBe(true);
      expect(afterAnswer1.questionHistory[2].probeCount).toBe(2);

      // Turn 2: Candidate answers probe 2
      const answer2 = 'The client buffer holds unacknowledged ops until server ACK.';
      const afterAnswer2 = MockInterviewerEngine.processAnswerSubmission(
        afterAnswer1,
        answer2,
        30,
        []
      );

      // Two-probe cap reached: must NOT create a 3rd probe. The single round must wrap up!
      expect(afterAnswer2.questionHistory.length).toBe(3);
      expect(afterAnswer2.isActive).toBe(false);
      expect(afterAnswer2.overallScorecard).toBeDefined();
    });
  });

  describe('Task 3: Pressure Setting (Low, Normal, High)', () => {
    it('defaults to normal pressure and keeps interruptions disabled', () => {
      const session = MockInterviewerEngine.createSession('dsa_coding');
      expect(session.pressure).toBe('normal');
      expect(session.interruptionEnabled).toBe(false);
    });

    it('modulates think-time based on pressure setting', () => {
      const persona = 'strict_big_tech';

      const lowDelay = MockInterviewerEngine.getInterviewerThinkingDelay(persona, 'low');
      const normalDelay = MockInterviewerEngine.getInterviewerThinkingDelay(persona, 'normal');
      const highDelay = MockInterviewerEngine.getInterviewerThinkingDelay(persona, 'high');

      // High pressure has significantly shorter delay (fast pace)
      expect(highDelay).toBeLessThanOrEqual(1.5);
      expect(normalDelay).toBe(3.5);
      // Low pressure has longer delay (relaxed pace)
      expect(lowDelay).toBeGreaterThanOrEqual(4.0);
    });

    it('modulates probe frequency: low pressure skips probe on adequate answer while high pressure probes', () => {
      // Session with LOW pressure
      const lowSession = MockInterviewerEngine.createSession(
        'dsa_coding',
        'friendly_recruiter',
        false,
        undefined,
        'low'
      );

      // Solid answer
      const goodAnswer =
        'First, let me clarify constraints: can the array be empty or negative? A brute force approach would be O(N^2), but an optimal approach uses a hash map to store seen numbers. The time complexity is O(N) linear time and auxiliary space is O(N).';
      const afterLow = MockInterviewerEngine.processAnswerSubmission(
        lowSession,
        goodAnswer,
        40,
        []
      );

      // Low pressure does not probe on adequate score
      expect(afterLow.questionHistory.filter((q) => q.isFollowUp).length).toBe(0);

      // Session with HIGH pressure on same answer
      const highSession = MockInterviewerEngine.createSession(
        'dsa_coding',
        'strict_big_tech',
        false,
        undefined,
        'high'
      );

      const afterHigh = MockInterviewerEngine.processAnswerSubmission(
        highSession,
        goodAnswer,
        40,
        []
      );

      // High pressure probes for depth/edge cases
      expect(afterHigh.questionHistory.filter((q) => q.isFollowUp).length).toBe(1);
    });
  });
});
