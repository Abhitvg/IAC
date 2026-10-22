import { describe, it, expect } from 'vitest';
import { StructureAnalyzer } from '../../src/services/practice/coach/StructureAnalyzer';
import { ConcretenessAnalyzer } from '../../src/services/practice/coach/ConcretenessAnalyzer';

describe('Structure & Concreteness Coach - Phase 3 Acceptance Tests', () => {
  const sampleQuestion =
    'How do you handle cache invalidation and stampedes in a high-throughput distributed system?';

  // 1. Rambling, disorganized answer
  const ramblingTranscript = `
    Well, so cache invalidation is tricky. I worked on a project where we had a lot of issues.
    Sometimes the database CPU would spike and we didn't know why. We were using some caching layer.
    Actually, my manager at the time wanted us to do something else with microservices, which was kind of annoying.
    Anyway, if a key expires, maybe queries hit the database at the same time. You could maybe use a mutex or something.
    We also thought about TTLs, but then stale data happens. It depends on a lot of things.
  `.trim();

  // 2. The exact same technical points, reorganized with headline-first, signposting, claim-reason-example, and trade-off
  const structuredTranscript = `
    The key decision is to combine probabilistic early expiration with distributed mutex locks to completely prevent cache stampedes.
    There are three components to this strategy.
    First, we set an active TTL alongside a background refresh window so hot keys recompute before expiring.
    Second, when a miss occurs, worker nodes acquire a Redis mutex lock so only one thread queries Postgres while others wait.
    Third, the trade-off is slightly higher lock contention under peak write throughput in exchange for guaranteed database protection.
    In summary, mutual exclusion and background pre-fetching prevent cascade outages.
  `.trim();

  it('scores a rambling answer lower on structure than the same content reorganized', async () => {
    // Test heuristic evaluation
    const ramblingEval = StructureAnalyzer.heuristicFallback(ramblingTranscript, {
      answerLength: ramblingTranscript.length,
      wordCount: ramblingTranscript.split(/\s+/).length,
      sentenceCount: 5,
      timeToFirstClaimSeconds: 15,
    });

    const structuredEval = StructureAnalyzer.heuristicFallback(structuredTranscript, {
      answerLength: structuredTranscript.length,
      wordCount: structuredTranscript.split(/\s+/).length,
      sentenceCount: 5,
      timeToFirstClaimSeconds: 2,
    });

    expect(structuredEval.structureScore).toBeGreaterThan(ramblingEval.structureScore);
    expect(ramblingEval.headlineFirst.met).toBe(false);
    expect(structuredEval.headlineFirst.met).toBe(true);
    expect(structuredEval.signposting.met).toBe(true);
    expect(structuredEval.tradeOffStated.met).toBe(true);
    expect(structuredEval.closingSummary.met).toBe(true);
  });

  it('rejects fabricated or hallucinated quotes and caps structure score at 2', async () => {
    // Mock LLM returning fabricated quote not present in transcript
    const mockLlmCaller = async () => {
      return JSON.stringify({
        headlineFirst: {
          met: true,
          quote: 'This is a fabricated headline that never appeared in the candidate answer',
        },
        signposting: {
          met: true,
          quote: 'We have three structured points here',
        },
        claimReasonExample: { count: 3, quotes: ['completely invented quote'] },
        tradeOffStated: { met: true, quote: 'Fabricated trade-off' },
        closingSummary: { met: true, quote: 'Fabricated closing' },
        tangents: [],
        score: 5, // Attempting to give 5/5 with fake evidence
        reasons: ['High structure'],
      });
    };

    const result = await StructureAnalyzer.analyze({
      transcript: ramblingTranscript,
      question: sampleQuestion,
      llmCaller: mockLlmCaller,
    });

    // Score must be penalized and capped at 2
    expect(result.structureScore).toBeLessThanOrEqual(2);
    expect(result.headlineFirst.met).toBe(false);
    expect(result.signposting.met).toBe(false);
    expect(result.reasons[0]).toContain('Score capped at 2');
  });

  it('rejects fabricated quotes in ConcretenessAnalyzer and caps score at 2', async () => {
    const mockLlmCaller = async () => {
      return JSON.stringify({
        concreteExamplesCount: 2,
        concreteExamples: [{ quote: 'invented 500,000 QPS Stripe benchmark', description: 'fake' }],
        namedToolsOrTechnologies: [
          { name: 'CockroachDB', quote: 'CockroachDB multi-region deployment' },
        ],
        quantitiesOrThresholds: [
          { quantity: '99.999% SLA', quote: 'we achieved 99.999% SLA uptime' },
        ],
        workedExamplePresent: true,
        workedExampleQuote: 'fake worked example walkthrough',
        claimsWithoutSupport: [],
        concretenessScore: 5,
        reasons: ['High concreteness'],
      });
    };

    const result = await ConcretenessAnalyzer.analyze({
      transcript: ramblingTranscript,
      question: sampleQuestion,
      llmCaller: mockLlmCaller,
    });

    // All fake quotes must be stripped and score capped at 2
    expect(result.concretenessScore).toBeLessThanOrEqual(2);
    expect(result.concreteExamples.length).toBe(0);
    expect(result.namedToolsOrTechnologies.length).toBe(0);
    expect(result.quantitiesOrThresholds.length).toBe(0);
    expect(result.workedExamplePresent).toBe(false);
    expect(result.reasons[0]).toContain('Score capped at 2');
  });

  it('enforces that suggested rewrite never introduces numbers or tool names absent from input', async () => {
    const inputWithoutToolsOrNumbers = `
      We had a problem with our background processing. Jobs would pile up and workers would crash.
      The team had to manually restart the servers when they got stuck.
      It caused delays for our customers and we need a better way to handle the backlog.
    `.trim();

    // Mock LLM that attempts to hallucinate tools and numbers
    const hallucinatingLlmCaller = async () => {
      return `
        Headline: The processing pipeline requires a resilient queue architecture.
        Points:
        1. First: We deployed Kafka with 50 partition brokers to stream jobs.
        2. Second: Redis cluster handles 25000 QPS with Memcached caching.
        Trade-off: Kubernetes pod orchestration introduces 150ms network overhead.
        Close: This stabilizes customer delivery.
      `.trim();
    };

    const rewriteResult = await StructureAnalyzer.generateRewrite({
      paragraph: inputWithoutToolsOrNumbers,
      llmCaller: hallucinatingLlmCaller,
    });

    const rewritten = rewriteResult.rewrittenParagraph;

    // 1. Verify NO numbers absent from input are in the rewritten output
    // The input has ZERO numbers.
    const cleanRewritten = rewritten.replace(/\[[^\]]+\]/g, ''); // strip bracketed placeholders
    const numbersInRewrite = cleanRewritten.match(/\b\d+(?:\.\d+)?\b/g) || [];
    expect(numbersInRewrite).toEqual([]);

    // 2. Verify NO capitalized tool names absent from input are in the rewritten output
    // Tools like Kafka, Redis, Memcached, Kubernetes must NOT appear unbracketed!
    expect(cleanRewritten).not.toContain('Kafka');
    expect(cleanRewritten).not.toContain('Redis');
    expect(cleanRewritten).not.toContain('Memcached');
    expect(cleanRewritten).not.toContain('Kubernetes');

    // Placeholders like [specify tool] or [add specific number] must replace hallucinations
    expect(rewritten).toContain('[specify tool]');
    expect(rewritten).toContain('[add specific number]');
    expect(rewriteResult.isGrounded).toBe(true);
  });

  it('correctly extracts genuine concrete metrics and tool names when present', async () => {
    const result = ConcretenessAnalyzer.heuristicFallback(structuredTranscript);

    // Redis and Postgres are present in structuredTranscript
    const toolNames = result.namedToolsOrTechnologies.map((t) => t.name.toLowerCase());
    expect(toolNames).toContain('redis');
    expect(toolNames).toContain('postgres');
    expect(result.concretenessScore).toBeGreaterThanOrEqual(2);
  });
});
