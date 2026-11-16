import {
  LINKEDIN_MEMBER_WRITE_SCOPE,
  LINKEDIN_MEMBER_SOCIAL_WRITE_SCOPE,
  LINKEDIN_ORGANIZATION_WRITE_SCOPE,
  LINKEDIN_ORGANIZATION_SOCIAL_WRITE_SCOPE,
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
  if (!token.accessToken || token.tokenType !== 'Bearer') {
    throw new Error('LinkedIn connection is invalid');
  }
  if (token.expiresAt <= Date.now()) {
    throw new Error('LinkedIn access token expired; reconnect the account');
  }
}

function assertUrn(value: string, allowed: 'person' | 'organization'): void {
  const pattern =
    allowed === 'person' ? /^urn:li:person:[A-Za-z0-9_-]+$/ : /^urn:li:organization:\d+$/;
  if (!pattern.test(value)) {
    throw new Error(`Invalid LinkedIn ${allowed} author URN`);
  }
}

function createPostPayload(author: string, commentary: string): Record<string, unknown> {
  return {
    author,
    commentary,
    visibility: 'PUBLIC',
    distribution: {
      feedDistribution: 'MAIN_FEED',
      targetEntities: [],
      thirdPartyDistributionChannels: [],
    },
    lifecycleState: 'PUBLISHED',
    isReshareDisabledByAuthor: false,
  };
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
      reason:
        'Requires Community Management API approval, w_organization_social, and an eligible Page role.',
    },
    {
      id: 'member_comment_react',
      status: !tokenUsable
        ? 'needs_member_authorization'
        : !entitlements.communityManagementApproved
          ? 'needs_linkedin_product_approval'
          : status(LINKEDIN_MEMBER_SOCIAL_WRITE_SCOPE),
      reason:
        'Requires Community Management API access and w_member_social_feed; w_member_social alone is not sufficient.',
    },
    {
      id: 'organization_comment_react',
      status: !tokenUsable
        ? 'needs_member_authorization'
        : !entitlements.communityManagementApproved
          ? 'needs_linkedin_product_approval'
          : status(LINKEDIN_ORGANIZATION_SOCIAL_WRITE_SCOPE),
      reason:
        'Requires Community Management API access, w_organization_social_feed, and an eligible Page role.',
    },
    {
      id: 'member_content_read',
      status: !tokenUsable
        ? 'needs_member_authorization'
        : !entitlements.communityManagementApproved
          ? 'needs_linkedin_product_approval'
          : scopes.has('r_member_social_feed')
            ? 'available'
            : 'needs_linkedin_product_approval',
      reason:
        'Requires approved member social read access; w_member_social does not grant read access.',
    },
    {
      id: 'connection_invitations',
      status: entitlements.invitationsApiApproved ? 'not_implemented' : 'needs_partner_approval',
      reason:
        'The Invitations API is partner-restricted; CareerOps has no invitation executor yet.',
    },
    {
      id: 'direct_messages',
      status: entitlements.messagesApiApproved ? 'not_implemented' : 'needs_partner_approval',
      reason: 'The Messages API is partner-restricted; CareerOps has no messaging executor yet.',
    },
    {
      id: 'inbox_read',
      status: entitlements.communicationsApiApproved ? 'not_implemented' : 'needs_partner_approval',
      reason:
        'Communications API partner access is required; browser inbox scraping is not supported.',
    },
  ];
}

export class LinkedInApiClient {
  private readonly fetcher: typeof fetch;
  private readonly apiVersion: string;

  constructor(config: LinkedInApiConfig = {}) {
    this.fetcher = config.fetcher ?? fetch;
    this.apiVersion = config.apiVersion ?? DEFAULT_API_VERSION;
    if (!/^20\d{4}$/.test(this.apiVersion)) {
      throw new Error('LinkedIn API version must use YYYYMM format');
    }
  }

  private async createTextPost(
    token: LinkedInTokenSet,
    authorUrn: string,
    commentary: string
  ): Promise<{ id: string; status: number }> {
    assertToken(token);
    const text = commentary.trim();
    if (!text || text.length > 3000) {
      throw new Error('Post text must contain 1–3000 characters');
    }

    const response = await this.fetcher(`${REST_BASE}/posts`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${token.accessToken}`,
        'content-type': 'application/json',
        'x-restli-protocol-version': '2.0.0',
        'linkedin-version': this.apiVersion,
      },
      body: JSON.stringify(createPostPayload(authorUrn, text)),
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
    if (!id) {
      throw new Error('LinkedIn accepted the request but did not return a post ID');
    }
    return { id, status: response.status };
  }

  async publishMemberTextPost(
    token: LinkedInTokenSet,
    authorUrn: string,
    commentary: string
  ): Promise<{ id: string; status: number }> {
    if (!token.grantedScopes.includes(LINKEDIN_MEMBER_WRITE_SCOPE)) {
      throw new Error(
        'LinkedIn member publishing is not authorized: w_member_social scope is missing'
      );
    }
    assertUrn(authorUrn, 'person');
    return this.createTextPost(token, authorUrn, commentary);
  }

  async publishMemberPoll(
    token: LinkedInTokenSet,
    authorUrn: string,
    commentary: string,
    question: string,
    options: string[],
    duration: 'ONE_DAY' | 'THREE_DAYS' | 'SEVEN_DAYS' | 'FOURTEEN_DAYS'
  ): Promise<{ id: string; status: number }> {
    if (!token.grantedScopes.includes(LINKEDIN_MEMBER_WRITE_SCOPE)) {
      throw new Error(
        'LinkedIn member poll publishing is not authorized: w_member_social scope is missing'
      );
    }
    assertToken(token);
    assertUrn(authorUrn, 'person');
    const text = commentary.trim();
    const pollQuestion = question.trim();
    const pollOptions = options.map((option) => option.trim());
    if (!text || text.length > 3000) {
      throw new Error('Poll commentary must contain 1–3000 characters');
    }
    if (!pollQuestion || pollQuestion.length > 140) {
      throw new Error('Poll question must contain 1–140 characters');
    }
    if (pollOptions.length < 2 || pollOptions.length > 4) {
      throw new Error('A LinkedIn poll must contain 2–4 options');
    }
    if (pollOptions.some((option) => !option || option.length > 30)) {
      throw new Error('Each LinkedIn poll option must contain 1–30 characters');
    }
    if (
      new Set(pollOptions.map((option) => option.toLocaleLowerCase())).size !== pollOptions.length
    ) {
      throw new Error('LinkedIn poll options must be unique');
    }

    const payload = {
      ...createPostPayload(authorUrn, text),
      content: {
        poll: {
          question: pollQuestion,
          options: pollOptions.map((option) => ({ text: option })),
          settings: {
            voteSelectionType: 'SINGLE_VOTE',
            duration,
            isVoterVisibleToAuthor: true,
          },
        },
      },
    };
    const response = await this.fetcher(`${REST_BASE}/posts`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${token.accessToken}`,
        'content-type': 'application/json',
        'x-restli-protocol-version': '2.0.0',
        'linkedin-version': this.apiVersion,
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(20_000),
    });
    if (!response.ok) {
      const retryAfter = Number(response.headers.get('retry-after'));
      throw new LinkedInApiError(
        `LinkedIn poll creation failed with HTTP ${response.status}`,
        response.status,
        Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter : undefined
      );
    }
    const id = response.headers.get('x-restli-id');
    if (!id) {
      throw new Error('LinkedIn accepted the poll but did not return a post ID');
    }
    return { id, status: response.status };
  }

  async publishOrganizationTextPost(
    token: LinkedInTokenSet,
    organizationUrn: string,
    commentary: string
  ): Promise<{ id: string; status: number }> {
    if (!token.grantedScopes.includes(LINKEDIN_ORGANIZATION_WRITE_SCOPE)) {
      throw new Error(
        'LinkedIn organization publishing is not authorized: w_organization_social scope is missing'
      );
    }
    assertUrn(organizationUrn, 'organization');
    return this.createTextPost(token, organizationUrn, commentary);
  }

  async publishOrganizationImagePost(
    token: LinkedInTokenSet,
    organizationUrn: string,
    commentary: string,
    imageUrn: string,
    altText: string
  ): Promise<{ id: string; status: number }> {
    assertToken(token);
    if (!token.grantedScopes.includes(LINKEDIN_ORGANIZATION_WRITE_SCOPE)) {
      throw new Error(
        'LinkedIn organization image publishing is not authorized: w_organization_social scope is missing'
      );
    }
    assertUrn(organizationUrn, 'organization');

    const text = commentary.trim();
    const imageId = imageUrn.trim();
    const alternativeText = altText.trim();
    if (!text || text.length > 3000) {
      throw new Error('Image post commentary must contain 1–3000 characters');
    }
    if (!/^urn:li:image:[A-Za-z0-9_-]+$/.test(imageId)) {
      throw new Error('Invalid LinkedIn image asset URN');
    }
    if (!alternativeText || alternativeText.length > 120) {
      throw new Error('Image alt text must contain 1–120 characters');
    }

    // A write grant is not treated as proof that processing has finished. Verify the
    // exact asset, its owner and its AVAILABLE state before creating a public post.
    const imageResponse = await this.fetcher(
      `${REST_BASE}/images/${encodeURIComponent(imageId)}`,
      {
        method: 'GET',
        headers: {
          authorization: `Bearer ${token.accessToken}`,
          'x-restli-protocol-version': '2.0.0',
          'linkedin-version': this.apiVersion,
        },
        signal: AbortSignal.timeout(20_000),
      }
    );
    if (!imageResponse.ok) {
      const retryAfter = Number(imageResponse.headers.get('retry-after'));
      throw new LinkedInApiError(
        `LinkedIn image status check failed with HTTP ${imageResponse.status}`,
        imageResponse.status,
        Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter : undefined
      );
    }

    let image: unknown;
    try {
      image = await imageResponse.json();
    } catch {
      throw new Error('LinkedIn returned an invalid image asset status response');
    }
    if (!image || typeof image !== 'object' || Array.isArray(image)) {
      throw new Error('LinkedIn returned an invalid image asset status response');
    }
    const imageRecord = image as Record<string, unknown>;
    if (imageRecord.owner !== organizationUrn) {
      throw new LinkedInApiError(
        'LinkedIn image asset owner does not match the organization',
        403
      );
    }
    if (imageRecord.status !== 'AVAILABLE') {
      const currentStatus =
        typeof imageRecord.status === 'string' ? imageRecord.status : 'unknown';
      throw new Error(
        `LinkedIn image asset is not AVAILABLE (current status: ${currentStatus})`
      );
    }

    const response = await this.fetcher(`${REST_BASE}/posts`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${token.accessToken}`,
        'content-type': 'application/json',
        'x-restli-protocol-version': '2.0.0',
        'linkedin-version': this.apiVersion,
      },
      body: JSON.stringify({
        ...createPostPayload(organizationUrn, text),
        content: {
          media: {
            id: imageId,
            altText: alternativeText,
          },
        },
      }),
      signal: AbortSignal.timeout(20_000),
    });

    if (!response.ok) {
      const retryAfter = Number(response.headers.get('retry-after'));
      throw new LinkedInApiError(
        `LinkedIn image post creation failed with HTTP ${response.status}`,
        response.status,
        Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter : undefined
      );
    }
    const id = response.headers.get('x-restli-id');
    if (!id) {
      throw new Error('LinkedIn accepted the image post but did not return a post ID');
    }
    return { id, status: response.status };
  }

  async createMemberComment(
    token: LinkedInTokenSet,
    targetPostUrn: string,
    objectUrn: string,
    commentary: string
  ): Promise<{ id: string; status: number }> {
    assertToken(token);
    if (!token.grantedScopes.includes(LINKEDIN_MEMBER_SOCIAL_WRITE_SCOPE)) {
      throw new Error(
        'LinkedIn commenting is not authorized: w_member_social_feed scope is missing'
      );
    }
    if (!/^urn:li:(?:share|ugcPost):[A-Za-z0-9_-]+$/.test(targetPostUrn)) {
      throw new Error('Invalid LinkedIn comment target URN');
    }
    if (!/^urn:li:activity:[A-Za-z0-9_-]+$/.test(objectUrn)) {
      throw new Error('Invalid LinkedIn comment object activity URN');
    }
    const text = commentary.trim();
    if (!text || text.length > 3000) {
      throw new Error('Comment text must contain 1–3000 characters');
    }

    const response = await this.fetcher(
      `${REST_BASE}/socialActions/${encodeURIComponent(targetPostUrn)}/comments`,
      {
        method: 'POST',
        headers: {
          authorization: `Bearer ${token.accessToken}`,
          'content-type': 'application/json',
          'x-restli-protocol-version': '2.0.0',
          'linkedin-version': this.apiVersion,
        },
        body: JSON.stringify({
          actor: `urn:li:person:${token.memberId}`,
          object: objectUrn,
          message: { text },
        }),
        signal: AbortSignal.timeout(20_000),
      }
    );
    if (!response.ok) {
      const retryAfter = Number(response.headers.get('retry-after'));
      throw new LinkedInApiError(
        `LinkedIn comment creation failed with HTTP ${response.status}`,
        response.status,
        Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter : undefined
      );
    }
    const id = response.headers.get('x-restli-id');
    if (!id) {
      throw new Error('LinkedIn accepted the comment but did not return a comment ID');
    }
    return { id, status: response.status };
  }

  async createMemberReaction(
    token: LinkedInTokenSet,
    rootUrn: string,
    reactionType: 'LIKE' | 'PRAISE' | 'EMPATHY' | 'INTEREST' | 'APPRECIATION' | 'ENTERTAINMENT'
  ): Promise<{ status: number }> {
    assertToken(token);
    if (!token.grantedScopes.includes(LINKEDIN_MEMBER_SOCIAL_WRITE_SCOPE)) {
      throw new Error(
        'LinkedIn reactions are not authorized: w_member_social_feed scope is missing'
      );
    }
    if (!/^urn:li:(?:share|ugcPost|activity):[A-Za-z0-9_-]+$/.test(rootUrn)) {
      throw new Error('Invalid LinkedIn reaction root URN');
    }

    const url = new URL(`${REST_BASE}/reactions`);
    url.searchParams.set('actor', `urn:li:person:${token.memberId}`);
    const response = await this.fetcher(url.toString(), {
      method: 'POST',
      headers: {
        authorization: `Bearer ${token.accessToken}`,
        'content-type': 'application/json',
        'x-restli-protocol-version': '2.0.0',
        'linkedin-version': this.apiVersion,
      },
      body: JSON.stringify({ root: rootUrn, reactionType }),
      signal: AbortSignal.timeout(20_000),
    });
    if (!response.ok) {
      const retryAfter = Number(response.headers.get('retry-after'));
      throw new LinkedInApiError(
        `LinkedIn reaction creation failed with HTTP ${response.status}`,
        response.status,
        Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter : undefined
      );
    }
    return { status: response.status };
  }

  async createOrganizationComment(
    token: LinkedInTokenSet,
    organizationUrn: string,
    targetPostUrn: string,
    objectUrn: string,
    commentary: string
  ): Promise<{ id: string; status: number }> {
    assertToken(token);
    if (!token.grantedScopes.includes(LINKEDIN_ORGANIZATION_SOCIAL_WRITE_SCOPE)) {
      throw new Error(
        'LinkedIn organization commenting is not authorized: w_organization_social_feed scope is missing'
      );
    }
    assertUrn(organizationUrn, 'organization');
    if (!/^urn:li:(?:share|ugcPost):[A-Za-z0-9_-]+$/.test(targetPostUrn)) {
      throw new Error('Invalid LinkedIn comment target URN');
    }
    if (!/^urn:li:activity:[A-Za-z0-9_-]+$/.test(objectUrn)) {
      throw new Error('Invalid LinkedIn comment object activity URN');
    }
    const text = commentary.trim();
    if (!text || text.length > 3000) {
      throw new Error('Comment text must contain 1–3000 characters');
    }

    const response = await this.fetcher(
      `${REST_BASE}/socialActions/${encodeURIComponent(targetPostUrn)}/comments`,
      {
        method: 'POST',
        headers: {
          authorization: `Bearer ${token.accessToken}`,
          'content-type': 'application/json',
          'x-restli-protocol-version': '2.0.0',
          'linkedin-version': this.apiVersion,
        },
        body: JSON.stringify({
          actor: organizationUrn,
          object: objectUrn,
          message: { text },
        }),
        signal: AbortSignal.timeout(20_000),
      }
    );
    if (!response.ok) {
      const retryAfter = Number(response.headers.get('retry-after'));
      throw new LinkedInApiError(
        `LinkedIn organization comment creation failed with HTTP ${response.status}`,
        response.status,
        Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter : undefined
      );
    }
    const id = response.headers.get('x-restli-id');
    if (!id) {
      throw new Error('LinkedIn accepted the organization comment but returned no comment ID');
    }
    return { id, status: response.status };
  }

  async createOrganizationReaction(
    token: LinkedInTokenSet,
    organizationUrn: string,
    rootUrn: string,
    reactionType: 'LIKE' | 'PRAISE' | 'EMPATHY' | 'INTEREST' | 'APPRECIATION' | 'ENTERTAINMENT'
  ): Promise<{ status: number }> {
    assertToken(token);
    if (!token.grantedScopes.includes(LINKEDIN_ORGANIZATION_SOCIAL_WRITE_SCOPE)) {
      throw new Error(
        'LinkedIn organization reactions are not authorized: w_organization_social_feed scope is missing'
      );
    }
    assertUrn(organizationUrn, 'organization');
    if (!/^urn:li:(?:share|ugcPost|activity):[A-Za-z0-9_-]+$/.test(rootUrn)) {
      throw new Error('Invalid LinkedIn reaction root URN');
    }

    const url = new URL(`${REST_BASE}/reactions`);
    url.searchParams.set('actor', organizationUrn);
    const response = await this.fetcher(url.toString(), {
      method: 'POST',
      headers: {
        authorization: `Bearer ${token.accessToken}`,
        'content-type': 'application/json',
        'x-restli-protocol-version': '2.0.0',
        'linkedin-version': this.apiVersion,
      },
      body: JSON.stringify({ root: rootUrn, reactionType }),
      signal: AbortSignal.timeout(20_000),
    });
    if (!response.ok) {
      const retryAfter = Number(response.headers.get('retry-after'));
      throw new LinkedInApiError(
        `LinkedIn organization reaction creation failed with HTTP ${response.status}`,
        response.status,
        Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter : undefined
      );
    }
    return { status: response.status };
  }

  async deleteOrganizationReaction(
    token: LinkedInTokenSet,
    organizationUrn: string,
    entityUrn: string
  ): Promise<{ status: number }> {
    assertToken(token);
    if (!token.grantedScopes.includes(LINKEDIN_ORGANIZATION_SOCIAL_WRITE_SCOPE)) {
      throw new Error(
        'LinkedIn organization reactions are not authorized: w_organization_social_feed scope is missing'
      );
    }
    assertUrn(organizationUrn, 'organization');
    if (!/^urn:li:(?:share|ugcPost):[A-Za-z0-9_-]+$/.test(entityUrn)) {
      throw new Error('Invalid LinkedIn reaction entity URN');
    }
    const actor = encodeURIComponent(organizationUrn);
    const entity = encodeURIComponent(entityUrn);
    const response = await this.fetcher(
      `${REST_BASE}/reactions/(actor:${actor},entity:${entity})`,
      {
        method: 'DELETE',
        headers: {
          authorization: `Bearer ${token.accessToken}`,
          'x-restli-protocol-version': '2.0.0',
          'linkedin-version': this.apiVersion,
        },
        signal: AbortSignal.timeout(20_000),
      }
    );
    if (!response.ok) {
      const retryAfter = Number(response.headers.get('retry-after'));
      throw new LinkedInApiError(
        `LinkedIn organization reaction deletion failed with HTTP ${response.status}`,
        response.status,
        Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter : undefined
      );
    }
    return { status: response.status };
  }

  async deleteMemberReaction(
    token: LinkedInTokenSet,
    entityUrn: string
  ): Promise<{ status: number }> {
    assertToken(token);
    if (!token.grantedScopes.includes(LINKEDIN_MEMBER_SOCIAL_WRITE_SCOPE)) {
      throw new Error(
        'LinkedIn reactions are not authorized: w_member_social_feed scope is missing'
      );
    }
    if (!/^urn:li:(?:share|ugcPost):[A-Za-z0-9_-]+$/.test(entityUrn)) {
      throw new Error('Invalid LinkedIn reaction entity URN');
    }
    const actor = encodeURIComponent(`urn:li:person:${token.memberId}`);
    const entity = encodeURIComponent(entityUrn);
    const response = await this.fetcher(
      `${REST_BASE}/reactions/(actor:${actor},entity:${entity})`,
      {
        method: 'DELETE',
        headers: {
          authorization: `Bearer ${token.accessToken}`,
          'x-restli-protocol-version': '2.0.0',
          'linkedin-version': this.apiVersion,
        },
        signal: AbortSignal.timeout(20_000),
      }
    );
    if (!response.ok) {
      const retryAfter = Number(response.headers.get('retry-after'));
      throw new LinkedInApiError(
        `LinkedIn reaction deletion failed with HTTP ${response.status}`,
        response.status,
        Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter : undefined
      );
    }
    return { status: response.status };
  }
}
