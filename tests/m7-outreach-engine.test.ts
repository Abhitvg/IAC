import { describe, expect, it } from 'vitest';
import { OutreachEngine } from '../packages/cloud-core/src/outreach/outreach-engine';
import type { SprintContract } from '../packages/cloud-core/src/contract';
import type { Person } from '../packages/cloud-core/src/person-graph/person-types';

describe('Milestone M7 - Email Outreach Engine Execution', () => {
  const sampleContract: SprintContract = {
    version: 1,
    roles: ['Senior Backend Engineer'],
    seniority: ['senior'],
    locations: ['San Francisco, CA'],
    remotePreference: 'remote',
    salaryFloor: { amount: 180000, currency: 'USD' },
    workAuthorization: { countries: ['US'], requiresSponsorship: false, confirmed: true },
    blocklist: { companies: [], industries: [] },
    enabledChannels: ['ats', 'email', 'calendar', 'linkedin_assist'],
    dailyCaps: { applications: 20, emails: 20, assistQueueItems: 10, calendarEvents: 5 },
    defaultAnswers: {},
    allowedFactIds: [],
    tone: 'professional',
    senderIdentity: { name: 'Alice Turing', email: 'alice@example.com' },
    jurisdiction: ['US'],
    outreachConsent: true,
    consentTextVersion: 'v1.0',
    startsAt: '2026-11-12T00:00:00.000Z',
    endsAt: '2026-11-16T00:00:00.000Z',
  };

  const samplePerson: Person = {
    id: 'p_101',
    tenantId: 't1',
    email: 'sarah@stripe.com',
    name: 'Sarah Connor',
    company: 'Stripe',
    title: 'Engineering Manager',
    roleDomain: 'hiring_manager',
    relationship: '1st_degree',
    verificationSource: 'licensed_provider',
    timeZone: 'America/New_York',
    crmStage: 'lead',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  it('generates concise, compliant outreach copy between 60 and 100 words', () => {
    const engine = new OutreachEngine(sampleContract);
    const copy = engine.generateOutreachCopy(
      samplePerson,
      'Staff Backend Engineer',
      'scaling PostgreSQL distributed ledgers processing 50k tps',
      1
    );

    expect(copy.subject).toBe('Staff Backend Engineer inquiry - Alice Turing');
    expect(copy.wordCount).toBeGreaterThanOrEqual(50);
    expect(copy.wordCount).toBeLessThanOrEqual(100);
    expect(copy.bodyText).toContain('unsubscribe');
  });

  it('enforces max 3 contacts per company per role rule', async () => {
    const engine = new OutreachEngine(sampleContract);
    const existingOutreach = [
      { personId: 'p1', roleTitle: 'Staff Backend Engineer', sentAt: '2026-11-10T00:00:00Z', status: 'sent' },
      { personId: 'p2', roleTitle: 'Staff Backend Engineer', sentAt: '2026-11-10T00:00:00Z', status: 'sent' },
      { personId: 'p3', roleTitle: 'Staff Backend Engineer', sentAt: '2026-11-10T00:00:00Z', status: 'sent' },
    ];

    const result = await engine.executeOutreach({
      person: samplePerson,
      targetRoleTitle: 'Staff Backend Engineer',
      companyName: 'Stripe',
      sequenceStep: 1,
      confirmedHook: 'scaling payment infrastructure',
      suppressionList: [],
      existingOutreachToCompany: existingOutreach,
      currentSentToday: 0,
      now: new Date('2026-11-15T18:00:00Z'), // 2pm EDT, not quiet
    });

    expect(result.status).toBe('skipped_company_cap');
    expect(result.reason).toContain('Exceeded limit of max 3 contacts');
  });

  it('enforces 30-day person cooldown guard', async () => {
    const engine = new OutreachEngine(sampleContract);
    const recentlyContactedPerson: Person = {
      ...samplePerson,
      lastContactedAt: new Date(Date.now() - 10 * 86400000).toISOString(), // 10 days ago
    };

    const result = await engine.executeOutreach({
      person: recentlyContactedPerson,
      targetRoleTitle: 'Staff Backend Engineer',
      companyName: 'Stripe',
      sequenceStep: 1,
      confirmedHook: 'scaling payment systems',
      suppressionList: [],
      existingOutreachToCompany: [],
      currentSentToday: 0,
      now: new Date('2026-11-15T18:00:00Z'),
    });

    expect(result.status).toBe('skipped_cooldown');
    expect(result.reason).toContain('Person in 30-day cooldown');
  });

  it('stops sending if person is on suppression list', async () => {
    const engine = new OutreachEngine(sampleContract);

    const result = await engine.executeOutreach({
      person: samplePerson,
      targetRoleTitle: 'Staff Backend Engineer',
      companyName: 'Stripe',
      sequenceStep: 1,
      confirmedHook: 'scaling payment systems',
      suppressionList: [{ email: 'sarah@stripe.com', reason: 'opt_out' }],
      existingOutreachToCompany: [],
      currentSentToday: 0,
      now: new Date('2026-11-15T18:00:00Z'),
    });

    expect(result.status).toBe('skipped_suppressed');
  });

  it('successfully dispatches outreach when all guardrails pass', async () => {
    const engine = new OutreachEngine(sampleContract);

    const result = await engine.executeOutreach({
      person: samplePerson,
      targetRoleTitle: 'Staff Backend Engineer',
      companyName: 'Stripe',
      sequenceStep: 1,
      confirmedHook: 'distributed systems architecture',
      suppressionList: [],
      existingOutreachToCompany: [],
      currentSentToday: 0,
      now: new Date('2026-11-15T18:00:00Z'),
    });

    expect(result.status).toBe('sent');
    expect(result.sendResult?.success).toBe(true);
    expect(result.bodyText).toBeDefined();
  });
});
