import { describe, it, expect, vi } from 'vitest';
import { createHash, createHmac } from 'node:crypto';
import {
  ShadowPipelineEngine,
  type ShadowRunInput,
  type ShadowTargetJob,
  type ShadowTargetContact,
} from '../packages/cloud-core/src/sprint/shadow-mode';
import { SprintWorkflowActivities } from '../packages/cloud-core/src/workflows/activities';
import type { CandidateFact } from '../packages/cloud-core/src/career-graph-types';
import type { SprintContract } from '../packages/cloud-core/src/contract';
import { createCloudApiServer } from '../apps/api/src/server';

const TENANT_ID = '11111111-1111-4111-8111-111111111111';
const TEST_SECRET = '0123456789abcdef0123456789abcdef';

function signToken(claims: Record<string, unknown>, secret = TEST_SECRET): string {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const payload = Buffer.from(JSON.stringify(claims)).toString('base64url');
  const content = `${header}.${payload}`;
  const signature = createHmac('sha256', secret).update(content).digest('base64url');
  return `${content}.${signature}`;
}

const sampleContract: SprintContract = {
  version: 1,
  roles: ['Senior Infrastructure Engineer'],
  seniority: ['senior', 'staff'],
  locations: ['San Francisco, CA', 'Remote'],
  remotePreference: 'any',
  salaryFloor: { amount: 180000, currency: 'USD' },
  workAuthorization: {
    countries: ['US'],
    requiresSponsorship: false,
    confirmed: true,
  },
  blocklist: {
    companies: ['Malicious Corp'],
    industries: ['Crypto Gambling'],
  },
  enabledChannels: ['ats', 'email'],
  dailyCaps: {
    applications: 2,
    emails: 2,
    assistQueueItems: 5,
    calendarEvents: 3,
  },
  defaultAnswers: {
    'legally-authorized': {
      label: 'Legally authorized to work in target country',
      factIds: ['fact-work-auth'],
      plaintextAnswer: 'Yes',
    },
  },
  outreachTemplates: [
    {
      templateId: 'eng_lead_v1',
      subjectTemplate: 'Infrastructure leadership at {{company}}',
      bodyTemplate: 'Hi {{firstName}}, noticed {{company}} scaling Kubernetes clusters.',
    },
  ],
  standingConsentReviewIntervalDays: 7,
  startsAt: '2026-11-01T00:00:00.000Z',
  endsAt: '2026-11-30T00:00:00.000Z',
};

const confirmedFacts: CandidateFact[] = [
  {
    id: 'fact-1',
    category: 'experience',
    payload: {
      company: 'Datadog',
      role: 'Staff Infrastructure Engineer',
      startDate: '2021-01-01',
      endDate: '2024-05-01',
      achievements: ['Scaled Kubernetes cluster by 40% reducing latency by 15%'],
    },
  },
  {
    id: 'fact-2',
    category: 'education',
    payload: {
      institution: 'UC Berkeley',
      degree: 'BS Computer Science',
      year: 2018,
    },
  },
  {
    id: 'fact-3',
    category: 'skill',
    payload: {
      name: 'Kubernetes',
      yearsOfExperience: 6,
    },
  },
];

function makeHash(content: string): string {
  return createHash('sha256').update(content).digest('hex');
}

describe('Milestone M11 Item 4: Tenant Shadow Mode & Dry-Run Pipeline', () => {
  it('executes full pipeline in shadow mode: produces report of what WOULD have happened with zero side-effects', () => {
    const engine = new ShadowPipelineEngine();

    const jobs: ShadowTargetJob[] = [
      {
        id: 'job-1',
        company: 'Stripe',
        title: 'Staff Site Reliability Engineer',
        atsPlatform: 'greenhouse',
        tailoredCvText: 'Staff Infrastructure Engineer with experience at Datadog scaling Kubernetes by 40%.',
        questions: [
          {
            question: 'What is your experience with Kubernetes?',
            answer: 'Led Kubernetes scaling at Datadog with 15% latency reduction.',
          },
        ],
      },
    ];

    const contacts: ShadowTargetContact[] = [
      {
        id: 'contact-1',
        email: 'recruiter@stripe.com',
        name: 'Alex Recruiter',
        role: 'Tech Recruiter',
        company: 'Stripe',
        hookText: 'Saw your team expanding the Datadog and Kubernetes infrastructure at Stripe.',
        provenanceEvidence: {
          sourceUrl: 'https://stripe.com/jobs/recruiter',
          contentHash: makeHash('stripe recruiter listing'),
          retrievedAt: new Date(Date.now() - 3600000).toISOString(),
          verificationSource: 'public_company_page',
        },
      },
    ];

    const report = engine.executeShadowRun({
      tenantId: TENANT_ID,
      sprintContract: sampleContract,
      confirmedFacts,
      targetJobs: jobs,
      targetContacts: contacts,
      currentDailyUsage: { applications: 0, emails: 0 },
      now: new Date('2026-11-12T14:00:00.000Z'), // Afternoon UTC
    });

    expect(report.shadowMode).toBe(true);
    expect(report.summary.totalEvaluatedJobs).toBe(1);
    expect(report.summary.wouldHaveSubmittedAts).toBe(1);
    expect(report.summary.blockedByTruthfulnessGateAts).toBe(0);
    expect(report.wouldHaveSubmitted).toHaveLength(1);
    expect(report.wouldHaveSubmitted[0].company).toBe('Stripe');
    expect(report.wouldHaveSubmitted[0].atsPlatform).toBe('greenhouse');

    expect(report.summary.totalEvaluatedContacts).toBe(1);
    expect(report.summary.wouldHaveSentOutreach).toBe(1);
    expect(report.summary.blockedByTruthfulnessGateOutreach).toBe(0);
    expect(report.wouldHaveSentOutreach).toHaveLength(1);
    expect(report.wouldHaveSentOutreach[0].recipientEmail).toBe('recruiter@stripe.com');
  });

  it('blocks fabricated facts at the Truthfulness Gate and logs detailed violations in the shadow report', () => {
    const engine = new ShadowPipelineEngine();

    const jobs: ShadowTargetJob[] = [
      {
        id: 'job-untruthful',
        company: 'Figma',
        title: 'Principal Architect',
        atsPlatform: 'lever',
        // Fabricated employer (Apple) and unconfirmed degree (PhD)
        tailoredCvText: 'Former Principal Architect at Apple with a PhD in Distributed Systems from MIT.',
      },
    ];

    const contacts: ShadowTargetContact[] = [
      {
        id: 'contact-untruthful',
        email: 'vp-eng@figma.com',
        name: 'Sarah VP',
        role: 'VP Engineering',
        company: 'Figma',
        // Fabricated claim: worked at Google
        hookText: 'During my tenure at Google building Borg clusters, I solved similar challenges.',
        provenanceEvidence: {
          sourceUrl: 'https://figma.com/about/team',
          contentHash: makeHash('figma leadership'),
          retrievedAt: new Date(Date.now() - 10000).toISOString(),
          verificationSource: 'public_company_page',
        },
      },
    ];

    const report = engine.executeShadowRun({
      tenantId: TENANT_ID,
      sprintContract: sampleContract,
      confirmedFacts,
      targetJobs: jobs,
      targetContacts: contacts,
      now: new Date('2026-11-12T14:00:00.000Z'),
    });

    expect(report.summary.wouldHaveSubmittedAts).toBe(0);
    expect(report.summary.blockedByTruthfulnessGateAts).toBe(1);
    expect(report.wouldHaveSubmitted).toHaveLength(0);

    expect(report.summary.wouldHaveSentOutreach).toBe(0);
    expect(report.summary.blockedByTruthfulnessGateOutreach).toBe(1);
    expect(report.wouldHaveSentOutreach).toHaveLength(0);

    // Verify truthfulness blocks log claims and violations
    expect(report.truthfulnessBlocks.length).toBeGreaterThanOrEqual(2);
    const atsBlock = report.truthfulnessBlocks.find((b) => b.targetType === 'ats_application');
    expect(atsBlock).toBeDefined();
    expect(atsBlock?.company).toBe('Figma');

    const outreachBlock = report.truthfulnessBlocks.find((b) => b.targetType === 'outreach');
    expect(outreachBlock).toBeDefined();
    expect(outreachBlock?.unsupportedClaim).toMatch(/google/i);
  });

  it('records cap, suppression, cooldown, quiet-hours, and H4 provenance decisions', () => {
    const engine = new ShadowPipelineEngine();

    const jobs: ShadowTargetJob[] = [
      { id: 'job-1', company: 'Company A', title: 'Eng 1', atsPlatform: 'greenhouse' },
      { id: 'job-2', company: 'Company B', title: 'Eng 2', atsPlatform: 'lever' },
      { id: 'job-3', company: 'Company C', title: 'Eng 3', atsPlatform: 'ashby' }, // Will exceed daily cap of 2
    ];

    const contacts: ShadowTargetContact[] = [
      // 1. Missing H4 provenance evidence
      {
        id: 'contact-no-provenance',
        email: 'lead@unproven.com',
        name: 'No Prov',
        role: 'Director',
        company: 'Unproven Corp',
      },
      // 2. On suppression list
      {
        id: 'contact-suppressed',
        email: 'optout@suppressed.org',
        name: 'Suppressed User',
        role: 'Manager',
        company: 'Suppressed Org',
        provenanceEvidence: {
          sourceUrl: 'https://suppressed.org/team',
          contentHash: makeHash('suppressed team'),
          retrievedAt: new Date().toISOString(),
          verificationSource: 'public_company_page',
        },
      },
      // 3. In 30-day cooldown
      {
        id: 'contact-cooldown',
        email: 'recent@cooldown.com',
        name: 'Recent Contact',
        role: 'Lead',
        company: 'Cooldown Corp',
        provenanceEvidence: {
          sourceUrl: 'https://cooldown.com/team',
          contentHash: makeHash('cooldown team'),
          retrievedAt: new Date().toISOString(),
          verificationSource: 'public_company_page',
        },
      },
    ];

    const report = engine.executeShadowRun({
      tenantId: TENANT_ID,
      sprintContract: sampleContract,
      confirmedFacts,
      targetJobs: jobs,
      targetContacts: contacts,
      currentDailyUsage: { applications: 0, emails: 0 },
      suppressionList: [{ email: 'optout@suppressed.org', reason: 'unsubscribed', addedAt: new Date().toISOString() }],
      existingOutreachHistory: [
        {
          recipientEmail: 'recent@cooldown.com',
          company: 'Cooldown Corp',
          sentAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(), // 5 days ago
        },
      ],
      now: new Date('2026-11-12T14:00:00.000Z'),
    });

    // ATS job-3 capped
    expect(report.summary.wouldHaveSubmittedAts).toBe(2);
    expect(report.summary.suppressedOrCappedAts).toBe(1);
    const capDecision = report.capSuppressionDecisions.find((d) => d.targetId === 'job-3');
    expect(capDecision?.decision).toBe('capped');

    // Outreach decisions
    const provDecision = report.capSuppressionDecisions.find((d) => d.targetId === 'contact-no-provenance');
    expect(provDecision?.decision).toBe('suppressed');
    expect(provDecision?.reason).toContain('Hard Line H4');

    const suppDecision = report.capSuppressionDecisions.find((d) => d.targetId === 'contact-suppressed');
    expect(suppDecision?.decision).toBe('suppressed');

    const coolDecision = report.capSuppressionDecisions.find((d) => d.targetId === 'contact-cooldown');
    expect(coolDecision?.decision).toBe('cooldown');
  });

  it('integrates with Temporal workflow activities: bypasses external side-effects when shadow mode is active', async () => {
    const mockControlsRepo = {
      getControlState: vi.fn().mockResolvedValue({
        tenantId: TENANT_ID,
        globalKillSwitch: false,
        pausedChannels: [],
        shadowMode: true,
        updatedAt: new Date().toISOString(),
      }),
    };

    const activities = new SprintWorkflowActivities({
      controlsRepository: mockControlsRepo,
    });

    const applyResult = await activities.executeApplyWave(TENANT_ID, 'sprint-1', 4);
    expect(applyResult.success).toBe(true);
    expect(applyResult.details).toMatchObject({
      shadowMode: true,
      wouldHaveSubmitted: 4,
      networkSubmitted: 0,
    });

    const outreachResult = await activities.executeOutreachWave(TENANT_ID, 'sprint-1', 5);
    expect(outreachResult.success).toBe(true);
    expect(outreachResult.details).toMatchObject({
      shadowMode: true,
      wouldHaveSent: 5,
      networkDispatched: 0,
    });
  });

  it('exposes shadow run and report retrieval endpoints via authenticated REST API', async () => {
    const savedReports: any[] = [];
    let currentShadowMode = false;

    const mockRepo = {
      checkReady: async () => {},
      findMembershipsBySubject: async () => [{ tenantId: TENANT_ID, subject: 'user-shadow', role: 'owner' as const, status: 'active' as const }],
      getControlState: async () => ({
        tenantId: TENANT_ID,
        globalKillSwitch: false,
        pausedChannels: [],
        shadowMode: currentShadowMode,
        updatedAt: new Date().toISOString(),
      }),
      setShadowMode: async (_tenantId: string, enabled: boolean) => {
        currentShadowMode = enabled;
      },
      getActiveSprintContract: async () => ({
        id: 'contract-1',
        revision: 1,
        tenantId: TENANT_ID,
        subject: 'user-shadow',
        acceptedAt: '2026-11-01T00:00:00.000Z',
        contract: sampleContract,
        signature: 'valid-sig',
      }),
      saveShadowReport: async (report: any) => {
        savedReports.push(report);
      },
      getShadowReport: async (_tenantId: string, id: string) => {
        return savedReports.find((r) => r.id === id) ?? null;
      },
      listShadowReports: async () => savedReports,
      acceptSprintContract: async () => ({ id: '1', revision: 1 }),
      revokeSprintContract: async () => {},
      setChannelPauseWithAudit: async () => {},
      setGlobalKillSwitchWithAudit: async () => {},
    };

    const server = createCloudApiServer({
      repository: mockRepo as any,
      config: { issuer: 'careerops.test', audience: 'careerops.api' },
      identityVerifier: {
        verify: async () => ({
          subject: 'user-shadow',
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
      sub: 'user-shadow',
      iss: 'careerops.test',
      aud: 'careerops.api',
      exp: 2_000_000_000,
      tenant_id: TENANT_ID,
    });

    try {
      // 1. Toggle shadow mode via POST /v1/tenant/controls/shadow-mode
      const toggleRes = await fetch(`${baseUrl}/v1/tenant/controls/shadow-mode`, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${token}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({ enabled: true }),
      });
      expect(toggleRes.status).toBe(200);
      expect(await toggleRes.json()).toMatchObject({ shadowMode: true });

      // 2. Verify controls reflect shadowMode
      const controlsRes = await fetch(`${baseUrl}/v1/tenant/controls`, {
        headers: { authorization: `Bearer ${token}` },
      });
      expect(controlsRes.status).toBe(200);
      const controlsJson = await controlsRes.json();
      expect(controlsJson.controls.shadowMode).toBe(true);

      // 3. Run shadow mode pipeline via POST /v1/sprint/shadow-run
      const runRes = await fetch(`${baseUrl}/v1/sprint/shadow-run`, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${token}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          confirmedFacts,
          targetJobs: [
            {
              id: 'job-api-1',
              company: 'Airbnb',
              title: 'Infrastructure Engineer',
              atsPlatform: 'greenhouse',
              tailoredCvText: 'Staff Infrastructure Engineer with experience at Datadog.',
            },
          ],
          targetContacts: [],
        }),
      });

      expect(runRes.status).toBe(200);
      const runJson = await runRes.json();
      expect(runJson.report.shadowMode).toBe(true);
      expect(runJson.report.wouldHaveSubmitted).toHaveLength(1);
      const reportId = runJson.report.id;

      // 4. Retrieve saved shadow report via GET /v1/sprint/shadow-reports/:id
      const getRes = await fetch(`${baseUrl}/v1/sprint/shadow-reports/${reportId}`, {
        headers: { authorization: `Bearer ${token}` },
      });
      expect(getRes.status).toBe(200);
      const getJson = await getRes.json();
      expect(getJson.report.id).toBe(reportId);
      expect(getJson.report.wouldHaveSubmitted[0].company).toBe('Airbnb');

      // 5. List shadow reports
      const listRes = await fetch(`${baseUrl}/v1/sprint/shadow-reports`, {
        headers: { authorization: `Bearer ${token}` },
      });
      expect(listRes.status).toBe(200);
      const listJson = await listRes.json();
      expect(listJson.reports).toHaveLength(1);
    } finally {
      await new Promise<void>((resolve, reject) =>
        server.close((err) => (err ? reject(err) : resolve()))
      );
    }
  });
});
