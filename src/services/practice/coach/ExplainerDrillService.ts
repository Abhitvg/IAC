import {
  ExplainerAttempt,
  ConceptCard,
  StructureAnalysisResult,
  ConcretenessAnalysisResult,
  DeliveryMetrics,
  TopicMastery,
} from '../types';
import { QuestionEntry } from '../QuestionBank';
import { SpacedScheduler } from '../SpacedScheduler';
import { LLMManager } from '../../providers/LLMProvider';

export class ExplainerDrillService {
  /**
   * Evaluates a 30, 60, or 90 second explanation attempt.
   * Reports structure, concreteness, delivery, timing compliance, score delta vs previous attempt,
   * and one actionable improvement target.
   */
  public static evaluateAttempt(params: {
    topic: string;
    transcript: string;
    timeLimitSeconds: 30 | 60 | 90;
    elapsedSeconds: number;
    previousAttempt?: ExplainerAttempt;
    structureAnalysis: StructureAnalysisResult;
    concretenessAnalysis: ConcretenessAnalysisResult;
    delivery: DeliveryMetrics;
    now?: number;
  }): ExplainerAttempt {
    const timestamp = params.now ?? Date.now();
    const dateKey = new Date(timestamp).toISOString().split('T')[0];

    const stayedWithinTime = params.elapsedSeconds <= params.timeLimitSeconds;

    const sScore = params.structureAnalysis.structureScore;
    const cScore = params.concretenessAnalysis.concretenessScore;
    const dScore = params.delivery.deliveryScore || 3.0;

    // Timing penalty: -0.5 to composite if overtime
    const timingDeduction = stayedWithinTime ? 0 : 0.5;
    const rawComposite = sScore * 0.4 + cScore * 0.4 + dScore * 0.2 - timingDeduction;
    const compositeScore = Math.max(1.0, Math.min(5.0, Math.round(rawComposite * 10) / 10));

    // Calculate score delta vs previous attempt
    let scoreDelta: ExplainerAttempt['scoreDelta'] | undefined = undefined;
    const attemptNumber = params.previousAttempt ? params.previousAttempt.attemptNumber + 1 : 1;

    if (params.previousAttempt) {
      scoreDelta = {
        structureDelta: sScore - params.previousAttempt.structureScore,
        concretenessDelta: cScore - params.previousAttempt.concretenessScore,
        compositeDelta:
          Math.round((compositeScore - params.previousAttempt.compositeScore) * 10) / 10,
      };
    }

    // Determine one concrete improvement target
    let improvementTarget: string;
    if (!stayedWithinTime) {
      const overBy = params.elapsedSeconds - params.timeLimitSeconds;
      improvementTarget = `Pacing target: You exceeded your ${params.timeLimitSeconds}s budget by ${overBy}s. Edit down tangents and state the summary close before the timer ends.`;
    } else if (sScore < 4 && !params.structureAnalysis.headlineFirst.met) {
      improvementTarget =
        'Structure target: State your decisive conclusion or recommendation within the opening 10 seconds before unpacking details.';
    } else if (sScore < 4 && !params.structureAnalysis.signposting.met) {
      improvementTarget =
        'Signposting target: Use explicit roadmap phrases (e.g. "There are three primary layers: first, second, third").';
    } else if (cScore < 4 && params.concretenessAnalysis.quantitiesOrThresholds.length === 0) {
      improvementTarget =
        'Concreteness target: Quote specific numerical thresholds (e.g. 10k QPS, p99 latency < 20ms, or cache TTL).';
    } else if (cScore < 4 && params.concretenessAnalysis.namedToolsOrTechnologies.length === 0) {
      improvementTarget =
        'Concreteness target: Name at least two real-world production technologies rather than using abstract descriptors.';
    } else if (sScore < 4 && !params.structureAnalysis.tradeOffStated.met) {
      improvementTarget =
        'Trade-off target: Acknowledge an explicit downside or alternative consideration before concluding.';
    } else if (params.delivery.fillerPercentage > 3.0) {
      improvementTarget = `Delivery target: Reduce filler word usage from ${params.delivery.fillerPercentage}% to under 3.0% by leaning into silent pauses.`;
    } else {
      improvementTarget =
        'Benchmark met! Challenge yourself by repeating the same explanation with a tighter 60s or 30s timer.';
    }

    return {
      id: `drill_${timestamp}_${Math.random().toString(36).slice(2, 7)}`,
      topic: params.topic,
      attemptNumber,
      timestamp,
      dateKey,
      transcript: params.transcript,
      timeLimitSeconds: params.timeLimitSeconds,
      elapsedSeconds: params.elapsedSeconds,
      stayedWithinTime,
      structureScore: sScore,
      concretenessScore: cScore,
      compositeScore,
      delivery: params.delivery,
      improvementTarget,
      scoreDelta,
    };
  }

  /**
   * SpacedScheduler mastery update rule:
   * Topics improve in mastery ONLY when both structure and concreteness reach at least 4 in two consecutive attempts.
   */
  public static updateMasteryFromAttempts(
    topicMastery: TopicMastery,
    attemptsForTopic: ExplainerAttempt[]
  ): {
    updatedMastery: TopicMastery;
    improved: boolean;
    consecutivePassingCount: number;
  } {
    if (!attemptsForTopic || attemptsForTopic.length === 0) {
      return { updatedMastery: topicMastery, improved: false, consecutivePassingCount: 0 };
    }

    // Sort chronologically
    const sorted = [...attemptsForTopic].sort((a, b) => a.timestamp - b.timestamp);

    const isPass = (att: ExplainerAttempt) => att.structureScore >= 4 && att.concretenessScore >= 4;

    const latest = sorted[sorted.length - 1];

    if (sorted.length < 2) {
      const pass = isPass(latest);
      return {
        updatedMastery: topicMastery,
        improved: false,
        consecutivePassingCount: pass ? 1 : 0,
      };
    }

    const penultimate = sorted[sorted.length - 2];
    const penultimatePass = isPass(penultimate);
    const latestPass = isPass(latest);

    if (penultimatePass && latestPass) {
      // Both structure and concreteness reached >= 4 in two consecutive attempts!
      // Improve mastery using SM-2
      const updatedMastery = SpacedScheduler.recordAttempt(topicMastery, 4.5);
      return {
        updatedMastery,
        improved: true,
        consecutivePassingCount: 2,
      };
    }

    return {
      updatedMastery: topicMastery,
      improved: false,
      consecutivePassingCount: latestPass ? 1 : 0,
    };
  }

  /**
   * Generates a 4-part Concept Card:
   * 1. Three-sentence core idea
   * 2. One worked example
   * 3. One common pitfall
   * 4. One trade-off
   * Clearly labeled "AI-generated, verify before relying on it".
   */
  public static async generateConceptCard(params: {
    topic: string;
    questionEntry?: QuestionEntry;
    userNotes?: string;
    llmCaller?:
      | ((prompt: string, model?: string) => Promise<string>)
      | ((prompt: string, model: string) => Promise<string>);
  }): Promise<ConceptCard> {
    const topic = params.topic.trim();

    const prompt = `
Generate a concise technical study concept card for the topic: "${topic}".
Use only established facts from the reference details or standard computer science principles.
Reference context:
${params.questionEntry ? `Question prompt: ${params.questionEntry.prompt}\nExpected points: ${params.questionEntry.expectedPoints.join('; ')}\nCommon mistakes: ${params.questionEntry.commonMistakes?.join('; ') || 'None'}` : 'None'}
${params.userNotes ? `User notes: ${params.userNotes}` : ''}

Return JSON only:
{
  "coreIdea": "<Exactly three sentences describing the fundamental concept>",
  "workedExample": "<One concrete, grounded production example with numbers and tool names>",
  "commonPitfall": "<One common architectural trap or candidate misconception>",
  "tradeOff": "<One primary engineering trade-off>"
}
`.trim();

    try {
      let rawJson = '';
      if (params.llmCaller) {
        rawJson = await params.llmCaller(prompt, 'gpt-4o-mini');
      } else {
        const llm = new LLMManager();
        const res = await llm.executeWithFallback([{ role: 'user', content: prompt }], {
          temperature: 0.2,
        });
        rawJson = res.text;
      }

      const match = rawJson.match(/\{[\s\S]*\}/);
      if (match) {
        const parsed = JSON.parse(match[0]);
        return {
          id: `card_${topic.toLowerCase().replace(/[^a-z0-9]+/g, '_')}`,
          topic,
          coreIdea:
            parsed.coreIdea ||
            `${topic} decouples system components to enable independent horizontal scaling. It guarantees consistency while managing latency and throughput constraints. Understanding its trade-offs is essential for staff-level interview performance.`,
          workedExample:
            parsed.workedExample ||
            `In an e-commerce platform processing 10,000 QPS, ${topic} prevents cascade failures during flash sale spikes.`,
          commonPitfall:
            parsed.commonPitfall ||
            `Assuming infinite horizontal scalability without accounting for downstream lock contention or network partitions.`,
          tradeOff:
            parsed.tradeOff ||
            `Trades memory and coordination overhead for guaranteed consistency and bounded p99 latency.`,
          isEditedByUser: false,
          disclaimer: 'AI-generated, verify before relying on it',
          updatedAt: Date.now(),
        };
      }
    } catch {
      // Fallback
    }

    // Deterministic fallback card
    return {
      id: `card_${topic.toLowerCase().replace(/[^a-z0-9]+/g, '_')}`,
      topic,
      coreIdea: `${topic} provides architectural decoupling to handle high-throughput workloads reliably. It balances data consistency against operational latency under distributed network conditions. Mastery requires stating trade-offs upfront with concrete numerical boundaries.`,
      workedExample: `In a production cluster handling 50,000 requests/sec, applying ${topic} bounded p99 response times to under 30ms.`,
      commonPitfall: `Failing to define explicit fallback degradation paths when external dependencies or networks partition.`,
      tradeOff: `Trades operational complexity and memory footprint for linear horizontal throughput and partition isolation.`,
      isEditedByUser: false,
      disclaimer: 'AI-generated, verify before relying on it',
      updatedAt: Date.now(),
    };
  }
}
