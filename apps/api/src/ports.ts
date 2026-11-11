import type { AuditRecord } from '../../../packages/cloud-core/src/audit';
import type { TenantControlState } from '../../../packages/cloud-core/src/controls';
import type { TenantMembershipRepository } from '../../../packages/cloud-core/src/tenant';
import type { VerifiedIdentity } from '../../../packages/cloud-core/src/auth';

export interface CloudApiRepository extends TenantMembershipRepository {
  getControlState(tenantId: string): Promise<TenantControlState>;
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
