import { describe, expect, it, vi } from 'vitest';
import { LinkedInApiClient, getLinkedInCapabilities } from '../apps/api/src/linkedin/client';
import { LinkedInOAuthService } from '../apps/api/src/linkedin/oauth';
import type {
  LinkedInOAuthState,
  LinkedInOAuthStateStore,
  LinkedInTokenSet,
  LinkedInTokenVault,
} from '../apps/api/src/linkedin/types';

const makeToken = (scopes: string[] = ['openid', 'profile', 'email', 'w_member_social']): LinkedInTokenSet => ({
  accessToken: 'test-access-token',
  memberId: 'abc123',
  expiresAt: Date.now() + 60_000,
  grantedScopes: scopes,
  tokenType: 'Bearer',
});

class MemoryStates implements LinkedInOAuthStateStore {
  values = new Map<string, LinkedInOAuthState>();
  async save(value: LinkedInOAuthState) { this.values.set(value.state, value); }
  async consume(state: string, identity: { tenantId: string; subject: string }) {
    const value = this.values.get(state) ?? null;
    this.values.delete(state);
    if (!value || value.identity.tenantId !== identity.tenantId || value.identity.subject !== identity.subject) return null;
    return value;
  }
}

class MemoryTokens implements LinkedInTokenVault {
  value: LinkedInTokenSet | null = null;
  async put(_identity: { tenantId: string; subject: string }, value: LinkedInTokenSet) { this.value = value; }
  async get() { return this.value; }
  async delete() { this.value = null; }
}

describe('LinkedIn API client', () => {
  it('publishes a member text post using the current versioned REST API', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(null, { status: 201, headers: { 'x-restli-id': 'urn:li:share:123' } })
    );
    const client = new LinkedInApiClient({ fetcher });
    const result = await client.publishMemberTextPost(makeToken(), 'urn:li:person:abc123', 'Hello network');
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
    await expect(client.publishMemberTextPost(makeToken(['openid', 'profile']), 'urn:li:person:abc', 'Hi'))
      .rejects.toThrow('w_member_social');
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('rejects expired tokens and malformed author URNs', async () => {
    const client = new LinkedInApiClient({ fetcher: vi.fn<typeof fetch>() });
    await expect(client.publishMemberTextPost({ ...makeToken(), expiresAt: 0 }, 'urn:li:person:abc', 'Hi'))
      .rejects.toThrow('expired');
    await expect(client.publishMemberTextPost(makeToken(), 'urn:li:organization:42', 'Hi'))
      .rejects.toThrow('author URN');
  });

  it('reports partner-only features as unavailable rather than pretending to execute them', () => {
    const capabilities = getLinkedInCapabilities(makeToken(), {
      invitationsApiApproved: false,
      messagesApiApproved: false,
    });
    expect(capabilities.find((item) => item.id === 'connection_invitations')?.status).toBe('needs_partner_approval');
    expect(capabilities.find((item) => item.id === 'direct_messages')?.status).toBe('needs_partner_approval');
  });
});

describe('LinkedIn OAuth service', () => {
  it('creates a state-bound authorization URL and stores tokens after callback', async () => {
    const states = new MemoryStates();
    const tokens = new MemoryTokens();
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify({
        access_token: 'access-token',
        expires_in: 3600,
        scope: 'openid profile email w_member_social',
      }), { status: 200, headers: { 'content-type': 'application/json' } }),
      new Response(JSON.stringify({ sub: 'abc123', name: 'Test User' }), { status: 200 })
    );
    const service = new LinkedInOAuthService({
      clientId: 'client-id',
      clientSecret: 'client-secret',
      redirectUri: 'https://careerops.example.com/oauth/linkedin/callback',
      fetcher,
    }, states, tokens);
    const identity = { tenantId: 'tenant-1', subject: 'member-1' };
    const url = new URL(await service.createAuthorizationUrl(identity));
    expect(url.origin + url.pathname).toBe('https://www.linkedin.com/oauth/v2/authorization');
    const state = url.searchParams.get('state')!;
    const result = await service.completeAuthorization({ code: 'one-time-code', state, identity });
    expect(result.connected).toBe(true);
    expect(result.scopes).toContain('w_member_social');
    expect(tokens.value?.accessToken).toBe('access-token');
    expect(tokens.value?.memberId).toBe('abc123');
    await expect(service.completeAuthorization({ code: 'replay', state, identity }))
      .rejects.toThrow('invalid, expired, or already used');
  });

  it('rejects OAuth state replay across members', async () => {
    const states = new MemoryStates();
    const service = new LinkedInOAuthService({
      clientId: 'client-id',
      clientSecret: 'client-secret',
      redirectUri: 'https://careerops.example.com/oauth/linkedin/callback',
      fetcher: vi.fn<typeof fetch>(),
    }, states, new MemoryTokens());
    await service.createAuthorizationUrl({ tenantId: 'tenant-1', subject: 'member-1' });
    const state = [...states.values.keys()][0];
    await expect(service.completeAuthorization({
      code: 'code',
      state,
      identity: { tenantId: 'tenant-1', subject: 'member-2' },
    })).rejects.toThrow('does not match');
  });

  it('does not persist token responses without explicit granted scopes', async () => {
    const tokens = new MemoryTokens();
    const states = new MemoryStates();
    const service = new LinkedInOAuthService({
      clientId: 'client-id',
      clientSecret: 'client-secret',
      redirectUri: 'https://careerops.example.com/oauth/linkedin/callback',
      fetcher: vi.fn<typeof fetch>().mockResolvedValue(
        new Response(JSON.stringify({ access_token: 'token', expires_in: 3600, scope: 'openid profile' }), { status: 200 }),
      new Response(JSON.stringify({ sub: 'abc123' }), { status: 200 })
      ),
    }, states, tokens);
    const identity = { tenantId: 'tenant-1', subject: 'member-1' };
    const url = new URL(await service.createAuthorizationUrl(identity));
    await expect(service.completeAuthorization({
      code: 'code',
      state: url.searchParams.get('state')!,
      identity,
    })).rejects.toThrow('did not return granted scopes');
    expect(tokens.value).toBeNull();
  });
});
