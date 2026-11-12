import { describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { LinkedInAssistProtocol } from '../packages/cloud-core/src/linkedin/assist-protocol';
import { LinkedInRestrictionManager } from '../packages/cloud-core/src/linkedin/restrictions';
import type { Person } from '../packages/cloud-core/src/person-graph/person-types';

describe('Milestone M8 - LinkedIn Assist Queue & Restriction Handling', () => {
  const protocol = new LinkedInAssistProtocol();
  const restrictionManager = new LinkedInRestrictionManager();
  const tenantId = randomUUID();

  const mockPerson: Person = {
    id: 'p_warm_1',
    tenantId,
    email: 'sarah@stripe.com',
    name: 'Sarah Connor',
    company: 'Stripe',
    title: 'Engineering Director',
    roleDomain: 'hiring_manager',
    relationship: '1st_degree',
    verificationSource: 'user_imported_connection',
    timeZone: 'America/New_York',
    linkedinUrl: 'https://www.linkedin.com/in/sarah-connor',
    crmStage: 'lead',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  it('generates personalized connection note strictly under 300 characters', () => {
    const note = protocol.generateAssistNote(
      mockPerson,
      'Staff Infrastructure Engineer',
      'Alice Turing',
      'high-throughput payment ledgers'
    );

    expect(note.length).toBeLessThanOrEqual(300);
    expect(note).toContain('Sarah');
    expect(note).toContain('Stripe');
    expect(note).toContain('Staff Infrastructure Engineer');
    expect(note).toContain('Alice Turing');
  });

  it('enforces userGestureRequired: true in Assist Queue items (H1)', () => {
    const item = protocol.createAssistActionItem(
      tenantId,
      mockPerson,
      'Staff Infrastructure Engineer',
      'Alice Turing',
      'payment ledgers'
    );

    expect(item.platform).toBe('linkedin_assist');
    expect(item.userGestureRequired).toBe(true);
    expect(item.targetUrl).toBe('https://www.linkedin.com/in/sarah-connor');
    expect(item.status).toBe('pending');
  });

  it('triggers mandatory auto-pause when user reports a LinkedIn restriction notice', () => {
    const report = {
      noticeType: 'invitation_limit_reached' as const,
      details: 'You have reached the weekly invitation limit of 100 requests.',
      reportedAt: new Date().toISOString(),
    };

    const result = restrictionManager.handleRestrictionReport(report);
    expect(result.channelAutoPaused).toBe('linkedin_assist');
    expect(result.auditReason).toContain('invitation_limit_reached');
    expect(result.recommendedUserAction).toContain('weekly invitation limit reached');
  });
});
