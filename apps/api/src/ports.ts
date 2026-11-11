import type { AuditRecord } from '../../../packages/cloud-core/src/audit';
import type { TenantControlState } from '../../../packages/cloud-core/src/controls';
import type { TenantMembershipRepository } from '../../../packages/cloud-core/src/tenant';

export interface CloudApiRepository extends TenantMembershipRepository {
  getControlState(tenantId: string): Promise<TenantControlState>;
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
  jwtHmacSecret: string;
  maxRequestBytes?: number;
}

export interface CloudRateLimiter {
  consume(key: string, limit: number, windowMs: number): Promise<boolean>;
}

export interface CloudApiDependencies {
  repository: CloudApiRepository;
  rateLimiter: CloudRateLimiter;
  config: CloudApiConfig;
}
