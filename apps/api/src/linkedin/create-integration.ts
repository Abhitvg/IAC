import {
  TenantEnvelopeCipher,
  type TenantKeyManagementService,
} from '../../../../packages/cloud-core/src/encryption';
import { LinkedInApiClient } from './client';
import { LinkedInOAuthService } from './oauth';
import {
  LinkedInPostgresStore,
  type LinkedInSqlPool,
} from './postgres-store';
import type {
  LinkedInOAuthConfig,
  LinkedInProductEntitlements,
} from './types';
import type { LinkedInCloudIntegration } from '../ports';

export interface CreateLinkedInIntegrationOptions {
  oauth: LinkedInOAuthConfig;
  entitlements: LinkedInProductEntitlements;
  apiVersion?: string;
}

/**
 * Builds the API integration using the deployment's KMS implementation.
 * No plaintext-token or local-key fallback is provided.
 */
export function createLinkedInCloudIntegration(
  pool: LinkedInSqlPool,
  keyManagement: TenantKeyManagementService,
  options: CreateLinkedInIntegrationOptions
): LinkedInCloudIntegration {
  const store = new LinkedInPostgresStore(pool, new TenantEnvelopeCipher(keyManagement));
  return {
    oauth: new LinkedInOAuthService(options.oauth, store, store),
    tokens: store,
    api: new LinkedInApiClient({ apiVersion: options.apiVersion }),
    entitlements: options.entitlements,
  };
}
