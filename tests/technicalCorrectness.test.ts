import { describe, it, expect } from 'vitest';
import { QuestionUnderstandingEngine } from '../src/services/questionUnderstanding';
import { TechnicalReasoningEngine } from '../src/services/technicalReasoning';
import { ProductionDebuggingEngine } from '../src/services/productionDebugging';
import { FollowUpEngine } from '../src/services/followUpEngine';
import { CandidateKnowledgeBase, CandidateConfirmationWorkflow } from '../src/services/candidateIntelligence';

describe('IAC 2.0 Technical Correctness, Reasoning & Domain Intelligence Suite', () => {
  describe('Question Understanding Engine — 16 Category Coverage', () => {
    it('classifies Programming fundamentals', () => {
      const analysis = QuestionUnderstandingEngine.analyze('Explain pass by value versus pass by reference in memory.');
      expect(analysis.category).toBe('Programming fundamentals');
      expect(analysis.expectedDepth).toBe('intermediate');
    });

    it('classifies Data structures and algorithms', () => {
      const analysis = QuestionUnderstandingEngine.analyze('Find the median of two sorted arrays in O(log(min(m,n))) time.', 'coding');
      expect(analysis.category).toBe('Data structures and algorithms');
      expect(analysis.isCodeExpected).toBe(true);
    });

    it('classifies Java and concurrency with hidden JMM requirement', () => {
      const analysis = QuestionUnderstandingEngine.analyze('Explain the difference between volatile and synchronized in Java.');
      expect(analysis.category).toBe('Java and concurrency');
      expect(analysis.hiddenRequirement).toContain('Java Memory Model');
    });

    it('classifies JavaScript and Node.js with event loop requirement', () => {
      const analysis = QuestionUnderstandingEngine.analyze('Explain how process.nextTick and Promise microtasks interact with the Node.js event loop.');
      expect(analysis.category).toBe('JavaScript and Node.js');
      expect(analysis.hiddenRequirement).toContain('non-blocking I/O');
    });

    it('classifies React and frontend', () => {
      const analysis = QuestionUnderstandingEngine.analyze('How does React Virtual DOM reconciliation work and when should you use useCallback?');
      expect(analysis.category).toBe('React and frontend');
    });

    it('classifies Backend engineering', () => {
      const analysis = QuestionUnderstandingEngine.analyze('How would you design a token bucket rate limiter middleware for a REST API?');
      expect(analysis.category).toBe('Backend engineering');
    });

    it('classifies Databases with index write amplification and isolation awareness', () => {
      const analysis = QuestionUnderstandingEngine.analyze('How does PostgreSQL handle MVCC and why can excessive indexes slow down write throughput?');
      expect(analysis.category).toBe('Databases');
      expect(analysis.hiddenRequirement).toContain('trade-offs: index write amplification');
    });

    it('classifies AWS and cloud', () => {
      const analysis = QuestionUnderstandingEngine.analyze('Explain the difference between deploying on AWS ECS Fargate versus EKS with EC2 nodes.');
      expect(analysis.category).toBe('AWS and cloud');
    });

    it('classifies DevOps and container orchestration', () => {
      const analysis = QuestionUnderstandingEngine.analyze('How do you set up zero-downtime rolling deployments in Kubernetes with readiness probes?');
      expect(analysis.category).toBe('DevOps');
    });

    it('classifies Distributed systems with delivery guarantee requirements', () => {
      const analysis = QuestionUnderstandingEngine.analyze('How do you implement idempotency keys for distributed payment transactions?');
      expect(analysis.category).toBe('Distributed systems');
      expect(analysis.hiddenRequirement).toContain('distributed systems realities');
    });

    it('classifies System design with SPOF and trade-off expectations', () => {
      const analysis = QuestionUnderstandingEngine.analyze('Design a real-time collaborative document editor like Google Docs.');
      expect(analysis.category).toBe('System design');
      expect(analysis.expectedDepth).toBe('deep');
      expect(analysis.targetSpokenDurationSec).toBeGreaterThanOrEqual(90);
    });

    it('classifies Security and token trust boundaries', () => {
      const analysis = QuestionUnderstandingEngine.analyze('How do you prevent CSRF and XSS attacks when handling JWT authentication?');
      expect(analysis.category).toBe('Security');
      expect(analysis.hiddenRequirement).toContain('trust boundaries');
    });

    it('classifies Debugging and enforces evidence-driven diagnosis', () => {
      const analysis = QuestionUnderstandingEngine.analyze('How would you debug a sudden 504 Gateway Timeout spike in production under heavy load?');
      expect(analysis.category).toBe('Debugging');
      expect(analysis.isPracticalExperience).toBe(true);
      expect(analysis.hiddenRequirement).toContain('disciplined methodology');
    });

    it('classifies Testing and flaky test mitigation', () => {
      const analysis = QuestionUnderstandingEngine.analyze('How do you identify and eliminate flaky tests in an asynchronous CI/CD test suite?');
      expect(analysis.category).toBe('Testing');
    });

    it('classifies Behavioral interviews using STAR guidance', () => {
      const analysis = QuestionUnderstandingEngine.analyze('Tell me about a time you had a technical disagreement with a teammate and how you resolved it.');
      expect(analysis.category).toBe('Behavioral interviews');
      expect(analysis.expectedDepth).toBe('deep');
    });

    it('classifies Project deep dives with personal ownership expectation', () => {
      const analysis = QuestionUnderstandingEngine.analyze('Walk me through your project DocFlow: what was your architecture and what did you personally build?');
      expect(analysis.category).toBe('Project deep dives');
      expect(analysis.expectedDepth).toBe('deep');
      expect(analysis.isPracticalExperience).toBe(true);
    });
  });

  describe('Technical Reasoning Engine & 8-Step Pipeline', () => {
    it('defines all 8 sequential reasoning steps with actionable guidance', () => {
      expect(TechnicalReasoningEngine.STEPS).toHaveLength(8);
      expect(TechnicalReasoningEngine.STEPS[0].name).toBe('Understand the requirement');
      expect(TechnicalReasoningEngine.STEPS[4].name).toBe('Verify correctness');
      expect(TechnicalReasoningEngine.STEPS[5].name).toBe('Identify trade-offs');
      expect(TechnicalReasoningEngine.STEPS[7].name).toBe('Check for misleading claims');
    });

    it('generates domain verification rules for PostgreSQL MVCC and indexing', () => {
      const rule = TechnicalReasoningEngine.getDomainVerification('Databases');
      expect(rule.domain).toContain('PostgreSQL');
      expect(rule.mandatoryChecks.some((c) => c.includes('PostgreSQL MVCC: Updates create new tuple versions'))).toBe(true);
      expect(rule.strictProhibitions.some((p) => p.includes('indexing every column blindly'))).toBe(true);
    });

    it('generates domain verification rules for Node.js event loop and microtasks', () => {
      const rule = TechnicalReasoningEngine.getDomainVerification('JavaScript and Node.js');
      expect(rule.domain).toContain('Node.js');
      expect(rule.mandatoryChecks.some((c) => c.includes('process.nextTick runs before Promise microtasks'))).toBe(true);
      expect(rule.strictProhibitions.some((p) => p.includes('Node.js is multi-threaded for standard JS execution'))).toBe(true);
    });
  });

  describe('Production Debugging Engine & 7-Stage Sequence', () => {
    it('includes all 7 diagnostic stages and enforces metric citations', () => {
      const promptSection = ProductionDebuggingEngine.buildDebuggingPromptSection();
      expect(promptSection).toContain('1. SYMPTOM');
      expect(promptSection).toContain('2. HYPOTHESES');
      expect(promptSection).toContain('3. MEASUREMENTS');
      expect(promptSection).toContain('4. ROOT CAUSE');
      expect(promptSection).toContain('5. IMMEDIATE MITIGATION');
      expect(promptSection).toContain('6. PERMANENT FIX');
      expect(promptSection).toContain('7. VERIFICATION');
      expect(promptSection).toContain('p50, p95, p99 percentiles');
      expect(promptSection).toContain('Queue depth, connection-pool wait time');
    });
  });

  describe('Dynamic Follow-Up Engine', () => {
    it('predicts database alternative follow-up when PostgreSQL is cited in answer', () => {
      const followUps = FollowUpEngine.predictFollowUps(
        'How do you store document metadata?',
        'I use PostgreSQL with JSONB columns for flexible document attributes while preserving ACID constraints.'
      );
      expect(followUps.some((f) => f.question.includes('Why did you choose PostgreSQL over a document store'))).toBe(true);
    });

    it('predicts cache failure follow-up when Redis is cited in answer', () => {
      const followUps = FollowUpEngine.predictFollowUps(
        'How do you manage active sessions?',
        'We cache active session tokens in Redis to keep read latency sub-5ms.'
      );
      expect(followUps.some((f) => f.question.includes('What happens if the Redis cache nodes crash'))).toBe(true);
    });

    it('predicts ownership follow-up when team language is used', () => {
      const followUps = FollowUpEngine.predictFollowUps(
        'Describe your collaboration project',
        'In our project, we built a WebSocket sync layer and our team designed the operational transformation protocol.'
      );
      expect(followUps.some((f) => f.question.includes('What specific parts of this architecture did you personally write'))).toBe(true);
    });
  });

  describe('Candidate Knowledge Base & Project Profile Management', () => {
    it('parses structured project profile and verifies personal ownership', () => {
      const resume = `
Abhishek Singh
Projects:
DocFlow – Real-time collaborative document editor
• Architected document synchronization with WebSockets and Redis in Node.js.
• Handled concurrent edits.
Technologies: TypeScript, Node.js, PostgreSQL, Redis, WebSockets
`;
      const kb = new CandidateKnowledgeBase(resume);
      const project = kb.getProject('DocFlow');
      expect(project).toBeDefined();
      expect(project?.name).toBe('DocFlow');
      // Technology keywords mentioned on resume alone are NOT verified implementations
      expect(kb.isTechnologyMentioned('TypeScript')).toBe(true);
      expect(kb.isTechnologyVerified('TypeScript')).toBe(false);
      expect(kb.isTechnologyVerified('C++')).toBe(false);

      // Explicit confirmation promotes technologies to verified status
      const ticket = CandidateConfirmationWorkflow.issueTicket('DocFlow');
      kb.confirmProject('DocFlow', {
        ticket,
        ownership: 'contributor',
        personalContribution: 'Implemented document sync using WebSockets',
        verifiedTechnologies: ['TypeScript', 'PostgreSQL'],
      });
      expect(kb.isTechnologyVerified('TypeScript')).toBe(true);
      expect(kb.isTechnologyVerified('PostgreSQL')).toBe(true);
    });

    it('retrieves relevant project profile based on question topic', () => {
      const resume = `
Abhishek Singh
DocFlow – Real-time collaborative document editor in TypeScript and WebSockets.
`;
      const kb = new CandidateKnowledgeBase(resume);
      // General question without project reference returns null
      expect(kb.findRelevantProject('How do you handle real-time collaboration?')).toBeNull();

      // Targeted project inquiry retrieves the relevant project
      const relevant = kb.findRelevantProject('In your project DocFlow, how do you handle real-time collaboration?');
      expect(relevant).toBeDefined();
      expect(relevant?.name).toBe('DocFlow');
    });
  });
});
