export interface MailboxMetrics {
  sentCount: number;
  deliveredCount: number;
  bounceCount: number;
  complaintCount: number;
  replyCount: number;
}

export interface MailboxHealthStatus {
  healthy: boolean;
  shouldAutoPause: boolean;
  autoPauseReason?: string;
  bounceRate: number;
  complaintRate: number;
  replyRate: number;
  recommendedDailyCap: number;
}

export class AdaptiveCapManager {
  private readonly maxCeiling: number;
  private currentDailyCap: number;

  constructor(maxCeiling = 30, initialCap = 10) {
    this.maxCeiling = maxCeiling;
    this.currentDailyCap = Math.min(initialCap, maxCeiling);
  }

  public getCurrentCap(): number {
    return this.currentDailyCap;
  }

  public canSendToday(sentToday: number): boolean {
    return sentToday < this.currentDailyCap;
  }

  /**
   * Evaluates mailbox health and adjusts daily caps dynamically.
   * Auto-pauses channel if bounce rate > 5% or any spam complaint occurs.
   */
  public evaluateHealth(metrics: MailboxMetrics): MailboxHealthStatus {
    const sent = Math.max(1, metrics.sentCount);
    const bounceRate = metrics.bounceCount / sent;
    const complaintRate = metrics.complaintCount / sent;
    const replyRate = metrics.replyCount / sent;

    // RULE: Auto-pause triggers: email bounce rate > 5%, any spam complaint
    if (metrics.bounceCount > 0 && bounceRate > 0.05) {
      this.currentDailyCap = 0;
      return {
        healthy: false,
        shouldAutoPause: true,
        autoPauseReason: `Email bounce rate (${(bounceRate * 100).toFixed(1)}%) exceeds safety threshold of 5%`,
        bounceRate,
        complaintRate,
        replyRate,
        recommendedDailyCap: 0,
      };
    }

    if (metrics.complaintCount > 0) {
      this.currentDailyCap = 0;
      return {
        healthy: false,
        shouldAutoPause: true,
        autoPauseReason: `Spam complaint detected (${metrics.complaintCount}); channel auto-paused to protect domain reputation`,
        bounceRate,
        complaintRate,
        replyRate,
        recommendedDailyCap: 0,
      };
    }

    // Adaptive Cap Tuning
    if (metrics.sentCount >= 5) {
      if (bounceRate >= 0.02) {
        // Throttling down if warning signals appear
        this.currentDailyCap = Math.max(5, Math.floor(this.currentDailyCap * 0.5));
      } else if (bounceRate < 0.02 && replyRate >= 0.05) {
        // Healthy scaling up
        this.currentDailyCap = Math.min(this.maxCeiling, this.currentDailyCap + 2);
      }
    }

    return {
      healthy: true,
      shouldAutoPause: false,
      bounceRate,
      complaintRate,
      replyRate,
      recommendedDailyCap: this.currentDailyCap,
    };
  }
}

