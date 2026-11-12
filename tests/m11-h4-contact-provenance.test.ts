import { once } from 'node:events';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { CloudApiDependencies } from '../apps/api/src/ports';
import { createCloudApiServer } from '../apps/api/src/server';
import {
  OutreachComplianceEngine,
  HardLineH4ViolationError,
} from '../packages/cloud-core/src/outreach/compliance';
import type { ContactProvenanceEvidence, Person } from '../packages/cloud-core/src/person-graph/person-types';

const tenantId = '10000000-0000-4000-8000-000000000001';
const subject = 'candidate:alice';

describe('Milestone M11 Item 3: Hard Line H4 Contact Provenance Evidence', () => {
  const compliance = new OutreachComplianceEngine();

  it('rejects self-asserted labels lacking provenance evidence records', () => {
    expect(() => {
      compliance.assertProvenanceEvidence('target@example.com', undefined);
    }).toThrow(/lacks provenance evidence/);

    expect(() => {
      compliance.assertProvenanceEvidence('target@example.com', null);
    }).toThrow(/lacks provenance evidence/);

    expect(() => {
      compliance.assertProvenanceEvidence('target@example.com', {});
    }).toThrow(/evidence is invalid/);
  });

  it('validates licensed_provider: requires providerRecordId and 64-character SHA-256 hash', () => {
    // Missing providerRecordId
    expect(() => {
      compliance.assertProvenanceEvidence('lead@firm.com', {
        verificationSource: 'licensed_provider',
        contentHash: 'a'.repeat(64),
        retrievedAt: new Date().toISOString(),
      });
    }).toThrow(/licensed_provider evidence requires a verified providerRecordId/);

    // Invalid content hash (not 64-char sha256)
    expect(() => {
      compliance.assertProvenanceEvidence('lead@firm.com', {
        verificationSource: 'licensed_provider',
        providerRecordId: 'zoominfo_rec_987',
        contentHash: 'not-a-sha256-hash',
        retrievedAt: new Date().toISOString(),
      });
    }).toThrow(/contentHash must be a valid 64-character SHA-256 hex string/);

    // Valid licensed provider evidence
    const valid = compliance.assertProvenanceEvidence('lead@firm.com', {
      verificationSource: 'licensed_provider',
      providerRecordId: 'apollo_rec_456',
      contentHash: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
      retrievedAt: new Date().toISOString(),
    });
    expect(valid.providerRecordId).toBe('apollo_rec_456');
  });

  it('validates public_company_page: requires HTTPS sourceUrl and rejects private/local IPs', () => {
    // Non-HTTPS source URL
    expect(() => {
      compliance.assertProvenanceEvidence('eng@startup.io', {
        verificationSource: 'public_company_page',
        sourceUrl: 'http://startup.io/team', // HTTP instead of HTTPS
        contentHash: 'b'.repeat(64),
        retrievedAt: new Date().toISOString(),
      });
    }).toThrow(/public_company_page evidence requires a valid HTTPS sourceUrl/);

    // Localhost / private IP SSRF attempt
    expect(() => {
      compliance.assertProvenanceEvidence('eng@startup.io', {
        verificationSource: 'public_company_page',
        sourceUrl: 'https://localhost:8080/staff',
        contentHash: 'b'.repeat(64),
        retrievedAt: new Date().toISOString(),
      });
    }).toThrow(/sourceUrl cannot be a private or local address/);

    // Valid public company page
    const valid = compliance.assertProvenanceEvidence('eng@stripe.com', {
      verificationSource: 'public_company_page',
      sourceUrl: 'https://stripe.com/blog/authors/alice-engineer',
      contentHash: 'c'.repeat(64),
      retrievedAt: new Date().toISOString(),
    });
    expect(valid.sourceUrl).toBe('https://stripe.com/blog/authors/alice-engineer');
  });

  it('rejects future retrievedAt timestamps', () => {
    const futureDate = new Date(Date.now() + 86400000 * 2).toISOString(); // 2 days in future
    expect(() => {
      compliance.assertProvenanceEvidence('vp@corp.com', {
        verificationSource: 'user_imported_connection',
        contentHash: 'd'.repeat(64),
        retrievedAt: futureDate,
      });
    }).toThrow(/retrievedAt timestamp cannot be in the future/);
  });

  it('POST /v1/people strictly enforces server-side provenance validation', async () => {
    const peopleStore: Person[] = [];
    let server: ReturnType<typeof createCloudApiServer> | null = null;
    let baseUrl = '';

    const dependencies: CloudApiDependencies = {
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
          tenantId,
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
        acceptSprintContract: async () => ({ id: 'c-1', revision: 1 }),
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
      outreach: {
        addPerson: vi.fn(async (_t, person) => {
          const p: Person = {
            ...person,
            id: 'p_101',
            tenantId,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          };
          peopleStore.push(p);
          return p;
        }),
        listPeople: vi.fn(async () => peopleStore),
        getPerson: vi.fn(async (_t, id) => peopleStore.find((p) => p.id === id) || null),
        updatePersonStage: vi.fn(),
        addSuppression: vi.fn(),
        isSuppressed: vi.fn(async () => false),
        logOutreachMessage: vi.fn(),
        countCompanyContactsForRole: vi.fn(async () => 0),
        getMailboxMetrics: vi.fn(async () => ({ sentCount: 0, bounceCount: 0, complaintCount: 0, replyCount: 0 })),
      },
    };

    server = createCloudApiServer(dependencies);
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    const address = server.address();
    const port = typeof address === 'object' && address ? address.port : 0;
    baseUrl = `http://127.0.0.1:${port}`;

    try {
      // 1. Attempt ingestion with self-asserted label and no provenance evidence (Must Fail 422)
      const fakeRes = await fetch(`${baseUrl}/v1/people`, {
        method: 'POST',
        headers: {
          authorization: 'Bearer valid-token',
          'x-tenant-id': tenantId,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          email: 'unproven@firm.com',
          name: 'Fake Recruiter',
          company: 'Firm',
          title: 'Recruiter',
          roleDomain: 'recruiter',
          relationship: 'cold',
          verificationSource: 'licensed_provider', // Self-asserted label without evidence!
        }),
      });

      expect(fakeRes.status).toBe(422);
      const fakeJson = await fakeRes.json();
      expect(fakeJson.error).toContain('lacks provenance evidence');

      // 2. Ingestion with verified provenance evidence (Must Succeed 200)
      const validRes = await fetch(`${baseUrl}/v1/people`, {
        method: 'POST',
        headers: {
          authorization: 'Bearer valid-token',
          'x-tenant-id': tenantId,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          email: 'verified@datadog.com',
          name: 'Sarah Engineer',
          company: 'Datadog',
          title: 'Senior Engineering Manager',
          roleDomain: 'hiring_manager',
          relationship: 'cold',
          verificationSource: 'public_company_page',
          provenanceEvidence: {
            verificationSource: 'public_company_page',
            sourceUrl: 'https://datadog.com/blog/engineering/sarah-profile',
            contentHash: 'f'.repeat(64),
            retrievedAt: new Date().toISOString(),
          },
        }),
      });

      expect(validRes.status).toBe(201);
      const validJson = await validRes.json();
      expect(validJson.person.email).toBe('verified@datadog.com');
      expect(validJson.person.provenanceEvidence.sourceUrl).toContain('datadog.com');
    } finally {
      if (server) {
        await new Promise<void>((resolve, reject) => {
          server?.close((err) => (err ? reject(err) : resolve()));
        });
      }
    }
  });
});
