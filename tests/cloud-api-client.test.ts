import { describe, expect, it, vi } from 'vitest';
import {
  CareerOpsApiError,
  createCareerOpsApiClient,
} from '../src/services/cloudApi/client';

describe('CareerOps cloud API client', () => {
  it('sends bearer auth and tenant context without cookies or redirect forwarding', async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify({ subject: 'user-1' }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    );
    const client = createCareerOpsApiClient({
      baseUrl: 'https://api.example.com/',
      getAccessToken: async () => 'signed-access-token',
      getTenantId: () => 'tenant-1',
      fetchImpl,
    });

    await expect(client.request<{ subject: string }>('/v1/me')).resolves.toEqual({
      subject: 'user-1',
    });
    const [url, init] = fetchImpl.mock.calls[0];
    expect(String(url)).toBe('https://api.example.com/v1/me');
    const headers = new Headers(init?.headers);
    expect(headers.get('authorization')).toBe('Bearer signed-access-token');
    expect(headers.get('x-tenant-id')).toBe('tenant-1');
    expect(init).toMatchObject({
      credentials: 'omit',
      redirect: 'error',
      cache: 'no-store',
    });
  });

  it('fails closed when no access token is available', async () => {
    const fetchImpl = vi.fn<typeof fetch>();
    const client = createCareerOpsApiClient({
      baseUrl: 'https://api.example.com',
      getAccessToken: async () => null,
      fetchImpl,
    });
    await expect(client.request('/v1/me')).rejects.toThrow(
      'A valid access token is required'
    );
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('rejects non-HTTPS remote endpoints and paths outside the API namespace', async () => {
    expect(() =>
      createCareerOpsApiClient({
        baseUrl: 'http://api.example.com',
        getAccessToken: async () => 'token',
      })
    ).toThrow('must use HTTPS');
    const client = createCareerOpsApiClient({
      baseUrl: 'https://api.example.com',
      getAccessToken: async () => 'token',
    });
    await expect(
      client.request('https://attacker.example/steal')
    ).rejects.toThrow('relative /v1/ endpoint');
  });

  it('surfaces API status codes without leaking response payloads', async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(
        JSON.stringify({ error: 'Unauthorized', secret: 'do-not-surface' }),
        {
          status: 401,
          headers: { 'content-type': 'application/json' },
        }
      )
    );
    const client = createCareerOpsApiClient({
      baseUrl: 'https://api.example.com',
      getAccessToken: async () => 'expired-token',
      fetchImpl,
    });
    await expect(client.request('/v1/me')).rejects.toMatchObject({
      name: 'CareerOpsApiError',
      message: 'Unauthorized',
      status: 401,
    } satisfies Partial<CareerOpsApiError>);
  });
});
