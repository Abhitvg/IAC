import {
  LINKEDIN_MEMBER_WRITE_SCOPE,
  LINKEDIN_ORGANIZATION_WRITE_SCOPE,
  type LinkedInApiConfig,
  type LinkedInCapability,
  type LinkedInProductEntitlements,
  type LinkedInTokenSet,
} from './types';

const DEFAULT_API_VERSION = '202610';
const REST_BASE = 'https://api.linkedin.com/rest';

export class LinkedInApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly retryAfterSeconds?: number
  ) {
    super(message);
    this.name = 'LinkedInApiError';
  }
}

function assertToken(token: LinkedInTokenSet): void {
  if (!token.accessToken || token.tokenType !== 'Bearer') throw new Error('LinkedIn connection is invalid');
  if (token.expiresAt <= Date.now()) throw new Error('LinkedIn access token expired; reconnect the account');
}

function assertUrn(value: string, allowed: 'person' | 'organization'): void {
  const pattern = allowed === 'person' ? /^urn:li:person:[A-Za-z0-9_-]+$/ : /^urn:li:organization:\d+$/;
  if (!pattern.test(value)) throw new Error(`Invalid LinkedIn ${allowed} author URN`);
}

export function getLinkedInCapabilities(
  token: LinkedInTokenSet | null,
  entitlements: LinkedInProductEntitlements = {}
): LinkedInCapability[] {
  const scopes = new Set(token?.grantedScopes ?? []);
  const tokenUsable = Boolean(token && token.expiresAt > Date.now());
  const status = (scope: string): LinkedInCapability['status'] => {
    if (!tokenUsable) return 'needs_member_authorization';
    return scopes.has(scope) ? 'available' : 'needs_member_authorization';
  };

  return [
    {
      id: 'member_profile_identity',
      status: tokenUsable && scopes.has('profile') ? 'available' : 'needs_member_authorization',
      reason: 'Requires a member OAuth connection with the OpenID Connect profile scope.',
    },
    {
      id: 'member_post_publish',
      status: status(LINKEDIN_MEMBER_WRITE_SCOPE),
      reason: 'Requires the Share on LinkedIn product and granted w_member_social scope.',
    },
    {
      id: 'organization_post_publish',
      status: !tokenUsable
        ? 'needs_member_authorization'
        : !entitlements.communityManagementApproved
          ? 'needs_linkedin_product_approval'
          : status(LINKEDIN_ORGANIZATION_WRITE_SCOPE),
      reason: 'Requires Community Management API approval, w_organization_social, and an eligible Page role.',
    },
    {
      id: 'member_content_read',
      status: !entitlements.communityManagementApproved
        ? 'needs_linkedin_product_approval'
        : 'needs_linkedin_product_approval',
      reason: 'Member social read permissions are restricted; do not infer access from write scopes.',
    },
    {
      id: 'connection_invitations',
      status: entitlements.invitationsApiApproved ? 'not_implemented' : 'needs_partner_approval',
      reason: 'The Invitations API is partner-restricted; CareerOps has no invitation executor yet.',
    },
    {
      id: 'direct_messages',
      status: entitlements.messagesApiApproved ? 'not_implemented' : 'needs_partner_approval',
      reason: 'The Messages API is partner-restricted; CareerOps has no messaging executor yet.',
    },
    {
      id: 'inbox_read',
      status: entitlements.communicationsApiApproved ? 'not_implemented' : 'needs_partner_approval',
      reason: 'Communications API partner access is required; browser inbox scraping is not supported.',
    },
  ];
}

export class LinkedInApiClient {
  private readonly fetcher: typeof fetch;
  private readonly apiVersion: string;

  constructor(config: LinkedInApiConfig = {}) {
    this.fetcher = config.fetcher ?? fetch;
    this.apiVersion = config.apiVersion ?? DEFAULT_API_VERSION;
    if (!/^20\d{4}$/.test(this.apiVersion)) throw new Error('LinkedIn API version must use YYYYMM format');
  }

  async publishMemberTextPost(
    token: LinkedInTokenSet,
    authorUrn: string,
    commentary: string
  ): Promise<{ id: string; status: number }> {
    assertToken(token);
    if (!token.grantedScopes.includes(LINKEDIN_MEMBER_WRITE_SCOPE)) {
      throw new Error('LinkedIn member publishing is not authorized: w_member_social scope is missing');
    }
    assertUrn(authorUrn, 'person');
    const text = commentary.trim();
    if (!text || text.length > 3000) throw new Error('Post text must contain 1–3000 characters');

    const response = await this.fetcher(`${REST_BASE}/posts`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${token.accessToken}`,
        'content-type': 'application/json',
        'x-restli-protocol-version': '2.0.0',
        'linkedin-version': this.apiVersion,
      },
      body: JSON.stringify({
        author: authorUrn,
        commentary: text,
        visibility: 'PUBLIC',
        distribution: {
          feedDistribution: 'MAIN_FEED',
          targetEntities: [],
          thirdPartyDistributionChannels: [],
        },
        lifecycleState: 'PUBLISHED',
        isReshareDisabledByAuthor: false,
      }),
      signal: AbortSignal.timeout(20_000),
    });

    if (!response.ok) {
      const retryAfter = Number(response.headers.get('retry-after'));
      throw new LinkedInApiError(
        `LinkedIn post creation failed with HTTP ${response.status}`,
        response.status,
        Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter : undefined
      );
    }
    const id = response.headers.get('x-restli-id');
    if (!id) throw new Error('LinkedIn accepted the request but did not return a post ID');
    return { id, status: response.status };
  }

  async publishOrganizationTextPost(
    token: LinkedInTokenSet,
    organizationUrn: string,
    commentary: string
  ): Promise<{ id: string; status: number }> {
    assertToken(token);
    if (!token.grantedScopes.includes(LINKEDIN_ORGANIZATION_WRITE_SCOPE)) {
      throw new Error('LinkedIn organization publishing is not authorized: w_organization_social scope is missing');
    }
    assertUrn(organizationUrn, 'organization');
    const text = commentary.trim();
    if (!text || text.length > 3000) throw new Error('Post text must contain 1–3000 characters');
    const response = await this.fetcher(`${REST_BASE}/posts`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${token.accessToken}`,
        'content-type': 'application/json',
        'x-restli-protocol-version': '2.0.0',
        'linkedin-version': this.apiVersion,
      },
      body: JSON.stringify({
        author: organizationUrn,
        commentary: text,
        visibility: 'PUBLIC',
        distribution: {
          feedDistribution: 'MAIN_FEED',
          targetEntities: [],
          thirdPartyDistributionChannels: [],
        },
        lifecycleState: 'PUBLISHED',
        isReshareDisabledByAuthor: false,
      }),
      signal: AbortSignal.timeout(20_000),
    });
    if (!response.ok) {
      const retryAfter = Number(response.headers.get('retry-after'));
      throw new LinkedInApiError(
        `LinkedIn organization post creation failed with HTTP ${response.status}`,
        response.status,
        Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter : undefined
      );
    }
    const id = response.headers.get('x-restli-id');
    if (!id) throw new Error('LinkedIn accepted the request but did not return a post ID');
    return { id, status: response.status };
  }
}
