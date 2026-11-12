import { describe, expect, it } from 'vitest';
import {
  HardLineH4ViolationError,
  OutreachComplianceEngine,
  type SuppressionEntry,
} from '../packages/cloud-core/src/outreach/compliance';

describe('Milestone M7 - Outreach Compliance, Suppression & Quiet Hours', () => {
  const compliance = new OutreachComplianceEngine();

  it('strictly throws HardLineH4ViolationError for guessed or probed contact sources (H4)', () => {
    expect(() =>
      compliance.assertAuthorizedContact('john@acme.com', 'smtp_probe')
    ).toThrow(HardLineH4ViolationError);

    expect(() =>
      compliance.assertAuthorizedContact('john@acme.com', 'scraped_pattern_guess')
    ).toThrow(HardLineH4ViolationError);

    // Permitted sources should not throw
    expect(() =>
      compliance.assertAuthorizedContact('john@acme.com', 'licensed_provider')
    ).not.toThrow();
    expect(() =>
      compliance.assertAuthorizedContact('john@acme.com', 'public_company_page')
    ).not.toThrow();
    expect(() =>
      compliance.assertAuthorizedContact('john@acme.com', 'user_imported_connection')
    ).not.toThrow();
  });

  it('matches global suppression list by direct email and domain', () => {
    const suppression: SuppressionEntry[] = [
      { email: 'optout@target.com', reason: 'opt_out' },
      { domain: 'blockedcorp.io', reason: 'spam_complaint' },
    ];

    const directCheck = compliance.isSuppressed('optout@target.com', suppression);
    expect(directCheck.suppressed).toBe(true);
    expect(directCheck.reason).toBe('opt_out');

    const domainCheck = compliance.isSuppressed('someone@blockedcorp.io', suppression);
    expect(domainCheck.suppressed).toBe(true);
    expect(domainCheck.reason).toBe('domain_spam_complaint');

    const cleanCheck = compliance.isSuppressed('alice@clean.com', suppression);
    expect(cleanCheck.suppressed).toBe(false);
  });

  it('enforces recipient quiet hours (blocks sends between 8pm and 8am recipient local time)', () => {
    // 23:00 (11pm) UTC is 19:00 (7pm) EDT (Allowed, not quiet)
    const sevenPmEdt = new Date('2026-11-15T23:00:00Z');
    const checkAllowed = compliance.checkQuietHours('America/New_York', sevenPmEdt);
    expect(checkAllowed.inQuietHours).toBe(false);

    // 03:00 (3am) UTC is 23:00 (11pm) EDT (Quiet hours!)
    const elevenPmEdt = new Date('2026-11-15T03:00:00Z');
    const checkQuiet = compliance.checkQuietHours('America/New_York', elevenPmEdt);
    expect(checkQuiet.inQuietHours).toBe(true);

    // 09:00 (9am) UTC is 05:00 (5am) EDT (Early morning, quiet hours!)
    const fiveAmEdt = new Date('2026-11-15T09:00:00Z');
    const checkEarly = compliance.checkQuietHours('America/New_York', fiveAmEdt);
    expect(checkEarly.inQuietHours).toBe(true);
  });

  it('generates compliant region-aware opt-out footers (US, EU, IN)', () => {
    const sender = {
      name: 'Alice Turing',
      email: 'alice@example.com',
      physicalAddress: '100 Market St, San Francisco, CA',
    };

    const usFooter = compliance.generateComplianceFooter('US', sender);
    expect(usFooter).toContain('Sent by Alice Turing | 100 Market St');
    expect(usFooter).toContain('unsubscribe');

    const euFooter = compliance.generateComplianceFooter('EU', sender);
    expect(euFooter).toContain('legitimate professional interest');
    expect(euFooter).toContain('opt out');

    const inFooter = compliance.generateComplianceFooter('IN', sender);
    expect(inFooter).toContain('Purpose: Professional career inquiry');
  });
});
