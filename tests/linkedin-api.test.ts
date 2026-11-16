import { describe, expect, it, vi } from 'vitest';
import { LinkedInApiClient, getLinkedInCapabilities } from '../apps/api/src/linkedin/client';
import { LinkedInOAuthService } from '../apps/api/src/linkedin/oauth';
import type {
  LinkedInOAuthState,
  LinkedInOAuthStateStore,
  LinkedInTokenSet,
  LinkedInTokenVault,
} from '../apps/api/src/linkedin/types';

const makeToken = (
  scopes: string[] = ['openid', 'profile', 'email', 'w_member_social']
): LinkedInTokenSet => ({
  accessToken: 'test-access-token',
  memberId: 'abc123',
  expiresAt: Date.now() + 60_000,
  grantedScopes: scopes,
  tokenType: 'Bearer',
});

class MemoryStates implements LinkedInOAuthStateStore {
  values = new Map<string, LinkedInOAuthState>();

  async save(value: LinkedInOAuthState) {
    this.values.set(value.state, value);
  }

  async consume(
    state: string,
    identity: { tenantId: string; subject: string }
  ): Promise<LinkedInOAuthState | null> {
    const value = this.values.get(state) ?? null;
    this.values.delete(state);
    if (
      !value ||
      value.identity.tenantId !== identity.tenantId ||
      value.identity.subject !== identity.subject
    ) {
      if (value) this.values.set(state, value);
      return null;
    }
    return value;
  }

  async consumeCallback(state: string): Promise<LinkedInOAuthState | null> {
    const value = this.values.get(state) ?? null;
    this.values.delete(state);
    return value;
  }
}

class MemoryTokens implements LinkedInTokenVault {
  value: LinkedInTokenSet | null = null;

  async put(_identity: { tenantId: string; subject: string }, value: LinkedInTokenSet) {
    this.value = value;
  }

  async get(): Promise<LinkedInTokenSet | null> {
    return this.value;
  }

  async delete() {
    this.value = null;
  }
}

describe('LinkedIn API client', () => {
  it('publishes a member text post using the current versioned REST API', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(null, {
        status: 201,
        headers: { 'x-restli-id': 'urn:li:share:123' },
      })
    );
    const client = new LinkedInApiClient({ fetcher });
    const result = await client.publishMemberTextPost(
      makeToken(),
      'urn:li:person:abc123',
      'Hello network'
    );

    expect(result).toEqual({ id: 'urn:li:share:123', status: 201 });
    const [url, init] = fetcher.mock.calls[0];
    expect(url).toBe('https://api.linkedin.com/rest/posts');
    expect(new Headers(init?.headers).get('linkedin-version')).toBe('202610');
    expect(JSON.parse(String(init?.body))).toMatchObject({
      author: 'urn:li:person:abc123',
      commentary: 'Hello network',
      lifecycleState: 'PUBLISHED',
    });
  });

  it('fails closed when the member write scope is absent', async () => {
    const fetcher = vi.fn<typeof fetch>();
    const client = new LinkedInApiClient({ fetcher });

    await expect(
      client.publishMemberTextPost(makeToken(['openid', 'profile']), 'urn:li:person:abc', 'Hi')
    ).rejects.toThrow('w_member_social');
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('rejects expired tokens and malformed author URNs', async () => {
    const client = new LinkedInApiClient({ fetcher: vi.fn<typeof fetch>() });

    await expect(
      client.publishMemberTextPost({ ...makeToken(), expiresAt: 0 }, 'urn:li:person:abc', 'Hi')
    ).rejects.toThrow('expired');
    await expect(
      client.publishMemberTextPost(makeToken(), 'urn:li:organization:42', 'Hi')
    ).rejects.toThrow('author URN');
  });

  it('creates a member comment only with the Community Management write scope', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(null, {
        status: 201,
        headers: { 'x-restli-id': 'comment-123' },
      })
    );
    const client = new LinkedInApiClient({ fetcher });
    const token = makeToken(['openid', 'profile', 'w_member_social_feed']);
    const result = await client.createMemberComment(
      token,
      'urn:li:ugcPost:12345',
      'urn:li:activity:12345',
      'A useful comment'
    );

    expect(result).toEqual({ id: 'comment-123', status: 201 });
    const [url, init] = fetcher.mock.calls[0];
    expect(url).toBe(
      'https://api.linkedin.com/rest/socialActions/urn%3Ali%3AugcPost%3A12345/comments'
    );
    expect(JSON.parse(String(init?.body))).toMatchObject({
      actor: 'urn:li:person:abc123',
      object: 'urn:li:activity:12345',
      message: { text: 'A useful comment' },
    });
  });

  it('creates and deletes reactions through the versioned Reactions API', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(null, { status: 201 }))
      .mockResolvedValueOnce(new Response(null, { status: 204 }));
    const client = new LinkedInApiClient({ fetcher });
    const token = makeToken(['openid', 'profile', 'w_member_social_feed']);

    await expect(
      client.createMemberReaction(token, 'urn:li:activity:12345', 'PRAISE')
    ).resolves.toEqual({ status: 201 });
    await expect(client.deleteMemberReaction(token, 'urn:li:ugcPost:12345')).resolves.toEqual({
      status: 204,
    });

    expect(fetcher.mock.calls[0][0]).toBe(
      'https://api.linkedin.com/rest/reactions?actor=urn%3Ali%3Aperson%3Aabc123'
    );
    expect(JSON.parse(String(fetcher.mock.calls[0][1]?.body))).toEqual({
      root: 'urn:li:activity:12345',
      reactionType: 'PRAISE',
    });
    expect(fetcher.mock.calls[1][0]).toContain('/reactions/(actor:urn%3Ali%3Aperson%3Aabc123');
  });

  it('does not attempt comments or reactions without w_member_social_feed', async () => {
    const fetcher = vi.fn<typeof fetch>();
    const client = new LinkedInApiClient({ fetcher });
    const token = makeToken(['openid', 'profile', 'w_member_social']);

    await expect(
      client.createMemberComment(token, 'urn:li:ugcPost:12345', 'urn:li:activity:12345', 'Comment')
    ).rejects.toThrow('w_member_social_feed');
    await expect(
      client.createMemberReaction(token, 'urn:li:activity:12345', 'LIKE')
    ).rejects.toThrow('w_member_social_feed');
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('reports partner-only features as unavailable rather than pretending to execute them', () => {
    const capabilities = getLinkedInCapabilities(makeToken(), {
      invitationsApiApproved: false,
      messagesApiApproved: false,
    });

    expect(capabilities.find((item) => item.id === 'connection_invitations')?.status).toBe(
      'needs_partner_approval'
    );
    expect(capabilities.find((item) => item.id === 'direct_messages')?.status).toBe(
      'needs_partner_approval'
    );
  });
});

describe('LinkedIn OAuth service', () => {
  it('creates a state-bound authorization URL and stores tokens after callback', async () => {
    const states = new MemoryStates();
    const tokens = new MemoryTokens();
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            access_token: 'access-token',
            expires_in: 3600,
            scope: 'openid profile email w_member_social',
          }),
          { status: 200, headers: { 'content-type': 'application/json' } }
        )
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ sub: 'abc123', name: 'Test User' }), { status: 200 })
      );
    const service = new LinkedInOAuthService(
      {
        clientId: 'client-id',
        clientSecret: 'client-secret',
        redirectUri: 'https://careerops.example.com/oauth/linkedin/callback',
        fetcher,
      },
      states,
      tokens
    );
    const identity = { tenantId: 'tenant-1', subject: 'member-1' };
    const url = new URL(await service.createAuthorizationUrl(identity));

    expect(url.origin + url.pathname).toBe('https://www.linkedin.com/oauth/v2/authorization');
    const state = url.searchParams.get('state')!;
    const result = await service.completeAuthorization({ code: 'one-time-code', state, identity });

    expect(result.connected).toBe(true);
    expect(result.scopes).toContain('w_member_social');
    expect(tokens.value?.accessToken).toBe('access-token');
    expect(tokens.value?.memberId).toBe('abc123');
    await expect(
      service.completeAuthorization({ code: 'replay', state, identity })
    ).rejects.toThrow('invalid, expired, or already used');
  });

  it('completes the public OAuth callback from one-time state without renderer credentials', async () => {
    const states = new MemoryStates();
    const tokens = new MemoryTokens();
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            access_token: 'callback-access-token',
            expires_in: 3600,
            scope: 'openid profile email w_member_social',
          }),
          { status: 200 }
        )
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ sub: 'callback-member' }), { status: 200 })
      );
    const service = new LinkedInOAuthService(
      {
        clientId: 'client-id',
        clientSecret: 'client-secret',
        redirectUri: 'https://careerops.example.com/oauth/linkedin/callback',
        fetcher,
      },
      states,
      tokens
    );
    const identity = { tenantId: 'tenant-bound', subject: 'user-bound' };
    const authorizeUrl = new URL(await service.createAuthorizationUrl(identity));
    const state = authorizeUrl.searchParams.get('state')!;

    const result = await service.completeAuthorizationCallback({ code: 'callback-code', state });

    expect(result.connected).toBe(true);
    expect(tokens.value?.memberId).toBe('callback-member');
    expect(tokens.value?.accessToken).toBe('callback-access-token');
    expect(fetcher).toHaveBeenCalledTimes(2);
    await expect(
      service.completeAuthorizationCallback({ code: 'replay-code', state })
    ).rejects.toThrow('invalid, expired, or already used');
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it('consumes an OAuth denial callback and cannot replay it', async () => {
    const states = new MemoryStates();
    const service = new LinkedInOAuthService(
      {
        clientId: 'client-id',
        clientSecret: 'client-secret',
        redirectUri: 'https://careerops.example.com/oauth/linkedin/callback',
        fetcher: vi.fn<typeof fetch>(),
      },
      states,
      new MemoryTokens()
    );
    const url = new URL(
      await service.createAuthorizationUrl({ tenantId: 'tenant-1', subject: 'member-1' })
    );
    const state = url.searchParams.get('state')!;
    await expect(service.cancelAuthorizationCallback(state)).resolves.toBe(true);
    await expect(service.cancelAuthorizationCallback(state)).resolves.toBe(false);
  });

  it('rejects OAuth state replay across members', async () => {
    const states = new MemoryStates();
    const service = new LinkedInOAuthService(
      {
        clientId: 'client-id',
        clientSecret: 'client-secret',
        redirectUri: 'https://careerops.example.com/oauth/linkedin/callback',
        fetcher: vi.fn<typeof fetch>(),
      },
      states,
      new MemoryTokens()
    );
    await service.createAuthorizationUrl({ tenantId: 'tenant-1', subject: 'member-1' });
    const state = [...states.values.keys()][0];

    await expect(
      service.completeAuthorization({
        code: 'code',
        state,
        identity: { tenantId: 'tenant-1', subject: 'member-2' },
      })
    ).rejects.toThrow('invalid, expired, or already used');
  });

  it('does not persist token responses without explicit granted scopes', async () => {
    const tokens = new MemoryTokens();
    const states = new MemoryStates();
    const service = new LinkedInOAuthService(
      {
        clientId: 'client-id',
        clientSecret: 'client-secret',
        redirectUri: 'https://careerops.example.com/oauth/linkedin/callback',
        fetcher: vi.fn<typeof fetch>().mockResolvedValue(
          new Response(JSON.stringify({ access_token: 'token', expires_in: 3600 }), {
            status: 200,
          })
        ),
      },
      states,
      tokens
    );
    const identity = { tenantId: 'tenant-1', subject: 'member-1' };
    const url = new URL(await service.createAuthorizationUrl(identity));

    await expect(
      service.completeAuthorization({
        code: 'code',
        state: url.searchParams.get('state')!,
        identity,
      })
    ).rejects.toThrow('did not grant the required OpenID Connect scope');
    expect(tokens.value).toBeNull();
  });
});
