import { MockSessionState, TopicMastery } from '../types';

export interface SessionProgressMetric {
  sessionId: string;
  roundType: string;
  structureScore: number | null;
  concretenessScore: number | null;
  deliveryScore: number | null;
  overallScore: number;
  speakingPaceWpm: number | null;
  fillerCount: number | null;
  confidence: 'llm_assisted' | 'heuristic';
  isHeuristicEstimate: boolean;
  questionCount: number;
}

export interface ProgressSummary {
  sessionCount: number;
  hasSufficientBaseline: boolean;
  shouldRenderTrendLine: boolean;
  isDataThin: boolean;
  dataThinMessage: string | null;
  metrics: SessionProgressMetric[];
  averageStructure: number;
  averageConcreteness: number;
  averageDelivery: number;
  averageOverall: number;
  averageWpm: number;
  topicMasterySummary: Array<{
    topicId: string;
    masteryPercentage: number;
    repetitions: number;
  }>;
}

export class ProgressMetricsService {
  public static readonly MINIMUM_SESSIONS_FOR_TREND = 3;

  /**
   * Computes progress metrics and baseline sufficiency across completed practice sessions.
   * Enforces the hard rule: a minimum of three sessions is required before drawing trend lines.
   */
  public static computeProgressSummary(
    sessionHistory: MockSessionState[] = [],
    topicMasteries: TopicMastery[] = []
  ): ProgressSummary {
    const validSessions = (sessionHistory || []).filter(
      (s) =>
        s.questionHistory &&
        s.questionHistory.length > 0 &&
        s.questionHistory.some((q) => q.evaluation)
    );

    const sessionCount = validSessions.length;
    const hasSufficientBaseline = sessionCount >= this.MINIMUM_SESSIONS_FOR_TREND;
    const shouldRenderTrendLine = hasSufficientBaseline;
    const isDataThin = !hasSufficientBaseline;

    const dataThinMessage = isDataThin
      ? `Data is thin (recorded: ${sessionCount}/${this.MINIMUM_SESSIONS_FOR_TREND} sessions). Establishing Baseline: A minimum of three completed sessions is required before showing trend lines.`
      : null;

    const metrics: SessionProgressMetric[] = validSessions.map((session, index) => {
      const evals = session.questionHistory.map((q) => q.evaluation).filter(Boolean) as NonNullable<
        (typeof session.questionHistory)[0]['evaluation']
      >[];

      const deliveries = session.questionHistory
        .map((q) => q.delivery)
        .filter(Boolean) as NonNullable<(typeof session.questionHistory)[0]['delivery']>[];

      // Extract Structure score
      let structureScore = session.overallScorecard?.structureScore;
      if (structureScore === undefined) {
        const structureDims = evals.flatMap((e) =>
          e.dimensions.filter((d) => d.name.toLowerCase().includes('structure'))
        );
        structureScore =
          structureDims.length > 0
            ? Math.round(
                (structureDims.reduce((acc, d) => acc + d.score, 0) / structureDims.length) * 10
              ) / 10
            : null;
      }

      // Extract Concreteness score
      let concretenessScore = session.overallScorecard?.concretenessScore;
      if (concretenessScore === undefined) {
        const concDims = evals.flatMap((e) =>
          e.dimensions.filter((d) => d.name.toLowerCase().includes('concreteness'))
        );
        concretenessScore =
          concDims.length > 0
            ? Math.round((concDims.reduce((acc, d) => acc + d.score, 0) / concDims.length) * 10) /
              10
            : null;
      }

      // Extract Delivery score & pace
      let deliveryScore = session.overallScorecard?.deliveryScore;
      if (deliveryScore === undefined) {
        const measuredDeliveries = deliveries.filter(
          (delivery) => delivery.wordCount > 0 && delivery.durationSeconds > 0
        );
        deliveryScore =
          measuredDeliveries.length > 0
            ? Math.round(
                (measuredDeliveries.reduce((acc, d) => acc + d.deliveryScore, 0) /
                  measuredDeliveries.length) *
                  10
              ) / 10
            : null;
      }

      const totalWords = deliveries.reduce((acc, d) => acc + (d.wordCount || 0), 0);
      const totalDuration = deliveries.reduce((acc, d) => acc + (d.durationSeconds || 0), 0);
      const speakingPaceWpm =
        totalDuration > 0 && totalWords > 0
          ? Math.round((totalWords / totalDuration) * 60)
          : null;

      const fillerCount =
        deliveries.length > 0
          ? deliveries.reduce((acc, d) => acc + (d.fillerWordsCount || 0), 0)
          : null;

      // Overall score
      const overallScore =
        session.overallScorecard?.averageScore ??
        Math.round((evals.reduce((acc, e) => acc + e.overallScore, 0) / evals.length) * 10) /
        10;

      // Confidence indicator: Low if heuristic estimate or no verbatim evidence, High otherwise
      const isHeuristic =
        evals.some((e) => e.isHeuristicEstimate) || Boolean(session.isOfflineInterviewer);
      const confidence: 'llm_assisted' | 'heuristic' = isHeuristic
        ? 'heuristic'
        : 'llm_assisted';

      return {
        sessionId: `session-${index + 1}`,
        roundType: session.roundType,
        structureScore,
        concretenessScore,
        deliveryScore,
        overallScore,
        speakingPaceWpm,
        fillerCount,
        confidence,
        isHeuristicEstimate: isHeuristic,
        questionCount: session.questionHistory.length,
      };
    });

    const averageOfMeasured = (values: Array<number | null>): number => {
      const measured = values.filter((value): value is number => value !== null);
      return measured.length > 0
        ? Math.round((measured.reduce((sum, value) => sum + value, 0) / measured.length) * 10) / 10
        : 0;
    };

    const averageStructure = averageOfMeasured(metrics.map((metric) => metric.structureScore));
    const averageConcreteness = averageOfMeasured(metrics.map((metric) => metric.concretenessScore));
    const averageDelivery = averageOfMeasured(metrics.map((metric) => metric.deliveryScore));
    const averageOverall = averageOfMeasured(metrics.map((metric) => metric.overallScore));
    const averageWpm = averageOfMeasured(metrics.map((metric) => metric.speakingPaceWpm));

    const topicMasterySummary = (topicMasteries || []).map((t) => ({
      topicId: t.topicId,
      masteryPercentage: Math.round((t.masteryScore || 0) * 100),
      repetitions: t.repetitions || 0,
    }));

    return {
      sessionCount,
      hasSufficientBaseline,
      shouldRenderTrendLine,
      isDataThin,
      dataThinMessage,
      metrics,
      averageStructure,
      averageConcreteness,
      averageDelivery,
      averageOverall,
      averageWpm,
      topicMasterySummary,
    };
  }
}
