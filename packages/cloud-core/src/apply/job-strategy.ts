import { z } from 'zod';

export const JobStrategyEnum = z.enum(['referral_first', 'apply_now', 'both']);
export type JobStrategy = z.infer<typeof JobStrategyEnum>;

export const ReferralStateEnum = z.enum([
  'waiting',
  'outreach_sent',
  'thread_active',
  'referral_received',
  'expired',
  'overridden',
]);
export type ReferralState = z.infer<typeof ReferralStateEnum>;

export const REFERRAL_DISCLAIMER_COPY =
  'Referral policies and submission requirements vary by employer. Some organizations disqualify candidates if an online ATS application precedes an internal employee referral.';

export interface StrategyHoldCheckParams {
  strategy?: JobStrategy;
  createdAt: string; // ISO string
  holdDays?: number; // default 4
  referralState?: ReferralState;
  overrideAt?: string | null;
}

export interface StrategyHoldResult {
  eligible: boolean;
  strategy: JobStrategy;
  referralState: ReferralState;
  reason: string;
  isHeld: boolean;
  holdRemainingMs: number;
  holdExpiresAt: string;
}

/**
 * Calculates whether an ATS application can be submitted based on strategy and referral state.
 */
export function checkStrategyHold(params: StrategyHoldCheckParams): StrategyHoldResult {
  const strategy = params.strategy ?? 'referral_first';
  const holdDays = params.holdDays ?? 4;
  const referralState = params.referralState ?? 'waiting';

  let createdTime = Date.now();
  if (params.createdAt) {
    if (typeof (params.createdAt as any) === 'number') {
      createdTime = params.createdAt as any;
    } else {
      const num = Number(params.createdAt);
      if (!isNaN(num) && num > 1000000000) {
        createdTime = num;
      } else {
        const parsed = Date.parse(params.createdAt);
        if (!isNaN(parsed)) {
          createdTime = parsed;
        }
      }
    }
  }

  const now = Date.now();
  const holdDurationMs = holdDays * 24 * 60 * 60 * 1000;
  const holdExpiresTime = createdTime + holdDurationMs;
  const holdRemainingMs = Math.max(0, holdExpiresTime - now);
  const holdExpiresAt = !isNaN(holdExpiresTime)
    ? new Date(holdExpiresTime).toISOString()
    : new Date().toISOString();

  // Strategy: apply_now or both
  if (strategy === 'apply_now' || strategy === 'both') {
    return {
      eligible: true,
      strategy,
      referralState,
      reason:
        strategy === 'apply_now'
          ? 'Strategy set to direct ATS submission.'
          : 'Dual strategy: simultaneous ATS application and outreach enabled.',
      isHeld: false,
      holdRemainingMs: 0,
      holdExpiresAt,
    };
  }

  // Strategy: referral_first
  // Invariant 1: If a referral thread is active, NEVER auto-apply
  if (referralState === 'thread_active') {
    return {
      eligible: false,
      strategy,
      referralState,
      reason:
        'Active referral conversation in progress with employee. ATS auto-apply blocked to prevent duplicate application collision.',
      isHeld: true,
      holdRemainingMs,
      holdExpiresAt,
    };
  }

  // Invariant 2: Candidate received referral link or internal referral confirmed
  if (referralState === 'referral_received') {
    return {
      eligible: true,
      strategy,
      referralState,
      reason: 'Referral confirmed by company insider. ATS application unlocked.',
      isHeld: false,
      holdRemainingMs: 0,
      holdExpiresAt,
    };
  }

  // Invariant 3: Explicit candidate override
  if (referralState === 'overridden' || params.overrideAt) {
    return {
      eligible: true,
      strategy,
      referralState: 'overridden',
      reason: 'Candidate manually overrode referral-first hold.',
      isHeld: false,
      holdRemainingMs: 0,
      holdExpiresAt,
    };
  }

  // Invariant 4: Check if hold has expired
  if (now >= holdExpiresTime) {
    return {
      eligible: true,
      strategy,
      referralState: 'expired',
      reason: `Referral hold period (${holdDays} days) elapsed without an active conversation. Direct ATS apply unlocked.`,
      isHeld: false,
      holdRemainingMs: 0,
      holdExpiresAt,
    };
  }

  // Invariant 5: Still in active hold period
  const remainingHours = Math.ceil(holdRemainingMs / (1000 * 60 * 60));
  return {
    eligible: false,
    strategy,
    referralState,
    reason: `ATS auto-apply held for referral wave (${remainingHours}h remaining). Outreach to company insiders runs first.`,
    isHeld: true,
    holdRemainingMs,
    holdExpiresAt,
  };
}

