import { once } from 'node:events';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createCloudApiServer } from '../apps/api/src/server';
import type { CloudApiDependencies, LinkedInCloudIntegration } from '../apps/api/src/ports';
import type { LinkedInTokenSet } from '../apps/api/src/linkedin/types';
import type { LinkedInScheduledPostStore } from '../apps/api/src/linkedin/scheduled-posts';

const tenantId = '10000000-0000-4000-8000-000000000001';
const subject = 'candidate:linkedin-member';
const token: LinkedInTokenSet = {
  accessToken: 'server-side-access-token',
  memberId: 'member-urn-id',
  expiresAt: Date.now() + 60_000,
  grantedScopes: ['openid', 'profile', 'email', 'w_member_social'],
  tokenType: 'Bearer',
};

function makeIntegration() {
  return {
    oauth: {
      completeAuthorizationCallback: vi.fn(async () => ({
        connected: true as const,
        scopes: ['openid', 'profile', 'w_member_social'],
        expiresAt: Date.now() + 60_000,
      })),
      cancelAuthorizationCallback: vi.fn(async () => true),
      getValidToken: vi.fn(async () => token),
      disconnect: vi.fn(async () => undefined),
    },
    tokens: { get: vi.fn(async () => token) },
    api: {
      publishMemberTextPost: vi.fn(async () => ({ id: 'urn:li:share:published', status: 201 })),
      publishMemberPoll: vi.fn(async () => ({ id: 'urn:li:share:poll', status: 201 })),
      publishOrganizationImagePost: vi.fn(async () => ({
        id: 'urn:li:share:image-post',
        status: 201,
      })),
    },
    entitlements: {
      communityManagementApproved: false,
      communicationsApiApproved: false,
      invitationsApiApproved: false,
      messagesApiApproved: false,
    },
  } as unknown as LinkedInCloudIntegration & {
    oauth: {
      completeAuthorizationCallback: ReturnType<typeof vi.fn>;
      cancelAuthorizationCallback: ReturnType<typeof vi.fn>;
      getValidToken: ReturnType<typeof vi.fn>;
      disconnect: ReturnType<typeof vi.fn>;
    };
    api: {
      publishMemberTextPost: ReturnType<typeof vi.fn>;
      publishMemberPoll: ReturnType<typeof vi.fn>;
      publishOrganizationImagePost: ReturnType<typeof vi.fn>;
    };
  };
}

function makeDependencies(input?: {
  integration?: ReturnType<typeof makeIntegration>;
  globalKillSwitch?: boolean;
  pausedChannels?: string[];
  scheduler?: {
    list: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
    cancel: ReturnType<typeof vi.fn>;
  };
}) {
  const integration = input?.integration ?? makeIntegration();
  const recordLinkedInAction = vi.fn(async () => undefined);
  const dependencies: CloudApiDependencies = {
    config: {
      issuer: 'https://identity.example.test',
      audience: 'careerops-api',
      jwksUrl: 'https://identity.example.test/.well-known/jwks.json',
      consentSigningSecret: 'test-secret-that-is-long-enough-for-this-api-test',
    },
    identityVerifier: {
      verify: vi.fn(async () => ({
        subject,
        issuer: 'https://identity.example.test',
        audience: ['careerops-api'],
        expiresAt: 2_000_000_000,
      })),
    },
    rateLimiter: { consume: async () => true },
    repository: {
      findMembershipsBySubject: async () => [
        { tenantId, subject, role: 'owner', status: 'active' },
      ],
      checkReady: async () => undefined,
      getControlState: async () => ({
        tenantId,
        globalKillSwitch: input?.globalKillSwitch ?? false,
        pausedChannels: input?.pausedChannels ?? [],
        updatedAt: new Date().toISOString(),
      }),
      acceptSprintContract: async () => ({ id: 'contract-id', revision: 1 }),
      getActiveSprintContract: async () => null,
      revokeSprintContract: async () => undefined,
      setChannelPauseWithAudit: async () => undefined,
      setGlobalKillSwitchWithAudit: async () => undefined,
      recordLinkedInAction,
    },
    careerGraph: {
      createFact: vi.fn(),
      listFacts: vi.fn(async () => []),
      reviewFact: vi.fn(),
    },
    linkedin: integration,
    ...(input?.scheduler
      ? { linkedinScheduler: input.scheduler as unknown as LinkedInScheduledPostStore }
      : {}),
  };
  return { dependencies, integration, recordLinkedInAction };
}

describe('LinkedIn cloud API security boundaries', () => {
  let server: ReturnType<typeof createCloudApiServer> | undefined;
  let baseUrl = '';

  afterEach(async () => {
    if (server?.listening) {
      server.close();
      await once(server, 'close');
    }
    server = undefined;
  });

  async function start(input?: Parameters<typeof makeDependencies>[0]) {
    const setup = makeDependencies(input);
    server = createCloudApiServer(setup.dependencies);
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('Expected a TCP listener');
    baseUrl = 'http://127.0.0.1:' + address.port;
    return setup;
  }

  it('completes the public browser callback using state without a bearer token or tenant header', async () => {
    const { integration, dependencies } = await start();
    const state = 'A'.repeat(43);
    const response = await fetch(
      baseUrl + '/oauth/linkedin/callback?code=one-time-code&state=' + state
    );

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('text/html');
    expect(await response.text()).toContain('connected successfully');
    expect(integration.oauth.completeAuthorizationCallback).toHaveBeenCalledWith({
      code: 'one-time-code',
      state,
    });
    expect(dependencies.identityVerifier.verify).not.toHaveBeenCalled();
  });

  it('consumes a denied OAuth callback state without reflecting provider error text', async () => {
    const { integration } = await start();
    const state = 'B'.repeat(43);
    const response = await fetch(
      baseUrl +
        '/oauth/linkedin/callback?error=access_denied&error_description=' +
        encodeURIComponent('provider detail must not be reflected') +
        '&state=' +
        state
    );
    const html = await response.text();

    expect(response.status).toBe(200);
    expect(html).toContain('authorization was not completed');
    expect(html).not.toContain('provider detail must not be reflected');
    expect(integration.oauth.cancelAuthorizationCallback).toHaveBeenCalledWith(state);
  });

  it('does not publish when the LinkedIn channel is paused', async () => {
    const { integration, recordLinkedInAction } = await start({
      pausedChannels: ['linkedin_assist'],
    });
    const response = await fetch(baseUrl + '/v1/linkedin/posts', {
      method: 'POST',
      headers: {
        authorization: 'Bearer test-token',
        'content-type': 'application/json',
      },
      body: JSON.stringify({ commentary: 'A reviewed post draft' }),
    });

    expect(response.status).toBe(423);
    expect(await response.json()).toMatchObject({
      error: 'LinkedIn channel is paused for this tenant',
    });
    expect(integration.api.publishMemberTextPost).not.toHaveBeenCalled();
    expect(recordLinkedInAction).not.toHaveBeenCalled();
  });

  it('does not publish when the tenant-wide kill switch is enabled', async () => {
    const { integration, recordLinkedInAction } = await start({
      globalKillSwitch: true,
    });
    const response = await fetch(baseUrl + '/v1/linkedin/posts', {
      method: 'POST',
      headers: {
        authorization: 'Bearer test-token',
        'content-type': 'application/json',
      },
      body: JSON.stringify({ commentary: 'A reviewed post draft' }),
    });

    expect(response.status).toBe(423);
    expect(await response.json()).toMatchObject({
      error: 'LinkedIn writes are disabled by the global kill switch',
    });
    expect(integration.api.publishMemberTextPost).not.toHaveBeenCalled();
    expect(recordLinkedInAction).not.toHaveBeenCalled();
  });

  it('returns reconnect-required status when an expired token cannot be refreshed', async () => {
    const { integration } = await start();
    integration.tokens.get = vi.fn(async () => ({
      ...token,
      expiresAt: Date.now() - 60_000,
      refreshToken: undefined,
      refreshTokenExpiresAt: undefined,
    }));
    integration.oauth.getValidToken.mockRejectedValueOnce(
      new Error('LinkedIn access token expired; reconnect the account')
    );

    const response = await fetch(baseUrl + '/v1/linkedin/status', {
      headers: { authorization: 'Bearer test-token' },
    });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      connected: false,
      reauthorizationRequired: true,
      tokenRefreshError: true,
    });
    expect(
      body.capabilities.find((item: { id: string }) => item.id === 'member_post_publish').status
    ).not.toBe('available');
  });

  it('publishes a member poll only with member write scope and audit', async () => {
    const { integration, recordLinkedInAction } = await start();
    const response = await fetch(baseUrl + '/v1/linkedin/polls', {
      method: 'POST',
      headers: {
        authorization: 'Bearer test-token',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        commentary: 'Help us plan the next session.',
        question: 'Which topic should we cover?',
        options: ['Cloud security', 'PostgreSQL', 'Kubernetes'],
        duration: 'SEVEN_DAYS',
      }),
    });

    expect(response.status).toBe(201);
    expect(await response.json()).toMatchObject({
      postId: 'urn:li:share:poll',
      status: 201,
    });
    expect(recordLinkedInAction).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'linkedin.member.poll.publish.requested',
        tenantId,
        actorSubject: subject,
      })
    );
    expect(integration.api.publishMemberPoll).toHaveBeenCalledWith(
      token,
      'urn:li:person:member-urn-id',
      'Help us plan the next session.',
      'Which topic should we cover?',
      ['Cloud security', 'PostgreSQL', 'Kubernetes'],
      'SEVEN_DAYS'
    );
  });

  it('rejects invalid poll shape before writing an audit event or calling LinkedIn', async () => {
    const { integration, recordLinkedInAction } = await start();
    const response = await fetch(baseUrl + '/v1/linkedin/polls', {
      method: 'POST',
      headers: {
        authorization: 'Bearer test-token',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        commentary: 'Help us plan.',
        question: 'Pick one',
        options: ['Only one option'],
        duration: 'SEVEN_DAYS',
      }),
    });

    expect(response.status).toBe(400);
    expect(integration.api.publishMemberPoll).not.toHaveBeenCalled();
    expect(recordLinkedInAction).not.toHaveBeenCalled();
  });

  it('lists only the authenticated member tenant scheduled posts', async () => {
    const scheduledPost = {
      id: '11111111-1111-4111-8111-111111111111',
      tenantId,
      subject,
      commentary: 'Scheduled copy',
      scheduledAt: new Date(Date.now() + 5 * 60_000).toISOString(),
      status: 'scheduled',
    };
    const scheduler = {
      list: vi.fn(async () => [scheduledPost]),
      create: vi.fn(),
      cancel: vi.fn(),
    };
    const { dependencies } = await start({ scheduler });
    const response = await fetch(baseUrl + '/v1/linkedin/scheduled-posts?limit=20', {
      headers: { authorization: 'Bearer test-token' },
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ scheduledPosts: [scheduledPost] });
    expect(scheduler.list).toHaveBeenCalledWith(tenantId, subject, 20);
    expect(dependencies.identityVerifier.verify).toHaveBeenCalledWith('test-token');
  });

  it('schedules a member text post only with granted member publishing scope and audit', async () => {
    const scheduledPost = {
      id: '11111111-1111-4111-8111-111111111111',
      tenantId,
      subject,
      commentary: 'A reviewed scheduled post',
      scheduledAt: new Date(Date.now() + 10 * 60_000).toISOString(),
      status: 'scheduled',
    };
    const scheduler = {
      list: vi.fn(),
      create: vi.fn(async () => scheduledPost),
      cancel: vi.fn(),
    };
    const { recordLinkedInAction } = await start({ scheduler });
    const scheduledAt = new Date(Date.now() + 10 * 60_000).toISOString();
    const response = await fetch(baseUrl + '/v1/linkedin/scheduled-posts', {
      method: 'POST',
      headers: {
        authorization: 'Bearer test-token',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        commentary: 'A reviewed scheduled post',
        scheduledAt,
        idempotencyKey: 'schedule_key_1234',
      }),
    });

    expect(response.status).toBe(201);
    expect(await response.json()).toMatchObject({ scheduledPost });
    expect(scheduler.create).toHaveBeenCalledWith({
      tenantId,
      subject,
      commentary: 'A reviewed scheduled post',
      scheduledAt: expect.any(String),
      idempotencyKey: 'schedule_key_1234',
    });
    expect(recordLinkedInAction).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'linkedin.member.post.schedule.requested',
        tenantId,
        actorSubject: subject,
      })
    );
  });

  it('does not create a scheduled post while LinkedIn is paused for the tenant', async () => {
    const scheduler = {
      list: vi.fn(),
      create: vi.fn(),
      cancel: vi.fn(),
    };
    const { recordLinkedInAction } = await start({
      scheduler,
      pausedChannels: ['linkedin_assist'],
    });
    const response = await fetch(baseUrl + '/v1/linkedin/scheduled-posts', {
      method: 'POST',
      headers: {
        authorization: 'Bearer test-token',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        commentary: 'A reviewed scheduled post',
        scheduledAt: new Date(Date.now() + 10 * 60_000).toISOString(),
        idempotencyKey: 'schedule_key_1234',
      }),
    });

    expect(response.status).toBe(423);
    expect(scheduler.create).not.toHaveBeenCalled();
    expect(recordLinkedInAction).not.toHaveBeenCalled();
  });

  it('audits a scheduled-post cancellation before changing queue state', async () => {
    const scheduler = {
      list: vi.fn(),
      create: vi.fn(),
      cancel: vi.fn(async () => true),
    };
    const { recordLinkedInAction } = await start({ scheduler });
    const id = '11111111-1111-4111-8111-111111111111';
    const response = await fetch(baseUrl + '/v1/linkedin/scheduled-posts/' + id, {
      method: 'DELETE',
      headers: { authorization: 'Bearer test-token' },
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ cancelled: true });
    expect(recordLinkedInAction).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'linkedin.member.post.schedule.cancel.requested',
        tenantId,
        actorSubject: subject,
        entityId: id,
      })
    );
    expect(recordLinkedInAction.mock.invocationCallOrder[0]).toBeLessThan(
      scheduler.cancel.mock.invocationCallOrder[0]
    );
    expect(scheduler.cancel).toHaveBeenCalledWith(tenantId, subject, id);
  });

  it('publishes an organization image only after Community Management approval and audits it', async () => {
    const { integration, recordLinkedInAction } = await start();
    integration.entitlements.communityManagementApproved = true;
    const authorizedToken = {
      ...token,
      grantedScopes: [...token.grantedScopes, 'w_organization_social'],
    };
    integration.oauth.getValidToken.mockResolvedValueOnce(authorizedToken);
    const response = await fetch(baseUrl + '/v1/linkedin/organization/image-posts', {
      method: 'POST',
      headers: {
        authorization: 'Bearer test-token',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        organizationUrn: 'urn:li:organization:12345',
        commentary: 'A reviewed image post',
        imageUrn: 'urn:li:image:asset_123',
        altText: 'A team working on a prototype',
      }),
    });

    expect(response.status).toBe(201);
    expect(await response.json()).toMatchObject({ postId: 'urn:li:share:image-post' });
    expect(integration.api.publishOrganizationImagePost).toHaveBeenCalledWith(
      authorizedToken,
      'urn:li:organization:12345',
      'A reviewed image post',
      'urn:li:image:asset_123',
      'A team working on a prototype'
    );
    expect(recordLinkedInAction).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'linkedin.organization.image_post.publish.requested',
        entityId: 'urn:li:image:asset_123',
        tenantId,
        actorSubject: subject,
      })
    );
  });

  it('rejects organization image posts without product approval or with an unready asset', async () => {
    const { integration } = await start();
    const body = {
      organizationUrn: 'urn:li:organization:12345',
      commentary: 'A reviewed image post',
      imageUrn: 'urn:li:image:asset_123',
      altText: 'A useful image',
    };
    const denied = await fetch(baseUrl + '/v1/linkedin/organization/image-posts', {
      method: 'POST',
      headers: {
        authorization: 'Bearer test-token',
        'content-type': 'application/json',
      },
      body: JSON.stringify(body),
    });
    expect(denied.status).toBe(403);
    expect(integration.api.publishOrganizationImagePost).not.toHaveBeenCalled();

    integration.entitlements.communityManagementApproved = true;
    const noScope = await fetch(baseUrl + '/v1/linkedin/organization/image-posts', {
      method: 'POST',
      headers: {
        authorization: 'Bearer test-token',
        'content-type': 'application/json',
      },
      body: JSON.stringify(body),
    });
    expect(noScope.status).toBe(403);
    expect(await noScope.json()).toMatchObject({
      error: 'LinkedIn organization image publishing requires the w_organization_social scope',
    });
    expect(integration.api.publishOrganizationImagePost).not.toHaveBeenCalled();

    integration.api.publishOrganizationImagePost.mockRejectedValueOnce(
      new Error('LinkedIn image asset is not AVAILABLE (current status: PROCESSING)')
    );
    const authorizedToken = {
      ...token,
      grantedScopes: [...token.grantedScopes, 'w_organization_social'],
    };
    integration.oauth.getValidToken.mockResolvedValueOnce(authorizedToken);
    const processing = await fetch(baseUrl + '/v1/linkedin/organization/image-posts', {
      method: 'POST',
      headers: {
        authorization: 'Bearer test-token',
        'content-type': 'application/json',
      },
      body: JSON.stringify(body),
    });
    expect(processing.status).toBe(409);
    expect(await processing.json()).toMatchObject({
      error: 'LinkedIn image asset is not AVAILABLE (current status: PROCESSING)',
    });
  });

  it('audits and then executes a member post when the channel is enabled', async () => {
    const { integration, recordLinkedInAction } = await start();
    const response = await fetch(baseUrl + '/v1/linkedin/posts', {
      method: 'POST',
      headers: {
        authorization: 'Bearer test-token',
        'content-type': 'application/json',
      },
      body: JSON.stringify({ commentary: 'A reviewed post draft' }),
    });

    expect(response.status).toBe(201);
    expect(await response.json()).toMatchObject({ postId: 'urn:li:share:published' });
    expect(recordLinkedInAction).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId,
        actorSubject: subject,
        action: 'linkedin.member.post.publish.requested',
      })
    );
    expect(integration.api.publishMemberTextPost).toHaveBeenCalledWith(
      token,
      'urn:li:person:member-urn-id',
      'A reviewed post draft'
    );
  });
});
