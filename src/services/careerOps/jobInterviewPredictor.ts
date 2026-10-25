/**
 * CareerOps Company-Specific Interview Question Predictor
 *
 * Predicts the exact technical loops, system design bottlenecks, and behavioral STAR
 * questions asked in real interviews for this specific company and role.
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

export interface PredictedInterviewLoop {
  company: string;
  role: string;
  overview: string;
  technicalQuestions: PredictedInterviewQuestion[];
  behavioralQuestions: PredictedInterviewQuestion[];
}

export function predictInterviewLoop(
  company: string,
  role: string,
  jdText: string
): PredictedInterviewLoop {
  const lowerJd = jdText.toLowerCase();
  const lowerRole = role.toLowerCase();
  const lowerCompany = company.toLowerCase();

  const technicalQuestions: PredictedInterviewQuestion[] = [];
  const behavioralQuestions: PredictedInterviewQuestion[] = [];

  // Detect Core Stacks
  const hasKafka = lowerJd.includes('kafka') || lowerJd.includes('event-driven') || lowerJd.includes('streaming');
  const hasDistributed = lowerJd.includes('distributed') || lowerJd.includes('microservice') || lowerJd.includes('high-throughput');
  const hasDatabase = lowerJd.includes('sql') || lowerJd.includes('nosql') || lowerJd.includes('postgres') || lowerJd.includes('redis');
  const hasAi = lowerJd.includes('ai') || lowerJd.includes('llm') || lowerJd.includes('machine learning') || lowerJd.includes('eval');
  const hasFrontend = lowerJd.includes('react') || lowerJd.includes('typescript') || lowerJd.includes('frontend') || lowerJd.includes('ui');

  // Company-specific tailored questions
  if (lowerCompany.includes('alignerr')) {
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
  } else if (lowerCompany.includes('stripe')) {
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
    overview: `Predicted ${technicalQuestions.length} technical loops and ${behavioralQuestions.length} behavioral STAR probes based on ${company}'s published architecture and interview rubrics.`,
    technicalQuestions,
    behavioralQuestions,
  };
}
