import { describe, expect, it, vi } from 'vitest';
import { createHmac } from 'node:crypto';
import { DsarManager } from '../packages/cloud-core/src/privacy/dsar';
import {
  TenantCryptoShredder,
  TenantKeyShreddedError,
} from '../packages/cloud-core/src/privacy/crypto-shredder';
import {
  createPseudonymizedAuditEvent,
  pseudonymizeActor,
  pseudonymizeAuditMetadata,
  appendAuditEvent,
  type AuditRepository,
  type AuditRecord,
} from '../packages/cloud-core/src/audit';
import { RetentionRunner } from '../packages/cloud-core/src/privacy/retention-runner';
import { SuppressionPropagator } from '../packages/cloud-core/src/privacy/suppression-propagator';
import { createCloudApiServer } from '../apps/api/src/server';

const TENANT_ID = '22222222-2222-4222-8222-222222222222';
const TEST_SECRET = '0123456789abcdef0123456789abcdef';

function signToken(claims: Record<string, unknown>, secret = TEST_SECRET): string {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const payload = Buffer.from(JSON.stringify(claims)).toString('base64url');
  const content = `${header}.${payload}`;
  const signature = createHmac('sha256', secret).update(content).digest('base64url');
  return `${content}.${signature}`;
}

describe('Milestone M11 Item 6: Privacy Hardening, DSAR & Crypto-Shredding', () => {
  describe('1. DSAR Cross-System Coverage (DB, Object Storage, Workflows, Tokens, Logs)', () => {
    const dsar = new DsarManager();

    it('bundles DB, object storage, workflow history, tokens, and logs with cryptographic integrity checksum', () => {
      const exportPackage = dsar.packageExport(
        TENANT_ID,
        'candidate:jane.doe',
        {
          confirmedFacts: [{ id: 'f-1', role: 'Staff SRE' }],
          contracts: [{ id: 'c-1', version: 1 }],
          applications: [{ id: 'app-1', company: 'Google' }],
          personGraphContacts: [{ id: 'p-1', name: 'Recruiter' }],
          outreachHistory: [{ messageId: 'm-1' }],
          auditLogSummary: { count: 10, firstOccurred: '2026-11-01T00:00:00Z', lastOccurred: '2026-11-12T00:00:00Z' },
        },
        {
          objectStorage: {
            storedFiles: [
              { key: `tenants/${TENANT_ID}/resume_v1.pdf`, contentType: 'application/pdf', sizeBytes: 1048576, uploadedAt: '2026-11-01T10:00:00Z' },
              { key: `tenants/${TENANT_ID}/tailored_cv_google.pdf`, contentType: 'application/pdf', sizeBytes: 524288, uploadedAt: '2026-11-05T14:00:00Z' },
            ],
          },
          workflowHistory: {
            temporalWorkflows: [
              { workflowId: `wf-sprint-${TENANT_ID}`, runId: 'run-001', status: 'COMPLETED', startedAt: '2026-11-01T12:00:00Z', completedAt: '2026-11-04T12:00:00Z' },
            ],
          },
          authTokens: {
            activeTokens: [
              { tokenId: 'tok_google_oauth_01', provider: 'google', issuedAt: '2026-11-01T09:00:00Z', expiresAt: '2026-12-01T09:00:00Z', status: 'active' },
            ],
          },
          logs: {
            logReferences: [
              { logStream: `tenants/${TENANT_ID}/activity.log`, eventCount: 142, period: { start: '2026-11-01T00:00:00Z', end: '2026-11-12T00:00:00Z' } },
            ],
          },
        }
      );

      expect(exportPackage.tenantId).toBe(TENANT_ID);
      expect(exportPackage.objectStorage?.storedFiles).toHaveLength(2);
      expect(exportPackage.workflowHistory?.temporalWorkflows).toHaveLength(1);
      expect(exportPackage.authTokens?.activeTokens).toHaveLength(1);
      expect(exportPackage.logs?.logReferences).toHaveLength(1);
      expect(exportPackage.integrityChecksumSha256).toMatch(/^[a-f0-9]{64}$/);
    });

    it('generates cross-system deletion receipt incorporating tenant crypto-shredding proof', () => {
      const shredder = new TenantCryptoShredder();
      shredder.getOrCreateKey(TENANT_ID);
      const shredReceipt = shredder.shredTenantKey(TENANT_ID);

      const receipt = dsar.generateDeletionReceipt(
        TENANT_ID,
        'candidate:jane.doe',
        {
          careerGraphFacts: 8,
          contracts: 1,
          applications: 14,
          people: 25,
          outreachMessages: 10,
          sprintRuns: 1,
          objectStorageKeys: 4,
          workflowRunsTerminated: 1,
          tokensRevoked: 2,
          logStreamsPurged: 3,
        },
        shredReceipt
      );

      expect(receipt.tenantId).toBe(TENANT_ID);
      expect(receipt.recordsPurged.objectStorageKeys).toBe(4);
      expect(receipt.recordsPurged.workflowRunsTerminated).toBe(1);
      expect(receipt.recordsPurged.tokensRevoked).toBe(2);
      expect(receipt.cryptoShredded).toBeDefined();
      expect(receipt.cryptoShredded?.status).toBe('shredded');
      expect(receipt.cryptoShredded?.keyZeroedChecksum).toMatch(/^[a-f0-9]{64}$/);
      expect(receipt.complianceNotice).toContain('GDPR Article 17');
    });
  });

  describe('2. Tenant-Key Crypto-Shredding', () => {
    it('encrypts data under tenant DEK and renders it permanently unrecoverable upon shredding', () => {
      const shredder = new TenantCryptoShredder();
      const secretResumeText = 'CONFIDENTIAL: Samantha Vance - AWS Principal Architect compensation $450k';

      // 1. Encrypt under tenant DEK
      const encrypted = shredder.encrypt(TENANT_ID, secretResumeText);
      expect(encrypted.tenantId).toBe(TENANT_ID);
      expect(encrypted.ciphertextHex).toBeDefined();

      // 2. Decrypt while key is active
      const decrypted = shredder.decrypt(encrypted);
      expect(decrypted).toBe(secretResumeText);

      // 3. Shred tenant key (zeroes key in-place)
      const shredReceipt = shredder.shredTenantKey(TENANT_ID);
      expect(shredReceipt.status).toBe('shredded');
      expect(shredder.isShredded(TENANT_ID)).toBe(true);

      // 4. Decryption MUST fail with TenantKeyShreddedError
      expect(() => {
        shredder.decrypt(encrypted);
      }).toThrow(TenantKeyShreddedError);
      expect(() => {
        shredder.decrypt(encrypted);
      }).toThrow(/Cryptographic shredding enforced/i);

      // 5. Subsequent encryption for shredded tenant MUST fail
      expect(() => {
        shredder.encrypt(TENANT_ID, 'new secret');
      }).toThrow(TenantKeyShreddedError);
    });
  });

  describe('3. Audit Event Pseudonymization', () => {
    it('pseudonymizes actor subjects and email addresses while preserving audit integrity chaining', async () => {
      const rawSubject = 'candidate:alice.smith@domain.com';
      const pseudoSubject = pseudonymizeActor(rawSubject, 'salt_2026');

      expect(pseudoSubject).toMatch(/^pseudo_[a-f0-9]{24}$/);
      expect(pseudoSubject).not.toContain('alice');
      expect(pseudoSubject).not.toContain('domain.com');

      const rawMetadata = {
        recipientEmail: 'recruiter.bob@target-tech.org',
        jobId: 'job-1234',
        candidate_id: 'candidate_9981-xyz',
        status: 'sent',
      };

      const pseudoMetadata = pseudonymizeAuditMetadata(rawMetadata, 'salt_2026');
      expect(pseudoMetadata.recipientEmail).toMatch(/^pseudo_eml_[a-f0-9]{20}$/);
      expect(pseudoMetadata.recipientEmail).not.toContain('recruiter.bob');
      expect(pseudoMetadata.candidate_id).toMatch(/^pseudo_id_[a-f0-9]{20}$/);
      expect(pseudoMetadata.jobId).toBe('job-1234');

      // Verify tamper-evident audit record chain creation with pseudonymized inputs
      const storedRecords: AuditRecord[] = [];
      const mockRepo: AuditRepository = {
        append: async (rec) => {
          storedRecords.push(rec);
        },
      };

      const auditInput = createPseudonymizedAuditEvent(
        {
          tenantId: TENANT_ID,
          actorSubject: rawSubject,
          action: 'outreach.email_sent',
          entityType: 'outreach_message',
          entityId: 'msg-001',
          occurredAt: '2026-11-12T10:00:00.000Z',
          metadata: rawMetadata,
        },
        'salt_2026'
      );

      const record = await appendAuditEvent(mockRepo, auditInput, null);

      expect(record.actorSubject).toMatch(/^pseudo_[a-f0-9]{24}$/);
      expect(record.metadata?.recipientEmail).toMatch(/^pseudo_eml_[a-f0-9]{20}$/);
      expect(record.eventHash).toMatch(/^[a-f0-9]{64}$/);
      expect(storedRecords).toHaveLength(1);
    });
  });

  describe('4. Data Retention Cleanup Jobs', () => {
    it('applies retention cutoff rules and purges stale records', async () => {
      const mockStore = {
        purgeStaleAuditEvents: vi.fn().mockResolvedValue(15),
        purgeApplicationTelemetry: vi.fn().mockResolvedValue(120),
        purgeShadowReports: vi.fn().mockResolvedValue(8),
        purgeExpiredTokens: vi.fn().mockResolvedValue(2),
        purgeTransientInboundEmails: vi.fn().mockResolvedValue(40),
      };

      const runner = new RetentionRunner(
        {
          auditEventRetentionDays: 180,
          applicationTelemetryDays: 60,
          shadowExecutionReportDays: 14,
        },
        mockStore
      );

      const report = await runner.runRetentionPurge(TENANT_ID, {
        now: new Date('2026-11-12T12:00:00.000Z'),
      });

      expect(report.status).toBe('completed');
      expect(report.recordsPurged.staleAuditEvents).toBe(15);
      expect(report.recordsPurged.applicationTelemetryEvents).toBe(120);
      expect(report.recordsPurged.shadowExecutionReports).toBe(8);
      expect(report.recordsPurged.expiredTokens).toBe(2);
      expect(report.recordsPurged.transientInboundEmails).toBe(40);

      expect(mockStore.purgeStaleAuditEvents).toHaveBeenCalledWith(
        TENANT_ID,
        expect.any(Date)
      );
    });
  });

  describe('5. Third-Party Contact Notice & Suppression Propagation', () => {
    it('immediately propagates opt-out/suppression, cancels pending outreach, and emits receipt', async () => {
      const mockStore = {
        addSuppressionEntry: vi.fn().mockResolvedValue(undefined),
        updateContactStage: vi.fn().mockResolvedValue(true),
        cancelPendingOutreach: vi.fn().mockResolvedValue(2), // 2 pending sequence steps cancelled
      };

      const propagator = new SuppressionPropagator(mockStore);

      const receipt = await propagator.propagateNotice({
        tenantId: TENANT_ID,
        contactEmail: 'engineering-director@netflix.com',
        reason: 'opt_out',
        scope: 'company_domain',
        sourceNotice: 'email_unsubscribe_link',
      });

      expect(receipt.tenantId).toBe(TENANT_ID);
      expect(receipt.suppressedEmailHash).toMatch(/^sha256:[a-f0-9]{64}$/);
      expect(receipt.scope).toBe('company_domain');
      expect(receipt.domain).toBe('netflix.com');
      expect(receipt.actionsTaken.addedToSuppressionList).toBe(true);
      expect(receipt.actionsTaken.personGraphStageUpdated).toBe(true);
      expect(receipt.actionsTaken.pendingOutreachSequencesCancelled).toBe(2);
      expect(receipt.complianceNotice).toContain('GDPR Art. 21 and CAN-SPAM');
      expect(receipt.receiptSha256).toMatch(/^[a-f0-9]{64}$/);

      expect(mockStore.addSuppressionEntry).toHaveBeenCalledWith(
        TENANT_ID,
        expect.objectContaining({
          email: 'engineering-director@netflix.com',
          domain: 'netflix.com',
          reason: 'opt_out',
        })
      );
      expect(mockStore.updateContactStage).toHaveBeenCalledWith(
        TENANT_ID,
        'engineering-director@netflix.com',
        'opted_out'
      );
    });
  });

  describe('6. REST API Privacy Endpoints', () => {
    it('handles crypto-shred, retention purge, and suppression propagation over authenticated REST API', async () => {
      const mockRepo = {
        checkReady: async () => {},
        findMembershipsBySubject: async () => [
          { tenantId: TENANT_ID, subject: 'candidate:jane', role: 'owner' as const, status: 'active' as const },
        ],
        getControlState: async () => ({
          tenantId: TENANT_ID,
          globalKillSwitch: false,
          pausedChannels: [],
          updatedAt: new Date().toISOString(),
        }),
        getActiveSprintContract: async () => null,
      };

      const server = createCloudApiServer({
        repository: mockRepo as any,
        config: { issuer: 'careerops.test', audience: 'careerops.api' },
        identityVerifier: {
          verify: async () => ({
            subject: 'candidate:jane',
            issuer: 'careerops.test',
            audience: 'careerops.api',
            expiresAt: 2_000_000_000,
            tenantId: TENANT_ID,
          }),
        },
        rateLimiter: { consume: async () => true },
      });

      await new Promise<void>((resolve) => server.listen(0, resolve));
      const address = server.address() as { port: number };
      const baseUrl = `http://127.0.0.1:${address.port}`;

      const token = signToken({
        sub: 'candidate:jane',
        iss: 'careerops.test',
        aud: 'careerops.api',
        exp: 2_000_000_000,
        tenant_id: TENANT_ID,
      });

      try {
        // 1. POST /v1/privacy/crypto-shred
        const shredRes = await fetch(`${baseUrl}/v1/privacy/crypto-shred`, {
          method: 'POST',
          headers: { authorization: `Bearer ${token}` },
        });
        expect(shredRes.status).toBe(200);
        const shredJson = await shredRes.json();
        expect(shredJson.shredReceipt.status).toBe('shredded');
        expect(shredJson.shredReceipt.zeroedChecksum).toMatch(/^[a-f0-9]{64}$/);

        // 2. POST /v1/privacy/retention/run
        const retentionRes = await fetch(`${baseUrl}/v1/privacy/retention/run`, {
          method: 'POST',
          headers: {
            authorization: `Bearer ${token}`,
            'content-type': 'application/json',
          },
          body: JSON.stringify({ dryRun: true }),
        });
        expect(retentionRes.status).toBe(200);
        const retentionJson = await retentionRes.json();
        expect(retentionJson.purgeReport.status).toBe('dry_run');

        // 3. POST /v1/privacy/suppression/propagate
        const suppRes = await fetch(`${baseUrl}/v1/privacy/suppression/propagate`, {
          method: 'POST',
          headers: {
            authorization: `Bearer ${token}`,
            'content-type': 'application/json',
          },
          body: JSON.stringify({
            contactEmail: 'recruiter@hiring-company.com',
            reason: 'opt_out',
            scope: 'recipient_only',
          }),
        });
        expect(suppRes.status).toBe(200);
        const suppJson = await suppRes.json();
        expect(suppJson.propagationReceipt.actionsTaken.addedToSuppressionList).toBe(true);
        expect(suppJson.propagationReceipt.suppressedEmailHash).toMatch(/^sha256:/);
      } finally {
        await new Promise<void>((resolve, reject) =>
          server.close((err) => (err ? reject(err) : resolve()))
        );
      }
    });
  });
});
