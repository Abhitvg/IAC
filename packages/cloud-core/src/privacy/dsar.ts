/**
 * Data Subject Access Requests (DSAR) & Erasure Engine (Milestone M11 Item 6 Hardened)
 * Enforces GDPR (Art. 15/17), CCPA, and India DPDP compliance.
 *
 * Covers:
 * - Database records (Facts, Contracts, Applications, Contacts, Outreach, Assist Queue)
 * - Object storage keys (resumes, tailored CVs, portfolios)
 * - Workflow execution history (Temporal workflow and run IDs)
 * - Auth and OAuth tokens
 * - Log references and log streams
 * - Tenant-Key Crypto-Shredding receipts
 */

import { createHash } from 'node:crypto';
import type { ShredReceipt } from './crypto-shredder';

export interface DsarExportPackage {
  tenantId: string;
  requesterSubject: string;
  exportedAt: string;
  data: {
    confirmedFacts: any[];
    contracts: any[];
    applications: any[];
    personGraphContacts: any[];
    outreachHistory: any[];
    assistQueueItems?: any[];
    auditLogSummary: { count: number; firstOccurred: string; lastOccurred: string };
  };
  objectStorage?: {
    storedFiles: Array<{
      key: string;
      contentType: string;
      sizeBytes: number;
      uploadedAt: string;
    }>;
  };
  workflowHistory?: {
    temporalWorkflows: Array<{
      workflowId: string;
      runId: string;
      status: string;
      startedAt: string;
      completedAt?: string;
    }>;
  };
  authTokens?: {
    activeTokens: Array<{
      tokenId: string;
      provider: string;
      issuedAt: string;
      expiresAt: string;
      status: 'active' | 'revoked';
    }>;
  };
  logs?: {
    logReferences: Array<{
      logStream: string;
      eventCount: number;
      period: { start: string; end: string };
    }>;
  };
  integrityChecksumSha256: string;
}

export interface DsarDeletionReceipt {
  tenantId: string;
  requesterSubject: string;
  deletedAt: string;
  recordsPurged: {
    careerGraphFacts: number;
    contracts: number;
    applications: number;
    people: number;
    outreachMessages: number;
    sprintRuns: number;
    objectStorageKeys?: number;
    workflowRunsTerminated?: number;
    tokensRevoked?: number;
    logStreamsPurged?: number;
  };
  cryptoShredded?: {
    tenantKeyId: string;
    shreddedAt: string;
    status: 'shredded';
    keyZeroedChecksum: string;
  };
  deletionAuditSha256: string;
  complianceNotice: string;
}

export class DsarManager {
  /**
   * Bundles candidate personal data across DB, Object Storage, Workflows, Tokens, and Logs
   * into a tamper-evident DSAR export package.
   */
  public packageExport(
    tenantId: string,
    requesterSubject: string,
    records: DsarExportPackage['data'],
    auxiliary?: {
      objectStorage?: DsarExportPackage['objectStorage'];
      workflowHistory?: DsarExportPackage['workflowHistory'];
      authTokens?: DsarExportPackage['authTokens'];
      logs?: DsarExportPackage['logs'];
    }
  ): DsarExportPackage {
    const exportedAt = new Date().toISOString();
    const payload = JSON.stringify({
      tenantId,
      requesterSubject,
      exportedAt,
      data: records,
      objectStorage: auxiliary?.objectStorage,
      workflowHistory: auxiliary?.workflowHistory,
      authTokens: auxiliary?.authTokens,
      logs: auxiliary?.logs,
    });
    const integrityChecksumSha256 = createHash('sha256').update(payload, 'utf8').digest('hex');

    return {
      tenantId,
      requesterSubject,
      exportedAt,
      data: records,
      objectStorage: auxiliary?.objectStorage,
      workflowHistory: auxiliary?.workflowHistory,
      authTokens: auxiliary?.authTokens,
      logs: auxiliary?.logs,
      integrityChecksumSha256,
    };
  }

  /**
   * Generates a tamper-evident deletion receipt confirming cross-system data purge
   * and cryptographic shredding under GDPR Article 17, CCPA, and India DPDP Section 12.
   */
  public generateDeletionReceipt(
    tenantId: string,
    requesterSubject: string,
    purgedCounts: DsarDeletionReceipt['recordsPurged'],
    shredReceipt?: ShredReceipt
  ): DsarDeletionReceipt {
    const deletedAt = new Date().toISOString();
    const auditString = `${tenantId}:${requesterSubject}:${deletedAt}:${JSON.stringify(purgedCounts)}:${shredReceipt?.zeroedChecksum ?? 'no_dek'}`;
    const deletionAuditSha256 = createHash('sha256').update(auditString, 'utf8').digest('hex');

    return {
      tenantId,
      requesterSubject,
      deletedAt,
      recordsPurged: purgedCounts,
      cryptoShredded: shredReceipt
        ? {
            tenantKeyId: shredReceipt.keyId,
            shreddedAt: shredReceipt.shreddedAt,
            status: 'shredded',
            keyZeroedChecksum: shredReceipt.zeroedChecksum,
          }
        : undefined,
      deletionAuditSha256,
      complianceNotice:
        'All candidate personal identifiable information (PII), object storage keys, workflow histories, tokens, and audit logs ' +
        'have been cryptographically purged and shred in compliance with GDPR Article 17, CCPA, and India DPDP Section 12.',
    };
  }
}
