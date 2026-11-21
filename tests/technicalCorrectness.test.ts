import { describe, it, expect } from 'vitest';
import { QuestionUnderstandingEngine } from '../src/services/questionUnderstanding';
import { TechnicalReasoningEngine } from '../src/services/technicalReasoning';
import { ProductionDebuggingEngine } from '../src/services/productionDebugging';
import { FollowUpEngine } from '../src/services/followUpEngine';
import { CandidateKnowledgeBase, CandidateConfirmationWorkflow } from '../src/services/candidateIntelligence';
import { buildCandidateSystemPrompt } from '../src/services/candidatePersona';
import { isQuestionShapedSpeech, shouldAutoRouteUncertainQuestion } from '../src/services/interviewQuestionRouting';
import { classifyUtterance } from '../src/services/interruptionDetector';
import { buildResumeDeepDivePlan } from '../src/services/resumeDeepDive';

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


describe('Cloud platform and DevOps correctness rules', () => {
  it('classifies Terraform and Kubernetes questions as DevOps', () => {
    const terraform = QuestionUnderstandingEngine.analyze(
      'How do you manage Terraform remote state and prevent concurrent applies?'
    );
    const kubernetes = QuestionUnderstandingEngine.analyze(
      'What is the difference between readiness and liveness probes in Kubernetes?'
    );
    expect(terraform.category).toBe('DevOps');
    expect(kubernetes.category).toBe('DevOps');
    expect(terraform.hiddenRequirement).toContain('safe Terraform state');
    const aws = QuestionUnderstandingEngine.analyze(
      'How do you design private AWS subnets and workload IAM permissions?'
    );
    expect(aws.category).toBe('AWS and cloud');
    expect(aws.hiddenRequirement).toContain('least-privilege IAM');
  });

  it('enforces safe Terraform state and plan/apply distinctions', () => {
    const rules = TechnicalReasoningEngine.getDomainVerification('DevOps');
    expect(rules.mandatoryChecks.some((rule) => rule.includes('never describe plan as a deployment'))).toBe(true);
    expect(rules.mandatoryChecks.some((rule) => rule.includes('native lockfile support'))).toBe(true);
    expect(rules.strictProhibitions.some((rule) => rule.includes('terraform plan changes infrastructure'))).toBe(true);
  });

  it('enforces Kubernetes probe and resource semantics', () => {
    const rules = TechnicalReasoningEngine.getDomainVerification('DevOps');
    expect(rules.mandatoryChecks.some((rule) => rule.includes('readiness, liveness, and startup probes'))).toBe(true);
    expect(rules.strictProhibitions.some((rule) => rule.includes('liveness probe should fail'))).toBe(true);
    expect(rules.strictProhibitions.some((rule) => rule.includes('resource limits are equivalent to requests'))).toBe(true);
  });

  it('enforces AWS networking and IAM correctness', () => {
    const rules = TechnicalReasoningEngine.getDomainVerification('AWS and cloud');
    expect(rules.mandatoryChecks.some((rule) => rule.includes('least privilege'))).toBe(true);
    expect(rules.mandatoryChecks.some((rule) => rule.includes('VPC CIDRs, subnet routing'))).toBe(true);
    expect(rules.strictProhibitions.some((rule) => rule.includes('security group as stateless'))).toBe(true);
    expect(rules.strictProhibitions.some((rule) => rule.includes('private subnet has internet access'))).toBe(true);
  });
});


  it('prioritizes DevOps mechanisms in mixed AWS and Terraform questions', () => {
    const terraformAws = QuestionUnderstandingEngine.analyze(
      'How would you manage Terraform state for AWS infrastructure and prevent concurrent applies?'
    );
    const eksDelivery = QuestionUnderstandingEngine.analyze(
      'How would you deploy a Dockerized service to EKS through a CI/CD pipeline?'
    );
    expect(terraformAws.category).toBe('DevOps');
    expect(eksDelivery.category).toBe('DevOps');
    expect(terraformAws.hiddenRequirement).toContain('safe Terraform state');
  });

  it('predicts operational follow-ups for Terraform, Kubernetes, and AWS networking', () => {
    const terraform = FollowUpEngine.predictFollowUps(
      'How do you manage AWS infrastructure?',
      'I use Terraform remote state and review the plan before apply.',
      'AWS and cloud'
    );
    const kubernetes = FollowUpEngine.predictFollowUps(
      'How do you operate workloads?',
      'The Kubernetes deployment uses readiness probes and Services.',
      'DevOps'
    );
    const networking = FollowUpEngine.predictFollowUps(
      'How do private workloads access AWS services?',
      'The VPC uses private subnets, route tables, and VPC endpoints.',
      'AWS and cloud'
    );
    expect(terraform[0].question).toContain('Terraform state');
    expect(kubernetes[0].question).toContain('pod is healthy');
    expect(networking[0].question).toContain('private workload');
  });



describe('Non-blocking live question routing', () => {
  it('routes uncertain interviewer questions automatically without confirmation', () => {
    expect(shouldAutoRouteUncertainQuestion({
      type: 'UNCLASSIFIED',
      needsConfirmation: true,
      confidence: 0.42,
    }, 'Can you explain Kafka consumer offsets?')).toBe(true);
    expect(shouldAutoRouteUncertainQuestion({
      type: 'INTERVIEWER_INTERRUPTION',
      needsConfirmation: false,
      confidence: 0.55,
    }, 'Walk me through the deployment.')).toBe(true);
    expect(shouldAutoRouteUncertainQuestion({
      type: 'INTERVIEWER_INTERRUPTION',
      needsConfirmation: true,
      confidence: 0.45,
      questionText: 'What happens when a pod fails?',
    })).toBe(true);
  });

  it('does not generate answers for uncertain filler or ordinary background speech', () => {
    expect(shouldAutoRouteUncertainQuestion({
      type: 'UNCLASSIFIED',
      needsConfirmation: true,
      confidence: 0.2,
    }, 'Yeah, okay.')).toBe(false);
    expect(shouldAutoRouteUncertainQuestion({
      type: 'UNCLASSIFIED',
      needsConfirmation: true,
      confidence: 0.3,
    }, 'The weather is nice today.')).toBe(false);
    expect(shouldAutoRouteUncertainQuestion({
      type: 'CONVERSATIONAL_FILLER',
      needsConfirmation: true,
      confidence: 0.3,
    }, 'What is Kubernetes?')).toBe(false);
  });

  it('classifies command-style prompts as questions before applying automatic routing', () => {
    const commandPrompts = [
      'Design a CI/CD pipeline.',
      'Implement an LRU cache in Java.',
      'Build a CI/CD pipeline.',
      'Create a REST API.',
      'List the AWS services you used.',
      'Trace this algorithm.',
      'Derive the time complexity.',
      'Please build a deployment pipeline.',
    ];

    for (const prompt of commandPrompts) {
      const classification = classifyUtterance(prompt, null);
      expect(classification.type).toBe('UNCLASSIFIED');
      expect(classification.needsConfirmation).toBe(true);
      expect(shouldAutoRouteUncertainQuestion(classification, prompt)).toBe(true);
    }
  });

  it('recognizes concise and command-style interview questions', () => {
    expect(isQuestionShapedSpeech('Kafka?')).toBe(true);
    expect(isQuestionShapedSpeech('Explain Java memory management.')).toBe(true);
    expect(isQuestionShapedSpeech('Design a CI/CD pipeline.')).toBe(true);
    expect(isQuestionShapedSpeech('Right.')).toBe(false);
    expect(isQuestionShapedSpeech('')).toBe(false);
  });
});

describe('Resume narrative grounding', () => {
  it('builds realistic experience narratives without inventing missing implementation details', () => {
    const prompt = buildCandidateSystemPrompt(
      'ATMA Research & Consultancy: Owned backend services using Java 8 and Spring Boot. Kafka event pipelines for inventory updates. 10K+ daily users; 99.9% uptime.',
      '',
      'Software Development Engineer',
      'Java',
      'interview',
      [],
      'Project',
      'resume',
      'Walk me through the Kafka event pipeline you worked on.'
    );
    expect(prompt).toContain('EVIDENCE-LED EXPERIENCE NARRATIVE');
    expect(prompt).toContain('Never upgrade "worked with" into "owned"');
    expect(prompt).toContain('Never invent incidents, outages, root causes');
    expect(prompt).toContain('preserve resume metrics exactly');
  });

  it('never pauses a live interview for candidate input or confirmation', () => {
    const prompt = buildCandidateSystemPrompt(
      'ATMA Research & Consultancy: Java 8, Spring Boot, Kafka event pipelines; 10K+ daily users; 99.9% uptime.',
      '',
      'Software Development Engineer',
      'Java',
      'interview',
      [],
      'Project',
      'resume',
      'Walk me through the exact Kafka consumer configuration and failure recovery.'
    );
    expect(prompt).toContain('LIVE RESPONSE CONTINUITY');
    expect(prompt).toContain('Do not pause the response to collect missing details');
    expect(prompt).toContain('hypothetical approach');
    expect(prompt).not.toContain('ask the candidate to confirm the missing detail');
    expect(prompt).not.toContain('ask a polite clarifying question');
    expect(prompt).not.toContain('candidate must clarify');
  });

  it('does not add experience storytelling rules to an unrelated conceptual question', () => {
    const prompt = buildCandidateSystemPrompt(
      'Java and Spring Boot developer.',
      '',
      'Software Engineer',
      'Java',
      'interview',
      [],
      'General',
      'conceptual',
      'What is the Java garbage collector?'
    );
    expect(prompt).not.toContain('EVIDENCE-LED EXPERIENCE NARRATIVE');
  });
});


describe('Resume deep-dive preparation planner', () => {
  it('creates project narratives and exposes missing personal evidence as clarification tasks', () => {
    const kb = new CandidateKnowledgeBase(`
ATMA Research & Consultancy
Software Development Engineer
• Own backend services using Java 8 and Spring Boot.
• Implemented Kafka-based event pipelines for inventory updates.
• Supported 10K+ daily users at 99.9% uptime.
Projects:
Quorum – Real-Time Collaboration Platform
• Built a full-stack collaboration platform using Next.js, NestJS, and PostgreSQL.
• Implemented JWT authentication and Google OAuth.
`);
    const plan = buildResumeDeepDivePlan(kb);
    expect(plan.modules.some((module) => module.title === 'Quorum')).toBe(true);
    expect(plan.modules.some((module) => module.kind === 'achievement')).toBe(true);
    const quorum = plan.modules.find((module) => module.title === 'Quorum');
    expect(quorum?.interviewerQuestions.some((question) => question.includes('actual architecture'))).toBe(true);
    expect(quorum?.clarificationNeeded.some((item) => item.includes('personally implement'))).toBe(true);
    expect(plan.coverage.projects).toBeGreaterThan(0);
    expect(plan.totalEvidenceItems).toBeGreaterThan(0);
  });

  it('does not turn resume-reported metrics into confirmed measurements', () => {
    const kb = new CandidateKnowledgeBase(`
Experience:
• Reduced API latency by 35%.
`);
    const plan = buildResumeDeepDivePlan(kb);
    const metric = plan.modules.find((module) => module.kind === 'achievement');
    expect(metric?.evidence[0].verificationStatus).toBe('RESUME_REPORTED');
    expect(metric?.clarificationNeeded.length).toBeGreaterThan(0);
  });
});



describe('Coding answer contract', () => {
  it('requires complete Java, correctness reasoning, edge cases, and honest verification claims', () => {
    const prompt = buildCandidateSystemPrompt(
      '',
      '',
      'Software Engineer',
      'Java',
      'coding',
      [],
      'Data structures and algorithms',
      'coding',
      'Implement a function to find the first non-repeating character.'
    );
    expect(prompt).toContain('Provide complete Java code');
    expect(prompt).toContain('Respect the exact function signature and platform contract');
    expect(prompt).toContain('Dry-run a representative example');
    expect(prompt).toContain('Never claim code was compiled, executed, or passed tests');
  });
});
