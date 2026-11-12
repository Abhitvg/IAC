import { describe, expect, it } from 'vitest';
import { DsarManager } from '../packages/cloud-core/src/privacy/dsar';

describe('Milestone M10 - Data Subject Access Requests (DSAR) & GDPR Erasure', () => {
  const manager = new DsarManager();
  const tenantId = '10000000-0000-4000-8000-000000000001';
  const requesterSubject = 'candidate:alice';

  it('packages full tenant personal data with cryptographic integrity checksum (GDPR Art. 15)', () => {
    const exportPackage = manager.packageExport(tenantId, requesterSubject, {
      confirmedFacts: [{ id: 'f1', claim: '5 years of backend engineering' }],
      contracts: [{ id: 'c1', roles: ['Staff Backend Engineer'] }],
      applications: [{ id: 'app1', company: 'Acme Corp', status: 'submitted' }],
      personGraphContacts: [{ name: 'Bob Recruiter', company: 'Acme Corp' }],
      outreachHistory: [{ messageId: 'm1', to: 'bob@acme.com' }],
      auditLogSummary: {
        count: 5,
        firstOccurred: '2026-11-01T00:00:00.000Z',
        lastOccurred: '2026-11-12T00:00:00.000Z',
      },
    });

    expect(exportPackage.tenantId).toBe(tenantId);
    expect(exportPackage.requesterSubject).toBe(requesterSubject);
    expect(exportPackage.data.confirmedFacts).toHaveLength(1);
    expect(exportPackage.integrityChecksumSha256).toMatch(/^[a-f0-9]{64}$/);
  });

  it('generates cryptographic deletion receipt under GDPR Article 17 Right to Erasure', () => {
    const receipt = manager.generateDeletionReceipt(tenantId, requesterSubject, {
      careerGraphFacts: 12,
      contracts: 1,
      applications: 24,
      people: 30,
      outreachMessages: 15,
      sprintRuns: 2,
    });

    expect(receipt.tenantId).toBe(tenantId);
    expect(receipt.recordsPurged.careerGraphFacts).toBe(12);
    expect(receipt.recordsPurged.applications).toBe(24);
    expect(receipt.deletionAuditSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(receipt.complianceNotice).toContain('GDPR Article 17');
    expect(receipt.complianceNotice).toContain('India DPDP Section 12');
  });
});
