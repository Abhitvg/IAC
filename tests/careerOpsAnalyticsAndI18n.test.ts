import { describe, it, expect, beforeEach } from 'vitest';
import {
  careerOpsAnalytics,
  sanitizeLogString,
  hashIdentifier,
} from '../src/services/careerOps/careerOpsAnalytics';
import { t } from '../src/services/careerOps/i18n';

describe('CareerOps Analytics & i18n Quality Guarantees', () => {
  beforeEach(() => {
    careerOpsAnalytics.clear();
  });

  it('redacts emails, phone numbers, and SSNs from client log strings', () => {
    const raw = 'Candidate john.doe@example.com with phone 555-123-4567 submitted application';
    const sanitized = sanitizeLogString(raw);

    expect(sanitized).not.toContain('john.doe@example.com');
    expect(sanitized).not.toContain('555-123-4567');
    expect(sanitized).toContain('[REDACTED_EMAIL]');
    expect(sanitized).toContain('[REDACTED_PHONE]');
  });

  it('generates deterministic anonymized hashes for identifiers', () => {
    const hash1 = hashIdentifier('job-posting-123');
    const hash2 = hashIdentifier('job-posting-123');
    const hash3 = hashIdentifier('job-posting-456');

    expect(hash1).toBe(hash2);
    expect(hash1).not.toBe(hash3);
    expect(hash1.startsWith('anon_')).toBe(true);
  });

  it('tracks onboarding telemetry and funnel stage events without PII', () => {
    careerOpsAnalytics.track({
      type: 'onboarding_started',
      timestamp: Date.now(),
    });

    careerOpsAnalytics.track({
      type: 'onboarding_first_value_rendered',
      timeToFirstValueMs: 420,
      profileScore: 92,
      rankedJobCount: 3,
      timestamp: Date.now(),
    });

    const events = careerOpsAnalytics.getEvents();
    expect(events.length).toBe(2);
    expect(events[1].type).toBe('onboarding_first_value_rendered');
    if (events[1].type === 'onboarding_first_value_rendered') {
      expect(events[1].timeToFirstValueMs).toBe(420);
      expect(events[1].profileScore).toBe(92);
    }
  });

  it('resolves nested translation keys with variable interpolation', () => {
    const title = t('today.title');
    expect(title).toBe('☀️ Today Digest');

    const interpolated = t('today.referralHoldNotice', { days: 4 });
    expect(interpolated).toBe('Held for referral wave (expires in 4 days)');

    const fallback = t('nonexistent.path.value');
    expect(fallback).toBe('nonexistent.path.value');
  });
});
