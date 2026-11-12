/**
 * Data Retention & Lifecycle Purge Runner (Milestone M11 Item 6)
 *
 * Enforces statutory and policy-driven data retention periods under GDPR, CCPA, and SOC 2.
 * Automatically purges stale logs, ephemeral application telemetry, shadow execution reports,
 * and expired tokens while maintaining audit trail compliance.
 */

export interface RetentionPolicy {
  auditEventRetentionDays: number; // e.g. 365 days
  applicationTelemetryDays: number; // e.g. 90 days
  shadowExecutionReportDays: number; // e.g. 30 days
  expiredTokenRetentionDays: number; // e.g. 7 days
  transientInboundEmailDays: number; // e.g. 60 days
}

export interface RetentionPurgeReport {
  tenantId: string;
  executedAt: string;
  recordsPurged: {
    staleAuditEvents: number;
    applicationTelemetryEvents: number;
    shadowExecutionReports: number;
    expiredTokens: number;
    transientInboundEmails: number;
  };
  policyApplied: RetentionPolicy;
  status: 'completed' | 'dry_run';
}

export interface RetentionDataStore {
  purgeStaleAuditEvents?(tenantId: string, olderThan: Date): Promise<number>;
  purgeApplicationTelemetry?(tenantId: string, olderThan: Date): Promise<number>;
  purgeShadowReports?(tenantId: string, olderThan: Date): Promise<number>;
  purgeExpiredTokens?(tenantId: string, olderThan: Date): Promise<number>;
  purgeTransientInboundEmails?(tenantId: string, olderThan: Date): Promise<number>;
}

export class RetentionRunner {
  public static readonly DEFAULT_POLICY: RetentionPolicy = {
    auditEventRetentionDays: 365,
    applicationTelemetryDays: 90,
    shadowExecutionReportDays: 30,
    expiredTokenRetentionDays: 7,
    transientInboundEmailDays: 60,
  };

  private readonly policy: RetentionPolicy;
  private readonly store?: RetentionDataStore;

  constructor(policy?: Partial<RetentionPolicy>, store?: RetentionDataStore) {
    this.policy = { ...RetentionRunner.DEFAULT_POLICY, ...policy };
    this.store = store;
  }

  /**
   * Executes scheduled retention cleanup for a tenant or globally.
   */
  public async runRetentionPurge(
    tenantId: string,
    options?: { dryRun?: boolean; now?: Date }
  ): Promise<RetentionPurgeReport> {
    const now = options?.now ?? new Date();
    const isDryRun = Boolean(options?.dryRun);

    const msPerDay = 24 * 60 * 60 * 1000;
    const auditCutoff = new Date(now.getTime() - this.policy.auditEventRetentionDays * msPerDay);
    const telemetryCutoff = new Date(now.getTime() - this.policy.applicationTelemetryDays * msPerDay);
    const shadowCutoff = new Date(now.getTime() - this.policy.shadowExecutionReportDays * msPerDay);
    const tokenCutoff = new Date(now.getTime() - this.policy.expiredTokenRetentionDays * msPerDay);
    const emailCutoff = new Date(now.getTime() - this.policy.transientInboundEmailDays * msPerDay);

    let staleAuditEvents = 0;
    let applicationTelemetryEvents = 0;
    let shadowExecutionReports = 0;
    let expiredTokens = 0;
    let transientInboundEmails = 0;

    if (!isDryRun && this.store) {
      if (this.store.purgeStaleAuditEvents) {
        staleAuditEvents = await this.store.purgeStaleAuditEvents(tenantId, auditCutoff);
      }
      if (this.store.purgeApplicationTelemetry) {
        applicationTelemetryEvents = await this.store.purgeApplicationTelemetry(tenantId, telemetryCutoff);
      }
      if (this.store.purgeShadowReports) {
        shadowExecutionReports = await this.store.purgeShadowReports(tenantId, shadowCutoff);
      }
      if (this.store.purgeExpiredTokens) {
        expiredTokens = await this.store.purgeExpiredTokens(tenantId, tokenCutoff);
      }
      if (this.store.purgeTransientInboundEmails) {
        transientInboundEmails = await this.store.purgeTransientInboundEmails(tenantId, emailCutoff);
      }
    }

    return {
      tenantId,
      executedAt: now.toISOString(),
      recordsPurged: {
        staleAuditEvents,
        applicationTelemetryEvents,
        shadowExecutionReports,
        expiredTokens,
        transientInboundEmails,
      },
      policyApplied: this.policy,
      status: isDryRun ? 'dry_run' : 'completed',
    };
  }
}

