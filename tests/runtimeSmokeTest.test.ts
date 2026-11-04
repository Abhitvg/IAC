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
import { CompetencyProfileService } from '../src/services/practice/CompetencyProfileService';
import { InterviewReportGenerator } from '../src/services/practice/InterviewReportGenerator';
import { usePracticeStore } from '../src/store/usePracticeStore';

describe('Real Runtime Application Smoke Test Suite', () => {
  beforeEach(() => {
    CompetencyProfileService.getInstance().resetProfile();
    localStorage.clear();
  });

  it('1. End-to-end DSA session with coding evaluation', async () => {
    const store = usePracticeStore.getState();
    store.startMockSession(
      'dsa_coding',
      'strict_big_tech',
      false,
      'normal',
      'ds_arrays_strings',
      'intermediate'
    );

    const session = usePracticeStore.getState().activeSession;
    expect(session).not.toBeNull();
    expect(session?.selectedTopicId).toBe('ds_arrays_strings');
    expect(session?.roundType).toBe('dsa_coding');

    // Submit coding solution
    const twoSumSolution = `function twoSum(nums: number[], target: number): number[] {
      const map = new Map<number, number>();
      for (let i = 0; i < nums.length; i++) {
        const diff = target - nums[i];
        if (map.has(diff)) return [map.get(diff)!, i];
        map.set(nums[i], i);
      }
      return [];
    }`;

    usePracticeStore.setState({ currentCandidateAnswer: twoSumSolution });
    await store.submitCurrentAnswer();

    const postSubmitSession = usePracticeStore.getState().activeSession;
    const evaluatedTurn = postSubmitSession?.questionHistory[0];
    expect(evaluatedTurn?.codingEvaluation).toBeDefined();
    expect(evaluatedTurn?.codingEvaluation.executionStatus).toBe('static_analysis_only');
    expect(evaluatedTurn?.codingEvaluation.dimensions.timeComplexity.score).toBeGreaterThanOrEqual(4.0);
    expect(evaluatedTurn?.codingEvaluation.dimensions.spaceComplexity.score).toBeGreaterThanOrEqual(4.0);
  });

  it('2. End-to-end Core CS session', async () => {
    const store = usePracticeStore.getState();
    store.startMockSession(
      'core_cs',
      'strict_big_tech',
      false,
      'normal',
      'cs_operating_systems',
      'advanced'
    );

    const session = usePracticeStore.getState().activeSession;
    expect(session).not.toBeNull();
    expect(session?.selectedTopicId).toBe('cs_operating_systems');

    usePracticeStore.setState({
      currentCandidateAnswer:
        'A page fault occurs when a process attempts to access a virtual memory page not mapped in the TLB or hardware page table with present bit set. The CPU trap handler invokes the OS kernel pager, which loads the frame from swap or disk and updates the page table.',
    });

    await store.submitCurrentAnswer();

    const updatedSession = usePracticeStore.getState().activeSession;
    expect(updatedSession?.questionHistory.length).toBeGreaterThanOrEqual(1);
    const lastTurn = updatedSession?.questionHistory[0];
    expect(lastTurn?.evaluation).toBeDefined();
    expect(lastTurn?.evaluation?.overallScore).toBeGreaterThanOrEqual(1.0);

    const comp = CompetencyProfileService.getInstance().getTopicCompetency('cs_operating_systems');
    expect(comp).toBeDefined();
    expect(comp?.attemptsCount).toBe(1);
  });

  it('3. End-to-end System Design session', async () => {
    const store = usePracticeStore.getState();
    store.startMockSession(
      'system_design',
      'strict_big_tech',
      false,
      'normal',
      'cs_distributed_systems',
      'advanced'
    );

    const session = usePracticeStore.getState().activeSession;
    expect(session).not.toBeNull();
    expect(session?.selectedTopicId).toBe('cs_distributed_systems');

    usePracticeStore.setState({
      currentCandidateAnswer:
        'To design a distributed key-value store with strong consistency, we can use Raft consensus across 5 nodes. Writes go through the leader which appends log entries, replicates to a majority of followers, and commits once a quorum acknowledges.',
    });

    await store.submitCurrentAnswer();

    const updatedSession = usePracticeStore.getState().activeSession;
    expect(updatedSession?.questionHistory[0].evaluation?.overallScore).toBeGreaterThanOrEqual(1.0);
  });

  it('4. End-to-end Behavioral session with separate competency model', async () => {
    const store = usePracticeStore.getState();
    store.startMockSession('behavioral', 'friendly_recruiter', false, 'normal');

    usePracticeStore.setState({
      currentCandidateAnswer:
        'Situation: Our core API service experienced a 30% latency spike. Task: As lead engineer, I had to diagnose the root cause under tight SLO constraints. Action: I used distributed tracing to isolate N+1 database queries, added Redis caching, and conducted a blameless post-mortem. Result: P99 latency dropped from 850ms to 45ms.',
    });

    await store.submitCurrentAnswer();

    const updatedSession = usePracticeStore.getState().activeSession!;
    expect(updatedSession).not.toBeNull();

    const report = InterviewReportGenerator.generateReport(updatedSession);
    expect(report.behavioralCompetencies).toBeDefined();
    expect(report.behavioralCompetencies?.isBehavioralAssessed).toBe(true);
    expect(report.behavioralCompetencies?.dimensions.communication.score).toBeGreaterThanOrEqual(2.0);
    expect(report.behavioralCompetencies?.dimensions.problemSolvingExplanation.score).toBeGreaterThanOrEqual(2.0);
    expect(report.behavioralCompetencies?.dimensions.leadership.score).toBeGreaterThanOrEqual(2.0);
    expect(report.behavioralCompetencies?.dimensions.ownershipAccountability.score).toBeGreaterThanOrEqual(2.0);
  });

  it('5. End-to-end Interview Report Generation', () => {
    const session = MockInterviewerEngine.createSession('dsa_coding');
    session.questionHistory[0].candidateTranscript = 'Solved with hash map.';
    session.questionHistory[0].evaluation = {
      overallScore: 4.2,
      percentage: 84,
      dimensions: [],
      topLeverageFixes: [],
      modelAnswer: '',
      diffMissingPoints: [],
      assessedAt: Date.now(),
    };

    const report = InterviewReportGenerator.generateReport(session);
    expect(report.summary.questionsAttempted).toBe(1);
    expect(report.technicalPerformance.correctness.score).toBeGreaterThanOrEqual(4.0);
    expect(report.auditMetadata.isMeasuredResult).toBe(true);
    expect(report.auditMetadata.aiAssistedFeedbackDisclaimer).toContain('static_analysis_only');
    expect(report.auditMetadata.aiAssistedFeedbackDisclaimer).not.toContain('test executions');
  });

  it('6. End-to-end Session Recovery & Discard Workflow', () => {
    const store = usePracticeStore.getState();
    store.startMockSession('core_cs', 'strict_big_tech', false, 'normal', 'cs_networking', 3);

    const saved = localStorage.getItem('ai_practice_active_session_v1');
    expect(saved).not.toBeNull();

    // Verify discarding removes the active session and leaves storage clean
    store.discardActiveSession();
    expect(usePracticeStore.getState().activeSession).toBeNull();
    expect(localStorage.getItem('ai_practice_active_session_v1')).toBe('null');
  });
});
