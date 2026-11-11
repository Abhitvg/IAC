import { once } from 'node:events';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { CareerGraphFact } from '../packages/cloud-core/src/career-graph';
import type { CloudApiDependencies } from '../apps/api/src/ports';
import { createCloudApiServer } from '../apps/api/src/server';

const tenantId = '10000000-0000-4000-8000-000000000001';
const factId = '20000000-0000-4000-8000-000000000002';
const subject = 'candidate:verified-subject';

const fact: CareerGraphFact = {
  id: factId,
  tenantId,
  factKey: 'profile.current_role',
  version: 1,
  valueEnvelope: {
    algorithm: 'A256GCM',
    keyVersion: 'test-key-v1',
    wrappedKey: 'wrapped-key',
    iv: 'AAAAAAAAAAAAAAAA',
    authTag: 'AAAAAAAAAAAAAAAAAAAAAA==',
    ciphertext: 'Y2lwaGVydGV4dA==',
    tenantId,
    context: 'career-graph:profile.current_role',
  },
  source: { kind: 'user_input' },
  createdBy: subject,
  createdAt: '2026-11-11T00:00:00.000Z',
  review: null,
};

const validInput = {
  factKey: 'profile.current_role',
  valueEnvelope: fact.valueEnvelope,
  source: { kind: 'user_input' },
};

function createDependencies(): CloudApiDependencies {
  const createFact = vi.fn(async () => fact);
  const listFacts = vi.fn(async () => [fact]);
  const reviewFact = vi.fn(async () => ({
    ...fact,
    review: {
      decision: 'confirmed' as const,
      reviewedBy: subject,
      reviewedAt: '2026-11-11T00:01:00.000Z',
    },
  }));
  const dependencies: CloudApiDependencies = {
    config: {
      issuer: 'https://identity.example.test',
      audience: 'careerops-api',
      jwksUrl: 'https://identity.example.test/.well-known/jwks.json',
      consentSigningSecret: 'test-secret',
    },
    identityVerifier: {
      verify: async () => ({
        subject,
        issuer: 'https://identity.example.test',
        audience: ['careerops-api'],
        expiresAt: 2_000_000_000,
      }),
    },
    rateLimiter: { consume: async () => true },
    repository: {
      findMembershipsBySubject: async () => [
        { tenantId, subject, role: 'owner', status: 'active' },
      ],
      checkReady: async () => undefined,
      getControlState: async () => ({
        tenantId,
        globalKillSwitch: true,
        pausedChannels: [],
        updatedAt: '2026-11-11T00:00:00.000Z',
      }),
      acceptSprintContract: async () => ({ id: factId, revision: 1 }),
      getActiveSprintContract: async () => null,
      revokeSprintContract: async () => undefined,
      setChannelPauseWithAudit: async () => undefined,
      setGlobalKillSwitchWithAudit: async () => undefined,
    },
    careerGraph: { createFact, listFacts, reviewFact },
  };
  return dependencies;
}

describe('Career Graph API routes', () => {
  let server: ReturnType<typeof createCloudApiServer> | undefined;
  let baseUrl: string;

  afterEach(async () => {
    if (server?.listening) {
      server.close();
      await once(server, 'close');
    }
    server = undefined;
  });

  async function startServer() {
    const dependencies = createDependencies();
    server = createCloudApiServer(dependencies);
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('Expected TCP address');
    baseUrl = `http://127.0.0.1:${address.port}`;
    return dependencies;
  }

  it('binds fact creation to verified tenant and actor, rejecting client-supplied identity fields', async () => {
    const dependencies = await startServer();
    const headers = {
      authorization: 'Bearer test-token',
      'content-type': 'application/json',
    };

    const forged = await fetch(`${baseUrl}/v1/career-graph/facts`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ ...validInput, tenantId: '30000000-0000-4000-8000-000000000003' }),
    });
    expect(forged.status).toBe(400);
    expect(dependencies.careerGraph.createFact).not.toHaveBeenCalled();

    const created = await fetch(`${baseUrl}/v1/career-graph/facts`, {
      method: 'POST',
      headers,
      body: JSON.stringify(validInput),
    });
    expect(created.status).toBe(201);
    expect(dependencies.careerGraph.createFact).toHaveBeenCalledWith(tenantId, subject, validInput);

    const listed = await fetch(`${baseUrl}/v1/career-graph/facts?limit=25`, {
      headers: { authorization: 'Bearer test-token' },
    });
    expect(listed.status).toBe(200);
    expect(await listed.json()).toMatchObject({ facts: [{ id: factId, tenantId }] });

    const invalidLimit = await fetch(`${baseUrl}/v1/career-graph/facts?limit=1000`, {
      headers: { authorization: 'Bearer test-token' },
    });
    expect(invalidLimit.status).toBe(400);
  });

  it('routes confirmation through the authenticated contributor identity', async () => {
    const dependencies = await startServer();
    const response = await fetch(`${baseUrl}/v1/career-graph/facts/${factId}/review`, {
      method: 'POST',
      headers: {
        authorization: 'Bearer test-token',
        'content-type': 'application/json',
      },
      body: JSON.stringify({ decision: 'confirmed' }),
    });
    expect(response.status).toBe(200);
    expect(dependencies.careerGraph.reviewFact).toHaveBeenCalledWith(tenantId, subject, factId, {
      decision: 'confirmed',
    });
    expect(await response.json()).toMatchObject({
      fact: { id: factId, review: { decision: 'confirmed', reviewedBy: subject } },
    });
  });
});
