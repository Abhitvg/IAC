import { describe, expect, it } from 'vitest';
import { SprintOrchestrator } from '../packages/cloud-core/src/sprint/sprint-orchestrator';
import { SprintConfig } from '../packages/cloud-core/src/sprint/types';

describe('Milestone M9 - Sprint Mode Orchestrator Lifecycle', () => {
  const orchestrator = new SprintOrchestrator();

  const validConfig: SprintConfig = {
    targetRoles: ['Senior Backend Engineer', 'Infrastructure Architect'],
    enabledChannels: ['ats', 'email', 'referral', 'linkedin_assist'],
    targetDurationHours: 72,
    dailyAtsCap: 15,
    dailyEmailCap: 20,
  };

  it('rejects sprints outside the 72-96 hour target window', () => {
    expect(() => {
      orchestrator.initializeSprint('t-1', { ...validConfig, targetDurationHours: 48 });
    }).toThrow(/Invalid Sprint target duration: 48 hours/);

    expect(() => {
      orchestrator.initializeSprint('t-1', { ...validConfig, targetDurationHours: 120 });
    }).toThrow(/Invalid Sprint target duration: 120 hours/);
  });

  it('initializes sprint with default metrics and multi-armed bandit arms', () => {
    const { sprint, initialArms } = orchestrator.initializeSprint('tenant-100', validConfig);

    expect(sprint.tenantId).toBe('tenant-100');
    expect(sprint.status).toBe('active');
    expect(sprint.targetDurationHours).toBe(72);
    expect(sprint.metrics.atsApplicationsSubmitted).toBe(0);
    expect(sprint.metrics.interviewsScheduled).toBe(0);

    // 4 channels * 2 target roles * 2 templates = 16 arms
    expect(initialArms).toHaveLength(16);
    expect(initialArms.every((a) => a.status === 'active' && a.weight === 1.0)).toBe(true);
  });

  it('progresses through lifecycle phases based on elapsed hours', () => {
    const { sprint } = orchestrator.initializeSprint('t-1', validConfig);
    const startMs = new Date(sprint.startedAt).getTime();

    // T+0: Initializing
    expect(orchestrator.getSprintPhase(sprint, new Date(startMs))).toBe('T0_INITIALIZING');

    // T+3h: Discovery and Prep phase
    const t3h = new Date(startMs + 3 * 3600 * 1000);
    expect(orchestrator.getSprintPhase(sprint, t3h)).toBe('T0_6_DISCOVERY_AND_PREP');

    // T+24h: Active Waves
    const t24h = new Date(startMs + 24 * 3600 * 1000);
    expect(orchestrator.getSprintPhase(sprint, t24h)).toBe('T6_ACTIVE_WAVES');

    // T+75h: Completed
    const t75h = new Date(startMs + 75 * 3600 * 1000);
    expect(orchestrator.getSprintPhase(sprint, t75h)).toBe('COMPLETED');
  });

  it('generates a comprehensive end-of-sprint funnel and learnings report', () => {
    const { sprint, initialArms } = orchestrator.initializeSprint('t-1', validConfig);

    sprint.metrics = {
      discoveredJobsCount: 120,
      evaluatedJobsCount: 80,
      tailoredArtifactsCount: 60,
      atsApplicationsSubmitted: 45,
      atsApplicationsFailed: 3,
      emailOutreachSent: 50,
      emailBounces: 1,
      emailComplaints: 0,
      emailRepliesReceived: 8,
      negativeReplies: 1,
      referralsInitiated: 6,
      linkedinAssistItemsGenerated: 12,
      truthfulnessGateChecks: 95,
      truthfulnessGateFailures: 2,
      interviewsScheduled: 4,
    };

    initialArms[0].pulls = 20;
    initialArms[0].successes = 3;
    initialArms[1].pulls = 15;
    initialArms[1].successes = 0;
    initialArms[1].status = 'halted';

    const report = orchestrator.generateReport(sprint, initialArms);

    expect(report.durationHours).toBe(72);
    expect(report.funnel.jobsDiscovered).toBe(120);
    expect(report.funnel.applicationsSubmitted).toBe(45);
    expect(report.funnel.outreachSent).toBe(50);
    expect(report.funnel.interviewsScheduled).toBe(4);

    expect(report.conversionRates.replyRate).toBe(0.16); // 8 / 50 = 16%
    expect(report.learnings.some((l) => l.includes('outperformed historical benchmarks'))).toBe(true);
    expect(report.learnings.some((l) => l.includes('halted 1 low-yield targeting combinations'))).toBe(true);
    expect(report.nextSteps.length).toBeGreaterThanOrEqual(2);
  });
});

