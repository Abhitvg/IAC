import {
  TenantEnvelopeCipher,
  type TenantKeyProvider,
} from '../../../../packages/cloud-core/src/encryption';
import { LinkedInApiClient } from './client';
import { LinkedInOAuthService } from './oauth';
import { LinkedInPostgresStore, type LinkedInSqlPool } from './postgres-store';
import type { LinkedInOAuthConfig, LinkedInProductEntitlements } from './types';
import type { LinkedInCloudIntegration } from '../ports';

export interface CreateLinkedInIntegrationOptions {
  oauth: LinkedInOAuthConfig;
  entitlements: LinkedInProductEntitlements;
  apiVersion?: string;
}

/**
 * Builds the API integration using the trusted backend's configured tenant key provider.
 * The provider may use the legacy local master-key ring during migration or AWS KMS
 * GenerateDataKey/Decrypt once the dual-read provider is implemented. Never expose
 * provider credentials or plaintext data keys to renderer/browser code. Retain every
 * legacy key version until LinkedIn token envelopes have been migrated and verified.
 */
export function createLinkedInCloudIntegration(
  pool: LinkedInSqlPool,
  keyProvider: TenantKeyProvider,
  options: CreateLinkedInIntegrationOptions
): LinkedInCloudIntegration {
  const store = new LinkedInPostgresStore(pool, new TenantEnvelopeCipher(keyProvider));
  return {
    oauth: new LinkedInOAuthService(options.oauth, store, store),
    tokens: store,
    api: new LinkedInApiClient({ apiVersion: options.apiVersion }),
    entitlements: options.entitlements,
  };
}
