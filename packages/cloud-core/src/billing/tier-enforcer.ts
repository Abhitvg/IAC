/**
 * Billing Tier Enforcer & Usage Quotas
 */

export type SubscriptionTier = 'starter' | 'sprint_pro' | 'enterprise';

export interface TierQuota {
  tier: SubscriptionTier;
  maxConcurrentSprints: number;
  monthlyApplicationsLimit: number;
  monthlyOutreachEmailsLimit: number;
  artifactStorageDays: number;
}

export const TIER_QUOTAS: Record<SubscriptionTier, TierQuota> = {
  starter: {
    tier: 'starter',
    maxConcurrentSprints: 1,
    monthlyApplicationsLimit: 30,
    monthlyOutreachEmailsLimit: 50,
    artifactStorageDays: 7,
  },
  sprint_pro: {
    tier: 'sprint_pro',
    maxConcurrentSprints: 3,
    monthlyApplicationsLimit: 300,
    monthlyOutreachEmailsLimit: 500,
    artifactStorageDays: 90,
  },
  enterprise: {
    tier: 'enterprise',
    maxConcurrentSprints: 10,
    monthlyApplicationsLimit: 10000,
    monthlyOutreachEmailsLimit: 20000,
    artifactStorageDays: 365,
  },
};

export interface CurrentUsage {
  activeSprintsCount: number;
  applicationsThisMonth: number;
  outreachEmailsThisMonth: number;
}

export class TierEnforcer {
  public static checkQuota(
    tier: SubscriptionTier,
    usage: CurrentUsage,
    action: 'start_sprint' | 'apply' | 'outreach'
  ): { allowed: boolean; reason?: string; remainingQuota: number } {
    const quota = TIER_QUOTAS[tier] || TIER_QUOTAS.starter;

    if (action === 'start_sprint') {
      const allowed = usage.activeSprintsCount < quota.maxConcurrentSprints;
      return {
        allowed,
        reason: allowed
          ? undefined
          : `Active sprint limit reached (${usage.activeSprintsCount}/${quota.maxConcurrentSprints}) for ${tier} tier. Upgrade to Sprint Pro or Enterprise for concurrent sprints.`,
        remainingQuota: Math.max(0, quota.maxConcurrentSprints - usage.activeSprintsCount),
      };
    }

    if (action === 'apply') {
      const allowed = usage.applicationsThisMonth < quota.monthlyApplicationsLimit;
      return {
        allowed,
        reason: allowed
          ? undefined
          : `Monthly application limit reached (${usage.applicationsThisMonth}/${quota.monthlyApplicationsLimit}) for ${tier} tier.`,
        remainingQuota: Math.max(0, quota.monthlyApplicationsLimit - usage.applicationsThisMonth),
      };
    }

    if (action === 'outreach') {
      const allowed = usage.outreachEmailsThisMonth < quota.monthlyOutreachEmailsLimit;
      return {
        allowed,
        reason: allowed
          ? undefined
          : `Monthly outreach email limit reached (${usage.outreachEmailsThisMonth}/${quota.monthlyOutreachEmailsLimit}) for ${tier} tier.`,
        remainingQuota: Math.max(0, quota.monthlyOutreachEmailsLimit - usage.outreachEmailsThisMonth),
      };
    }

    return { allowed: true, remainingQuota: 9999 };
  }
}
