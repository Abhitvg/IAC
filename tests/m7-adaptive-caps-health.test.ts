import { describe, expect, it } from 'vitest';
import {
  AdaptiveCapManager,
  type MailboxMetrics,
} from '../packages/cloud-core/src/outreach/adaptive-caps';

describe('Milestone M7 - Adaptive Caps & Mailbox Health Monitoring', () => {
  it('triggers immediate auto-pause when email bounce rate exceeds 5%', () => {
    const manager = new AdaptiveCapManager(30, 10);

    const badMetrics: MailboxMetrics = {
      sentCount: 20,
      deliveredCount: 18,
      bounceCount: 2, // 10% bounce rate (> 5%)!
      complaintCount: 0,
      replyCount: 1,
    };

    const health = manager.evaluateHealth(badMetrics);
    expect(health.healthy).toBe(false);
    expect(health.shouldAutoPause).toBe(true);
    expect(health.autoPauseReason).toContain('exceeds safety threshold of 5%');
    expect(manager.canSendToday(0)).toBe(false); // Cap zeroed out
  });

  it('triggers immediate auto-pause on any spam complaint', () => {
    const manager = new AdaptiveCapManager(30, 10);

    const complaintMetrics: MailboxMetrics = {
      sentCount: 20,
      deliveredCount: 19,
      bounceCount: 0,
      complaintCount: 1, // 1 spam complaint!
      replyCount: 2,
    };

    const health = manager.evaluateHealth(complaintMetrics);
    expect(health.healthy).toBe(false);
    expect(health.shouldAutoPause).toBe(true);
    expect(health.autoPauseReason).toContain('Spam complaint detected');
    expect(manager.getCurrentCap()).toBe(0);
  });

  it('throttles daily cap down when bounce rate is between 2% and 5%', () => {
    const manager = new AdaptiveCapManager(30, 20);

    const warningMetrics: MailboxMetrics = {
      sentCount: 30,
      deliveredCount: 29,
      bounceCount: 1, // 3.3% bounce rate
      complaintCount: 0,
      replyCount: 2,
    };

    const health = manager.evaluateHealth(warningMetrics);
    expect(health.healthy).toBe(true);
    expect(health.shouldAutoPause).toBe(false);
    expect(health.recommendedDailyCap).toBe(10); // Throttled from 20 down to 10
  });

  it('safely scales daily cap up when mailbox health and reply engagement are strong', () => {
    const manager = new AdaptiveCapManager(20, 10);

    const healthyMetrics: MailboxMetrics = {
      sentCount: 10,
      deliveredCount: 10,
      bounceCount: 0, // 0% bounce
      complaintCount: 0,
      replyCount: 2, // 20% reply rate
    };

    const health = manager.evaluateHealth(healthyMetrics);
    expect(health.healthy).toBe(true);
    expect(health.recommendedDailyCap).toBe(12); // Scaled from 10 to 12
  });
});

