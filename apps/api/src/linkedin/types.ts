export const LINKEDIN_OPENID_SCOPES = ['openid', 'profile', 'email'] as const;
export const LINKEDIN_MEMBER_WRITE_SCOPE = 'w_member_social' as const;
export const LINKEDIN_MEMBER_SOCIAL_WRITE_SCOPE = 'w_member_social_feed' as const;
export const LINKEDIN_ORGANIZATION_SOCIAL_WRITE_SCOPE = 'w_organization_social_feed' as const;
export const LINKEDIN_ORGANIZATION_WRITE_SCOPE = 'w_organization_social' as const;

export type LinkedInScope =
  | (typeof LINKEDIN_OPENID_SCOPES)[number]
  | typeof LINKEDIN_MEMBER_WRITE_SCOPE
  | typeof LINKEDIN_ORGANIZATION_WRITE_SCOPE
  | string;

export interface LinkedInTokenSet {
  accessToken: string;
  memberId: string;
  expiresAt: number;
  grantedScopes: string[];
  refreshToken?: string;
  refreshTokenExpiresAt?: number;
  tokenType: 'Bearer';
}

export interface LinkedInConnectionIdentity {
  tenantId: string;
  subject: string;
}

export interface LinkedInOAuthState {
  state: string;
  identity: LinkedInConnectionIdentity;
  redirectUri: string;
  expiresAt: number;
}

export interface LinkedInOAuthStateStore {
  save(state: LinkedInOAuthState): Promise<void>;
  consume(state: string, identity: LinkedInConnectionIdentity): Promise<LinkedInOAuthState | null>;
}

export interface LinkedInTokenVault {
  put(identity: LinkedInConnectionIdentity, tokens: LinkedInTokenSet): Promise<void>;
  get(identity: LinkedInConnectionIdentity): Promise<LinkedInTokenSet | null>;
  delete(identity: LinkedInConnectionIdentity): Promise<void>;
}

export type LinkedInCapabilityStatus =
  | 'available'
  | 'needs_member_authorization'
  | 'needs_linkedin_product_approval'
  | 'needs_partner_approval'
  | 'not_implemented';

export interface LinkedInCapability {
  id: string;
  status: LinkedInCapabilityStatus;
  reason: string;
}

export interface LinkedInProductEntitlements {
  communityManagementApproved?: boolean;
  communicationsApiApproved?: boolean;
  invitationsApiApproved?: boolean;
  messagesApiApproved?: boolean;
}

export interface LinkedInOAuthConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  stateTtlMs?: number;
  fetcher?: typeof fetch;
}

export interface LinkedInApiConfig {
  apiVersion?: string;
  fetcher?: typeof fetch;
}
