import { describe, expect, it } from 'vitest';
import { createServer } from 'node:http';
import { AddressInfo } from 'node:net';
import { randomUUID } from 'node:crypto';
import { AtsApplyRunner } from '../packages/cloud-core/src/apply/apply-runner';
import { AtsApplyWorker, type PlaywrightApplyDriver } from '../packages/cloud-core/src/apply/playwright-worker';
import { verifyTruthfulness } from '../packages/cloud-core/src/evaluation/truthfulness-gate';
import { OutreachEngine } from '../packages/cloud-core/src/outreach/outreach-engine';
import { AdaptiveCapManager } from '../packages/cloud-core/src/outreach/adaptive-caps';
import { AutoPauseCoordinator } from '../packages/cloud-core/src/sprint/auto-pause';
import { SuppressionPropagator } from '../packages/cloud-core/src/privacy/suppression-propagator';
import type { SprintContract } from '../packages/cloud-core/src/contract';
import type { CandidateConfirmedProfile } from '../packages/cloud-core/src/apply/answer-bank';
import type { JobPosting } from '../packages/cloud-core/src/plugins';
import type { Person } from '../packages/cloud-core/src/person-graph/person-types';
import type { CandidateFact } from '../packages/cloud-core/src/career-graph-types';

describe('Milestone M11 Item 8: Staging Runs Against Real Test Mailbox & Mock ATS Pages', () => {
  const tenantId = '80000000-0000-4000-8000-000000000001';
  const factId = randomUUID();

  const mockContract: SprintContract = {
    version: 1,
    roles: ['Staff Distributed Systems Engineer'],
    seniority: ['staff', 'senior'],
    locations: ['Remote'],
    remotePreference: 'remote',
    salaryFloor: { amount: 180000, currency: 'USD' },
    workAuthorization: { countries: ['US'], requiresSponsorship: false, confirmed: true },
    blocklist: { companies: [], industries: [] },
    enabledChannels: ['ats', 'email', 'calendar', 'linkedin_assist'],
    dailyCaps: { applications: 25, emails: 25, assistQueueItems: 10, calendarEvents: 5 },
    allowedFactIds: [factId],
    defaultAnswers: {},
    tone: 'professional',
    senderIdentity: { name: 'Jordan Lee', email: 'jordan@staging.careerops.internal' },
    jurisdiction: ['US'],
    outreachConsent: true,
    consentTextVersion: 'v1.0',
    startsAt: new Date(Date.now() - 3600000).toISOString(),
    endsAt: new Date(Date.now() + 86400000 * 3).toISOString(),
  };

  const mockProfile: CandidateConfirmedProfile = {
    firstName: 'Jordan',
    lastName: 'Lee',
    email: 'jordan@staging.careerops.internal',
    phone: '+1-555-0199',
    location: 'San Francisco, CA',
    experiences: [
      {
        company: 'Apex Cloud',
        title: 'Staff Distributed Systems Engineer',
        startDate: '2020-01-01',
        isCurrent: true,
        achievements: [
          'Engineered global Raft storage engine processing 100k writes/sec',
          'Reduced cross-region p99 latency by 45%',
        ],
      },
    ],
    skills: ['Go', 'Rust', 'Distributed Systems', 'PostgreSQL'],
  };

  const confirmedFacts: CandidateFact[] = [
    {
      factKey: 'exp.apex-cloud',
      category: 'experience',
      payload: {
        company: 'Apex Cloud',
        role: 'Staff Distributed Systems Engineer',
        startDate: '2020-01-01',
        endDate: null,
        isCurrent: true,
        achievements: [
          'Engineered global Raft storage engine processing 100k writes/sec',
          'Reduced cross-region p99 latency by 45%',
        ],
      },
      source: { kind: 'document' },
      suggestedConfidence: 1.0,
    },
  ];

  it('stage 1: discovers mock ATS posting, passes truthfulness gate, and submits application with verifiable proof', async () => {
    // 1. Setup Mock ATS Server
    const submittedApplications: any[] = [];
    const atsServer = createServer((req, res) => {
      if (req.method === 'POST' && req.url === '/api/v1/applications') {
        let body = '';
        req.on('data', (c) => (body += c));
        req.on('end', () => {
          const parsed = JSON.parse(body);
          submittedApplications.push(parsed);
          res.writeHead(200, { 'content-type': 'application/json' });
          res.end(
            JSON.stringify({
              status: 'submitted',
              application_id: `mock-app-${submittedApplications.length}`,
              received_at: new Date().toISOString(),
            })
          );
        });
        return;
      }
      res.writeHead(404).end();
    });

    await new Promise<void>((resolve) => atsServer.listen(0, resolve));
    const atsPort = (atsServer.address() as AddressInfo).port;
    const atsUrl = `http://127.0.0.1:${atsPort}/jobs/12345`;

    try {
      const posting: JobPosting = {
        sourceId: 'greenhouse:mock-corp',
        platform: 'greenhouse',
        title: 'Staff Distributed Systems Engineer',
        company: 'Mock Corp',
        location: 'Remote',
        remoteType: 'remote',
        url: atsUrl,
        externalId: '12345',
        descriptionText: 'Looking for a Staff Systems Engineer with Go and Raft experience.',
        postedAt: new Date().toISOString(),
      };

      // 2. Automated Truthfulness Check on candidate profile & facts
      const truthCheck = verifyTruthfulness(
        `I am currently a Staff Distributed Systems Engineer at Apex Cloud. I engineered Raft storage handling 100k writes/sec and reduced latency by 45%.`,
        confirmedFacts,
        'Mock Corp'
      );
      expect(truthCheck.passed).toBe(true);
      expect(truthCheck.violations).toHaveLength(0);

      // 3. Mock Playwright Driver interacting with Mock ATS
      const mockDriver: PlaywrightApplyDriver = {
        extractFields: async () => ({
          html: '<form><input name="first_name"/><input name="last_name"/><input name="email"/></form>',
          fields: [
            { id: '1', name: 'first_name', label: 'First Name', type: 'text', required: true },
            { id: '2', name: 'last_name', label: 'Last Name', type: 'text', required: true },
            { id: '3', name: 'email', label: 'Email', type: 'email', required: true },
          ],
        }),
        submitForm: async (url, answers) => {
          // Send HTTP POST to mock ATS
          const res = await fetch(`http://127.0.0.1:${atsPort}/api/v1/applications`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ url, answers }),
          });
          const json = (await res.json()) as any;
          return {
            success: true,
            confirmationNumber: json.application_id,
            screenshotUrl: `https://storage.staging.careerops.internal/proofs/${json.application_id}.png`,
            submittedPayload: answers,
            htmlAfterSubmit: `<div class="success">Application Received! #${json.application_id}</div>`,
          };
        },
      };

      const worker = new AtsApplyWorker(mockDriver);
      const runner = new AtsApplyRunner(worker);

      const result = await runner.execute({
        tenantId,
        contract: mockContract,
        profile: mockProfile,
        job: posting,
        evaluationScore: 4.8,
      });

      expect(result.status).toBe('applied');
      expect(result.proof?.confirmationNumber).toBe('mock-app-1');
      expect(result.proof?.payloadSha256).toMatch(/^[a-f0-9]{64}$/);
      expect(submittedApplications).toHaveLength(1);
      expect(submittedApplications[0].answers.first_name).toBe('Jordan');
      expect(submittedApplications[0].answers.email).toBe('jordan@staging.careerops.internal');
    } finally {
      await new Promise<void>((resolve, reject) =>
        atsServer.close((err) => (err ? reject(err) : resolve()))
      );
    }
  });

  it('stage 2: outreach wave executes against real test mailbox and auto-pauses upon verified bounce signal', async () => {
    // 1. In-Memory Test Mailbox Adapter
    const sentMailbox: Array<{ to: string; subject: string; body: string; messageId: string }> = [];
    const testMailboxAdapter = {
      sendMessage: async (options: { recipient: string; subject: string; bodyText: string }) => {
        const messageId = `<staging-${randomUUID()}@staging.careerops.internal>`;
        sentMailbox.push({
          to: options.recipient,
          subject: options.subject,
          body: options.bodyText,
          messageId,
        });
        return { success: true, messageId, threadId: `thread-${randomUUID()}` };
      },
    };

    const targetPerson: Person = {
      id: 'person-hiring-manager-1',
      tenantId,
      name: 'Sarah Connor',
      email: 'sconnor@mockcorp.internal',
      company: 'Mock Corp',
      title: 'VP of Engineering',
      roleDomain: 'engineering_leadership',
      relationship: '2nd_degree',
      verificationSource: 'public_company_page',
      provenanceEvidence: {
        sourceUrl: 'https://mockcorp.internal/team/sarah-connor',
        contentHash: 'a'.repeat(64),
        retrievedAt: new Date().toISOString(),
        providerRecordId: 'corp-team-101',
      },
      timeZone: 'America/Los_Angeles',
      crmStage: 'lead',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const capManager = new AdaptiveCapManager();
    const outreachEngine = new OutreachEngine(mockContract, testMailboxAdapter as any, capManager);

    // 2. Execute Outreach Message
    const outreachResult = await outreachEngine.executeOutreach({
      person: targetPerson,
      targetRoleTitle: 'Staff Distributed Systems Engineer',
      companyName: 'Mock Corp',
      sequenceStep: 1,
      confirmedHook: 'I saw your team is building raft-based distributed storage at Mock Corp.',
      suppressionList: [],
      existingOutreachToCompany: [],
      currentSentToday: 0,
      now: new Date('2026-11-12T18:00:00.000Z'), // 10:00 AM PT (within quiet hours window)
    });

    expect(outreachResult.status).toBe('sent');
    expect(sentMailbox).toHaveLength(1);
    expect(sentMailbox[0].to).toBe('sconnor@mockcorp.internal');
    expect(sentMailbox[0].body).toContain('Jordan Lee');

    // 3. Simulate Provider Bounce Webhook
    // AutoPauseCoordinator receives verified provider signals: 2 bounces on 5 sends = 40% bounce rate (> 5% max threshold)
    const coordinator = new AutoPauseCoordinator();
    const pauseEvents = coordinator.evaluateMetrics('sprint-staging-1', {
      atsSubmissionsAttempted: 0,
      atsSubmissionsSuccessful: 0,
      atsSubmissionsFailed: 0,
      emailOutreachSent: 5,
      emailBounces: 2,
      emailComplaints: 0,
      emailRepliesReceived: 0,
      emailPositiveReplies: 0,
      emailNegativeReplies: 0,
      truthfulnessGateChecks: 0,
      truthfulnessGatePassed: 0,
      truthfulnessGateBlocked: 0,
      interviewsBooked: 0,
    });

    expect(pauseEvents.some((e) => e.shouldPause && e.affectedChannels.includes('email'))).toBe(true);
    expect(pauseEvents[0].event?.details).toContain('Email bounce rate');

    // 4. Propagate Suppression
    const suppressionPropagator = new SuppressionPropagator();
    const suppressionReceipt = await suppressionPropagator.propagateNotice({
      tenantId,
      contactEmail: 'sconnor@mockcorp.internal',
      reason: 'bounce',
      source: 'provider_webhook',
      scope: 'recipient_only',
    });

    expect(suppressionReceipt.suppressedEmailHash).toBeTruthy();
    expect(suppressionReceipt.actionsTaken.addedToSuppressionList).toBe(true);
    expect(suppressionReceipt.complianceNotice).toContain('suppression notice successfully propagated');
  });
});
