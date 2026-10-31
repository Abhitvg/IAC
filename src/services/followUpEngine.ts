/**
 * followUpEngine.ts
 *
 * Dynamic Context-Aware Follow-Up Question Engine for IAC 2.0.
 *
 * Generates tailored follow-up cross-examination questions grounded directly in the
 * actual content of the generated answer, exposes potential omissions or weaknesses,
 * and prepares consistent, defensible answers when challenged.
 */

export interface PredictedFollowUp {
  question: string;
  category: 'trade_off' | 'failure_mode' | 'scale' | 'ownership' | 'alternative' | 'testing';
  rational: string;
  suggestedDefense: string;
}

export class FollowUpEngine {
  /**
   * Generates dynamic follow-up questions tailored to the specific answer text and topic.
   */
  public static predictFollowUps(
    question: string,
    answer: string,
    category: string = 'General'
  ): PredictedFollowUp[] {
    const qLower = (question || '').toLowerCase();
    const aLower = (answer || '').toLowerCase();
    const followUps: PredictedFollowUp[] = [];

    // 1. Check for database technology choices (e.g. PostgreSQL, Redis, DynamoDB)
    if (aLower.includes('postgresql') || aLower.includes('postgres')) {
      followUps.push({
        question: 'Why did you choose PostgreSQL over a document store like MongoDB or DynamoDB for this use case?',
        category: 'alternative',
        rational: 'Answer explicitly mentions PostgreSQL; interviewers standardly probe data modeling alternatives.',
        suggestedDefense: 'Focus on ACID transaction guarantees, relational schema consistency, and JSONB flexibility when document storage is needed.',
      });
    }

    if (aLower.includes('redis')) {
      followUps.push({
        question: 'What happens if the Redis cache nodes crash or experience an eviction spike?',
        category: 'failure_mode',
        rational: 'Caches are vulnerable to cache stampedes and memory eviction under high write volume.',
        suggestedDefense: 'Explain cache penetration protections, probabilistic early expiration (XFetch), and falling back to read replicas with connection pooling.',
      });
    }

    // 2. Check for distributed messaging / Kafka / queues
    if (aLower.includes('kafka') || aLower.includes('queue') || aLower.includes('message')) {
      followUps.push({
        question: 'How do you guarantee message ordering and avoid duplicate processing when a consumer crashes?',
        category: 'failure_mode',
        rational: 'Consumer group rebalancing in Kafka can lead to redelivery of uncommitted offsets.',
        suggestedDefense: 'Emphasize that ordering is guaranteed per partition key, and consumers must maintain idempotent state updates using transaction IDs.',
      });
    }

    // 3. Check for concurrency or multithreading
    if (aLower.includes('thread') || aLower.includes('concurren') || aLower.includes('volatile') || aLower.includes('lock')) {
      followUps.push({
        question: 'Under severe contention, how does your chosen locking mechanism impact latency and CPU utilization?',
        category: 'scale',
        rational: 'Lock contention leads to thread parking and kernel context switching overhead.',
        suggestedDefense: 'Contrast coarse-grained synchronization with lock striping or non-blocking CAS primitives (AtomicReference/StampedLock).',
      });
    }

    // 4. Check for personal ownership in behavioral / project answers
    if (aLower.includes('we ') || aLower.includes('our team') || aLower.includes('the project')) {
      followUps.push({
        question: 'What specific parts of this architecture did you personally write versus what was built by other team members?',
        category: 'ownership',
        rational: 'Interviewers seek to separate individual technical contributions from broader team deliverables.',
        suggestedDefense: 'Directly identify the modules you individually coded (e.g. data synchronization protocol, unit test suite, schema design).',
      });
    }

    // 5. Check for scaling claims
    if (aLower.includes('scale') || aLower.includes('thousands') || aLower.includes('high traffic') || aLower.includes('load balancer')) {
      followUps.push({
        question: 'If traffic increased by a factor of 10x overnight, where is the first single point of failure in this design?',
        category: 'scale',
        rational: 'Probes architectural bottlenecks under sudden burst scale.',
        suggestedDefense: 'Isolate the primary database write throughput and connection limits; propose horizontal sharding or read-replica scaling.',
      });
    }

    // 6. Check for testing & verification
    if (followUps.length < 3) {
      followUps.push({
        question: 'How did you verify and test this implementation in production or staging environments?',
        category: 'testing',
        rational: 'Validates that the candidate tests systems systematically rather than relying on manual inspection.',
        suggestedDefense: 'Mention end-to-end integration tests, load testing with k6/Gatling, and canary deployments with synthetic health probes.',
      });
    }

    // 7. General fallback if needed
    if (followUps.length < 3) {
      followUps.push({
        question: 'Looking back at this implementation, what architectural trade-off would you design differently today?',
        category: 'trade_off',
        rational: 'Tests technical self-reflection and engineering maturity.',
        suggestedDefense: 'Discuss an operational limitation (e.g., earlier adoption of structured observability or stricter API schemas).',
      });
    }

    return followUps.slice(0, 3);
  }

  /**
   * Generates prompt instructions for the LLM to output contextual follow-up predictions.
   */
  public static buildFollowUpPromptInstruction(): string {
    return `

═══ FOLLOW-UP PREDICTION ═══
After your main answer, on a new line output exactly:
FOLLOW_UPS: [question1] | [question2] | [question3]
where each is a likely follow-up the interviewer may ask based on your answer.
Keep each follow-up under 15 words. Do NOT explain them.`;
  }
}
