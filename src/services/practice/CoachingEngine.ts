import { TieredHint, HintTier } from "./types";

export interface ModelComparison {
  question: string;
  category: string;
  candidateAnswer: string;
  modelAnswer: string;
  keyOmissions: string[];
  suggestedPhrasing: string;
}

export class CoachingEngine {
  /**
   * Generates progressive tiered hints with associated score penalties.
   */
  public static getTieredHints(question: string, category: string): TieredHint[] {
    const qLower = (question || "").toLowerCase();

    if (category === "coding" || qLower.includes("array") || qLower.includes("tree") || qLower.includes("graph") || qLower.includes("string")) {
      return this.getCodingHints(qLower);
    } else if (category === "system_design" || qLower.includes("design") || qLower.includes("scale") || qLower.includes("architecture")) {
      return this.getSystemDesignHints(qLower);
    } else {
      return this.getBehavioralHints(qLower);
    }
  }

  /**
   * Computes cumulative score deduction from used hints.
   */
  public static calculatePenalty(hintsUsed: TieredHint[]): number {
    return hintsUsed.reduce((sum, h) => sum + h.penaltyPoints, 0);
  }

  /**
   * Produces a side-by-side comparison between candidate transcript and gold-standard answer.
   */
  public static compareWithModelAnswer(
    question: string,
    category: string,
    candidateAnswer: string
  ): ModelComparison {
    const cleanCandidate = (candidateAnswer || "").trim();
    const lower = cleanCandidate.toLowerCase();
    const keyOmissions: string[] = [];

    if (category === "coding") {
      if (!lower.includes("o(") && !lower.includes("complexity")) {
        keyOmissions.push("Time and Space Complexity (Big-O)");
      }
      if (!lower.includes("edge case") && !lower.includes("constraint") && !lower.includes("empty")) {
        keyOmissions.push("Clarifying input boundaries & null/empty edge cases");
      }
      if (!lower.includes("test") && !lower.includes("trace") && !lower.includes("dry run")) {
        keyOmissions.push("Manual dry-run with a concrete sample input");
      }

      return {
        question,
        category,
        candidateAnswer: cleanCandidate || "(No answer recorded)",
        modelAnswer:
          "1. Clarify constraints (size, bounds, duplicates, memory limits).\n2. Discuss naive O(N^2) brute force vs optimal O(N) using a Hash Map/Two-Pointer.\n3. State invariants and dry run an example step-by-step.\n4. Conclude with Big-O: O(N) time, O(1) auxiliary space.",
        keyOmissions: keyOmissions.length > 0 ? keyOmissions : ["Auxiliary space trade-off analysis"],
        suggestedPhrasing:
          "Before coding, let me clarify: can the input be empty or contain duplicates? I'll first explore a hash map approach to achieve O(N) time with O(N) auxiliary space.",
      };
    } else if (category === "system_design") {
      if (!lower.includes("qps") && !lower.includes("storage")) {
        keyOmissions.push("Scale estimations (QPS & 5-year storage)");
      }
      if (!lower.includes("cache") && !lower.includes("invalidation")) {
        keyOmissions.push("Cache eviction strategy (LRU/TTL) & invalidation pattern");
      }
      if (!lower.includes("failure") && !lower.includes("spof") && !lower.includes("circuit")) {
        keyOmissions.push("Failure modes, replication lag, and circuit breaker protection");
      }

      return {
        question,
        category,
        candidateAnswer: cleanCandidate || "(No answer recorded)",
        modelAnswer:
          "1. Scope: Functional requirements + SLAs (p99 latency < 50ms, 99.99% availability).\n2. Math: Peak QPS calculation and 5-year storage size.\n3. High-level: API Gateway -> App Servers -> Distributed DB (DynamoDB/Postgres sharded) + Redis cache.\n4. Deep dive: Write-around caching with TTL to prevent cache stampedes.\n5. Resilience: Multi-region failover, circuit breakers, and dead-letter queues.",
        keyOmissions: keyOmissions.length > 0 ? keyOmissions : ["Circuit breaker protection on database failover"],
        suggestedPhrasing:
          "Let's quantify scale first: assuming 10M DAU with a 10:1 read-to-write ratio, peak write QPS is 2,500. We'll store records in a partitioned NoSQL table and use Redis for hot queries with write-around caching.",
      };
    } else {
      if (!lower.includes("i ") && !lower.includes("my ")) {
        keyOmissions.push("First-person ownership ('I decided', 'I built' instead of 'we')");
      }
      if (!/\b\d+(%|ms|s|k|m|users|percent)?\b/i.test(lower)) {
        keyOmissions.push("Quantified business impact metrics (numbers, %, dollar savings)");
      }
      if (cleanCandidate.length > 800) {
        keyOmissions.push("Brevity: answer exceeded 2 minutes and rambled into unnecessary background details");
      }

      return {
        question,
        category,
        candidateAnswer: cleanCandidate || "(No answer recorded)",
        modelAnswer:
          "STAR Method:\n- Situation: Clear project stakes in 20 seconds.\n- Task: My specific mandate.\n- Action: 3 concrete decisions I personally led (architectural choice, team alignment, implementation).\n- Result: Quantified impact (e.g. 'reduced latency by 45% and saved $15k/mo').",
        keyOmissions: keyOmissions.length > 0 ? keyOmissions : ["Explicitly contrasting the 'before' vs 'after' metrics"],
        suggestedPhrasing:
          "When our payment pipeline started dropping 3% of transactions due to lock contention, I took ownership of the remediation. I refactored our write path into an asynchronous queue with idempotent workers, reducing error rate to 0.01% and protecting $3.5M in Black Friday transactions.",
      };
    }
  }

  // ─────────────────────────────────────────────────────────────
  // DOMAIN-SPECIFIC HINT GENERATORS
  // ─────────────────────────────────────────────────────────────
  private static getCodingHints(qLower: string): TieredHint[] {
    if (qLower.includes("two sum") || qLower.includes("pair") || qLower.includes("target")) {
      return [
        {
          tier: 1,
          title: "Gentle Nudge",
          content: "Instead of searching all pairs in O(N^2), ask yourself: what value do you need to find when looking at the current number?",
          penaltyPoints: 0.5,
        },
        {
          tier: 2,
          title: "Specific Hint",
          content: "Use a Hash Map where the key is the number and the value is its index. For each element 'x', check if 'target - x' already exists in the map.",
          penaltyPoints: 1.0,
        },
        {
          tier: 3,
          title: "Near-Solution Approach",
          content: "Loop through array once: check 'seen.has(target - num)'. If true, return [seen.get(target - num), i]. Else, seen.set(num, i). This gives O(N) time and O(N) space.",
          penaltyPoints: 2.0,
        },
      ];
    }

    if (qLower.includes("substring") || qLower.includes("sliding") || qLower.includes("longest")) {
      return [
        {
          tier: 1,
          title: "Gentle Nudge",
          content: "Consider how a contiguous window expands to include new characters and contracts when a condition is violated.",
          penaltyPoints: 0.5,
        },
        {
          tier: 2,
          title: "Specific Hint",
          content: "Maintain a sliding window [left, right] with a set or frequency map of characters currently inside the window.",
          penaltyPoints: 1.0,
        },
        {
          tier: 3,
          title: "Near-Solution Approach",
          content: "Iterate 'right' from 0 to N-1. While the character at 'right' is a duplicate in your set, remove s[left] and increment 'left'. Add s[right] and update maxLen = Math.max(maxLen, right - left + 1).",
          penaltyPoints: 2.0,
        },
      ];
    }

    // Default Algorithmic Hints
    return [
      {
        tier: 1,
        title: "Gentle Nudge",
        content: "Clarify constraints and think about whether sorting or an auxiliary frequency map can simplify the search space.",
        penaltyPoints: 0.5,
      },
      {
        tier: 2,
        title: "Specific Hint",
        content: "Look for monotonicity or overlapping subproblems. A two-pointer or dynamic programming table can eliminate redundant calculations.",
        penaltyPoints: 1.0,
      },
      {
        tier: 3,
        title: "Near-Solution Approach",
        content: "Define the recurrence relation or loop invariant clearly. Initialize pointers/structures, handle base cases, and dry-run with a 3-element test case.",
        penaltyPoints: 2.0,
      },
    ];
  }

  private static getSystemDesignHints(qLower: string): TieredHint[] {
    return [
      {
        tier: 1,
        title: "Gentle Nudge",
        content: "Start by separating functional requirements (user can do X) from non-functional requirements (p99 latency < 100ms, 99.99% availability).",
        penaltyPoints: 0.5,
      },
      {
        tier: 2,
        title: "Specific Hint",
        content: "Estimate scale: calculate peak QPS and 5-year storage. Then design the storage tier (SQL vs NoSQL) and define the primary partition key.",
        penaltyPoints: 1.0,
      },
      {
        tier: 3,
        title: "Near-Solution Approach",
        content: "Introduce an API Gateway -> Microservices -> Sharded Database + Redis Cache. Explicitly state the cache invalidation policy (write-around vs write-through) and circuit breaker for downstream failure resilience.",
        penaltyPoints: 2.0,
      },
    ];
  }

  private static getBehavioralHints(qLower: string): TieredHint[] {
    return [
      {
        tier: 1,
        title: "Gentle Nudge",
        content: "Use the STAR structure. Limit the Situation to 20 seconds so you have maximum time for your personal Actions.",
        penaltyPoints: 0.5,
      },
      {
        tier: 2,
        title: "Specific Hint",
        content: "Shift from 'we' to 'I'. Explicitly say: 'My specific role was...' and describe the engineering or leadership trade-off you navigated.",
        penaltyPoints: 1.0,
      },
      {
        tier: 3,
        title: "Near-Solution Approach",
        content: "Anchor your result in 2 quantifiable metrics: e.g. 'This dropped p99 latency by 40% and saved 8 hours of engineering toil per week.'",
        penaltyPoints: 2.0,
      },
    ];
  }
}
