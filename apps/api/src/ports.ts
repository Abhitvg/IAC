import type { AuditRecord } from '../../../packages/cloud-core/src/audit';
import type { ConsentRecord } from '../../../packages/cloud-core/src/contract';
import type { TenantControlState } from '../../../packages/cloud-core/src/controls';
import type { TenantMembershipRepository } from '../../../packages/cloud-core/src/tenant';
import type { VerifiedIdentity } from '../../../packages/cloud-core/src/auth';

export interface CloudApiRepository extends TenantMembershipRepository {
  checkReady(): Promise<void>;
  getControlState(tenantId: string): Promise<TenantControlState>;
  acceptSprintContract(record: ConsentRecord): Promise<{ id: string; revision: number }>;
  getActiveSprintContract(
    tenantId: string
  ): Promise<(ConsentRecord & { id: string; revision: number }) | null>;
  revokeSprintContract(input: {
    tenantId: string;
    subject: string;
    contractId: string;
    revokedAt: string;
    metadata: Record<string, string | boolean>;
  }): Promise<void>;
  setChannelPauseWithAudit(input: {
    tenantId: string;
    actorSubject: string;
    channel: 'ats' | 'email' | 'calendar' | 'linkedin_assist';
    paused: boolean;
    occurredAt: string;
    metadata: Record<string, string | boolean>;
  }): Promise<void>;
  setGlobalKillSwitchWithAudit(input: {
    tenantId: string;
    actorSubject: string;
    enabled: boolean;
    occurredAt: string;
    metadata: Record<string, string | boolean>;
  }): Promise<void>;
}

export interface CloudApiConfig {
  issuer: string;
  audience: string;
  jwksUrl: string;
  consentSigningSecret: string;
  maxRequestBytes?: number;
}

export interface CloudRateLimiter {
  consume(key: string, limit: number, windowMs: number): Promise<boolean>;
}

export interface CloudIdentityVerifier {
  verify(token: string): Promise<VerifiedIdentity>;
}

export interface CloudApiDependencies {
  identityVerifier: CloudIdentityVerifier;
  repository: CloudApiRepository;
  rateLimiter: CloudRateLimiter;
  config: CloudApiConfig;
}
