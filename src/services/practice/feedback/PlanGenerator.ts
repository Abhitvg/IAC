import { CompanyPlanGenerator } from '../CompanyPlanGenerator';
import {
  WeaknessMapResult,
  WeaknessPracticePlan,
  WeaknessPlanDay,
  WeaknessPlanDrill,
  RankedWeakness,
} from '../types';

export class PlanGenerator extends CompanyPlanGenerator {
  public static readonly DEFAULT_MAX_DAILY_MINUTES = 90;

  /**
   * Generates a 7-day practice plan tailored to the user's weakness map.
   * Each day contains exactly:
   *   1. One structure drill
   *   2. One concreteness drill
   *   3. One topic mock
   * With explicit time budgets totaling <= maxDailyMinutes (default 90).
   * Plan generation is 100% deterministic given the same input.
   */
  public static generate7DayPlan(
    weaknessMap: WeaknessMapResult,
    options?: {
      maxDailyMinutes?: number;
      startDate?: number;
    }
  ): WeaknessPracticePlan {
    const maxDailyMinutes = Math.max(
      30,
      options?.maxDailyMinutes ?? this.DEFAULT_MAX_DAILY_MINUTES
    );
    const createdAt = options?.startDate ?? 1770000000000;

    // Allocate time budgets totaling exactly maxDailyMinutes
    const structureMinutes = Math.max(10, Math.round(maxDailyMinutes * (25 / 90)));
    const concretenessMinutes = Math.max(10, Math.round(maxDailyMinutes * (25 / 90)));
    const topicMockMinutes = maxDailyMinutes - structureMinutes - concretenessMinutes;

    const ranked = weaknessMap.rankedWeaknesses;

    const structureWeaknesses = ranked.filter((w) => w.skill === 'structure');
    const concretenessWeaknesses = ranked.filter((w) => w.skill === 'concreteness');
    const otherWeaknesses = ranked.filter(
      (w) => w.skill !== 'structure' && w.skill !== 'concreteness'
    );

    const defaultTopic = 'System Architecture & Technical Communication';

    const getTopic = (
      pool: RankedWeakness[],
      index: number,
      fallbackPool: RankedWeakness[]
    ): string => {
      if (pool.length > 0) return pool[index % pool.length].topic;
      if (fallbackPool.length > 0) return fallbackPool[index % fallbackPool.length].topic;
      return defaultTopic;
    };

    const days: WeaknessPlanDay[] = [];

    for (let dayNum = 1; dayNum <= 7; dayNum++) {
      const idx = dayNum - 1;

      // Drill 1: Structure Drill
      const sTopic = getTopic(structureWeaknesses, idx, ranked);
      const structureDrill: WeaknessPlanDrill = {
        id: `plan_day_${dayNum}_structure`,
        type: 'structure_drill',
        title: `Structure Drill: Headline & Signposting (${sTopic})`,
        targetTopic: sTopic,
        instructions: `Deliver a structured explanation of ${sTopic}. Start with a decisive headline in the first 20% of your answer, signpost exactly three sub-points ("There are three considerations..."), provide claim-reason-example triples, state an explicit trade-off, and finish with a one-sentence close.`,
        timeBudgetMinutes: structureMinutes,
        completed: false,
      };

      // Drill 2: Concreteness Drill
      const cTopic = getTopic(concretenessWeaknesses, idx, ranked);
      const concretenessDrill: WeaknessPlanDrill = {
        id: `plan_day_${dayNum}_concreteness`,
        type: 'concreteness_drill',
        title: `Concreteness Drill: Worked Examples & Metrics (${cTopic})`,
        targetTopic: cTopic,
        instructions: `Answer a scenario on ${cTopic} with grounded concreteness. Name at least two specific production tools/technologies, calculate numerical parameters (QPS, latency thresholds, cache sizing), and walk through a worked failure example without unsupported claims.`,
        timeBudgetMinutes: concretenessMinutes,
        completed: false,
      };

      // Drill 3: Topic Mock
      const mTopic = getTopic(otherWeaknesses.length > 0 ? otherWeaknesses : ranked, idx, ranked);
      const topicMock: WeaknessPlanDrill = {
        id: `plan_day_${dayNum}_mock`,
        type: 'topic_mock',
        title: `Deep-Dive Topic Mock: ${mTopic}`,
        targetTopic: mTopic,
        instructions: `Simulate a full interview question on ${mTopic}. Synthesize both organized structure and deep technical concreteness. Respond to interviewer follow-up probes under pressure.`,
        timeBudgetMinutes: topicMockMinutes,
        completed: false,
      };

      days.push({
        day: dayNum,
        totalTimeMinutes: structureMinutes + concretenessMinutes + topicMockMinutes,
        drills: [structureDrill, concretenessDrill, topicMock],
      });
    }

    return {
      id: `weakness_plan_${createdAt}`,
      createdAt,
      durationDays: 7,
      maxDailyMinutes,
      rankedWeaknessesSnapshot: [...ranked],
      days,
    };
  }
}
