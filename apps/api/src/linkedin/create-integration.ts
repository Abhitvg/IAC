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
 * Builds the API integration using the deployment's configured tenant key provider.
 * This abstraction does not call AWS KMS; production callers must inject a securely
 * provisioned provider and retain old key versions until encrypted tokens are rewrapped.
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
