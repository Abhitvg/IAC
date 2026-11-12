import { describe, it, expect } from 'vitest';
import {
  checkStrategyHold,
  REFERRAL_DISCLAIMER_COPY,
} from '../packages/cloud-core/src/apply/job-strategy';

describe('CareerOps Job Strategy & Referral-First Hold Engine', () => {
  it('defaults to referral_first with a 4-day hold when waiting', () => {
    const createdAt = new Date(Date.now() - 1000 * 60 * 60 * 24).toISOString(); // 1 day ago
    const result = checkStrategyHold({ createdAt });
    expect(result.strategy).toBe('referral_first');
    expect(result.isHeld).toBe(true);
    expect(result.eligible).toBe(false);
    expect(result.reason).toContain('ATS auto-apply held for referral wave');
  });

  it('strictly blocks ATS auto-apply if referral thread is active (even after hold period)', () => {
    const createdAt = new Date(Date.now() - 1000 * 60 * 60 * 24 * 10).toISOString(); // 10 days ago
    const result = checkStrategyHold({
      createdAt,
      referralState: 'thread_active',
    });
    expect(result.eligible).toBe(false);
    expect(result.isHeld).toBe(true);
    expect(result.reason).toContain('Active referral conversation in progress with employee');
  });

  it('unlocks direct ATS apply immediately when strategy is apply_now or both', () => {
    const createdAt = new Date().toISOString();
    const applyNow = checkStrategyHold({ createdAt, strategy: 'apply_now' });
    expect(applyNow.eligible).toBe(true);
    expect(applyNow.isHeld).toBe(false);

    const both = checkStrategyHold({ createdAt, strategy: 'both' });
    expect(both.eligible).toBe(true);
    expect(both.isHeld).toBe(false);
  });

  it('unlocks ATS submission once hold expires without an active thread', () => {
    const createdAt = new Date(Date.now() - 1000 * 60 * 60 * 24 * 5).toISOString(); // 5 days ago (hold is 4)
    const result = checkStrategyHold({ createdAt, holdDays: 4, referralState: 'waiting' });
    expect(result.eligible).toBe(true);
    expect(result.isHeld).toBe(false);
    expect(result.referralState).toBe('expired');
  });

  it('unlocks ATS submission immediately if candidate overrides hold', () => {
    const createdAt = new Date().toISOString();
    const result = checkStrategyHold({ createdAt, overrideAt: new Date().toISOString() });
    expect(result.eligible).toBe(true);
    expect(result.isHeld).toBe(false);
    expect(result.reason).toContain('Candidate manually overrode');
  });

  it('includes mandatory referral policy variance disclaimer', () => {
    expect(REFERRAL_DISCLAIMER_COPY).toContain('Referral policies and submission requirements vary by employer');
  });
});

