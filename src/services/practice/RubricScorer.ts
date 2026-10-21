import { RubricDimension, RubricEvaluation } from "./types";

export interface RubricConfig {
  category: "coding" | "system_design" | "behavioral";
  question: string;
  candidateAnswer: string;
  codeSnippet?: string;
}

export class RubricScorer {
  /**
   * Evaluates an answer with evidence-based criteria and quotes verbatim transcript moments.
   */
  public static evaluate(config: RubricConfig): RubricEvaluation {
    const { category, question, candidateAnswer, codeSnippet } = config;
    const cleanAnswer = (candidateAnswer || "").trim();
    const answerLower = cleanAnswer.toLowerCase();
    const sentences = cleanAnswer.split(/(?<=[.?!])\s+/).filter((s) => s.length > 5);

    if (category === "coding") {
      return this.evaluateCoding(question, cleanAnswer, answerLower, sentences, codeSnippet);
    } else if (category === "system_design") {
      return this.evaluateSystemDesign(question, cleanAnswer, answerLower, sentences);
    } else {
      return this.evaluateBehavioral(question, cleanAnswer, answerLower, sentences);
    }
  }

  // ─────────────────────────────────────────────────────────────
  // CODING (DSA) RUBRIC
  // Dimensions: Problem Understanding, Approach, Correctness, Complexity Analysis, Testing, Communication
  // ─────────────────────────────────────────────────────────────
  private static evaluateCoding(
    question: string,
    transcript: string,
    lower: string,
    sentences: string[],
    code?: string
  ): RubricEvaluation {
    const dimensions: RubricDimension[] = [];
    const topLeverageFixes: string[] = [];
    const diffMissingPoints: string[] = [];

    // 1. Problem Understanding & Constraints
    const clarifiesConstraints =
      lower.includes("constraint") ||
      lower.includes("edge case") ||
      lower.includes("empty") ||
      lower.includes("null") ||
      lower.includes("negative") ||
      lower.includes("duplicates") ||
      lower.includes("size of the input");

    const constraintQuote = sentences.find(
      (s) =>
        s.toLowerCase().includes("constraint") ||
        s.toLowerCase().includes("edge case") ||
        s.toLowerCase().includes("duplicate") ||
        s.toLowerCase().includes("empty")
    );

    if (clarifiesConstraints) {
      dimensions.push({
        name: "Problem Understanding & Constraints",
        category: "coding",
        score: 4.5,
        maxScore: 5,
        weight: 0.15,
        feedback: "Clarified constraints and edge boundaries before diving in.",
        evidenceQuote: constraintQuote || sentences[0],
      });
    } else {
      dimensions.push({
        name: "Problem Understanding & Constraints",
        category: "coding",
        score: 2.0,
        maxScore: 5,
        weight: 0.15,
        feedback: "Jumped directly into implementation without asking clarifying questions on bounds or null cases.",
        missingAspect: "Never clarified input range, memory constraints, or duplicate handling.",
      });
      topLeverageFixes.push("Before writing code, explicitly ask 2-3 boundary questions (e.g. empty inputs, integer bounds).");
      diffMissingPoints.push("Explicit constraint verification (e.g. 'Can array be empty? Are values sorted?')");
    }

    // 2. Approach & Trade-offs
    const discussesTradeoffs =
      lower.includes("brute force") ||
      lower.includes("optimal") ||
      lower.includes("hash map") ||
      lower.includes("two pointer") ||
      lower.includes("binary search") ||
      lower.includes("trade-off") ||
      lower.includes("instead of");

    const approachQuote = sentences.find(
      (s) =>
        s.toLowerCase().includes("approach") ||
        s.toLowerCase().includes("trade") ||
        s.toLowerCase().includes("hash map") ||
        s.toLowerCase().includes("two pointer") ||
        s.toLowerCase().includes("brute force")
    );

    if (discussesTradeoffs) {
      dimensions.push({
        name: "Approach & Trade-off Exploration",
        category: "coding",
        score: 4.5,
        maxScore: 5,
        weight: 0.2,
        feedback: "Weighed alternative approaches and selected an appropriate algorithmic strategy.",
        evidenceQuote: approachQuote,
      });
    } else {
      dimensions.push({
        name: "Approach & Trade-off Exploration",
        category: "coding",
        score: 2.5,
        maxScore: 5,
        weight: 0.2,
        feedback: "Did not contrast the naive brute-force approach against an optimal data structure.",
        missingAspect: "Lacks explicit reasoning on why this data structure was chosen over alternatives.",
      });
      topLeverageFixes.push("Articulate the naive O(N^2) solution first in 30 seconds, then explain how your data structure reduces time complexity.");
      diffMissingPoints.push("Comparison of brute force vs optimal solution trade-offs");
    }

    // 3. Complexity Analysis (Big-O Time & Space)
    const hasTimeComplexity =
      lower.includes("o(n") ||
      lower.includes("o(1") ||
      lower.includes("o(log") ||
      lower.includes("time complexity") ||
      lower.includes("linear time");

    const hasSpaceComplexity =
      lower.includes("space complexity") ||
      lower.includes("auxiliary space") ||
      lower.includes("extra memory") ||
      lower.includes("o(n) space") ||
      lower.includes("in-place");

    const complexityQuote = sentences.find(
      (s) =>
        s.toLowerCase().includes("complexity") ||
        s.toLowerCase().includes("o(") ||
        s.toLowerCase().includes("linear time")
    );

    if (hasTimeComplexity && hasSpaceComplexity) {
      dimensions.push({
        name: "Complexity Analysis (Time & Space)",
        category: "coding",
        score: 5.0,
        maxScore: 5,
        weight: 0.2,
        feedback: "Accurately stated both Big-O Time and Space complexities with mechanical justification.",
        evidenceQuote: complexityQuote,
      });
    } else if (hasTimeComplexity) {
      dimensions.push({
        name: "Complexity Analysis (Time & Space)",
        category: "coding",
        score: 3.0,
        maxScore: 5,
        weight: 0.2,
        feedback: "Stated time complexity but omitted auxiliary space complexity (call stack or heap allocations).",
        evidenceQuote: complexityQuote,
        missingAspect: "Omitted auxiliary space complexity analysis.",
      });
      topLeverageFixes.push("Always state BOTH Big-O Time AND Auxiliary Space without waiting for interviewer to prompt.");
      diffMissingPoints.push("Big-O auxiliary space complexity calculation");
    } else {
      dimensions.push({
        name: "Complexity Analysis (Time & Space)",
        category: "coding",
        score: 1.5,
        maxScore: 5,
        weight: 0.2,
        feedback: "Never stated Big-O time or space complexity.",
        missingAspect: "Zero Big-O complexity analysis provided in transcript.",
      });
      topLeverageFixes.push("Must state time and space complexity with exact Big-O notation.");
      diffMissingPoints.push("Time and space complexity formulas with reasoning");
    }

    // 4. Testing & Dry-Run
    const dryRunsCode =
      lower.includes("dry run") ||
      lower.includes("trace") ||
      lower.includes("test with") ||
      lower.includes("walk through") ||
      lower.includes("example with") ||
      lower.includes("step by step");

    const testQuote = sentences.find(
      (s) =>
        s.toLowerCase().includes("trace") ||
        s.toLowerCase().includes("dry run") ||
        s.toLowerCase().includes("example") ||
        s.toLowerCase().includes("test")
    );

    if (dryRunsCode) {
      dimensions.push({
        name: "Testing & Code Dry-Run",
        category: "coding",
        score: 4.5,
        maxScore: 5,
        weight: 0.2,
        feedback: "Proactively traced sample inputs through the logic to verify correctness.",
        evidenceQuote: testQuote,
      });
    } else {
      dimensions.push({
        name: "Testing & Code Dry-Run",
        category: "coding",
        score: 2.0,
        maxScore: 5,
        weight: 0.2,
        feedback: "Declared solution finished without walking through a concrete test case.",
        missingAspect: "Did not manually execute line-by-line dry run with a test array/string.",
      });
      topLeverageFixes.push("Do not say 'I am done'—pick a small 3-element input and manually trace variable states.");
      diffMissingPoints.push("Concrete test case dry-run with pointer values");
    }

    // 5. Technical Communication & Structure
    const hasStructuredMilestones = sentences.length >= 4 && transcript.length > 120;
    dimensions.push({
      name: "Communication & Articulation",
      category: "coding",
      score: hasStructuredMilestones ? 4.2 : 2.8,
      maxScore: 5,
      weight: 0.25,
      feedback: hasStructuredMilestones
        ? "Consistently thought aloud, keeping interviewer informed of decisions."
        : "Silent for extended stretches or jumped between thoughts erratically.",
      evidenceQuote: sentences[0] || "Answer transcript",
      missingAspect: hasStructuredMilestones ? undefined : "Explain internal invariants before typing code.",
    });

    // Compute overall score
    const weightedSum = dimensions.reduce((acc, d) => acc + d.score * d.weight, 0);
    const overallScore = Math.round(weightedSum * 10) / 10;
    const percentage = Math.round((overallScore / 5) * 100);

    const modelAnswer = `1. Clarify: "Confirming constraints—array size up to 10^5, elements within [-10^9, 10^9], can return indices in any order. If no valid pair exists, return empty array."\n2. Approach: "A naive nested loop takes O(N^2) time. Instead, we can use a hash map storing value -> index. For each element 'x', we lookup 'target - x' in O(1) average time, giving O(N) overall time."\n3. Complexity: "Time Complexity is O(N) because we perform a single pass with O(1) hash map operations. Space Complexity is O(N) auxiliary space to store elements in the hash map."\n4. Dry Run: "Let's trace nums = [2, 7, 11, 15], target = 9. Iteration 0: x=2, complement=7 not in map, map={2:0}. Iteration 1: x=7, complement=2 found at index 0. Return [0, 1]. All boundary checks pass."`;

    return {
      overallScore,
      percentage,
      dimensions,
      topLeverageFixes,
      modelAnswer,
      diffMissingPoints,
      assessedAt: Date.now(),
    };
  }

  // ─────────────────────────────────────────────────────────────
  // SYSTEM DESIGN RUBRIC
  // Dimensions: Requirements & Scope, Estimation & Math, High-Level Architecture, Tradeoffs & Deep Dives, Failure Modes & Resilience
  // ─────────────────────────────────────────────────────────────
  private static evaluateSystemDesign(
    question: string,
    transcript: string,
    lower: string,
    sentences: string[]
  ): RubricEvaluation {
    const dimensions: RubricDimension[] = [];
    const topLeverageFixes: string[] = [];
    const diffMissingPoints: string[] = [];

    // 1. Requirements & Scope
    const hasReqs =
      (lower.includes("functional") && lower.includes("non-functional")) ||
      lower.includes("latency") ||
      lower.includes("availability") ||
      lower.includes("consistency") ||
      lower.includes("throughput");

    const reqsQuote = sentences.find(
      (s) =>
        s.toLowerCase().includes("requirement") ||
        s.toLowerCase().includes("latency") ||
        s.toLowerCase().includes("sla")
    );

    if (hasReqs) {
      dimensions.push({
        name: "Requirements & Scope Framing",
        category: "system_design",
        score: 4.5,
        maxScore: 5,
        weight: 0.2,
        feedback: "Properly framed functional user stories and non-functional SLAs.",
        evidenceQuote: reqsQuote,
      });
    } else {
      dimensions.push({
        name: "Requirements & Scope Framing",
        category: "system_design",
        score: 2.0,
        maxScore: 5,
        weight: 0.2,
        feedback: "Did not define clear SLAs or separate functional from non-functional requirements.",
        missingAspect: "Missing latency (p99 < 100ms), availability (99.99%), and consistency requirements.",
      });
      topLeverageFixes.push("Always ask: What is the read-to-write ratio? What are the p99 latency target and uptime SLAs?");
      diffMissingPoints.push("Distinction between Functional Requirements vs Non-Functional SLAs");
    }

    // 2. Estimation & Back-of-the-envelope Math
    const hasEstimations =
      lower.includes("qps") ||
      lower.includes("queries per second") ||
      lower.includes("gigabytes") ||
      lower.includes("terabytes") ||
      lower.includes("petabytes") ||
      lower.includes("bandwidth") ||
      lower.includes("daily active users") ||
      lower.includes("dau");

    const mathQuote = sentences.find(
      (s) =>
        s.toLowerCase().includes("qps") ||
        s.toLowerCase().includes("dau") ||
        s.toLowerCase().includes("tb") ||
        s.toLowerCase().includes("storage") ||
        s.toLowerCase().includes("bytes")
    );

    if (hasEstimations) {
      dimensions.push({
        name: "Scale Estimation & Math",
        category: "system_design",
        score: 4.5,
        maxScore: 5,
        weight: 0.2,
        feedback: "Performed back-of-the-envelope calculations for traffic QPS and 5-year storage needs.",
        evidenceQuote: mathQuote,
      });
    } else {
      dimensions.push({
        name: "Scale Estimation & Math",
        category: "system_design",
        score: 1.5,
        maxScore: 5,
        weight: 0.2,
        feedback: "Omitted back-of-the-envelope calculations for storage, network egress, and peak QPS.",
        missingAspect: "Never calculated storage requirement over 5 years or read/write network bandwidth.",
      });
      topLeverageFixes.push("Calculate 5-year storage: (DAU * writes/day * payload_size * 365 * 5) and peak QPS (avg QPS * 2).");
      diffMissingPoints.push("Back-of-the-envelope calculation for QPS and 5-year disk storage");
    }

    // 3. Tradeoffs & Deep Dives (SQL vs NoSQL, Caching)
    const hasTradeoffs =
      lower.includes("trade-off") ||
      lower.includes("tradeoff") ||
      lower.includes("nosql") ||
      lower.includes("sql") ||
      lower.includes("sharding") ||
      lower.includes("replication") ||
      lower.includes("cache invalidation") ||
      lower.includes("eventual consistency");

    const tradeoffQuote = sentences.find(
      (s) =>
        s.toLowerCase().includes("tradeoff") ||
        s.toLowerCase().includes("trade-off") ||
        s.toLowerCase().includes("consistency") ||
        s.toLowerCase().includes("invalidation") ||
        s.toLowerCase().includes("nosql")
    );

    if (hasTradeoffs) {
      dimensions.push({
        name: "Architecture Trade-offs & Deep Dives",
        category: "system_design",
        score: 4.8,
        maxScore: 5,
        weight: 0.25,
        feedback: "Analyzed architectural trade-offs with explicit database and caching rationale.",
        evidenceQuote: tradeoffQuote,
      });
    } else {
      dimensions.push({
        name: "Architecture Trade-offs & Deep Dives",
        category: "system_design",
        score: 2.2,
        maxScore: 5,
        weight: 0.25,
        feedback: "Simply listed components (database, cache) without justifying why or addressing cache invalidation.",
        missingAspect: "Lacks cache eviction strategy (TTL vs write-through) and database partitioning key selection.",
      });
      topLeverageFixes.push("Whenever you mention caching, immediately state the invalidation strategy (e.g. Write-Around + TTL).");
      diffMissingPoints.push("Specific cache invalidation and database partition key justification");
    }

    // 4. Failure Modes & Bottlenecks
    const hasFailureModes =
      lower.includes("single point of failure") ||
      lower.includes("spof") ||
      lower.includes("circuit breaker") ||
      lower.includes("dead letter queue") ||
      lower.includes("backpressure") ||
      lower.includes("retry") ||
      lower.includes("failover") ||
      lower.includes("disaster recovery");

    const failureQuote = sentences.find(
      (s) =>
        s.toLowerCase().includes("fail") ||
        s.toLowerCase().includes("spof") ||
        s.toLowerCase().includes("circuit") ||
        s.toLowerCase().includes("retry")
    );

    if (hasFailureModes) {
      dimensions.push({
        name: "Failure Modes & Resilience",
        category: "system_design",
        score: 4.5,
        maxScore: 5,
        weight: 0.2,
        feedback: "Addressed SPOFs, circuit breakers, and database replication lag gracefully.",
        evidenceQuote: failureQuote,
      });
    } else {
      dimensions.push({
        name: "Failure Modes & Resilience",
        category: "system_design",
        score: 2.0,
        maxScore: 5,
        weight: 0.2,
        feedback: "Assumed the happy path. Did not address what happens when downstream services or Redis dies.",
        missingAspect: "Omitted cascading failure protection (rate limiting, circuit breakers, dead letter queues).",
      });
      topLeverageFixes.push("Always spend the last 5 minutes walking through failure scenarios: node crash, cache stampede, network partition.");
      diffMissingPoints.push("Handling cache stampedes, database master failover, and rate limiting");
    }

    // 5. High-Level Diagram & APIs
    dimensions.push({
      name: "API Design & Component Decoupling",
      category: "system_design",
      score: lower.includes("api") || lower.includes("endpoint") || lower.includes("service") ? 4.2 : 2.5,
      maxScore: 5,
      weight: 0.15,
      feedback: "Evaluated modularity of services, message brokers, and API payload definitions.",
      evidenceQuote: sentences[0],
    });

    const weightedSum = dimensions.reduce((acc, d) => acc + d.score * d.weight, 0);
    const overallScore = Math.round(weightedSum * 10) / 10;
    const percentage = Math.round((overallScore / 5) * 100);

    const modelAnswer = `1. Scope & SLAs: "Functional: Generate unique short URLs, redirect 302/301, capture click analytics. Non-Functional: 100M daily shortens, 10:1 read-to-write ratio, p99 latency < 50ms, 99.99% availability."\n2. Math: "100M writes/day = ~1,160 writes/sec (peak 2,500 W-QPS). Reads = 11,600 R-QPS. Storage: 500 bytes per URL record * 100M * 365 * 5 years = ~91 TB over 5 years."\n3. Data & API: "POST /v1/urls { longUrl, customSlug? } -> { shortUrl, expiresAt }. Data model in DynamoDB / Cassandra with partition key 'shortKey' for O(1) key-value lookup."\n4. Caching & Tradeoffs: "Redis cluster caching top 20% hot URLs (80/20 rule). Cache policy: LRU eviction with 24h TTL. Invalidation: Write-around to prevent cache pollution."\n5. Failure Modes: "Cache crash handled via circuit breaker to avoid stampeding DB. Cassandra replicated across 3 multi-region AZs with quorum consistency (W=QUORUM, R=QUORUM) for zero SPOF."`;

    return {
      overallScore,
      percentage,
      dimensions,
      topLeverageFixes,
      modelAnswer,
      diffMissingPoints,
      assessedAt: Date.now(),
    };
  }

  // ─────────────────────────────────────────────────────────────
  // BEHAVIORAL (STAR) RUBRIC
  // Dimensions: Situation, Task, Action & Ownership ("I" vs "we"), Quantified Result, Specificity
  // ─────────────────────────────────────────────────────────────
  private static evaluateBehavioral(
    question: string,
    transcript: string,
    lower: string,
    sentences: string[]
  ): RubricEvaluation {
    const dimensions: RubricDimension[] = [];
    const topLeverageFixes: string[] = [];
    const diffMissingPoints: string[] = [];

    // 1. Situation & Context
    const hasSituation = sentences.length > 0 && transcript.length > 50;
    const situationQuote = sentences[0];

    dimensions.push({
      name: "Situation (Context Framing)",
      category: "behavioral",
      score: hasSituation ? 4.2 : 2.5,
      maxScore: 5,
      weight: 0.15,
      feedback: hasSituation
        ? "Framed project context and operational stakes early."
        : "Vague opening without setting context, company, or team role.",
      evidenceQuote: situationQuote,
    });

    // 2. Action & Ownership ("I" vs "we")
    const words = lower.split(/\s+/);
    const iCount = words.filter((w) => w === "i" || w === "my" || w === "i'm" || w === "me").length;
    const weCount = words.filter((w) => w === "we" || w === "our" || w === "us" || w === "team").length;

    const actionQuote = sentences.find(
      (s) =>
        s.toLowerCase().startsWith("i ") ||
        s.toLowerCase().includes("i decided") ||
        s.toLowerCase().includes("i built") ||
        s.toLowerCase().includes("i designed") ||
        s.toLowerCase().includes("i led")
    );

    if (iCount >= weCount && iCount >= 3) {
      dimensions.push({
        name: "Action & Individual Ownership ('I' vs 'we')",
        category: "behavioral",
        score: 4.8,
        maxScore: 5,
        weight: 0.35,
        feedback: `Strong ownership demonstrated with ${iCount} first-person citations ('I designed', 'I implemented').`,
        evidenceQuote: actionQuote || sentences.find((s) => s.toLowerCase().includes("i ")),
      });
    } else {
      dimensions.push({
        name: "Action & Individual Ownership ('I' vs 'we')",
        category: "behavioral",
        score: 2.2,
        maxScore: 5,
        weight: 0.35,
        feedback: `Overused collective pronouns ('we did this', 'our team') with ${weCount} 'we' vs ${iCount} 'I'. Interviewer cannot identify YOUR exact contribution.`,
        missingAspect: "Failed to isolate candidate's personal decision or code from the team's work.",
      });
      topLeverageFixes.push("Replace 'we decided' with 'I proposed X and authored the RFC'. Never say 'we' when discussing engineering choices.");
      diffMissingPoints.push("Explicit personal action ('I profiled the query', 'I rewrote the indexing strategy')");
    }

    // 3. Quantified Result & Impact
    const hasNumbers = /\b\d+(%|ms|s|x|k|m|b|gb|tb|dollars|percent|users|engineers)?\b/i.test(transcript);
    const resultQuote = sentences.find((s) =>
      /\b\d+(%|ms|s|k|m|users|percent)?\b/i.test(s) &&
      (s.toLowerCase().includes("result") ||
        s.toLowerCase().includes("reduced") ||
        s.toLowerCase().includes("improved") ||
        s.toLowerCase().includes("saved") ||
        s.toLowerCase().includes("increased"))
    );

    if (hasNumbers && resultQuote) {
      dimensions.push({
        name: "Quantified Result & Business Impact",
        category: "behavioral",
        score: 4.8,
        maxScore: 5,
        weight: 0.3,
        feedback: "Delivered tangible, quantified outcome with metrics and timeline.",
        evidenceQuote: resultQuote,
      });
    } else if (hasNumbers) {
      dimensions.push({
        name: "Quantified Result & Business Impact",
        category: "behavioral",
        score: 3.2,
        maxScore: 5,
        weight: 0.3,
        feedback: "Mentioned metrics but did not connect them directly to a measurable before/after delta.",
        missingAspect: "Needs concrete delta (e.g. 'reduced latency from 450ms to 85ms and saved $12k/month').",
      });
      topLeverageFixes.push("Conclude every behavioral answer with: 'The outcome was X% reduction in Y, which saved the team Z hours.'");
      diffMissingPoints.push("Quantified before/after business metrics (% reduction, revenue, latency)");
    } else {
      dimensions.push({
        name: "Quantified Result & Business Impact",
        category: "behavioral",
        score: 1.8,
        maxScore: 5,
        weight: 0.3,
        feedback: "Vague ending ('it worked out well and everyone was happy') without hard business numbers.",
        missingAspect: "Zero quantified business or engineering metrics provided.",
      });
      topLeverageFixes.push("Must state at least one number in the result: latency drop %, dollar savings, or test coverage %.");
      diffMissingPoints.push("Quantified business outcome numbers");
    }

    // 4. Specificity vs Rambling
    const isSpecific = transcript.length >= 100 && transcript.length <= 900;
    dimensions.push({
      name: "Specificity & STAR Structure",
      category: "behavioral",
      score: isSpecific ? 4.2 : 2.5,
      maxScore: 5,
      weight: 0.2,
      feedback: isSpecific
        ? "Crisp STAR narrative that adhered to time constraints without rambling."
        : "Answer either lacked concrete details or rambled beyond the 2-minute mark.",
      evidenceQuote: sentences[sentences.length - 1] || sentences[0],
      missingAspect: isSpecific ? undefined : "Deliver answers within 90-120 seconds using strict STAR anchors.",
    });

    const weightedSum = dimensions.reduce((acc, d) => acc + d.score * d.weight, 0);
    const overallScore = Math.round(weightedSum * 10) / 10;
    const percentage = Math.round((overallScore / 5) * 100);

    const modelAnswer = `Situation: "At Acme Corp, our payment processing service suffered intermittent timeouts during peak Black Friday sales, causing ~4% of checkout drops."\nTask: "I was assigned as technical lead to find the root cause and restore 99.99% availability within 48 hours."\nAction: "I isolated the issue to connection pool exhaustion in our Postgres cluster. I personally designed and deployed an asynchronous Redis queue with exponential backoff retries, and rewritten our batch query to use composite indexes."\nResult: "Payment checkout drop rate decreased from 4.2% to 0.02%, p99 latency dropped from 1,200ms to 95ms, and we successfully processed $4.8M in peak transactions without a single dropped transaction."`;

    return {
      overallScore,
      percentage,
      dimensions,
      topLeverageFixes,
      modelAnswer,
      diffMissingPoints,
      assessedAt: Date.now(),
    };
  }
}
