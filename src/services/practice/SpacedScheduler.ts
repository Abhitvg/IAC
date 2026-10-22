import { TopicMastery } from './types';
import { QuestionBank, QuestionEntry } from './QuestionBank';

export class SpacedScheduler {
  public static readonly DEFAULT_TOPICS: Array<{
    id: string;
    name: string;
    category: 'DSA' | 'System Design' | 'Behavioral' | 'Core CS';
  }> = [
    { id: 'dsa_arrays_pointers', name: 'Two Pointers & Sliding Window', category: 'DSA' },
    { id: 'dsa_binary_search', name: 'Binary Search & Monotonic Stack', category: 'DSA' },
    { id: 'dsa_trees_graphs', name: 'Trees & Graph Traversals (DFS/BFS)', category: 'DSA' },
    { id: 'dsa_dp', name: 'Dynamic Programming & Memoization', category: 'DSA' },
    { id: 'dsa_heaps_topo', name: 'Heaps & Topological Sort', category: 'DSA' },
    { id: 'sd_scale_lb', name: 'Horizontal Scaling & Load Balancing', category: 'System Design' },
    { id: 'sd_sharding_repl', name: 'Database Sharding & Replication', category: 'System Design' },
    {
      id: 'sd_caching',
      name: 'Caching Patterns & Invalidation Strategies',
      category: 'System Design',
    },
    {
      id: 'sd_queues_async',
      name: 'Distributed Queues & Event-Driven Architecture',
      category: 'System Design',
    },
    {
      id: 'sd_resilience',
      name: 'Rate Limiting & Circuit Breaker Fault Tolerance',
      category: 'System Design',
    },
    { id: 'beh_conflict', name: 'Resolving Engineering Disagreements', category: 'Behavioral' },
    {
      id: 'beh_ambiguity',
      name: 'Delivering Under Ambiguity & Shifting Specs',
      category: 'Behavioral',
    },
    {
      id: 'beh_failure',
      name: 'Production Incident Postmortems & Ownership',
      category: 'Behavioral',
    },
    {
      id: 'beh_leadership',
      name: 'Technical Leadership & Cross-Functional Alignment',
      category: 'Behavioral',
    },
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
    const scoreWeight = q / 5.0;
    const masteryScore = Math.min(
      100,
      Math.round((repetitionWeight * 0.6 + scoreWeight * 0.4) * 100)
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
  public static selectTomorrowPracticeSet(
    records: TopicMastery[],
    count: number = 3
  ): QuestionEntry[] {
    const prioritizedTopics = this.getDailyPracticeQueue(records, count);
    const chosenQuestions: QuestionEntry[] = [];
    const chosenIds = new Set<string>();

    for (const topic of prioritizedTopics) {
      const type =
        topic.category === 'DSA'
          ? 'coding'
          : topic.category === 'System Design'
            ? 'system_design'
            : 'behavioral';

      const q = QuestionBank.selectAdaptiveQuestion({
        type,
        excludedIds: Array.from(chosenIds),
        topicMasteries: records,
      });

      if (q && !chosenIds.has(q.id)) {
        chosenIds.add(q.id);
        chosenQuestions.push(q);
      }
    }

    // Fill remaining if needed
    while (chosenQuestions.length < count) {
      const fallback = QuestionBank.selectAdaptiveQuestion({
        type: 'coding',
        excludedIds: Array.from(chosenIds),
        topicMasteries: records,
      });
      if (fallback && !chosenIds.has(fallback.id)) {
        chosenIds.add(fallback.id);
        chosenQuestions.push(fallback);
      } else {
        break;
      }
    }

    return chosenQuestions;
  }

  public static identifyTopicForQuestion(question: string | QuestionEntry): string {
    if (typeof question !== 'string') {
      const allTags = [question.topic, ...(question.tags || [])].map((t) => t.toLowerCase());
      for (const tag of allTags) {
        if (tag.includes('sliding_window') || tag.includes('two_pointers'))
          return 'dsa_arrays_pointers';
        if (tag.includes('binary_search') || tag.includes('monotonic_stack'))
          return 'dsa_binary_search';
        if (
          tag.includes('tree') ||
          tag.includes('graph') ||
          tag.includes('bfs') ||
          tag.includes('dfs')
        )
          return 'dsa_trees_graphs';
        if (tag.includes('dynamic_programming') || tag.includes('dp')) return 'dsa_dp';
        if (tag.includes('heap') || tag.includes('priority_queue') || tag.includes('topological'))
          return 'dsa_heaps_topo';
        if (
          tag.includes('rate_limiting') ||
          tag.includes('circuit_breaker') ||
          tag.includes('resilience')
        )
          return 'sd_resilience';
        if (tag.includes('caching') || tag.includes('redis')) return 'sd_caching';
        if (tag.includes('queue') || tag.includes('kafka') || tag.includes('stream'))
          return 'sd_queues_async';
        if (tag.includes('sharding') || tag.includes('storage') || tag.includes('nosql'))
          return 'sd_sharding_repl';
        if (tag.includes('conflict')) return 'beh_conflict';
        if (tag.includes('ambiguity')) return 'beh_ambiguity';
        if (tag.includes('failure') || tag.includes('postmortem') || tag.includes('incident'))
          return 'beh_failure';
        if (tag.includes('leadership') || tag.includes('mentorship')) return 'beh_leadership';
      }
      return question.type === 'coding'
        ? 'dsa_arrays_pointers'
        : question.type === 'system_design'
          ? 'sd_caching'
          : 'beh_conflict';
    }
    const qLower = (question || '').toLowerCase();

    if (
      qLower.includes('two sum') ||
      qLower.includes('pointer') ||
      qLower.includes('sliding window')
    ) {
      return 'dsa_arrays_pointers';
    }
    if (
      qLower.includes('binary search') ||
      qLower.includes('sorted array') ||
      qLower.includes('rotated')
    ) {
      return 'dsa_binary_search';
    }
    if (
      qLower.includes('tree') ||
      qLower.includes('graph') ||
      qLower.includes('traversal') ||
      qLower.includes('bst')
    ) {
      return 'dsa_trees_graphs';
    }
    if (
      qLower.includes('dynamic programming') ||
      qLower.includes('memo') ||
      qLower.includes('knapsack')
    ) {
      return 'dsa_dp';
    }
    if (qLower.includes('cache') || qLower.includes('redis') || qLower.includes('invalidation')) {
      return 'sd_caching';
    }
    if (qLower.includes('shard') || qLower.includes('partition') || qLower.includes('database')) {
      return 'sd_sharding_repl';
    }
    if (qLower.includes('queue') || qLower.includes('kafka') || qLower.includes('event')) {
      return 'sd_queues_async';
    }
    if (qLower.includes('disagree') || qLower.includes('conflict')) {
      return 'beh_conflict';
    }
    if (qLower.includes('ambiguity') || qLower.includes('unclear')) {
      return 'beh_ambiguity';
    }
    if (qLower.includes('fail') || qLower.includes('outage') || qLower.includes('incident')) {
      return 'beh_failure';
    }
    if (qLower.includes('lead') || qLower.includes('mentor') || qLower.includes('stakeholder')) {
      return 'beh_leadership';
    }

    return 'dsa_arrays_pointers';
  }
}
