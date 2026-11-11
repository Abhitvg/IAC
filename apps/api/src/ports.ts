import type { AuditRecord } from '../../../packages/cloud-core/src/audit';
import type { ConsentRecord } from '../../../packages/cloud-core/src/contract';
import type {
  CareerGraphFact,
  CareerGraphFactInput,
  CareerGraphFactReview,
  EncryptedFactEnvelope,
} from '../../../packages/cloud-core/src/career-graph';
import type { TenantControlState } from '../../../packages/cloud-core/src/controls';
import type { TenantMembershipRepository } from '../../../packages/cloud-core/src/tenant';
import type { VerifiedIdentity } from '../../../packages/cloud-core/src/auth';

// Verifies ciphertext before tenant-scoped persistence.
export interface CareerGraphEnvelopeVerifier {
  verify(
    envelope: EncryptedFactEnvelope,
    tenantId: string,
    context: string
  ): Promise<void>;
}

export interface CareerGraphRepository {
  createFact(
    tenantId: string,
    actorSubject: string,
    input: CareerGraphFactInput
  ): Promise<CareerGraphFact>;
  listFacts(
    tenantId: string,
    actorSubject: string,
    limit: number
  ): Promise<CareerGraphFact[]>;
  reviewFact(
    tenantId: string,
    actorSubject: string,
    factId: string,
    input: CareerGraphFactReview
  ): Promise<CareerGraphFact>;
}

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
  careerGraph: CareerGraphRepository;
  careerGraphEnvelopeVerifier: CareerGraphEnvelopeVerifier;
  rateLimiter: CloudRateLimiter;
  config: CloudApiConfig;
}
