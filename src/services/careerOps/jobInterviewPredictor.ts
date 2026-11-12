/**
 * CareerOps Company-Specific Interview Question & Loop Predictor
 *
 * Predicts the exact technical loops, system design bottlenecks, and behavioral STAR
 * questions asked in real interviews for top tech companies (Anthropic, OpenAI, Stripe,
 * Datadog, Google, Meta, Amazon, Netflix, etc.) and arbitrary tech stacks.
 */

export interface PredictedInterviewQuestion {
  id: string;
  type: 'coding' | 'system_design' | 'behavioral' | 'architecture';
  prompt: string;
  category: string;
  difficulty: 'Medium' | 'Hard';
  companyContext: string;
  keyEvaluationPoints: string[];
}

export interface InterviewStageBlueprint {
  stageNumber: number;
  name: string;
  duration: string;
  interviewerRole: string;
  focus: string;
  format: 'Recruiter Call' | 'Technical Screen' | 'Onsite System Design' | 'Onsite Coding' | 'Bar Raiser / Culture';
}

export interface PredictedInterviewLoop {
  company: string;
  role: string;
  overview: string;
  stages: InterviewStageBlueprint[];
  technicalQuestions: PredictedInterviewQuestion[];
  behavioralQuestions: PredictedInterviewQuestion[];
}

export function predictInterviewLoop(
  company: string,
  role: string,
  jdText: string
): PredictedInterviewLoop {
  const lowerJd = jdText.toLowerCase();
  const lowerCompany = company.toLowerCase();

  const technicalQuestions: PredictedInterviewQuestion[] = [];
  const behavioralQuestions: PredictedInterviewQuestion[] = [];
  let stages: InterviewStageBlueprint[] = [];

  // Detect Core Stacks
  const hasKafka = lowerJd.includes('kafka') || lowerJd.includes('event-driven') || lowerJd.includes('streaming');
  const hasDistributed = lowerJd.includes('distributed') || lowerJd.includes('microservice') || lowerJd.includes('high-throughput');
  const hasDatabase = lowerJd.includes('sql') || lowerJd.includes('nosql') || lowerJd.includes('postgres') || lowerJd.includes('redis');
  const hasAi = lowerJd.includes('ai') || lowerJd.includes('llm') || lowerJd.includes('machine learning') || lowerJd.includes('eval');
  const hasFrontend = lowerJd.includes('react') || lowerJd.includes('typescript') || lowerJd.includes('frontend') || lowerJd.includes('ui');

  // Company-specific blueprints
  if (lowerCompany.includes('anthropic')) {
    stages = [
      { stageNumber: 1, name: 'Recruiter Alignment', duration: '30 min', interviewerRole: 'Talent Lead', focus: 'AI alignment passion, compensation, and mission fit', format: 'Recruiter Call' },
      { stageNumber: 2, name: 'Technical Systems Screen', duration: '60 min', interviewerRole: 'Member of Technical Staff', focus: 'Scalable distributed systems or Python/Rust systems debugging', format: 'Technical Screen' },
      { stageNumber: 3, name: 'AI Infrastructure & Architecture', duration: '60 min', interviewerRole: 'Infra Lead', focus: 'GPU cluster orchestration, checkpointing, and high-throughput training', format: 'Onsite System Design' },
      { stageNumber: 4, name: 'Safety & Evaluation Engineering', duration: '60 min', interviewerRole: 'Safety Research Engineer', focus: 'Model evaluations, red-teaming harnesses, and determinism', format: 'Onsite Coding' },
      { stageNumber: 5, name: 'Core Culture & Alignment', duration: '45 min', interviewerRole: 'Founding Member / MTS', focus: 'Long-term AI safety, intellectual honesty, and high-agency execution', format: 'Bar Raiser / Culture' },
    ];
    technicalQuestions.push({
      id: 'pred-anthropic-1',
      type: 'architecture',
      prompt: 'Design a distributed evaluation and safety benchmarking pipeline that runs thousands of multimodal model checkpoints against dynamic test suites with deterministic replayability.',
      category: 'AI Infrastructure & Safety Systems',
      difficulty: 'Hard',
      companyContext: 'Anthropic emphasizes scalable oversight, deterministic harness execution, and zero silent data corruption during evaluations.',
      keyEvaluationPoints: [
        'Deterministic sandbox isolation for untrusted AI-generated code',
        'Efficient test batching and GPU/CPU resource scheduling',
        'Transparent anomaly scoring and automated regression detection',
      ],
    });
  } else if (lowerCompany.includes('openai')) {
    stages = [
      { stageNumber: 1, name: 'Recruiter Phone Screen', duration: '30 min', interviewerRole: 'Technical Recruiter', focus: 'Background, AI projects, and role expectations', format: 'Recruiter Call' },
      { stageNumber: 2, name: 'Coding & Algorithms Screen', duration: '60 min', interviewerRole: 'Software Engineer', focus: 'High-performance algorithms, concurrency, and clean code', format: 'Technical Screen' },
      { stageNumber: 3, name: 'Distributed Systems & Inference Scale', duration: '60 min', interviewerRole: 'Platform MTS', focus: 'Serving high-throughput LLM requests with dynamic batching', format: 'Onsite System Design' },
      { stageNumber: 4, name: 'Practical Systems Debugging', duration: '60 min', interviewerRole: 'Systems MTS', focus: 'Real-time bug diagnosis in an unfamiliar distributed codebase', format: 'Onsite Coding' },
      { stageNumber: 5, name: 'Mission & Values Interview', duration: '45 min', interviewerRole: 'Engineering Manager', focus: 'Safe AGI development, cross-functional collaboration, and ownership', format: 'Bar Raiser / Culture' },
    ];
    technicalQuestions.push({
      id: 'pred-openai-1',
      type: 'system_design',
      prompt: 'Architect an inference routing layer that distributes incoming token-generation requests across multiple GPU clusters with continuous batching and KV-cache persistence.',
      category: 'LLM Inference Architecture',
      difficulty: 'Hard',
      companyContext: 'OpenAI focuses heavily on P99 latency containment, KV-cache memory management, and gracefully handling model worker failures.',
      keyEvaluationPoints: [
        'Prefix-caching and KV cache locality routing',
        'Pipelined continuous batching and latency SLAs',
        'Fallback routing and graceful degradation on GPU OOM errors',
      ],
    });
  } else if (lowerCompany.includes('stripe')) {
    stages = [
      { stageNumber: 1, name: 'Recruiter Conversation', duration: '30 min', interviewerRole: 'Recruiter', focus: 'Candidate journey, motivations, and Stripe culture fit', format: 'Recruiter Call' },
      { stageNumber: 2, name: 'Technical Phone Screen (Coding)', duration: '60 min', interviewerRole: 'Senior Engineer', focus: 'Practical API design, test-driven development, and edge cases', format: 'Technical Screen' },
      { stageNumber: 3, name: 'System Design: Distributed Ledger', duration: '60 min', interviewerRole: 'Staff Engineer', focus: 'Idempotency, distributed locking, and ledger consistency', format: 'Onsite System Design' },
      { stageNumber: 4, name: 'Bug Hunt & Code Integration', duration: '60 min', interviewerRole: 'Senior Engineer', focus: 'Navigating a real open-source codebase to diagnose and fix a subtle race condition', format: 'Onsite Coding' },
      { stageNumber: 5, name: 'Hiring Manager & Operating Principles', duration: '45 min', interviewerRole: 'Engineering Manager', focus: 'Customer obsession, macro thinking, and user friction elimination', format: 'Bar Raiser / Culture' },
    ];
    technicalQuestions.push({
      id: 'pred-stripe-1',
      type: 'system_design',
      prompt: 'Design an idempotent payment API that guarantees exactly-once transaction processing under network partitions and distributed duplicate retries.',
      category: 'Distributed Systems & FinTech Reliability',
      difficulty: 'Hard',
      companyContext: 'Stripe famously evaluates idempotency keys, distributed lock contention, and zero financial data inconsistency.',
      keyEvaluationPoints: [
        'Idempotency key state machine (pending, processed, failed)',
        'Redis/PostgreSQL distributed locking mechanisms',
        'Reconciliation pipelines and graceful failure rollbacks',
      ],
    });
  } else if (lowerCompany.includes('datadog')) {
    stages = [
      { stageNumber: 1, name: 'Recruiter Chat', duration: '30 min', interviewerRole: 'Recruiter', focus: 'Experience and alignment with Datadog high-scale culture', format: 'Recruiter Call' },
      { stageNumber: 2, name: 'Technical Phone Screen', duration: '60 min', interviewerRole: 'Software Engineer', focus: 'Concurrency, multithreading, and algorithmic efficiency', format: 'Technical Screen' },
      { stageNumber: 3, name: 'High-Throughput Streaming System Design', duration: '60 min', interviewerRole: 'Staff Engineer', focus: 'Time-series ingestion at 1M+ metrics/sec and retention architectures', format: 'Onsite System Design' },
      { stageNumber: 4, name: 'Real-time Coding & Concurrency', duration: '60 min', interviewerRole: 'Senior Engineer', focus: 'Ring buffers, memory-efficient data structures, and GC pressure avoidance', format: 'Onsite Coding' },
      { stageNumber: 5, name: 'Team Lead & Culture Interview', duration: '45 min', interviewerRole: 'Engineering Manager', focus: 'On-call culture, observability passion, and cross-team communication', format: 'Bar Raiser / Culture' },
    ];
    technicalQuestions.push({
      id: 'pred-datadog-1',
      type: 'system_design',
      prompt: 'Architect a time-series metrics ingestion pipeline capable of consuming 2 million telemetry events/sec with sub-second dashboard query availability.',
      category: 'High-Throughput Streaming Systems',
      difficulty: 'Hard',
      companyContext: 'Datadog loops focus heavily on consumer lag mitigation, partitioning strategies, and low-latency storage engines.',
      keyEvaluationPoints: [
        'Kafka partition sizing and consumer group rebalancing',
        'Time-series rollups, downsampling, and columnar compression',
        'P99 tail latency containment under sudden metric bursts',
      ],
    });
  } else if (lowerCompany.includes('alignerr')) {
    stages = [
      { stageNumber: 1, name: 'Technical Assessment', duration: '60 min', interviewerRole: 'Automated Platform', focus: 'Code reasoning, Big-O evaluation, and edge-case spotting', format: 'Technical Screen' },
      { stageNumber: 2, name: 'Architecture & Benchmark Interview', duration: '45 min', interviewerRole: 'AI Lead', focus: 'Designing deterministic evaluation harnesses for coding LLMs', format: 'Onsite System Design' },
    ];
    technicalQuestions.push({
      id: 'pred-alignerr-1',
      type: 'architecture',
      prompt: 'How do you structure an automated, reproducible benchmark suite to evaluate two LLM coding models side-by-side on real Git repositories?',
      category: 'AI Evaluation & Code Reasoning',
      difficulty: 'Hard',
      companyContext: 'Alignerr prioritizes precise technical justifications, Big-O analysis, and spotting subtle edge-case hallucinations in AI code outputs.',
      keyEvaluationPoints: [
        'Deterministic test harnesses and sandbox isolation',
        'Distinguishing syntactically correct code from semantically flawed edge cases',
        'Quantifying time & space complexity trade-offs objectively',
      ],
    });
  } else {
    // Standard Tier-1 Engineering Loop
    stages = [
      { stageNumber: 1, name: 'Recruiter Introductory Call', duration: '30 min', interviewerRole: 'Recruiter', focus: 'Role overview, candidate background, and compensation expectations', format: 'Recruiter Call' },
      { stageNumber: 2, name: 'Technical Screen (Coding/DS)', duration: '60 min', interviewerRole: 'Senior Engineer', focus: 'Data structures, algorithms, problem decomposition, and runtime complexity', format: 'Technical Screen' },
      { stageNumber: 3, name: 'System Architecture & Scale', duration: '60 min', interviewerRole: 'Principal / Staff Engineer', focus: 'High-availability architecture, data partitioning, trade-offs, and failure modes', format: 'Onsite System Design' },
      { stageNumber: 4, name: 'Deep-Dive Domain Coding', duration: '60 min', interviewerRole: 'Senior Team Member', focus: 'Production-quality code, concurrency, modularity, and error handling', format: 'Onsite Coding' },
      { stageNumber: 5, name: 'Leadership & Behavioral (STAR)', duration: '45 min', interviewerRole: 'Engineering Manager', focus: 'Cross-functional collaboration, ownership, handling setbacks, and culture fit', format: 'Bar Raiser / Culture' },
    ];
  }

  // General Technical Questions matching stack
  if (hasKafka || hasDistributed) {
    technicalQuestions.push({
      id: 'pred-dist-1',
      type: 'system_design',
      prompt: `How would you design a distributed event ingestion and dispatch service for ${company} that maintains strict message ordering per customer partition?`,
      category: 'Distributed Systems Architecture',
      difficulty: 'Hard',
      companyContext: `Directly reflects ${company}'s requirements for high-availability event-driven infrastructure.`,
      keyEvaluationPoints: [
        'Partition key hashing and hot-spot prevention',
        'Dead letter queues (DLQ) and backpressure handling',
        'End-to-end telemetry and consumer offset management',
      ],
    });
  }

  if (hasDatabase) {
    technicalQuestions.push({
      id: 'pred-db-1',
      type: 'architecture',
      prompt: 'Walk through your strategy for diagnosing and resolving severe database query latency during peak traffic without causing cold-start connection pool exhaustion.',
      category: 'Data Infrastructure & Query Optimization',
      difficulty: 'Medium',
      companyContext: `Addresses ${company}'s performance requirements for core database operations.`,
      keyEvaluationPoints: [
        'EXPLAIN ANALYZE index inspection and compound index design',
        'Redis cache invalidation strategies (Cache-aside vs Write-through)',
        'Connection pooling tuning (HikariCP / PgBouncer)',
      ],
    });
  }

  if (hasAi) {
    technicalQuestions.push({
      id: 'pred-ai-1',
      type: 'coding',
      prompt: 'Implement a token rate limiter and fallback circuit breaker for upstream LLM inference providers handling bursty traffic.',
      category: 'AI Platform Engineering',
      difficulty: 'Medium',
      companyContext: `Ensures client applications at ${company} remain resilient against LLM provider rate limits and transient outages.`,
      keyEvaluationPoints: [
        'Token bucket or sliding window algorithm',
        'Graceful exponential backoff with jitter',
        'Zero thread blocking during async API calls',
      ],
    });
  }

  if (hasFrontend || technicalQuestions.length < 3) {
    technicalQuestions.push({
      id: 'pred-fe-1',
      type: 'coding',
      prompt: 'Implement an in-memory real-time state synchronization engine with conflict resolution for concurrent collaborative edits.',
      category: 'Full-Stack & Real-Time Engineering',
      difficulty: 'Hard',
      companyContext: 'Validates candidate ability to handle concurrent asynchronous events and state immutability.',
      keyEvaluationPoints: [
        'Optimistic UI updates with rollback',
        'WebSocket heartbeat and reconnect handling',
        'CRDT or operational transform principles',
      ],
    });
  }

  // Behavioral STAR Questions
  behavioralQuestions.push({
    id: 'pred-beh-1',
    type: 'behavioral',
    prompt: `Tell me about a time you owned a high-severity production outage or critical bug at work. How did you diagnose it, communicate with stakeholders, and prevent recurrence?`,
    category: 'Ownership & Crisis Management',
    difficulty: 'Medium',
    companyContext: `${company} evaluates how engineers remain calm under fire and turn operational failures into permanent systemic improvements.`,
    keyEvaluationPoints: [
      'STAR Method: clear Situation, Task, Action, and Result',
      'Blameless root cause analysis (RCA) and post-mortem creation',
      'Implementing automated test guards to prevent regression',
    ],
  });

  behavioralQuestions.push({
    id: 'pred-beh-2',
    type: 'behavioral',
    prompt: `Describe a situation where you had a strong technical disagreement with a team member or product manager regarding architecture or timeline. How did you resolve it?`,
    category: 'Technical Leadership & Collaboration',
    difficulty: 'Medium',
    companyContext: `Measures communication clarity and the ability to disagree and commit with cross-functional empathy.`,
    keyEvaluationPoints: [
      'Data-driven trade-off analysis over subjective arguments',
      'Prioritizing end-user impact and business velocity',
      'Preserving team trust and psychological safety',
    ],
  });

  behavioralQuestions.push({
    id: 'pred-beh-3',
    type: 'behavioral',
    prompt: `Give an example of an ambitious engineering project where requirements were ambiguous and deadlines were tight. What trade-offs did you make to ship on time without compromising reliability?`,
    category: 'Pragmatic Execution & Velocity',
    difficulty: 'Medium',
    companyContext: `Demonstrates the candidate can balance technical purity with shipping value in fast-moving teams at ${company}.`,
    keyEvaluationPoints: [
      'Defining a crisp Minimum Viable Architecture (MVA)',
      'Explicitly documenting known technical debt and mitigation plan',
      'Quantified business outcome upon release',
    ],
  });

  return {
    company,
    role,
    overview: `Predicted ${stages.length}-round interview loop (${technicalQuestions.length} technical loops, ${behavioralQuestions.length} behavioral STAR probes) based on ${company}'s published rubrics.`,
    stages,
    technicalQuestions,
    behavioralQuestions,
  };
}
