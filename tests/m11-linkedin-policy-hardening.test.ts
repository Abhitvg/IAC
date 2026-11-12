import { describe, expect, it } from 'vitest';
import { createHmac, randomUUID } from 'node:crypto';
import { LinkedInAssistProtocol } from '../packages/cloud-core/src/linkedin/assist-protocol';
import {
  LinkedInExtensionPolicyGate,
  LINKEDIN_POLICY_RISK_NOTICE,
} from '../packages/cloud-core/src/linkedin/extension-policy';
import type { Person } from '../packages/cloud-core/src/person-graph/person-types';
import { createCloudApiServer } from '../apps/api/src/server';

const TENANT_ID = '33333333-3333-4333-8333-333333333333';
const TEST_SECRET = '0123456789abcdef0123456789abcdef';

function signToken(claims: Record<string, unknown>, secret = TEST_SECRET): string {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const payload = Buffer.from(JSON.stringify(claims)).toString('base64url');
  const content = `${header}.${payload}`;
  const signature = createHmac('sha256', secret).update(content).digest('base64url');
  return `${content}.${signature}`;
}

describe('Milestone M11 Item 7: LinkedIn Policy Hardening, Assist Queue Default & Extension Gate', () => {
  const protocol = new LinkedInAssistProtocol();

  const mockPerson: Person = {
    id: 'p-recruiter-1',
    tenantId: TENANT_ID,
    email: 'recruiter@databricks.com',
    name: 'Elena Rostova',
    company: 'Databricks',
    title: 'Senior Technical Recruiter',
    roleDomain: 'recruiter',
    relationship: '2nd_degree',
    verificationSource: 'public_company_page',
    timeZone: 'America/Los_Angeles',
    linkedinUrl: 'https://www.linkedin.com/in/elena-rostova-recruiter',
    crmStage: 'lead',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  describe('1. Assist Queue Default: Copy-Text + Open-Profile-Link', () => {
    it('defaults prepared LinkedIn actions to copy-text + open-profile-link with user gesture requirement (H1)', () => {
      const item = protocol.createAssistActionItem(
        TENANT_ID,
        mockPerson,
        'Staff Distributed Systems Engineer',
        'David Chen',
        'Apache Spark optimization'
      );

      expect(item.platform).toBe('linkedin_assist');
      expect(item.userGestureRequired).toBe(true);
      expect(item.targetUrl).toBe('https://www.linkedin.com/in/elena-rostova-recruiter');

      // Verify default payload structure
      const payload = item.prefilledPayload as any;
      expect(payload.workflowMode).toBe('copy_text_and_open_profile');
      expect(payload.copyText).toBeDefined();
      expect(payload.copyText).toContain('Elena');
      expect(payload.copyText).toContain('Apache Spark optimization');
      expect(payload.copyText.length).toBeLessThanOrEqual(300);
      expect(payload.userInstructions).toContain('Copy & Open Profile');
      expect(item.assistNotes).toContain('Default action: Copy text and open profile link');
    });
  });

  describe('2. Page-Reading Extension Opt-In & Policy-Risk Notice Gate', () => {
    it('is strictly disabled by default and requires explicit policy risk acknowledgment to enable', () => {
      const gate = new LinkedInExtensionPolicyGate();

      // Default state
      const initial = gate.getOptInState(TENANT_ID);
      expect(initial.pageReadingEnabled).toBe(false);
      expect(initial.acknowledgedPolicyRisk).toBe(false);
      expect(initial.policyRiskNotice).toContain('LinkedIn User Agreement (Section 8.2)');

      // Rejects enabling without acknowledgedPolicyRisk = true
      expect(() => {
        gate.setOptInState(TENANT_ID, true, false);
      }).toThrow(/Policy Risk Notice Acknowledgment Required/i);

      // Successfully enables when acknowledged
      const enabledState = gate.setOptInState(TENANT_ID, true, true);
      expect(enabledState.pageReadingEnabled).toBe(true);
      expect(enabledState.acknowledgedPolicyRisk).toBe(true);
      expect(enabledState.optedInAt).toBeDefined();

      // Disabling records opt-out timestamp
      const disabledState = gate.setOptInState(TENANT_ID, false);
      expect(disabledState.pageReadingEnabled).toBe(false);
      expect(disabledState.acknowledgedPolicyRisk).toBe(false);
      expect(disabledState.optedOutAt).toBeDefined();
    });

    it('blocks page-reading when tenant is not opted in', () => {
      const gate = new LinkedInExtensionPolicyGate();

      expect(() => {
        gate.processPageRead({
          tenantId: TENANT_ID,
          url: 'https://www.linkedin.com/in/target-profile',
          rawDomExcerpt: '<h1>Target Profile</h1>',
          userGesture: {
            hasUserGesture: true,
            gestureType: 'click',
            clientTimestamp: new Date().toISOString(),
          },
        });
      }).toThrow(/LinkedIn page-reading extension is disabled for this tenant/i);
    });
  });

  describe('3. User-Gesture-Only Invariant (Hard Line H1)', () => {
    it('rejects automated, timed, or background reading lacking an active user gesture', () => {
      const gate = new LinkedInExtensionPolicyGate();
      gate.setOptInState(TENANT_ID, true, true);

      // Background scrape attempt without user gesture
      expect(() => {
        gate.processPageRead({
          tenantId: TENANT_ID,
          url: 'https://www.linkedin.com/in/sarah-connor',
          rawDomExcerpt: '<h1>Sarah Connor</h1>',
          userGesture: {
            hasUserGesture: false,
            gestureType: 'click',
            clientTimestamp: new Date().toISOString(),
          },
        });
      }).toThrow(/Hard Line H1 Violation: Background, timed, or automated LinkedIn page-reading is strictly forbidden/i);
    });

    it('rejects non-profile URLs and extracts defanged profile fields on valid click gesture', () => {
      const gate = new LinkedInExtensionPolicyGate();
      gate.setOptInState(TENANT_ID, true, true);

      // Reject non-profile URL
      expect(() => {
        gate.processPageRead({
          tenantId: TENANT_ID,
          url: 'https://www.linkedin.com/feed/',
          rawDomExcerpt: '<div>Feed</div>',
          userGesture: {
            hasUserGesture: true,
            gestureType: 'click',
            clientTimestamp: new Date().toISOString(),
          },
        });
      }).toThrow(/Restricted scope: Page-reading is permitted exclusively on individual/i);

      // Successful read with active click gesture
      const result = gate.processPageRead({
        tenantId: TENANT_ID,
        url: 'https://www.linkedin.com/in/marcus-aurelius',
        rawDomExcerpt: '<h1>Marcus Aurelius</h1><div class="text-body-medium">VP of Cloud Architecture</div>',
        userGesture: {
          hasUserGesture: true,
          gestureType: 'click',
          clientTimestamp: new Date().toISOString(),
        },
      });

      expect(result.sanitized).toBe(true);
      expect(result.name).toBe('Marcus Aurelius');
      expect(result.currentTitle).toBe('VP of Cloud Architecture');
      expect(result.sourceUrl).toBe('https://www.linkedin.com/in/marcus-aurelius');
    });
  });

  describe('4. Authenticated REST API Policy Endpoints', () => {
    it('serves policy status, processes opt-in, and evaluates profile reads over HTTP', async () => {
      const mockRepo = {
        checkReady: async () => {},
        findMembershipsBySubject: async () => [
          { tenantId: TENANT_ID, subject: 'user:linkedin-lead', role: 'owner' as const, status: 'active' as const },
        ],
        getControlState: async () => ({
          tenantId: TENANT_ID,
          globalKillSwitch: false,
          pausedChannels: [],
          updatedAt: new Date().toISOString(),
        }),
      };

      const server = createCloudApiServer({
        repository: mockRepo as any,
        config: { issuer: 'careerops.test', audience: 'careerops.api' },
        identityVerifier: {
          verify: async () => ({
            subject: 'user:linkedin-lead',
            issuer: 'careerops.test',
            audience: 'careerops.api',
            expiresAt: 2_000_000_000,
            tenantId: TENANT_ID,
          }),
        },
        rateLimiter: { consume: async () => true },
      });

      await new Promise<void>((resolve) => server.listen(0, resolve));
      const address = server.address() as { port: number };
      const baseUrl = `http://127.0.0.1:${address.port}`;

      const token = signToken({
        sub: 'user:linkedin-lead',
        iss: 'careerops.test',
        aud: 'careerops.api',
        exp: 2_000_000_000,
        tenant_id: TENANT_ID,
      });

      try {
        // 1. GET /v1/linkedin/extension-policy returns default disabled
        const policyRes = await fetch(`${baseUrl}/v1/linkedin/extension-policy`, {
          headers: { authorization: `Bearer ${token}` },
        });
        expect(policyRes.status).toBe(200);
        const policyJson = await policyRes.json();
        expect(policyJson.policy.pageReadingEnabled).toBe(false);
        expect(policyJson.policy.policyRiskNotice).toContain('LinkedIn User Agreement');

        // 2. POST /v1/linkedin/extension-policy/opt-in rejects without acknowledgment
        const unackRes = await fetch(`${baseUrl}/v1/linkedin/extension-policy/opt-in`, {
          method: 'POST',
          headers: {
            authorization: `Bearer ${token}`,
            'content-type': 'application/json',
          },
          body: JSON.stringify({ enabled: true, acknowledgedPolicyRisk: false }),
        });
        expect(unackRes.status).toBe(500); // Throws risk acknowledgment error

        // 3. POST /v1/linkedin/extension-policy/opt-in succeeds with acknowledgment
        const optInRes = await fetch(`${baseUrl}/v1/linkedin/extension-policy/opt-in`, {
          method: 'POST',
          headers: {
            authorization: `Bearer ${token}`,
            'content-type': 'application/json',
          },
          body: JSON.stringify({ enabled: true, acknowledgedPolicyRisk: true }),
        });
        expect(optInRes.status).toBe(200);
        const optInJson = await optInRes.json();
        expect(optInJson.policy.pageReadingEnabled).toBe(true);
        expect(optInJson.policy.acknowledgedPolicyRisk).toBe(true);

        // 4. POST /v1/linkedin/extension/read-profile succeeds with click gesture
        const readRes = await fetch(`${baseUrl}/v1/linkedin/extension/read-profile`, {
          method: 'POST',
          headers: {
            authorization: `Bearer ${token}`,
            'content-type': 'application/json',
          },
          body: JSON.stringify({
            url: 'https://www.linkedin.com/in/alex-smith',
            rawDomExcerpt: '<h1>Alex Smith</h1><div class="text-body-medium">Lead SRE at Uber</div>',
            userGesture: {
              hasUserGesture: true,
              gestureType: 'click',
              clientTimestamp: new Date().toISOString(),
            },
          }),
        });
        expect(readRes.status).toBe(200);
        const readJson = await readRes.json();
        expect(readJson.profile.name).toBe('Alex Smith');
        expect(readJson.profile.currentTitle).toBe('Lead SRE at Uber');
      } finally {
        await new Promise<void>((resolve, reject) =>
          server.close((err) => (err ? reject(err) : resolve()))
        );
      }
    });
  });
});

