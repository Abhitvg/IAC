/**
 * Sprint Mode Orchestrator (72-96 Hours)
 * Coordinates the full autonomous job-search lifecycle:
 * - T+0: Onboarding, Career Graph, truthfulness baseline, profile audit
 * - T+0-6h: Backlog discovery sweep, job evaluation, tailoring top roles, initial waves
 * - T+6h onward: Wave cadence (apply every few hours, outreach within caps, inbox watch every 5 min)
 * - Compressed follow-ups: Day 2 (48h) and Day 4 (96h)
 * - Daily: Contextual bandit rebalancing
 * - End of sprint: Funnel report, conversion metrics, learnings, next-step plan
 */

import { AdaptiveAllocator } from './allocator';
import { AutoPauseCoordinator } from './auto-pause';
import { OutcomeForecaster } from './forecaster';
import {
  AllocationArm,
  AutoPauseEvent,
  CalibratedForecast,
  SprintChannel,
  SprintConfig,
  SprintMetrics,
  SprintReport,
  SprintRun,
  SprintStatus,
} from './types';

export type SprintPhase = 'T0_INITIALIZING' | 'T0_6_DISCOVERY_AND_PREP' | 'T6_ACTIVE_WAVES' | 'COMPLETED';

export class SprintOrchestrator {
  private readonly allocator: AdaptiveAllocator;
  private readonly autoPauseCoordinator: AutoPauseCoordinator;
  private readonly forecaster: OutcomeForecaster;

  constructor() {
    this.allocator = new AdaptiveAllocator();
    this.autoPauseCoordinator = new AutoPauseCoordinator();
    this.forecaster = new OutcomeForecaster();
  }

  /**
   * Initializes a new Sprint Run with default metrics, duration checks, and bandit arms.
   */
  public initializeSprint(
    tenantId: string,
    config: SprintConfig,
    contractId?: string,
    id?: string
  ): { sprint: SprintRun; initialArms: AllocationArm[] } {
    if (config.targetDurationHours < 72 || config.targetDurationHours > 96) {
      throw new Error(
        `Invalid Sprint target duration: ${config.targetDurationHours} hours. Sprint Mode must run between 72 and 96 hours.`
      );
    }

    if (!config.targetRoles || config.targetRoles.length === 0) {
      throw new Error('Sprint requires at least one target role.');
    }

    const defaultMetrics: SprintMetrics = {
      discoveredJobsCount: 0,
      evaluatedJobsCount: 0,
      tailoredArtifactsCount: 0,
      atsApplicationsSubmitted: 0,
      atsApplicationsFailed: 0,
      emailOutreachSent: 0,
      emailBounces: 0,
      emailComplaints: 0,
      emailRepliesReceived: 0,
      negativeReplies: 0,
      referralsInitiated: 0,
      linkedinAssistItemsGenerated: 0,
      truthfulnessGateChecks: 0,
      truthfulnessGateFailures: 0,
      interviewsScheduled: 0,
    };

    const sprint: SprintRun = {
      id: id || `sprint_${Date.now()}`,
      tenantId,
      contractId,
      status: 'active',
      targetDurationHours: config.targetDurationHours,
      startedAt: new Date().toISOString(),
      config,
      metrics: defaultMetrics,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    // Initialize bandit arms across enabled channels, target roles, and standard templates
    const initialArms: AllocationArm[] = [];
    const templates = ['concise_direct_ask', 'role_alignment_hook'];

    for (const channel of config.enabledChannels) {
      for (const role of config.targetRoles) {
        for (const templateId of templates) {
          initialArms.push({
            channel,
            targetRole: role,
            templateId,
            weight: 1.0,
            pulls: 0,
            successes: 0,
            status: 'active',
          });
        }
      }
    }

    return { sprint, initialArms };
  }

  /**
   * Determines the current sprint phase based on elapsed wall-clock hours.
   */
  public getSprintPhase(sprint: SprintRun, now: Date = new Date()): SprintPhase {
    if (sprint.status === 'completed' || sprint.status === 'aborted') {
      return 'COMPLETED';
    }

    const startMs = new Date(sprint.startedAt).getTime();
    const elapsedHours = (now.getTime() - startMs) / (1000 * 60 * 60);

    if (elapsedHours < 0.1) {
      return 'T0_INITIALIZING';
    } else if (elapsedHours < 6.0) {
      return 'T0_6_DISCOVERY_AND_PREP';
    } else if (elapsedHours < sprint.targetDurationHours) {
      return 'T6_ACTIVE_WAVES';
    } else {
      return 'COMPLETED';
    }
  }

  /**
   * Evaluates auto-pause conditions across all sprint metrics.
   */
  public checkAutoPause(sprint: SprintRun): { shouldPause: boolean; events: AutoPauseEvent[]; pausedChannels: SprintChannel[] } {
    const triggerResults = this.autoPauseCoordinator.evaluateMetrics(sprint.id, sprint.metrics);
    const events: AutoPauseEvent[] = [];
    const pausedChannelsSet = new Set<SprintChannel>();

    for (const res of triggerResults) {
      if (res.shouldPause) {
        if (res.event) events.push(res.event);
        for (const ch of res.affectedChannels) {
          pausedChannelsSet.add(ch);
        }
      }
    }

    return {
      shouldPause: pausedChannelsSet.size > 0,
      events,
      pausedChannels: Array.from(pausedChannelsSet),
    };
  }

  /**
   * Rebalances multi-armed bandit allocation weights across active arms.
   */
  public rebalanceAllocations(arms: AllocationArm[]) {
    return this.allocator.rebalance(arms);
  }

  /**
   * Generates a calibrated outcome forecast complying with Hard Line H6.
   */
  public getForecast(sprint: SprintRun, now: Date = new Date()): CalibratedForecast {
    const startMs = new Date(sprint.startedAt).getTime();
    const elapsedHours = (now.getTime() - startMs) / (1000 * 60 * 60);
    const remainingHours = Math.max(0, sprint.targetDurationHours - elapsedHours);

    return this.forecaster.generateForecast({
      config: sprint.config,
      currentMetrics: sprint.metrics,
      durationHoursRemaining: remainingHours,
    });
  }

  /**
   * Generates the end-of-sprint funnel and conversion report.
   */
  public generateReport(sprint: SprintRun, arms: AllocationArm[]): SprintReport {
    const metrics = sprint.metrics;
    const durationHours = sprint.targetDurationHours;

    const evaluationPassRate = metrics.discoveredJobsCount > 0
      ? Number((metrics.evaluatedJobsCount / metrics.discoveredJobsCount).toFixed(3))
      : 0;

    const replyRate = metrics.emailOutreachSent > 0
      ? Number((metrics.emailRepliesReceived / metrics.emailOutreachSent).toFixed(3))
      : 0;

    const totalOutbound = metrics.atsApplicationsSubmitted + metrics.emailOutreachSent + metrics.referralsInitiated;
    const interviewYieldRate = totalOutbound > 0
      ? Number((metrics.interviewsScheduled / totalOutbound).toFixed(3))
      : 0;

    // Summarize channel performance
    const channelMap = new Map<SprintChannel, { volume: number; successes: number; status: 'active' | 'throttled' | 'halted' }>();

    for (const ch of sprint.config.enabledChannels) {
      channelMap.set(ch, { volume: 0, successes: 0, status: 'active' });
    }

    for (const arm of arms) {
      const entry = channelMap.get(arm.channel) || { volume: 0, successes: 0, status: 'active' };
      entry.volume += arm.pulls;
      entry.successes += arm.successes;
      if (arm.status === 'halted') {
        entry.status = 'halted';
      } else if (arm.status === 'throttled' && entry.status !== 'halted') {
        entry.status = 'throttled';
      }
      channelMap.set(arm.channel, entry);
    }

    const channelPerformance = Array.from(channelMap.entries()).map(([channel, data]) => ({
      channel,
      volume: data.volume,
      successRate: data.volume > 0 ? Number((data.successes / data.volume).toFixed(3)) : 0,
      status: data.status,
    }));

    const learnings: string[] = [];
    if (replyRate > 0.10) {
      learnings.push(`Email outreach hook outperformed historical benchmarks with a ${(replyRate * 100).toFixed(1)}% reply rate.`);
    } else if (metrics.emailOutreachSent > 10) {
      learnings.push(`Outreach hooks underperformed baseline; consider pivoting messaging angle toward technical depth.`);
    }

    const haltedArms = arms.filter((a) => a.status === 'halted');
    if (haltedArms.length > 0) {
      learnings.push(`Bandit allocator successfully halted ${haltedArms.length} low-yield targeting combinations to preserve candidate brand and rate limits.`);
    }

    if (metrics.interviewsScheduled > 0) {
      learnings.push(`Generated ${metrics.interviewsScheduled} confirmed interview opportunities during the ${durationHours}h sprint.`);
    }

    const nextSteps = [
      'Complete interview preparation for upcoming screening rounds using the CareerOps prep module.',
      'Review Assist Queue items for any pending 1st-degree warm introductions.',
      'Maintain CRM relationships with recruiters who responded positively.',
    ];

    return {
      sprintId: sprint.id,
      durationHours,
      status: sprint.status,
      funnel: {
        jobsDiscovered: metrics.discoveredJobsCount,
        jobsEvaluated: metrics.evaluatedJobsCount,
        applicationsSubmitted: metrics.atsApplicationsSubmitted,
        outreachSent: metrics.emailOutreachSent,
        repliesReceived: metrics.emailRepliesReceived,
        interviewsScheduled: metrics.interviewsScheduled,
      },
      conversionRates: {
        evaluationPassRate,
        replyRate,
        interviewYieldRate,
      },
      channelPerformance,
      learnings,
      nextSteps,
    };
  }
}

