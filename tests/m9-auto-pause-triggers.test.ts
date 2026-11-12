import { describe, expect, it } from 'vitest';
import { AutoPauseCoordinator } from '../packages/cloud-core/src/sprint/auto-pause';
import { SprintMetrics } from '../packages/cloud-core/src/sprint/types';

describe('Milestone M9 - Standing-Consent Auto-Pause Triggers Coordinator', () => {
  const coordinator = new AutoPauseCoordinator();
  const sprintId = 'sprint-test-123';

  const baseMetrics: SprintMetrics = {
    discoveredJobsCount: 50,
    evaluatedJobsCount: 40,
    tailoredArtifactsCount: 30,
    atsApplicationsSubmitted: 10,
    atsApplicationsFailed: 0,
    emailOutreachSent: 20,
    emailBounces: 0,
    emailComplaints: 0,
    emailRepliesReceived: 5,
    negativeReplies: 0,
    referralsInitiated: 2,
    linkedinAssistItemsGenerated: 5,
    truthfulnessGateChecks: 10,
    truthfulnessGateFailures: 0,
    interviewsScheduled: 2,
  };

  it('triggers email auto-pause when bounce rate exceeds 5%', () => {
    const metrics: SprintMetrics = {
      ...baseMetrics,
      emailOutreachSent: 20,
      emailBounces: 2, // 10% bounce rate (> 5%)
    };

    const results = coordinator.evaluateMetrics(sprintId, metrics);
    const bounceTrigger = results.find((r) => r.event?.triggerType === 'bounce_rate_spike');

    expect(bounceTrigger).toBeDefined();
    expect(bounceTrigger?.shouldPause).toBe(true);
    expect(bounceTrigger?.affectedChannels).toEqual(['email']);
    expect(bounceTrigger?.event?.metricValue).toBe(0.1);
    expect(bounceTrigger?.event?.details).toContain('exceeded critical safety threshold of 5%');
  });

  it('triggers immediate email auto-pause on any spam complaint', () => {
    const metrics: SprintMetrics = {
      ...baseMetrics,
      emailComplaints: 1, // Any complaint > 0
    };

    const results = coordinator.evaluateMetrics(sprintId, metrics);
    const spamTrigger = results.find((r) => r.event?.triggerType === 'spam_complaint');

    expect(spamTrigger).toBeDefined();
    expect(spamTrigger?.shouldPause).toBe(true);
    expect(spamTrigger?.affectedChannels).toEqual(['email']);
    expect(spamTrigger?.event?.details).toContain('Spam complaint received');
  });

  it('triggers ATS auto-pause when ATS application failure rate exceeds 15%', () => {
    const metrics: SprintMetrics = {
      ...baseMetrics,
      atsApplicationsSubmitted: 7,
      atsApplicationsFailed: 3, // 3 / 10 = 30% failure rate (> 15%)
    };

    const results = coordinator.evaluateMetrics(sprintId, metrics);
    const atsTrigger = results.find((r) => r.event?.triggerType === 'ats_error_spike');

    expect(atsTrigger).toBeDefined();
    expect(atsTrigger?.shouldPause).toBe(true);
    expect(atsTrigger?.affectedChannels).toEqual(['ats']);
    expect(atsTrigger?.event?.details).toContain('exceeded 15%');
  });

  it('triggers dual ATS and Email auto-pause when truthfulness gate failure rate exceeds 10%', () => {
    const metrics: SprintMetrics = {
      ...baseMetrics,
      truthfulnessGateChecks: 10,
      truthfulnessGateFailures: 2, // 20% failure rate (> 10%)
    };

    const results = coordinator.evaluateMetrics(sprintId, metrics);
    const truthTrigger = results.find((r) => r.event?.triggerType === 'truthfulness_gate_spike');

    expect(truthTrigger).toBeDefined();
    expect(truthTrigger?.shouldPause).toBe(true);
    expect(truthTrigger?.affectedChannels).toContain('ats');
    expect(truthTrigger?.affectedChannels).toContain('email');
    expect(truthTrigger?.event?.details).toContain('Hard Line H3 alert');
  });

  it('triggers email auto-pause when negative replies exceed 40%', () => {
    const metrics: SprintMetrics = {
      ...baseMetrics,
      emailRepliesReceived: 10,
      negativeReplies: 5, // 50% negative replies (> 40%)
    };

    const results = coordinator.evaluateMetrics(sprintId, metrics);
    const replyTrigger = results.find((r) => r.event?.triggerType === 'negative_reply_spike');

    expect(replyTrigger).toBeDefined();
    expect(replyTrigger?.shouldPause).toBe(true);
    expect(replyTrigger?.affectedChannels).toEqual(['email']);
  });

  it('evaluates external platform alerts for LinkedIn restrictions and mailbox warnings', () => {
    const linkedinAlert = coordinator.evaluateExternalAlert(
      sprintId,
      'linkedin_restriction',
      'Account flagged for unusual activity'
    );
    expect(linkedinAlert.shouldPause).toBe(true);
    expect(linkedinAlert.affectedChannels).toEqual(['linkedin_assist']);
    expect(linkedinAlert.event?.triggerType).toBe('linkedin_restriction');

    const mailboxAlert = coordinator.evaluateExternalAlert(
      sprintId,
      'mailbox_warning',
      'Daily sending quota reduced by Google Workspace'
    );
    expect(mailboxAlert.shouldPause).toBe(true);
    expect(mailboxAlert.affectedChannels).toEqual(['email']);
    expect(mailboxAlert.event?.triggerType).toBe('mailbox_warning');
  });
});

