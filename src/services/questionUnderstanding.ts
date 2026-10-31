/**
 * questionUnderstanding.ts
 *
 * Question Understanding and Intent Detection Engine for IAC 2.0.
 *
 * Implements deep classification across 16 canonical interview categories,
 * discovers hidden technical requirements, assesses constraints, determines expected depth,
 * and differentiates practical experience from theoretical probing.
 */

export type DetailedInterviewCategory =
  | 'Programming fundamentals'
  | 'Data structures and algorithms'
  | 'Java and concurrency'
  | 'JavaScript and Node.js'
  | 'React and frontend'
  | 'Backend engineering'
  | 'Databases'
  | 'AWS and cloud'
  | 'DevOps'
  | 'Distributed systems'
  | 'System design'
  | 'Security'
  | 'Debugging'
  | 'Testing'
  | 'Behavioral interviews'
  | 'Project deep dives'
  | 'AI and Machine Learning'
  | 'Career and role alignment';

export type QuestionType =
  | 'technical'
  | 'candidate_specific'
  | 'mixed'
  | 'behavioral'
  | 'ai_ml'
  | 'role_alignment'
  | 'follow_up'
  | 'ambiguous';

export interface QuestionAnalysis {
  category: DetailedInterviewCategory;
  questionType: QuestionType;
  requiresCandidateVault: boolean;
  vaultRetrievalKeywords: string[];
  suggestedStructure:
    | 'Direct-Mechanism-Tradeoff'
    | 'STAR'
    | 'Architecture-Components-Tradeoffs'
    | 'Clarify-First'
    | 'Role-Company-Value';
  primaryConcept: string;
  hiddenRequirement: string;
  expectedDepth: 'concise' | 'intermediate' | 'deep';
  constraints: string[];
  requiredExamples: string[];
  isCodeExpected: boolean;
  isPracticalExperience: boolean; // Practical experience vs theoretical knowledge
  targetSpokenDurationSec: number;
}

export class QuestionUnderstandingEngine {
  /**
   * Analyzes an interview question to extract intent, category, and requirements.
   */
  public static analyze(
    question: string,
    activeMode: 'coding' | 'interview' | 'quiz' = 'interview'
  ): QuestionAnalysis {
    const q = (question || '').trim();
    const lower = q.toLowerCase();

    // 1. Identify category
    const category = QuestionUnderstandingEngine.determineCategory(lower, activeMode);

    // 2. Discover hidden technical requirement
    const hiddenRequirement = QuestionUnderstandingEngine.extractHiddenRequirement(lower, category);

    // 3. Primary concept
    const primaryConcept = QuestionUnderstandingEngine.extractPrimaryConcept(q, lower, category);

    // 4. Determine code expectation
    const isCodeExpected =
      activeMode === 'coding' ||
      /\b(write a function|write code|implement\s+(?:a|an)?\s*(?:algorithm|function|class)|solve this|two sum|reverse a linked list|binary search)\b/i.test(lower);

    // 5. Practical experience vs theoretical knowledge
    const isPracticalExperience =
      /\b(how have you|in your experience|production|tell me about a time|how did you|how do you debug|in your project|what did you do when)\b/i.test(lower) ||
      category === 'Behavioral interviews' ||
      category === 'Project deep dives' ||
      category === 'Debugging';

    // 6. Expected depth & duration
    let expectedDepth: 'concise' | 'intermediate' | 'deep';
    let targetSpokenDurationSec: number;

    if (category === 'Behavioral interviews' || category === 'Project deep dives') {
      expectedDepth = 'deep';
      targetSpokenDurationSec = 150; // 2-3 minutes
    } else if (category === 'System design' || category === 'Distributed systems') {
      expectedDepth = 'deep';
      targetSpokenDurationSec = 120; // 90-150 seconds
    } else if (
      /^(what is\b|define\b|what are\b|meaning of\b)/i.test(lower) &&
      lower.length < 50
    ) {
      expectedDepth = 'concise';
      targetSpokenDurationSec = 30; // 20-40 seconds
    } else {
      expectedDepth = 'intermediate';
      targetSpokenDurationSec = 60; // 45-75 seconds
    }

    // 7. Constraints and required examples
    const constraints: string[] = [];
    if (lower.includes('thread') || lower.includes('concurren')) constraints.push('Thread-safety & memory visibility');
    if (lower.includes('scale') || lower.includes('high traffic')) constraints.push('Horizontal scalability & low latency');
    if (lower.includes('distributed') || lower.includes('network')) constraints.push('Network partitions & partial failure resilience');
    if (lower.includes('memory') || lower.includes('leak')) constraints.push('Bounded memory & resource cleanup');
    if (lower.includes('transaction') || lower.includes('acid')) constraints.push('ACID guarantees & isolation anomalies');

    const requiredExamples: string[] = [];
    if (category === 'Databases') requiredExamples.push('B-Tree index lookups or PostgreSQL MVCC VACUUM cost');
    if (category === 'Distributed systems') requiredExamples.push('Payment idempotency key or Kafka partition ordering');
    if (category === 'Java and concurrency') requiredExamples.push('Volatile flag vs synchronized counter');
    if (category === 'JavaScript and Node.js') requiredExamples.push('process.nextTick queue draining vs timer callback');
    if (category === 'React and frontend') requiredExamples.push('useCallback / useMemo memoization or key reconciler');
    if (category === 'Debugging') requiredExamples.push('Metric diagnosis (p99 vs p50, GC pause, pool saturation)');

    // 8. Determine questionType
    let questionType: QuestionType = 'technical';
    if (lower.length < 15 && lower.split(/\s+/).length <= 2 && !/\b(what is|explain|define)\b/i.test(lower)) {
      questionType = 'ambiguous';
    } else if (
      /\b(why\s+(?:do\s+you\s+want\s+to\s+join|should\s+we\s+hire\s+you|this\s+company|our\s+company|this\s+role|join\s+us|work\s+here)|what\s+interests\s+you\s+about|why\s+our\s+company)\b/i.test(
        lower
      )
    ) {
      questionType = 'role_alignment';
    } else if (category === 'Behavioral interviews') {
      questionType = 'behavioral';
    } else if (category === 'AI and Machine Learning') {
      questionType = 'ai_ml';
    } else if (
      /\b(how did you (?:implement|use|architect|deploy|scale|build|debug|handle|design)|in your project(?:,)? how did you|in your (?:last|previous|current) (?:role|company|job),(?:.*)how did you)\b/i.test(
        lower
      )
    ) {
      questionType = 'mixed';
    } else if (
      /\b(walk me through your (?:resume|background|experience|engineering)|tell me about yourself|tell me about your (?:project|work|experience)|describe (?:the\s+.*)?project|project you (?:have\s+)?personally worked on|(?:in|on|for|of)\s+your\s+(?:[A-Za-z0-9_-]+\s+){0,4}project|what did you (?:do|build) at|(?:in|at) your (?:last|previous|current) (?:role|company|job)|(?:what was|describe) your (?:specific )?(?:role|responsibility|responsibilities)|what is your greatest achievement)\b/i.test(
        lower
      ) ||
      category === 'Project deep dives' ||
      category === 'Career and role alignment'
    ) {
      questionType = 'candidate_specific';
    } else if (
      /\b(can you elaborate|what about (?:the|that)|why did you choose that|what trade-offs?|could you clarify)\b/i.test(
        lower
      )
    ) {
      questionType = 'follow_up';
    }

    // 9. Candidate Vault requirements
    const requiresCandidateVault =
      questionType === 'candidate_specific' ||
      questionType === 'mixed' ||
      questionType === 'role_alignment';

    // 10. Suggested Structure
    let suggestedStructure:
      | 'Direct-Mechanism-Tradeoff'
      | 'STAR'
      | 'Architecture-Components-Tradeoffs'
      | 'Clarify-First'
      | 'Role-Company-Value';

    if (questionType === 'behavioral') {
      suggestedStructure = 'STAR';
    } else if (category === 'System design' || category === 'Distributed systems') {
      suggestedStructure = 'Architecture-Components-Tradeoffs';
    } else if (questionType === 'role_alignment') {
      suggestedStructure = 'Role-Company-Value';
    } else if (questionType === 'ambiguous') {
      suggestedStructure = 'Clarify-First';
    } else {
      suggestedStructure = 'Direct-Mechanism-Tradeoff';
    }

    // 11. Vault retrieval keywords
    const vaultRetrievalKeywords = q
      .replace(/[^\w\s]/g, '')
      .split(/\s+/)
      .filter((w) => w.length > 3 && !/\b(what|how|when|where|why|which|explain|tell|about|does|with|have|your|this|that|from)\b/i.test(w));

    return {
      category,
      questionType,
      requiresCandidateVault,
      vaultRetrievalKeywords,
      suggestedStructure,
      primaryConcept,
      hiddenRequirement,
      expectedDepth,
      constraints,
      requiredExamples,
      isCodeExpected,
      isPracticalExperience,
      targetSpokenDurationSec,
    };
  }

  private static determineCategory(
    lower: string,
    activeMode: 'coding' | 'interview' | 'quiz'
  ): DetailedInterviewCategory {
    // Career & Role Alignment
    if (
      /\b(why\s+(?:do\s+you\s+want\s+to\s+join|should\s+we\s+hire\s+you|this\s+company|our\s+company|join\s+us|work\s+here|this\s+role)|what\s+interests\s+you\s+about|tell\s+me\s+about\s+yourself)\b/i.test(
        lower
      )
    ) {
      return 'Career and role alignment';
    }

    // AI & Machine Learning
    if (
      /\b(llm|large language model|rag|retrieval augmented|fine-tuning|prompt engineering|embeddings?|vector database|transformer|attention mechanism|hallucination|evals?|agentic|diffusion)\b/i.test(
        lower
      )
    ) {
      return 'AI and Machine Learning';
    }
    // Behavioral
    if (
      /\b(tell me about a time|give me an example of|describe a situation|how do you handle conflict|time you failed|biggest challenge|disagreement|proudest)\b/i.test(
        lower
      )
    ) {
      return 'Behavioral interviews';
    }

    // Project deep dive
    if (
      /\b(walk me through (?:your|a) project|describe (?:the\s+.*)?project|tell me about your project|what did you build at|tell me about your current role|project you (?:have\s+)?personally worked on)\b/i.test(
        lower
      )
    ) {
      return 'Project deep dives';
    }

    // Debugging & troubleshooting
    if (
      /\b(how (?:do you|would you) debug|troubleshoot|diagnose|production incident|memory leak|high cpu|out of memory|oom|stack overflow|investigate an issue)\b/i.test(
        lower
      )
    ) {
      return 'Debugging';
    }

    // Testing
    if (
      /\b(flaky tests?|unit tests?|integration tests?|e2e tests?|mock vs stub|test coverage|regression tests?|property-based tests?)\b/i.test(
        lower
      )
    ) {
      return 'Testing';
    }

    // Security
    if (
      /\b(oauth|jwt|csrf|xss|sql injection|sqli|authentication vs authorization|zero trust|mtls|encryption at rest|cors policy)\b/i.test(
        lower
      )
    ) {
      return 'Security';
    }

    // Distributed systems
    if (
      /\b(distributed system|idempotenc[ye]|cap theorem|consensus|raft|paxos|split brain|two phase commit|2pc|saga|eventual consistency|leader election)\b/i.test(
        lower
      )
    ) {
      return 'Distributed systems';
    }

    // Backend engineering (API patterns, rate limiting, middleware, RPC)
    if (
      /\b(rate limit(?:er|ing)?|token bucket|leaky bucket|middleware|rest api|api design|restful|graphql|grpc|reverse proxy|nginx)\b/i.test(
        lower
      )
    ) {
      return 'Backend engineering';
    }

    // System design
    if (
      /\b(system design|design a\b|design an\b|how would you architect|scale to \d+|architect a\b|high-level architecture)\b/i.test(
        lower
      )
    ) {
      return 'System design';
    }

    // Databases
    if (
      /\b(database|sql|nosql|acid|postgres|mysql|mongodb|cassandra|redis|b-tree|mvcc|isolation level|optimistic locking|pessimistic locking|foreign key|sharding|replication)\b/i.test(
        lower
      )
    ) {
      return 'Databases';
    }

    // Java & Concurrency
    if (
      /\b(java\b|jvm|concurrency|multithreading|thread pool|executor|volatile|synchronized|atomic|happens-before|concurrent_hash_map|reentrant_lock|deadlock)\b/i.test(
        lower
      )
    ) {
      return 'Java and concurrency';
    }

    // JavaScript & Node.js
    if (
      /\b(node\.?js|javascript|event loop|microtask|macrotask|nexttick|libuv|worker threads?|stream backpressure|commonjs vs esm|v8)\b/i.test(
        lower
      )
    ) {
      return 'JavaScript and Node.js';
    }

    // React & Frontend
    if (
      /\b(react|virtual dom|useeffect|usememo|usecallback|usestate|redux|zustand|hydration|server components?|csr vs ssr|css layout)\b/i.test(
        lower
      )
    ) {
      return 'React and frontend';
    }

    // AWS & Cloud
    if (
      /\b(aws|cloud|s3|ec2|lambda|dynamodb|iam role|ecs|eks|vpc|cloudformation|cloud watch)\b/i.test(
        lower
      )
    ) {
      return 'AWS and cloud';
    }

    // DevOps & CI/CD
    if (
      /\b(devops|docker|kubernetes|k8s|ci\/cd|pipeline|github actions|jenkins|terraform|ansible|helm|container)\b/i.test(
        lower
      )
    ) {
      return 'DevOps';
    }

    // Backend engineering
    if (
      /\b(backend|api design|restful|rest api|graphql|grpc|rate limiting|middleware|reverse proxy|nginx|load balancing)\b/i.test(
        lower
      )
    ) {
      return 'Backend engineering';
    }

    // Data structures & algorithms
    if (
      activeMode === 'coding' ||
      /\b(dsa|data structure|binary search|tree|graph|dynamic programming|dp|sorting|hashmap|linked list|stack|queue|heap|big-o|time complexity)\b/i.test(
        lower
      )
    ) {
      return 'Data structures and algorithms';
    }

    // Default
    return 'Programming fundamentals';
  }

  private static extractHiddenRequirement(
    lower: string,
    category: DetailedInterviewCategory
  ): string {
    switch (category) {
      case 'Java and concurrency':
        return 'Interviewer wants proof of Java Memory Model awareness: happens-before semantics, CPU cache visibility, and difference between atomicity vs visibility.';
      case 'JavaScript and Node.js':
        return 'Interviewer is evaluating understanding of non-blocking I/O: microtask queue draining before macrotask next tick, libuv thread pool offloading, and avoiding event-loop starvation.';
      case 'Databases':
        return 'Interviewer is probing cost trade-offs: index write amplification, transaction isolation anomalies (dirty/non-repeatable/phantom reads), and MVCC table bloat.';
      case 'Distributed systems':
        return 'Interviewer is checking for distributed systems realities: network delays, failure recovery, idempotency key guarantees, and refusing false exactly-once claims.';
      case 'AI and Machine Learning':
        return 'Interviewer is evaluating real-world model understanding: latency vs accuracy trade-offs, retrieval precision vs recall in RAG, hallucination safeguards, and quantitative eval metrics.';
      case 'Career and role alignment':
        return 'Interviewer wants genuine interest in the team engineering problems and clear communication of practical value alignment.';
      case 'System design':
        return 'Interviewer expects high-level clarity first, followed by clear single points of failure (SPOF) mitigation and trade-off analysis.';
      case 'Debugging':
        return 'Interviewer tests disciplined methodology: distinguishing symptoms from root causes, measuring before modifying, avoiding premature changes.';
      case 'Security':
        return 'Interviewer is probing trust boundaries, least privilege, validation at API borders, and preventing secret exfiltration.';
      case 'Behavioral interviews':
        return 'Interviewer evaluates authentic technical ownership, practical resolution of conflicts, and genuine learning from setbacks.';
      default:
        return 'Interviewer expects direct first-sentence clarity, a practical mechanism explanation, and awareness of trade-offs.';
    }
  }

  private static extractPrimaryConcept(
    raw: string,
    lower: string,
    category: DetailedInterviewCategory
  ): string {
    const conceptMatches = raw.match(/\b(?:what is|difference between|how does|explain)\s+([A-Za-z0-9_\s]{3,30}?)(?:\?|\s+work|\s+and|\s+in|$)/i);
    if (conceptMatches && conceptMatches[1]) {
      return conceptMatches[1].trim();
    }
    return category;
  }
}
