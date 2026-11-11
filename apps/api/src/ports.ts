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

export interface CloudApiDependencies {
  repository: CloudApiRepository;
  config: CloudApiConfig;
}
