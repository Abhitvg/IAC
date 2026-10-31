import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  classifyQuestionIntent,
  LENGTH_TARGETS,
  QuestionIntent,
} from '../src/services/responseStyle';
import {
  buildCandidateSystemPrompt,
  DEFAULT_JOB_DESCRIPTION,
} from '../src/services/candidatePersona';
import { classifyQuestion } from '../src/services/ai';
import { buildScreenSolverPrompt } from '../src/services/screenSolver';
import { InterviewEngine } from '../src/services/InterviewEngine';
import { useAppStore } from '../src/store/useAppStore';
import { AudioRecorder } from '../src/services/audio';
import { AnswerGenerationService } from '../src/services/AnswerGenerationService';
import { globalLatencyTracker } from '../src/services/LatencyTracker';

// Mock electronAPI
const mockElectronAPI = {
  getSessionsDir: vi.fn().mockResolvedValue('/mock/sessions'),
  listDir: vi.fn().mockResolvedValue([]),
  readFile: vi.fn(),
  writeFile: vi.fn().mockResolvedValue(true),
  deleteFile: vi.fn().mockResolvedValue(true),
  getSettings: vi.fn().mockResolvedValue({}),
  getApiKey: vi.fn().mockResolvedValue('gsk_test12345'),
};

(globalThis as any).window = {
  electronAPI: mockElectronAPI,
};

describe('IAC 2.0 Interview Intelligence & Implementation Depth Suite', () => {
  const verifiedResume = `Abhishek Singh
Senior Software Developer
Projects: DocFlow (real-time collaborative document editor using WebSockets and CRDTs), Quorum (distributed event streaming platform).
Skills: Java, TypeScript, Spring Boot, PostgreSQL, MongoDB, Kafka, Docker, AWS, React.`;

  describe('Part 3 & 5: Technical Taxonomy & Implementation-Depth Prompts', () => {
    it('1. Distributed Systems & Idempotency: classifies and injects atomic persistence guidance', () => {
      const q = 'How do you handle duplicate requests in a distributed system?';
      const intent = classifyQuestionIntent(q, 'interview');
      expect(intent).toBe('distributed_systems');

      const prompt = buildCandidateSystemPrompt(
        verifiedResume,
        DEFAULT_JOB_DESCRIPTION,
        'Distributed Systems Architect',
        'Java',
        'interview',
        [],
        'System Design',
        intent,
        q
      );

      expect(prompt).toContain('CONVERSATIONAL SPOKEN INTERVIEW RESPONSE STYLE');
      expect(prompt).toContain('idempotency key');
      expect(prompt).toContain('atomic');
      expect(prompt).not.toContain('Phase 1 (Ingestion & Initialization)');
    });

    it('2. Operational Transformation & Concurrency: provides mechanism-level guidance', () => {
      const q = 'How does Operational Transformation handle concurrent edits in real-time document editing?';
      const intent = classifyQuestionIntent(q, 'interview');
      expect(intent).toBe('implementation');

      const prompt = buildCandidateSystemPrompt(
        verifiedResume,
        DEFAULT_JOB_DESCRIPTION,
        'Collaborative Software Engineer',
        'TypeScript',
        'interview',
        [],
        'General',
        intent,
        q
      );

      expect(prompt).toContain('70–130 words');
      expect(prompt).toContain('DIRECT ANSWER');
      expect(prompt).toContain('MECHANISM');
      expect(prompt).toContain('TRADE-OFF');
    });

    it('3. Java Concurrency: classifies runtime internals and enforces distinction between volatile and synchronized', () => {
      const q = 'What is the difference between volatile and synchronized in Java?';
      const intent = classifyQuestionIntent(q, 'interview');
      expect(intent).toBe('runtime_internals');

      const prompt = buildCandidateSystemPrompt(
        verifiedResume,
        DEFAULT_JOB_DESCRIPTION,
        'Senior Java Engineer',
        'Java',
        'interview',
        [],
        'Java',
        intent,
        q
      );

      expect(prompt).toContain('Volatile guarantees visibility and ordering');
      expect(prompt).toContain('synchronized guarantees both visibility and mutual exclusion');
      expect(prompt).toContain('memory barriers');
    });

    it('4. Node.js Event Loop & Microtasks: classifies runtime internals and includes execution phases', () => {
      const q = 'Explain the Node.js event loop phases and how microtasks are executed.';
      const intent = classifyQuestionIntent(q, 'interview');
      expect(intent).toBe('runtime_internals');

      const prompt = buildCandidateSystemPrompt(
        verifiedResume,
        DEFAULT_JOB_DESCRIPTION,
        'Node.js Backend Engineer',
        'TypeScript',
        'interview',
        [],
        'Node.js',
        intent,
        q
      );

      expect(prompt).toContain('RUNTIME_INTERNALS');
      expect(prompt).toContain('60–110 words');
      expect(prompt).toContain('DIRECT ANSWER');
    });

    it('5. PostgreSQL MVCC & Indexes: classifies database/SQL with write cost trade-off', () => {
      const q = 'How does PostgreSQL implement MVCC and when do indexes hurt performance?';
      const intent = classifyQuestionIntent(q, 'interview');
      expect(intent).toBe('databases_sql');

      const prompt = buildCandidateSystemPrompt(
        verifiedResume,
        DEFAULT_JOB_DESCRIPTION,
        'Database Architect',
        'Java',
        'interview',
        [],
        'DBMS',
        intent,
        q
      );

      expect(prompt).toContain('DATABASES_SQL');
      expect(prompt).toContain('60–120 words');
      expect(prompt).toContain('TRADE-OFF');
    });

    it('6. Testing & Flaky Test Diagnosis: classifies testing reliability and mandates root-cause isolation', () => {
      const q = 'How do you diagnose and eliminate flaky tests in a CI/CD pipeline?';
      const intent = classifyQuestionIntent(q, 'interview');
      expect(intent).toBe('testing_reliability');

      const prompt = buildCandidateSystemPrompt(
        verifiedResume,
        DEFAULT_JOB_DESCRIPTION,
        'Quality Engineer',
        'Java',
        'interview',
        [],
        'DevOps',
        intent,
        q
      );

      expect(prompt).toContain('TESTING_RELIABILITY');
      expect(prompt).toContain('60–120 words');
    });

    it('7. Security: classifies token and encryption boundaries', () => {
      const q = 'What is the difference between OAuth authentication and authorization using JWT?';
      const intent = classifyQuestionIntent(q, 'interview');
      expect(intent).toBe('security');

      const prompt = buildCandidateSystemPrompt(
        verifiedResume,
        DEFAULT_JOB_DESCRIPTION,
        'Security Engineer',
        'Java',
        'interview',
        [],
        'General',
        intent,
        q
      );

      expect(prompt).toContain('SECURITY');
      expect(prompt).toContain('60–120 words');
    });
  });

  describe('Part 2 & 10: Lifecycle, Cancellation & Deduplication Guarantees', () => {
    beforeEach(() => {
      vi.clearAllMocks();
      useAppStore.setState({
        status: 'idle',
        recitalState: 'idle',
        currentQuestion: null,
        currentAnswer: null,
        teleprompterQueue: [],
      });
    });

    it('deduplicates identical in-flight questions to prevent duplicate answer generation', async () => {
      const answerSpy = vi.spyOn(AnswerGenerationService.getInstance(), 'generateAnswer').mockResolvedValue();

      useAppStore.setState({
        currentQuestion: 'Explain database normalization.',
        status: 'generating',
      });

      // Submit identical question while already generating
      await InterviewEngine.handleEvent({
        type: 'QUESTION_DETECTED',
        text: 'Explain database normalization.',
      });

      // Answer generation should NOT be called again for the duplicate
      expect(answerSpy).not.toHaveBeenCalled();
    });

    it('STOP_LISTENING stops audio capture without aborting active AI generation', async () => {
      const audioStopSpy = vi.spyOn(AudioRecorder.getInstance(), 'stop').mockResolvedValue();

      useAppStore.setState({
        status: 'generating',
        currentQuestion: 'What is AWS?',
        currentAnswer: 'Partial generating text...',
      });

      await InterviewEngine.handleEvent({ type: 'STOP_LISTENING' });

      // Audio recording was stopped cleanly
      expect(audioStopSpy).toHaveBeenCalledWith(false);

      // Status remains 'generating' so in-flight answer is NOT destroyed!
      expect(useAppStore.getState().status).toBe('generating');
    });

    it('CANCEL_ACTIVE_REQUEST cleanly terminates active generation, purges queue, and restores safe state', async () => {
      const abortSpy = vi.spyOn(InterviewEngine, 'cancelAllActiveWork');

      useAppStore.setState({
        status: 'generating',
        currentQuestion: 'How does OT work?',
        currentAnswer: 'Partial text',
        teleprompterQueue: ['Sentence 1', 'Sentence 2'],
      });

      await InterviewEngine.handleEvent({ type: 'CANCEL_ACTIVE_REQUEST' });

      expect(abortSpy).toHaveBeenCalled();
      expect(useAppStore.getState().teleprompterQueue).toEqual([]);
      expect(useAppStore.getState().status).toBe('idle');
    });
  });

  describe('Part 14: Latency Tracking Precision', () => {
    it('accurately records latency timestamps per request lifecycle', () => {
      globalLatencyTracker.reset();

      globalLatencyTracker.mark('questionDetected');
      globalLatencyTracker.mark('generationStart');
      globalLatencyTracker.markFirstSentenceOnce();
      globalLatencyTracker.mark('generationEnd');

      const report = globalLatencyTracker.getReport();

      expect(report.timeToFirstSentence).toBeDefined();
      expect(report.generationDuration).toBeDefined();
      expect(report.totalPipelineLatency).toBeDefined();
    });
  });
});
