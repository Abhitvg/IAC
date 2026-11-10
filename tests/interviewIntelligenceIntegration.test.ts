import { describe, it, expect, beforeEach } from 'vitest';

// Polyfill localStorage for node test runner
let storeMap: Record<string, string> = {};
const localStorageMock = {
  getItem: (key: string) => storeMap[key] || null,
  setItem: (key: string, value: string) => {
    storeMap[key] = value.toString();
  },
  removeItem: (key: string) => {
    delete storeMap[key];
  },
  clear: () => {
    storeMap = {};
  },
};
if (typeof (globalThis as any).localStorage === 'undefined') {
  (globalThis as any).localStorage = localStorageMock;
}

import { MockInterviewerEngine } from '../src/services/practice/MockInterviewerEngine';
import { InterviewerService } from '../src/services/practice/InterviewerService';
import { CodingEvaluationService } from '../src/services/practice/CodingEvaluationService';
import { CompetencyProfileService } from '../src/services/practice/CompetencyProfileService';
import { InterviewReportGenerator } from '../src/services/practice/InterviewReportGenerator';
import { usePracticeStore } from '../src/store/usePracticeStore';

describe('Phase Integration & Post-Remediation Release Gate Tests', () => {
  beforeEach(() => {
    CompetencyProfileService.getInstance().resetProfile();
    localStorage.clear();
  });

  describe('1. Topic and Difficulty Selection (P1)', () => {
    it('creates session with specific curriculum topic and difficulty', () => {
      const session = MockInterviewerEngine.createSession(
        'dsa_coding',
        'strict_big_tech',
        false,
        [],
        'normal',
        [],
        { topicId: 'ds_trees_bst', difficulty: 'advanced' }
      );

      expect(session.selectedTopicId).toBe('ds_trees_bst');
      expect(session.selectedDifficulty).toBe(4);
      expect(session.questionHistory[0].curriculumTopicId).toBe('ds_trees_bst');
      expect(session.currentQuestion).toBeDefined();
    });

    it('validates boundaries on difficulty (clamps between 1 and 5)', () => {
      const sessionLow = MockInterviewerEngine.createSession(
        'dsa_coding',
        'strict_big_tech',
        false,
        [],
        'normal',
        [],
        { topicId: 'ds_arrays_strings', difficulty: -2 }
      );
      expect(sessionLow.selectedDifficulty).toBe(1);

      const sessionHigh = MockInterviewerEngine.createSession(
        'dsa_coding',
        'strict_big_tech',
        false,
        [],
        'normal',
        [],
        { topicId: 'ds_arrays_strings', difficulty: 99 }
      );
      expect(sessionHigh.selectedDifficulty).toBe(5);
    });

    it('falls back safely when unrecognized topic ID is passed', () => {
      const session = MockInterviewerEngine.createSession(
        'dsa_coding',
        'strict_big_tech',
        false,
        [],
        'normal',
        [],
        { topicId: 'non_existent_topic_xyz', difficulty: 'easy' }
      );
      expect(session.selectedTopicId).toBeUndefined();
      expect(session.selectedDifficulty).toBe(2);
      expect(session.currentQuestion).toBeDefined();
    });

    it('passes selected topic and difficulty from usePracticeStore.startMockSession', () => {
      const store = usePracticeStore.getState();
      store.startMockSession(
        'dsa_coding',
        'strict_big_tech',
        false,
        'normal',
        'algo_dynamic_programming',
        'advanced'
      );

      const activeSession = usePracticeStore.getState().activeSession;
      expect(activeSession).not.toBeNull();
      expect(activeSession?.selectedTopicId).toBe('algo_dynamic_programming');
      expect(activeSession?.selectedDifficulty).toBe(4);
      expect(activeSession?.questionHistory[0].curriculumTopicId).toBe('algo_dynamic_programming');
    });
  });

  describe('2. Competency Assessment Idempotency & Persistence (P1)', () => {
    it('handles same submission retried multiple times without duplicate events', () => {
      const service = CompetencyProfileService.getInstance();
      const params = {
        curriculumTopicId: 'ds_trees_bst',
        questionId: 'q_tree_01',
        submissionId: 'sub_tree_01_attempt_1',
        score: 4.5,
        candidateQuoteOrSnippet: 'Invert binary tree by recursively swapping left and right subtrees.',
        sourceType: 'live_interview' as const,
      };

      const res1 = service.recordAssessment(params);
      expect(res1.success).toBe(true);

      const res2 = service.recordAssessment(params);
      expect(res2.success).toBe(true);

      const res3 = service.recordAssessment(params);
      expect(res3.success).toBe(true);

      const topic = service.getTopicCompetency('ds_trees_bst');
      expect(topic?.attemptsCount).toBe(1);
      expect(topic?.history.length).toBe(1);
    });

    it('handles two concurrent submission attempts idempotently', async () => {
      const service = CompetencyProfileService.getInstance();
      const params = {
        curriculumTopicId: 'ds_hash_tables',
        questionId: 'q_hash_01',
        submissionId: 'sub_hash_concurrent_01',
        score: 4.0,
        candidateQuoteOrSnippet: 'Linear probing probes consecutive array slots on hash collision.',
        sourceType: 'live_interview' as const,
      };

      const [p1, p2] = await Promise.all([
        Promise.resolve(service.recordAssessment(params)),
        Promise.resolve(service.recordAssessment(params)),
      ]);

      expect(p1.success).toBe(true);
      expect(p2.success).toBe(true);

      const topic = service.getTopicCompetency('ds_hash_tables');
      expect(topic?.attemptsCount).toBe(1);
      expect(topic?.history.length).toBe(1);
    });

    it('records two legitimate identical answers in separate questions independently', () => {
      const service = CompetencyProfileService.getInstance();
      const answerSnippet = 'Use binary search to find the lower bound index in O(log N).';

      // First question
      const res1 = service.recordAssessment({
        curriculumTopicId: 'algo_binary_search',
        questionId: 'q_binary_search_01',
        submissionId: 'sub_bs_01',
        score: 4.5,
        candidateQuoteOrSnippet: answerSnippet,
        sourceType: 'live_interview',
      });
      expect(res1.success).toBe(true);

      // Second, separate question on same topic
      const res2 = service.recordAssessment({
        curriculumTopicId: 'algo_binary_search',
        questionId: 'q_binary_search_02',
        submissionId: 'sub_bs_02',
        score: 4.5,
        candidateQuoteOrSnippet: answerSnippet,
        sourceType: 'live_interview',
      });
      expect(res2.success).toBe(true);

      const topic = service.getTopicCompetency('algo_binary_search');
      expect(topic?.attemptsCount).toBe(2);
      expect(topic?.history.length).toBe(2);
      expect(topic?.history[0].questionId).toBe('q_binary_search_01');
      expect(topic?.history[1].questionId).toBe('q_binary_search_02');
    });

    it('persists append-only assessment history across simulated application restart', () => {
      const service = CompetencyProfileService.getInstance();
      service.recordAssessment({
        curriculumTopicId: 'cs_operating_systems',
        questionId: 'q_os_01',
        submissionId: 'sub_os_persist_01',
        score: 4.8,
        candidateQuoteOrSnippet: 'The MMU checks page table entries; if present bit is 0, CPU raises page fault interrupt.',
        sourceType: 'live_interview',
      });

      // Verify stored to localStorage
      const rawStored = localStorage.getItem('iac_technical_competency_profile_v1');
      expect(rawStored).not.toBeNull();
      const entries: [string, any][] = JSON.parse(rawStored!);
      const osEntry = entries.find(([id]) => id === 'cs_operating_systems')?.[1];
      expect(osEntry).toBeDefined();
      expect(osEntry.history.length).toBe(1);
      expect(osEntry.history[0].submissionId).toBe('sub_os_persist_01');

      // Simulate retry after reload: should not duplicate
      const retryRes = service.recordAssessment({
        curriculumTopicId: 'cs_operating_systems',
        questionId: 'q_os_01',
        submissionId: 'sub_os_persist_01',
        score: 4.8,
        candidateQuoteOrSnippet: 'The MMU checks page table entries; if present bit is 0, CPU raises page fault interrupt.',
        sourceType: 'live_interview',
      });
      expect(retryRes.success).toBe(true);
      expect(service.getTopicCompetency('cs_operating_systems')?.history.length).toBe(1);
    });
  });

  describe('3. Session Recovery & Schema Validation (P1/P2)', () => {
    it('persists active session and resumes state on reload', () => {
      const store = usePracticeStore.getState();
      store.startMockSession(
        'conceptual',
        'strict_big_tech',
        false,
        'normal',
        'cs_networking',
        'intermediate'
      );

      const savedJson = localStorage.getItem('ai_practice_active_session_v1');
      expect(savedJson).not.toBeNull();
      const parsed = JSON.parse(savedJson!);
      expect(parsed.selectedTopicId).toBe('cs_networking');
      expect(parsed.isActive).toBe(true);
    });

    it('cleanly discards an active session without writing corrupted history', () => {
      const store = usePracticeStore.getState();
      store.startMockSession('dsa_coding');
      expect(store.activeSession).not.toBeNull();

      store.discardActiveSession();
      expect(usePracticeStore.getState().activeSession).toBeNull();
      expect(localStorage.getItem('ai_practice_active_session_v1')).toBe('null');
    });

    it('safely recovers from malformed stored session data by discarding it', () => {
      localStorage.setItem('ai_practice_active_session_v1', '{"corrupted": true, "invalid": 123}');
      // Trigger store recovery check
      const reloadedStore = usePracticeStore.getState();
      // Malformed data should not crash and activeSession should be null or discarded
      expect(reloadedStore.activeSession === null || !reloadedStore.activeSession?.isActive).toBe(true);
    });

    it('ensures in-progress / unsubmitted answers are not marked as completed turns', () => {
      const store = usePracticeStore.getState();
      store.startMockSession('dsa_coding');
      store.setCurrentCandidateAnswer('Typing half a sentence here without submitting...');

      const active = usePracticeStore.getState().activeSession;
      expect(active?.questionHistory.length).toBe(1);
      expect(active?.questionHistory[0].candidateTranscript).toBe('');
    });
  });

  describe('4. Adaptive Interviewer 6-Action Live Verification (P1)', () => {
    const candidateContext = 'Candidate: Dynamic programming stores overlapping subproblem solutions.';

    it('verifies ASK action through generateTurn', async () => {
      const mockLlm = async () =>
        JSON.stringify({
          action: 'ask',
          spoken: 'How would you classify memoization versus tabulation?',
          reason: 'Explore paradigm difference.',
          evidence: '',
        });

      const turn = await InterviewerService.generateTurn(
        {
          persona_name: 'Alex',
          persona_style: 'rigorous',
          interview_type: 'coding',
          question_json: 'Explain DP.',
          rolling_transcript: candidateContext,
          lastAnswer: 'Dynamic programming stores overlapping subproblem solutions.',
        },
        mockLlm
      );

      expect(turn.action).toBe('ask');
      expect(turn.spoken).toContain('memoization versus tabulation');
    });

    it('verifies PROBE action requiring exact quote evidence', async () => {
      const mockLlm = async () =>
        JSON.stringify({
          action: 'probe',
          spoken: 'When you say overlapping subproblems, what is an example where subproblems do not overlap?',
          reason: 'Test non-overlapping vs overlapping boundary.',
          evidence: 'overlapping subproblem solutions',
        });

      const turn = await InterviewerService.generateTurn(
        {
          persona_name: 'Alex',
          persona_style: 'rigorous',
          interview_type: 'coding',
          question_json: 'Explain DP.',
          rolling_transcript: candidateContext,
          lastAnswer: 'Dynamic programming stores overlapping subproblem solutions.',
        },
        mockLlm
      );

      expect(turn.action).toBe('probe');
      expect(turn.evidence).toBe('overlapping subproblem solutions');
    });

    it('verifies CHALLENGE action with exact quote and rejects fabricated quote', async () => {
      const mockValidChallenge = async () =>
        JSON.stringify({
          action: 'challenge',
          spoken: 'You stated you store overlapping subproblems. Does merge sort have overlapping subproblems?',
          reason: 'Disprove divide-and-conquer overlap.',
          evidence: 'overlapping subproblem solutions',
        });

      const turnValid = await InterviewerService.generateTurn(
        {
          persona_name: 'Alex',
          persona_style: 'rigorous',
          interview_type: 'coding',
          question_json: 'Explain DP.',
          rolling_transcript: candidateContext,
          lastAnswer: 'Dynamic programming stores overlapping subproblem solutions.',
        },
        mockValidChallenge
      );
      expect(turnValid.action).toBe('challenge');

      // Now with hallucinated quote
      const mockHallucinated = async () =>
        JSON.stringify({
          action: 'challenge',
          spoken: 'You said tabulation is always recursive.',
          reason: 'Challenge tabulation assertion.',
          evidence: 'tabulation is always recursive', // Never spoken!
        });

      const turnInvalid = await InterviewerService.generateTurn(
        {
          persona_name: 'Alex',
          persona_style: 'rigorous',
          interview_type: 'coding',
          question_json: 'Explain DP.',
          rolling_transcript: candidateContext,
          lastAnswer: 'Dynamic programming stores overlapping subproblem solutions.',
        },
        mockHallucinated
      );
      // Hallucinated challenge must be dropped to move_on to prevent putting words in candidate's mouth
      expect(turnInvalid.action).toBe('move_on');
    });

    it('verifies CLARIFY action with verbatim evidence', async () => {
      const mockClarify = async () =>
        JSON.stringify({
          action: 'clarify',
          spoken: 'What specific data structure do you mean by stores?',
          reason: 'Clarify storage structure.',
          evidence: 'stores',
        });

      const turn = await InterviewerService.generateTurn(
        {
          persona_name: 'Alex',
          persona_style: 'rigorous',
          interview_type: 'coding',
          question_json: 'Explain DP.',
          rolling_transcript: candidateContext,
          lastAnswer: 'Dynamic programming stores overlapping subproblem solutions.',
        },
        mockClarify
      );
      expect(turn.action).toBe('clarify');
    });

    it('verifies MOVE_ON action', async () => {
      const mockMoveOn = async () =>
        JSON.stringify({
          action: 'move_on',
          spoken: "That makes sense. Let's move to the space optimization step.",
          reason: 'Satisfactory explanation.',
          evidence: '',
        });

      const turn = await InterviewerService.generateTurn(
        {
          persona_name: 'Alex',
          persona_style: 'friendly',
          interview_type: 'coding',
          question_json: 'Explain DP.',
          rolling_transcript: candidateContext,
          lastAnswer: 'Dynamic programming stores overlapping subproblem solutions.',
        },
        mockMoveOn
      );
      expect(turn.action).toBe('move_on');
    });

    it('verifies WRAP_UP action', async () => {
      const mockWrapUp = async () =>
        JSON.stringify({
          action: 'wrap_up',
          spoken: 'We have covered everything for this question. Excellent work.',
          reason: 'Complete mastery.',
          evidence: '',
        });

      const turn = await InterviewerService.generateTurn(
        {
          persona_name: 'Alex',
          persona_style: 'friendly',
          interview_type: 'coding',
          question_json: 'Explain DP.',
          rolling_transcript: candidateContext,
          lastAnswer: 'Dynamic programming stores overlapping subproblem solutions.',
        },
        mockWrapUp
      );
      expect(turn.action).toBe('wrap_up');
    });

    it('gracefully recovers from malformed LLM responses by falling back to offline heuristic', async () => {
      const session = MockInterviewerEngine.createSession('conceptual');
      const badJsonLlm = async () => 'Not a valid JSON response { broken ';

      const updated = await MockInterviewerEngine.processAnswerSubmissionAsync(
        session,
        'Short verbal explanation.',
        30,
        [],
        badJsonLlm
      );

      expect(updated.questionHistory.length).toBeGreaterThanOrEqual(1);
      expect(updated.currentQuestion).toBeDefined();
    });

    it('prevents concurrent submissions while evaluation is active', async () => {
      const store = usePracticeStore.getState();
      store.startMockSession('conceptual');
      usePracticeStore.setState({ isEvaluatingAnswer: true });

      // Calling submitCurrentAnswer while isEvaluatingAnswer is true should return immediately
      await store.submitCurrentAnswer();
      expect(usePracticeStore.getState().isEvaluatingAnswer).toBe(true);

      usePracticeStore.setState({ isEvaluatingAnswer: false });
    });
  });

  describe('5. Coding Evaluation Honesty & Static Analysis Boundary (P1/P2)', () => {
    it('sets execution status to static_analysis_only and never claims passed test cases without an executor', async () => {
      const code = `function maxSubArray(nums: number[]): number {
        let maxSoFar = nums[0];
        let currentMax = nums[0];
        for (let i = 1; i < nums.length; i++) {
          currentMax = Math.max(nums[i], currentMax + nums[i]);
          maxSoFar = Math.max(maxSoFar, currentMax);
        }
        return maxSoFar;
      }`;

      const result = await CodingEvaluationService.evaluateSubmission({
        problemId: 'kadane_01',
        curriculumTopicId: 'ds_arrays_strings',
        candidateSubmission: code,
        explanationTranscript: 'Kadane algorithm runs in linear time with constant auxiliary space.',
        language: 'typescript',
        expectedOptimalComplexity: { time: 'O(N)', space: 'O(1)' },
      });

      expect(result.executionStatus).toBe('static_analysis_only');
      expect(result.testResults.length).toBe(0);
      expect(result.dimensions.timeComplexity.score).toBe(3);
      expect(result.dimensions.spaceComplexity.score).toBe(3);
    });

    it('report disclaimer explicitly states static_analysis_only without dynamic sandbox claims', () => {
      const session = MockInterviewerEngine.createSession('dsa_coding');
      const report = InterviewReportGenerator.generateReport(session);
      expect(report.auditMetadata.aiAssistedFeedbackDisclaimer).toContain('static_analysis_only');
      expect(report.auditMetadata.aiAssistedFeedbackDisclaimer).not.toContain('test executions');
    });
  });
});
