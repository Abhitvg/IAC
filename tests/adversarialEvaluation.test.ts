import { describe, it, expect, beforeEach } from 'vitest';
import { CandidateKnowledgeBase, FactualGroundingValidator } from '../src/services/candidateIntelligence';
import { EvaluationScorer } from '../src/services/evaluationScorer';
import { ProductionDebuggingEngine } from '../src/services/productionDebugging';
import { TechnicalReasoningEngine } from '../src/services/technicalReasoning';
import { isTrustedSender, isSafeExternalUrl, redactSensitiveData } from '../electron/services/security';

describe('IAC 2.0 Adversarial Evaluation Suite & Anti-Hallucination Guardrails', () => {
  let kb: CandidateKnowledgeBase;

  const verifiedResume = `
Abhishek Singh
Senior Software Engineer
Projects:
DocFlow – Real-time collaborative document editor
• Architected document synchronization using Operational Transformation and WebSockets in TypeScript and Node.js.
• Integrated Redis Pub/Sub and PostgreSQL for session management and persistence.
• Handled concurrent edits across distributed browser clients.
Skills: Java, TypeScript, Node.js, React, PostgreSQL, Redis, Docker, WebSockets, Git.
`;

  beforeEach(() => {
    kb = new CandidateKnowledgeBase(verifiedResume, 'Abhishek Singh');
  });

  describe('Adversarial Test 1: Fabricated Resume Achievements & Metrics', () => {
    it('catches and fails answer claiming fabricated 10,000 concurrent users', () => {
      const fabricatedAnswer =
        'In my project DocFlow, I implemented a custom CRDT supporting 10,000 concurrent users without any degradation.';

      const result = EvaluationScorer.evaluateAnswer(
        'How many users does DocFlow support?',
        fabricatedAnswer,
        kb
      );

      expect(result.passed).toBe(false);
      expect(result.criticalFailure).toBe(true);
      expect(result.overallScore).toBeLessThan(50);
      expect(result.failureReason).toContain('Factual grounding failure');
      expect(result.violations.some((v) => v.includes('10,000 concurrent users'))).toBe(true);
    });

    it('catches unsupported latency improvement claims (e.g. reduced latency by 85%)', () => {
      const fabricatedAnswer =
        'I optimized the PostgreSQL queries and reduced latency by 85% across our production clusters.';

      const validation = FactualGroundingValidator.validateAnswer(fabricatedAnswer, kb);
      expect(validation.isGrounded).toBe(false);
      expect(validation.violations.some((v) => v.includes('Unverified performance claim'))).toBe(true);
    });

    it('passes grounded answer that honestly acknowledges unverified telemetry metrics', () => {
      const groundedAnswer =
        "I worked on the collaborative editing architecture for DocFlow. I would need to verify our exact telemetry logs before quoting a specific concurrency benchmark, but in local test harnesses it sustained concurrent typing across active browser tabs without desynchronization.";

      const result = EvaluationScorer.evaluateAnswer(
        'What were the concurrency benchmarks for DocFlow?',
        groundedAnswer,
        kb
      );

      expect(result.passed).toBe(true);
      expect(result.dimensions.factualGrounding).toBeGreaterThanOrEqual(90);
    });
  });

  describe('Adversarial Test 2: Distributed Systems & Exactly-Once Fallacy', () => {
    it('detects and flags false claims of exactly-once delivery across independent systems', () => {
      const misleadingAnswer =
        'Our microservices architecture guarantees exactly-once delivery across all services, ensuring no duplicate events are ever processed.';

      const validation = FactualGroundingValidator.validateAnswer(misleadingAnswer, kb);
      expect(validation.isGrounded).toBe(false);
      expect(validation.violations.some((v) => v.includes('exactly-once delivery across independent systems'))).toBe(true);
    });

    it('passes answer explaining at-least-once delivery coupled with consumer idempotency', () => {
      const correctDistributedAnswer =
        "Network channels can only guarantee at-least-once delivery because network partitions can cause unacknowledged retries. For example, in payment processing, each request includes a unique idempotency key. The consumer checks Redis atomically before execution so that duplicate deliveries return the existing response instead of re-executing. The trade-off is storage overhead for idempotency keys with a suitable TTL.";

      const result = EvaluationScorer.evaluateAnswer(
        'How do you guarantee exactly-once processing in distributed systems?',
        correctDistributedAnswer,
        kb,
        {
          requiredMechanisms: ['at-least-once', 'idempotenc'],
          forbiddenMisconceptions: ['guarantees exactly-once network delivery'],
        }
      );

      expect(result.passed).toBe(true);
      expect(result.dimensions.technicalCorrectness).toBe(100);
    });
  });

  describe('Adversarial Test 3: Kafka Message Ordering Guarantees', () => {
    it('enforces that Kafka ordering is strictly per-partition, not global across topics', () => {
      const rule = TechnicalReasoningEngine.getDomainVerification('Distributed systems');
      expect(rule.mandatoryChecks.some((c) => c.includes('Kafka ordering: Guaranteed strictly within a single partition'))).toBe(true);
      expect(rule.strictProhibitions.some((p) => p.includes('global message ordering across partitions'))).toBe(true);

      const invalidKafkaAnswer =
        'Apache Kafka automatically guarantees strict total ordering of all events across the entire topic regardless of partition count.';

      const result = EvaluationScorer.evaluateAnswer(
        'Does Kafka guarantee global message ordering?',
        invalidKafkaAnswer,
        kb,
        {
          forbiddenMisconceptions: ['guarantees strict total ordering.*across the entire topic'],
        }
      );

      expect(result.dimensions.technicalCorrectness).toBeLessThan(70);
    });
  });

  describe('Adversarial Test 4: Java Memory Model & Volatile Concurrency Semantics', () => {
    it('rejects the misconception that volatile makes non-atomic operations (e.g. count++) thread-safe', () => {
      const falseJavaAnswer =
        'Declaring a counter variable volatile guarantees thread-safety for count++ because writes are immediately visible to other threads.';

      const result = EvaluationScorer.evaluateAnswer(
        'Is count++ thread-safe when count is volatile?',
        falseJavaAnswer,
        kb,
        {
          forbiddenMisconceptions: ['volatile guarantees thread-safety for count\\+\\+'],
        }
      );

      expect(result.dimensions.technicalCorrectness).toBeLessThan(70);
      expect(result.violations.some((v) => v.includes('Technical misconception detected'))).toBe(true);
    });

    it('passes correct explanation of volatile visibility vs synchronized mutual exclusion', () => {
      const correctJavaAnswer =
        "Volatile guarantees visibility and ordering via memory barriers, but it does not guarantee atomicity for compound operations like count++. Synchronized guarantees both visibility and mutual exclusion via a monitor lock. For example, if multiple threads increment a counter, volatile will suffer race conditions, so you need AtomicInteger or synchronized. The trade-off is monitor lock contention overhead.";

      const result = EvaluationScorer.evaluateAnswer(
        'What is the difference between volatile and synchronized in Java?',
        correctJavaAnswer,
        kb,
        {
          requiredMechanisms: ['visibility', 'atomicity', 'synchronized'],
        }
      );

      expect(result.passed).toBe(true);
      expect(result.dimensions.technicalCorrectness).toBe(100);
    });
  });

  describe('Adversarial Test 5: Production Debugging Anti-Patterns', () => {
    it('flags blind thread-pool expansion as an anti-pattern', () => {
      const rule = ProductionDebuggingEngine.ANTI_PATTERNS.find(
        (a) => a.rule === 'NO_BLIND_THREAD_POOL_INCREASE'
      );
      expect(rule).toBeDefined();
      expect(rule?.description).toContain('context-switching overhead');
    });

    it('flags blind database connection-pool expansion as an anti-pattern', () => {
      const rule = ProductionDebuggingEngine.ANTI_PATTERNS.find(
        (a) => a.rule === 'NO_BLIND_DB_CONNECTION_POOL_INCREASE'
      );
      expect(rule).toBeDefined();
      expect(rule?.description).toContain('PostgreSQL allocates memory per backend');
    });

    it('rejects confusing HTTP request duration with network RTT', () => {
      const rule = ProductionDebuggingEngine.ANTI_PATTERNS.find(
        (a) => a.rule === 'NO_CONFUSING_HTTP_DURATION_WITH_RTT'
      );
      expect(rule).toBeDefined();
      expect(rule?.description).toContain('server ingress queue wait time');
    });

    it('rejects naive retries without jitter and circuit breakers', () => {
      const rule = ProductionDebuggingEngine.ANTI_PATTERNS.find(
        (a) => a.rule === 'NO_BLIND_RETRIES'
      );
      expect(rule).toBeDefined();
      expect(rule?.description).toContain('retry storms');
    });

    it('rejects assuming a timeout equals operation failure', () => {
      const rule = ProductionDebuggingEngine.ANTI_PATTERNS.find(
        (a) => a.rule === 'NO_ASSUMING_TIMEOUT_MEANS_FAILURE'
      );
      expect(rule).toBeDefined();
      expect(rule?.description).toContain('downstream write may have succeeded');
    });
  });

  describe('Adversarial Test 6: Electron IPC & Security Hardening', () => {
    it('rejects IPC calls from non-main frame or untrusted sender', () => {
      const mockMainWindow = {
        webContents: {
          mainFrame: { id: 1 },
        },
      };

      const untrustedEvent = {
        senderFrame: { id: 99, parent: { id: 1 } }, // Child iframe / rogue injection
      };

      const trustedEvent = {
        senderFrame: mockMainWindow.webContents.mainFrame,
      };

      expect(isTrustedSender(untrustedEvent as any, mockMainWindow as any)).toBe(false);
      expect(isTrustedSender(trustedEvent as any, mockMainWindow as any)).toBe(true);
    });

    it('validates safe external URLs and denies javascript: or file: schemes', () => {
      expect(isSafeExternalUrl('https://github.com')).toBe(true);
      expect(isSafeExternalUrl('http://localhost:5173')).toBe(true);
      expect(isSafeExternalUrl('javascript:alert(1)')).toBe(false);
      expect(isSafeExternalUrl('file:///etc/passwd')).toBe(false);
      expect(isSafeExternalUrl('data:text/html,<script>evil()</script>')).toBe(false);
    });

    it('redacts sensitive API keys and JWT tokens from OCR text and logs', () => {
      const rawText =
        'Found API key gsk_1234567890abcdef1234567890 and Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.doNotLeakThisToken in the terminal.';

      const redacted = redactSensitiveData(rawText);
      expect(redacted).not.toContain('gsk_1234567890abcdef1234567890');
      expect(redacted).not.toContain('doNotLeakThisToken');
      expect(redacted).toContain('[REDACTED_GROQ_KEY]');
      expect(redacted).toContain('[REDACTED_JWT_TOKEN]');
    });
  });

  describe('Adversarial Test 7: Weighted Scoring & Cliché AI Filler Detection', () => {
    it('penalizes AI cliché phrases ("Certainly!", "Great question!", "Let\'s dive deep")', () => {
      const clichéAnswer =
        "Certainly! That's a great question! Let's dive deep into database normalization. In summary, it is important to note that normalization reduces redundancy.";

      const result = EvaluationScorer.evaluateAnswer(
        'What is database normalization?',
        clichéAnswer,
        kb
      );

      expect(result.dimensions.clarity).toBeLessThan(60);
      expect(result.violations.some((v) => v.includes('Cliché AI filler detected'))).toBe(true);
    });

    it('fails a well-written but completely fabricated answer despite high clarity', () => {
      const deceptiveAnswer =
        "At Google, I single-handedly re-architected the YouTube ingestion pipeline to handle 500 million concurrent video uploads per second, reducing infrastructure latency by 99% using a proprietary quantum algorithm.";

      const result = EvaluationScorer.evaluateAnswer(
        'Tell me about your most challenging project',
        deceptiveAnswer,
        kb
      );

      // Must strictly fail regardless of writing polish!
      expect(result.passed).toBe(false);
      expect(result.criticalFailure).toBe(true);
      expect(result.overallScore).toBeLessThan(50);
    });
  });
});
