import { once } from 'node:events';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { CloudApiDependencies } from '../apps/api/src/ports';
import { createCloudApiServer } from '../apps/api/src/server';

const tenantId = '10000000-0000-4000-8000-000000000001';
const subject = 'candidate:alice';

function createDependencies(): CloudApiDependencies {
  return {
    config: {
      issuer: 'https://identity.example.test',
      audience: 'careerops-api',
      jwksUrl: 'https://identity.example.test/.well-known/jwks.json',
      consentSigningSecret: 'test-secret-at-least-32-chars-long-12345',
      maxRequestBytes: 64 * 1024,
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
        globalKillSwitch: false,
        pausedChannels: [],
        updatedAt: '2026-11-12T00:00:00.000Z',
      }),
      acceptSprintContract: async () => ({ id: 'contract-id', revision: 1 }),
      getActiveSprintContract: async () => null,
      revokeSprintContract: async () => undefined,
      setChannelPauseWithAudit: async () => undefined,
      setGlobalKillSwitchWithAudit: async () => undefined,
    },
    careerGraph: {
      createFact: vi.fn(),
      listFacts: vi.fn(async () => []),
      reviewFact: vi.fn(),
    },
  };
}

describe('M1: Career Graph extraction API routes', () => {
  let server: ReturnType<typeof createCloudApiServer> | undefined;
  let baseUrl: string;

  afterEach(async () => {
    if (server?.listening) {
      server.close();
      await once(server, 'close');
    }
    server = undefined;
  });

  async function startServer(deps = createDependencies()): Promise<string> {
    server = createCloudApiServer(deps);
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    const addr = server.address();
    if (!addr || typeof addr === 'string') throw new Error('Failed to bind');
    baseUrl = `http://127.0.0.1:${addr.port}`;
    return baseUrl;
  }

  it('extracts candidate facts from resume via POST /v1/career-graph/extract/resume', async () => {
    await startServer();
    const resumeText = `
Jane Doe
Staff Engineer
EXPERIENCE
Acme - Staff SWE
2022 - Present
- Built high throughput systems
SKILLS
TypeScript, Go, Kubernetes
    `;

    const res = await fetch(`${baseUrl}/v1/career-graph/extract/resume`, {
      method: 'POST',
      headers: {
        authorization: 'Bearer valid.jwt.token',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        text: resumeText,
        filename: 'resume.txt',
      }),
    });

    expect(res.status).toBe(200);
    const data = (await res.json()) as any;
    expect(data.count).toBeGreaterThan(0);
    expect(Array.isArray(data.candidateFacts)).toBe(true);
    const tsSkill = data.candidateFacts.find((f: any) => f.factKey === 'skill.typescript');
    expect(tsSkill).toBeDefined();
  });

  it('extracts candidate facts from LinkedIn CSV via POST /v1/career-graph/extract/linkedin', async () => {
    await startServer();
    const res = await fetch(`${baseUrl}/v1/career-graph/extract/linkedin`, {
      method: 'POST',
      headers: {
        authorization: 'Bearer valid.jwt.token',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        skillsCsv: `"Name"\n"PostgreSQL"\n"Rust"`,
      }),
    });

    expect(res.status).toBe(200);
    const data = (await res.json()) as any;
    expect(data.count).toBe(2);
    expect(data.candidateFacts[0].factKey).toBe('skill.postgresql');
    expect(data.candidateFacts[1].factKey).toBe('skill.rust');
  });

  it('extracts candidate facts from GitHub payload via POST /v1/career-graph/extract/github', async () => {
    await startServer();
    const res = await fetch(`${baseUrl}/v1/career-graph/extract/github`, {
      method: 'POST',
      headers: {
        authorization: 'Bearer valid.jwt.token',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        user: { login: 'torvalds', name: 'Linus Torvalds' },
        repositories: [
          {
            name: 'linux',
            description: 'Linux kernel source tree',
            html_url: 'https://github.com/torvalds/linux',
            language: 'C',
            stargazers_count: 180000,
            forks_count: 55000,
          },
        ],
      }),
    });

    expect(res.status).toBe(200);
    const data = (await res.json()) as any;
    expect(data.count).toBe(2); // 1 project + 1 skill (C)
    const project = data.candidateFacts.find((f: any) => f.category === 'project');
    expect(project.factKey).toBe('project.torvalds-linux');
  });

  it('rejects unauthenticated requests to extraction routes with 401', async () => {
    await startServer();
    const res = await fetch(`${baseUrl}/v1/career-graph/extract/resume`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({ text: 'Some resume' }),
    });

    expect(res.status).toBe(401);
  });
});

