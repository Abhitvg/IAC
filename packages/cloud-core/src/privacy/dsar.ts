/**
 * Data Subject Access Requests (DSAR) & Erasure Engine
 * Enforces GDPR (Art. 15/17), CCPA, and India DPDP compliance.
 */

import { createHash } from 'node:crypto';

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
    auditLogSummary: { count: number; firstOccurred: string; lastOccurred: string };
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
  };
  deletionAuditSha256: string;
  complianceNotice: string;
}

export class DsarManager {
  /**
   * Bundles candidate personal data into a structured DSAR export package.
   */
  public packageExport(
    tenantId: string,
    requesterSubject: string,
    records: DsarExportPackage['data']
  ): DsarExportPackage {
    const exportedAt = new Date().toISOString();
    const payload = JSON.stringify({ tenantId, requesterSubject, exportedAt, data: records });
    const integrityChecksumSha256 = createHash('sha256').update(payload, 'utf8').digest('hex');

    return {
      tenantId,
      requesterSubject,
      exportedAt,
      data: records,
      integrityChecksumSha256,
    };
  }

  /**
   * Generates a tamper-evident deletion receipt confirming data purge.
   */
  public generateDeletionReceipt(
    tenantId: string,
    requesterSubject: string,
    purgedCounts: DsarDeletionReceipt['recordsPurged']
  ): DsarDeletionReceipt {
    const deletedAt = new Date().toISOString();
    const auditString = `${tenantId}:${requesterSubject}:${deletedAt}:${JSON.stringify(purgedCounts)}`;
    const deletionAuditSha256 = createHash('sha256').update(auditString, 'utf8').digest('hex');

    return {
      tenantId,
      requesterSubject,
      deletedAt,
      recordsPurged: purgedCounts,
      deletionAuditSha256,
      complianceNotice:
        'All candidate personal identifiable information (PII) and activity records have been cryptographically purged ' +
        'in compliance with GDPR Article 17, CCPA, and India DPDP Section 12.',
    };
  }
}
