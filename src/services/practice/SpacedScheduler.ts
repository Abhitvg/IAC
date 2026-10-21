import { TopicMastery } from "./types";

export class SpacedScheduler {
  public static readonly DEFAULT_TOPICS: Array<{
    id: string;
    name: string;
    category: "DSA" | "System Design" | "Behavioral" | "Core CS";
  }> = [
    { id: "dsa_arrays_pointers", name: "Two Pointers & Sliding Window", category: "DSA" },
    { id: "dsa_binary_search", name: "Binary Search & Monotonic Stack", category: "DSA" },
    { id: "dsa_trees_graphs", name: "Trees & Graph Traversals (DFS/BFS)", category: "DSA" },
    { id: "dsa_dp", name: "Dynamic Programming & Memoization", category: "DSA" },
    { id: "dsa_heaps_topo", name: "Heaps & Topological Sort", category: "DSA" },
    { id: "sd_scale_lb", name: "Horizontal Scaling & Load Balancing", category: "System Design" },
    { id: "sd_sharding_repl", name: "Database Sharding & Replication", category: "System Design" },
    { id: "sd_caching", name: "Caching Patterns & Invalidation Strategies", category: "System Design" },
    { id: "sd_queues_async", name: "Distributed Queues & Event-Driven Architecture", category: "System Design" },
    { id: "sd_resilience", name: "Rate Limiting & Circuit Breaker Fault Tolerance", category: "System Design" },
    { id: "beh_conflict", name: "Resolving Engineering Disagreements", category: "Behavioral" },
    { id: "beh_ambiguity", name: "Delivering Under Ambiguity & Shifting Specs", category: "Behavioral" },
    { id: "beh_failure", name: "Production Incident Postmortems & Ownership", category: "Behavioral" },
    { id: "beh_leadership", name: "Technical Leadership & Cross-Functional Alignment", category: "Behavioral" },
  ];

  /**
   * Initializes default topic mastery records if none exist yet.
   */
  public static initializeDefaults(): TopicMastery[] {
    const now = Date.now();
    return this.DEFAULT_TOPICS.map((topic, index) => ({
      topicId: topic.id,
      topicName: topic.name,
      category: topic.category,
      easeFactor: 2.5,
      intervalDays: 0,
      repetitions: 0,
      masteryScore: 0,
      lastReviewedDate: undefined,
      nextReviewDate: now + index * 60000, // Stagger initial review so first topics appear immediately
    }));
  }

  /**
   * Applies the SuperMemo 2 (SM-2) algorithm to update topic mastery.
   * @param record Current topic mastery state
   * @param quality Rubric performance score from 1.0 (poor) to 5.0 (perfect)
   */
  public static recordAttempt(record: TopicMastery, qualityScore: number): TopicMastery {
    const q = Math.max(1, Math.min(5, Math.round(qualityScore)));
    let { easeFactor, intervalDays, repetitions } = record;

    if (q < 3) {
      // Failed recall / weak response -> reset repetitions and practice tomorrow
      repetitions = 0;
      intervalDays = 1;
    } else {
      // Successful response -> advance interval
      if (repetitions === 0) {
        intervalDays = 1;
      } else if (repetitions === 1) {
        intervalDays = 6;
      } else {
        intervalDays = Math.round(intervalDays * easeFactor);
      }
      repetitions++;
    }

    // Update ease factor: EF' = EF + (0.1 - (5 - q) * (0.08 + (5 - q) * 0.02))
    const diff = 5 - q;
    easeFactor = easeFactor + (0.1 - diff * (0.08 + diff * 0.02));
    easeFactor = Math.max(1.3, Math.min(3.5, Math.round(easeFactor * 100) / 100));

    // Calculate normalized mastery percentage (0% to 100%)
    const repetitionWeight = Math.min(repetitions / 4, 1.0);
    const scoreWeight = (q / 5.0);
    const masteryScore = Math.min(
      100,
      Math.round(((repetitionWeight * 0.6) + (scoreWeight * 0.4)) * 100)
    );

    const now = Date.now();
    const nextReviewDate = now + intervalDays * 24 * 60 * 60 * 1000;

    return {
      ...record,
      easeFactor,
      intervalDays,
      repetitions,
      masteryScore,
      lastReviewedDate: now,
      nextReviewDate,
    };
  }

  /**
   * Generates prioritized practice drill queue for today.
   * Focuses on overdue reviews and weakest topics (<60% mastery).
   */
  public static getDailyPracticeQueue(
    records: TopicMastery[],
    maxDrills: number = 3
  ): TopicMastery[] {
    const now = Date.now();

    // Separate into overdue/due topics and future topics
    const dueTopics = records.filter((r) => r.nextReviewDate <= now || r.repetitions === 0);
    const futureTopics = records.filter((r) => r.nextReviewDate > now && r.repetitions > 0);

    // Sort due topics by lowest mastery score first (gaps first)
    dueTopics.sort((a, b) => a.masteryScore - b.masteryScore);

    // Sort future topics by lowest mastery score as backup
    futureTopics.sort((a, b) => a.masteryScore - b.masteryScore);

    const queue = [...dueTopics, ...futureTopics];
    return queue.slice(0, maxDrills);
  }

  /**
   * Maps a question string to the best matching Topic ID.
   */
  public static identifyTopicForQuestion(question: string): string {
    const qLower = (question || "").toLowerCase();

    if (qLower.includes("two sum") || qLower.includes("pointer") || qLower.includes("sliding window")) {
      return "dsa_arrays_pointers";
    }
    if (qLower.includes("binary search") || qLower.includes("sorted array") || qLower.includes("rotated")) {
      return "dsa_binary_search";
    }
    if (qLower.includes("tree") || qLower.includes("graph") || qLower.includes("traversal") || qLower.includes("bst")) {
      return "dsa_trees_graphs";
    }
    if (qLower.includes("dynamic programming") || qLower.includes("memo") || qLower.includes("knapsack")) {
      return "dsa_dp";
    }
    if (qLower.includes("cache") || qLower.includes("redis") || qLower.includes("invalidation")) {
      return "sd_caching";
    }
    if (qLower.includes("shard") || qLower.includes("partition") || qLower.includes("database")) {
      return "sd_sharding_repl";
    }
    if (qLower.includes("queue") || qLower.includes("kafka") || qLower.includes("event")) {
      return "sd_queues_async";
    }
    if (qLower.includes("disagree") || qLower.includes("conflict")) {
      return "beh_conflict";
    }
    if (qLower.includes("ambiguity") || qLower.includes("unclear")) {
      return "beh_ambiguity";
    }
    if (qLower.includes("fail") || qLower.includes("outage") || qLower.includes("incident")) {
      return "beh_failure";
    }
    if (qLower.includes("lead") || qLower.includes("mentor") || qLower.includes("stakeholder")) {
      return "beh_leadership";
    }

    return "dsa_arrays_pointers";
  }
}
