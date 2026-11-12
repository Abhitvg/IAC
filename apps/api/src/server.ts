import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { randomUUID } from 'node:crypto';
import { readBearerToken } from '../../../packages/cloud-core/src/auth';
import { createConsentRecord } from '../../../packages/cloud-core/src/contract';
import {
  CareerGraphFactReviewSchema,
  validateCareerGraphFact,
} from '../../../packages/cloud-core/src/career-graph';
import { extractCandidateFactsFromResume } from '../../../packages/cloud-core/src/importers/resume';
import { extractCandidateFactsFromLinkedInExport } from '../../../packages/cloud-core/src/importers/linkedin';
import {
  extractCandidateFactsFromGitHub,
  type GitHubUserProfile,
  type GitHubRepository,
} from '../../../packages/cloud-core/src/importers/github';
import {
  ApplicationInputSchema,
  ApplicationStatusEnum,
  type TransitionRequest,
} from '../../../packages/cloud-core/src/tracker';
import { evaluateJobCredibility } from '../../../packages/cloud-core/src/discovery/ghost-scam-filter';
import { runDiscoveryWave } from '../../../packages/cloud-core/src/discovery/scheduler';
import type { JobPosting } from '../../../packages/cloud-core/src/plugins';
import { evaluateJobFit } from '../../../packages/cloud-core/src/evaluation/ah-evaluation';
import { generateTailoredArtifacts } from '../../../packages/cloud-core/src/evaluation/tailoring-engine';
import { verifyTruthfulness } from '../../../packages/cloud-core/src/evaluation/truthfulness-gate';
import type { CandidateFact } from '../../../packages/cloud-core/src/career-graph-types';
import { AtsApplyRunner } from '../../../packages/cloud-core/src/apply/apply-runner';
import {
  AtsApplyWorker,
  type PlaywrightApplyDriver,
} from '../../../packages/cloud-core/src/apply/playwright-worker';
import type {
  CandidateConfirmedProfile,
  FormField,
} from '../../../packages/cloud-core/src/apply/answer-bank';
import type { AssistQueueStatus } from '../../../packages/cloud-core/src/apply/assist-queue';
import { EmailReplyClassifier } from '../../../packages/cloud-core/src/inbound/classifier';
import { AutoScheduler } from '../../../packages/cloud-core/src/inbound/auto-scheduler';
import { GoogleCalendarConnector } from '../../../packages/cloud-core/src/connectors/calendar/google-calendar';
import type { InboundEmailMessage } from '../../../packages/cloud-core/src/connectors/email/email-types';
import type { CalendarConnector } from '../../../packages/cloud-core/src/connectors/calendar/calendar-types';
import { PersonRanker } from '../../../packages/cloud-core/src/person-graph/ranker';
import type { Person, CrmStage } from '../../../packages/cloud-core/src/person-graph/person-types';
import { OutreachEngine } from '../../../packages/cloud-core/src/outreach/outreach-engine';
import { OutreachComplianceEngine } from '../../../packages/cloud-core/src/outreach/compliance';
import { AdaptiveCapManager } from '../../../packages/cloud-core/src/outreach/adaptive-caps';
import { LinkedInSecurityGate } from '../../../packages/cloud-core/src/linkedin/oauth';
import { LinkedInExportParser } from '../../../packages/cloud-core/src/linkedin/export-importer';
import { LinkedInProfileAuditor } from '../../../packages/cloud-core/src/linkedin/profile-audit';
import {
  LinkedInRestrictionManager,
  type LinkedInRestrictionReport,
} from '../../../packages/cloud-core/src/linkedin/restrictions';
import { SprintOrchestrator } from '../../../packages/cloud-core/src/sprint/sprint-orchestrator';
import { OutcomeForecaster } from '../../../packages/cloud-core/src/sprint/forecaster';
import { AdaptiveAllocator } from '../../../packages/cloud-core/src/sprint/allocator';
import { AutoPauseCoordinator } from '../../../packages/cloud-core/src/sprint/auto-pause';
import type {
  SprintConfig,
  SprintMetrics,
  SprintRun,
  AllocationArm,
} from '../../../packages/cloud-core/src/sprint/types';
import { globalActivityHub } from './activity-hub';
import { resolveTenantContext } from '../../../packages/cloud-core/src/tenant';
import type { CloudApiDependencies } from './ports';

function sendJson(response: ServerResponse, status: number, body: unknown): void {
  response.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
    'referrer-policy': 'no-referrer',
    'x-frame-options': 'DENY',
  });
  response.end(JSON.stringify(body));
}

async function readJson(
  request: IncomingMessage,
  maxBytes: number
): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.length;
    if (size > maxBytes) throw new Error('Request body exceeds size limit');
    chunks.push(buffer);
  }
  const parsed = JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown;
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('Request body must be a JSON object');
  }
  return parsed as Record<string, unknown>;
}

export function createCloudApiServer(dependencies: CloudApiDependencies) {
  const maxBytes = dependencies.config.maxRequestBytes ?? 16 * 1024;

  return createServer(async (request, response) => {
    const requestId = randomUUID();
    response.setHeader('x-request-id', requestId);

    try {
      const url = new URL(request.url ?? '/', 'http://localhost');
      if (request.method === 'GET' && url.pathname === '/health/live') {
        sendJson(response, 200, { status: 'ok', requestId });
        return;
      }
      if (request.method === 'GET' && url.pathname === '/health/ready') {
        try {
          await dependencies.repository.checkReady();
          sendJson(response, 200, { status: 'ready', requestId });
        } catch {
          sendJson(response, 503, { status: 'not_ready', requestId });
        }
        return;
      }

      const ipKey = `ip:${request.socket.remoteAddress ?? 'unknown'}`;
      if (!(await dependencies.rateLimiter.consume(ipKey, 60, 60_000))) {
        sendJson(response, 429, { error: 'Rate limit exceeded', requestId });
        return;
      }

      const token = readBearerToken(request.headers.authorization);
      const identity = await dependencies.identityVerifier.verify(token);
      const requestedTenant = request.headers['x-tenant-id'];
      if (Array.isArray(requestedTenant)) throw new Error('Invalid tenant selection header');
      const tenant = await resolveTenantContext(
        identity.subject,
        dependencies.repository,
        requestedTenant
      );
      if (!(await dependencies.rateLimiter.consume(`tenant:${tenant.tenantId}`, 300, 60_000))) {
        sendJson(response, 429, { error: 'Tenant rate limit exceeded', requestId });
        return;
      }

      if (request.method === 'GET' && url.pathname === '/v1/me') {
        sendJson(response, 200, {
          subject: tenant.subject,
          tenantId: tenant.tenantId,
          role: tenant.role,
        });
        return;
      }

      if (request.method === 'GET' && url.pathname === '/v1/career-graph/facts') {
        const rawLimit = url.searchParams.get('limit');
        const limit = rawLimit === null ? 50 : Number(rawLimit);
        if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
          sendJson(response, 400, {
            error: 'limit must be an integer between 1 and 100',
            requestId,
          });
          return;
        }
        const facts = await dependencies.careerGraph.listFacts(
          tenant.tenantId,
          tenant.subject,
          limit
        );
        sendJson(response, 200, { facts, requestId });
        return;
      }

      if (request.method === 'POST' && url.pathname === '/v1/career-graph/facts') {
        const body = await readJson(request, maxBytes);
        const input = validateCareerGraphFact(tenant.tenantId, tenant.subject, body);
        const fact = await dependencies.careerGraph.createFact(
          tenant.tenantId,
          tenant.subject,
          input
        );
        sendJson(response, 201, { fact, requestId });
        return;
      }

      const factReviewMatch = url.pathname.match(
        /^\/v1\/career-graph\/facts\/([0-9a-f-]{36})\/review$/i
      );
      if (request.method === 'POST' && factReviewMatch) {
        const body = await readJson(request, maxBytes);
        const review = CareerGraphFactReviewSchema.parse(body);
        const fact = await dependencies.careerGraph.reviewFact(
          tenant.tenantId,
          tenant.subject,
          factReviewMatch[1],
          review
        );
        sendJson(response, 200, { fact, requestId });
        return;
      }

      if (request.method === 'POST' && url.pathname === '/v1/career-graph/extract/resume') {
        const body = await readJson(request, maxBytes);
        if (typeof body.text !== 'string') {
          sendJson(response, 400, { error: 'Expected string text field', requestId });
          return;
        }
        const candidateFacts = extractCandidateFactsFromResume(
          body.text,
          typeof body.filename === 'string' ? { filename: body.filename } : {}
        );
        sendJson(response, 200, { candidateFacts, count: candidateFacts.length, requestId });
        return;
      }

      if (request.method === 'POST' && url.pathname === '/v1/career-graph/extract/linkedin') {
        const body = await readJson(request, maxBytes);
        const candidateFacts = extractCandidateFactsFromLinkedInExport({
          positionsCsv: typeof body.positionsCsv === 'string' ? body.positionsCsv : undefined,
          educationCsv: typeof body.educationCsv === 'string' ? body.educationCsv : undefined,
          skillsCsv: typeof body.skillsCsv === 'string' ? body.skillsCsv : undefined,
          certificationsCsv:
            typeof body.certificationsCsv === 'string' ? body.certificationsCsv : undefined,
          profileCsv: typeof body.profileCsv === 'string' ? body.profileCsv : undefined,
        });
        sendJson(response, 200, { candidateFacts, count: candidateFacts.length, requestId });
        return;
      }

      if (request.method === 'POST' && url.pathname === '/v1/career-graph/extract/github') {
        const body = await readJson(request, maxBytes);
        if (!body.user || typeof body.user !== 'object' || !Array.isArray(body.repositories)) {
          sendJson(response, 400, {
            error: 'Expected user object and repositories array',
            requestId,
          });
          return;
        }
        const candidateFacts = extractCandidateFactsFromGitHub({
          user: body.user as unknown as GitHubUserProfile,
          repositories: body.repositories as unknown as GitHubRepository[],
        });
        sendJson(response, 200, { candidateFacts, count: candidateFacts.length, requestId });
        return;
      }

      if (request.method === 'GET' && url.pathname === '/v1/sprint-contract') {
        const record = await dependencies.repository.getActiveSprintContract(tenant.tenantId);
        sendJson(response, 200, {
          contract: record
            ? {
                id: record.id,
                revision: record.revision,
                tenantId: record.tenantId,
                acceptedBy: record.subject,
                contract: record.contract,
                contractHash: record.contractHash,
                acceptedAt: record.acceptedAt,
                revokedAt: record.revokedAt,
              }
            : null,
        });
        return;
      }

      if (request.method === 'POST' && url.pathname === '/v1/sprint-contract') {
        if (tenant.role !== 'owner') {
          sendJson(response, 403, { error: 'Tenant owner role required', requestId });
          return;
        }
        const body = await readJson(request, maxBytes);
        const record = createConsentRecord(
          tenant.tenantId,
          tenant.subject,
          body,
          dependencies.config.consentSigningSecret
        );
        const persisted = await dependencies.repository.acceptSprintContract(record);
        sendJson(response, 201, {
          id: persisted.id,
          revision: persisted.revision,
          contractHash: record.contractHash,
          acceptedAt: record.acceptedAt,
          revokedAt: null,
        });
        return;
      }

      const revokeMatch = url.pathname.match(/^\/v1\/sprint-contract\/([0-9a-f-]{36})\/revoke$/i);
      if (request.method === 'POST' && revokeMatch) {
        if (tenant.role !== 'owner') {
          sendJson(response, 403, { error: 'Tenant owner role required', requestId });
          return;
        }
        const body = await readJson(request, maxBytes);
        if (Object.keys(body).length !== 0) {
          sendJson(response, 400, { error: 'Revocation request body must be empty', requestId });
          return;
        }
        const activeContract = await dependencies.repository.getActiveSprintContract(
          tenant.tenantId
        );
        if (!activeContract || activeContract.id !== revokeMatch[1]) {
          sendJson(response, 404, { error: 'Active Sprint Contract not found', requestId });
          return;
        }
        if (activeContract.subject !== tenant.subject) {
          sendJson(response, 403, {
            error: 'Only the accepting owner can revoke this Sprint Contract',
            requestId,
          });
          return;
        }
        const revokedAt = new Date().toISOString();
        await dependencies.repository.revokeSprintContract({
          tenantId: tenant.tenantId,
          subject: tenant.subject,
          contractId: revokeMatch[1],
          revokedAt,
          metadata: { requestId },
        });
        sendJson(response, 200, { revoked: true, revokedAt });
        return;
      }

      if (request.method === 'GET' && url.pathname === '/v1/controls') {
        const controls = await dependencies.repository.getControlState(tenant.tenantId);
        if (controls.tenantId !== tenant.tenantId)
          throw new Error('Tenant control context mismatch');
        sendJson(response, 200, controls);
        return;
      }

      if (request.method === 'POST' && url.pathname === '/v1/controls/kill-switch') {
        if (tenant.role !== 'owner') {
          sendJson(response, 403, { error: 'Tenant owner role required', requestId });
          return;
        }
        const body = await readJson(request, maxBytes);
        if (
          typeof body.enabled !== 'boolean' ||
          Object.keys(body).some((key) => key !== 'enabled')
        ) {
          sendJson(response, 400, {
            error: 'Expected exactly one boolean field: enabled',
            requestId,
          });
          return;
        }
        const occurredAt = new Date().toISOString();
        await dependencies.repository.setGlobalKillSwitchWithAudit({
          tenantId: tenant.tenantId,
          actorSubject: tenant.subject,
          enabled: body.enabled,
          occurredAt,
          metadata: { requestId, enabled: body.enabled },
        });
        sendJson(response, 200, {
          tenantId: tenant.tenantId,
          globalKillSwitch: body.enabled,
          updatedAt: occurredAt,
        });
        return;
      }

      if (request.method === 'POST' && url.pathname === '/v1/controls/channel-pause') {
        if (tenant.role !== 'owner') {
          sendJson(response, 403, { error: 'Tenant owner role required', requestId });
          return;
        }
        const body = await readJson(request, maxBytes);
        const channels = ['ats', 'email', 'calendar', 'linkedin_assist'] as const;
        if (
          typeof body.channel !== 'string' ||
          !channels.includes(body.channel as (typeof channels)[number]) ||
          typeof body.paused !== 'boolean' ||
          Object.keys(body).some((key) => key !== 'channel' && key !== 'paused')
        ) {
          sendJson(response, 400, {
            error: 'Expected a supported channel and boolean paused field',
            requestId,
          });
          return;
        }
        const occurredAt = new Date().toISOString();
        await dependencies.repository.setChannelPauseWithAudit({
          tenantId: tenant.tenantId,
          actorSubject: tenant.subject,
          channel: body.channel as (typeof channels)[number],
          paused: body.paused,
          occurredAt,
          metadata: { requestId, channel: body.channel, paused: body.paused },
        });
        sendJson(response, 200, {
          tenantId: tenant.tenantId,
          channel: body.channel,
          paused: body.paused,
          updatedAt: occurredAt,
        });
        return;
      }

      if (request.method === 'GET' && url.pathname === '/v1/applications') {
        if (!dependencies.applicationTracker) {
          sendJson(response, 501, { error: 'Application tracker not configured', requestId });
          return;
        }
        const rawStatus = url.searchParams.get('status');
        const status = rawStatus ? ApplicationStatusEnum.parse(rawStatus) : undefined;
        const limit = url.searchParams.has('limit') ? Number(url.searchParams.get('limit')) : 50;
        const offset = url.searchParams.has('offset') ? Number(url.searchParams.get('offset')) : 0;
        const applications = await dependencies.applicationTracker.listApplications(
          tenant.tenantId,
          {
            status,
            limit,
            offset,
          }
        );
        sendJson(response, 200, { applications, count: applications.length, requestId });
        return;
      }

      if (request.method === 'POST' && url.pathname === '/v1/applications') {
        if (!dependencies.applicationTracker) {
          sendJson(response, 501, { error: 'Application tracker not configured', requestId });
          return;
        }
        const body = await readJson(request, maxBytes);
        const input = ApplicationInputSchema.parse(body);
        const application = await dependencies.applicationTracker.createApplication(
          tenant.tenantId,
          tenant.subject,
          input
        );
        sendJson(response, 201, { application, requestId });
        return;
      }

      const appMatch = url.pathname.match(/^\/v1\/applications\/([0-9a-f-]{36})$/i);
      if (request.method === 'GET' && appMatch) {
        if (!dependencies.applicationTracker) {
          sendJson(response, 501, { error: 'Application tracker not configured', requestId });
          return;
        }
        const application = await dependencies.applicationTracker.getApplication(
          tenant.tenantId,
          appMatch[1]
        );
        if (!application) {
          sendJson(response, 404, { error: 'Application not found', requestId });
          return;
        }
        const timeline = await dependencies.applicationTracker.getApplicationTimeline(
          tenant.tenantId,
          appMatch[1]
        );
        sendJson(response, 200, { application, timeline, requestId });
        return;
      }

      const transitionMatch = url.pathname.match(
        /^\/v1\/applications\/([0-9a-f-]{36})\/transition$/i
      );
      if (request.method === 'POST' && transitionMatch) {
        if (!dependencies.applicationTracker) {
          sendJson(response, 501, { error: 'Application tracker not configured', requestId });
          return;
        }
        const body = await readJson(request, maxBytes);
        const requestPayload = body as unknown as TransitionRequest;
        const application = await dependencies.applicationTracker.transitionApplication(
          tenant.tenantId,
          tenant.subject,
          transitionMatch[1],
          requestPayload
        );
        sendJson(response, 200, { application, requestId });
        return;
      }

      const withdrawMatch = url.pathname.match(/^\/v1\/applications\/([0-9a-f-]{36})\/withdraw$/i);
      if (request.method === 'POST' && withdrawMatch) {
        if (!dependencies.applicationTracker) {
          sendJson(response, 501, { error: 'Application tracker not configured', requestId });
          return;
        }
        const body = await readJson(request, maxBytes);
        if (typeof body.reason !== 'string' || !body.reason.trim()) {
          sendJson(response, 400, {
            error: 'A clear reason is required to withdraw an application',
            requestId,
          });
          return;
        }
        const application = await dependencies.applicationTracker.withdrawApplication(
          tenant.tenantId,
          tenant.subject,
          withdrawMatch[1],
          body.reason
        );
        sendJson(response, 200, { application, requestId });
        return;
      }

      if (request.method === 'GET' && url.pathname === '/v1/dashboard/stats') {
        if (!dependencies.applicationTracker) {
          sendJson(response, 501, { error: 'Application tracker not configured', requestId });
          return;
        }
        const metrics = await dependencies.applicationTracker.getDashboardMetrics(tenant.tenantId);
        sendJson(response, 200, { metrics, requestId });
        return;
      }

      if (request.method === 'GET' && url.pathname === '/v1/activity-feed') {
        if (!dependencies.applicationTracker) {
          sendJson(response, 501, { error: 'Application tracker not configured', requestId });
          return;
        }
        const limit = url.searchParams.has('limit') ? Number(url.searchParams.get('limit')) : 50;
        const events = await dependencies.applicationTracker.listActivityEvents(
          tenant.tenantId,
          limit
        );
        sendJson(response, 200, { events, count: events.length, requestId });
        return;
      }

      if (request.method === 'GET' && url.pathname === '/v1/activity-feed/stream') {
        response.writeHead(200, {
          'content-type': 'text/event-stream',
          'cache-control': 'no-cache',
          connection: 'keep-alive',
          'x-accel-buffering': 'no',
        });
        response.write(
          `event: ready\ndata: ${JSON.stringify({ tenantId: tenant.tenantId, requestId })}\n\n`
        );

        const unsubscribe = globalActivityHub.subscribe(tenant.tenantId, (event) => {
          response.write(`event: activity\ndata: ${JSON.stringify(event)}\n\n`);
        });

        request.on('close', () => {
          unsubscribe();
        });
        return;
      }

      if (request.method === 'POST' && url.pathname === '/v1/discovery/evaluate-job') {
        const body = await readJson(request, maxBytes);
        const report = evaluateJobCredibility(body as unknown as JobPosting);
        sendJson(response, 200, { report, requestId });
        return;
      }

      if (request.method === 'POST' && url.pathname === '/v1/discovery/wave') {
        const activeContractRecord = await dependencies.repository.getActiveSprintContract(
          tenant.tenantId
        );
        if (!activeContractRecord) {
          sendJson(response, 400, {
            error: 'Active Sprint Contract required to run discovery waves',
            requestId,
          });
          return;
        }

        const summary = await runDiscoveryWave([], activeContractRecord.contract, {
          trackJob: async (job) => {
            if (!dependencies.applicationTracker) return false;
            try {
              await dependencies.applicationTracker.createApplication(
                tenant.tenantId,
                tenant.subject,
                {
                  company: job.company,
                  role: job.title,
                  sourceUrl: job.url,
                  externalJobId: job.externalId,
                  channel: 'ats',
                  metadata: { source: job.platform },
                }
              );
              return true;
            } catch {
              return false;
            }
          },
        });

        sendJson(response, 200, { summary, requestId });
        return;
      }

      if (request.method === 'POST' && url.pathname === '/v1/evaluation/evaluate') {
        const body = await readJson(request, maxBytes);
        if (!body.job || typeof body.job !== 'object') {
          sendJson(response, 400, { error: 'Expected job object in body', requestId });
          return;
        }
        const activeContractRecord = await dependencies.repository.getActiveSprintContract(
          tenant.tenantId
        );
        const confirmedFacts = Array.isArray(body.confirmedFacts)
          ? (body.confirmedFacts as CandidateFact[])
          : [];
        const report = evaluateJobFit(
          body.job as unknown as JobPosting,
          confirmedFacts,
          activeContractRecord?.contract
        );
        sendJson(response, 200, { report, requestId });
        return;
      }

      if (request.method === 'POST' && url.pathname === '/v1/evaluation/tailor') {
        const body = await readJson(request, maxBytes);
        if (!body.job || typeof body.job !== 'object') {
          sendJson(response, 400, { error: 'Expected job object in body', requestId });
          return;
        }
        const activeContractRecord = await dependencies.repository.getActiveSprintContract(
          tenant.tenantId
        );
        if (!activeContractRecord) {
          sendJson(response, 400, {
            error: 'Active Sprint Contract required for tailoring',
            requestId,
          });
          return;
        }
        const confirmedFacts = Array.isArray(body.confirmedFacts)
          ? (body.confirmedFacts as CandidateFact[])
          : [];
        const artifacts = generateTailoredArtifacts(
          body.job as unknown as JobPosting,
          confirmedFacts,
          activeContractRecord.contract
        );

        const truthfulness = verifyTruthfulness(
          `${artifacts.tailoredResumeLatex} ${artifacts.tailoredCoverLetterText}`,
          confirmedFacts,
          (body.job as unknown as JobPosting).company
        );

        if (!truthfulness.passed) {
          sendJson(response, 422, {
            error: 'Truthfulness gate violation (H3): generated content contains unverified claims',
            truthfulness,
            requestId,
          });
          return;
        }

        sendJson(response, 200, { artifacts, truthfulness, requestId });
        return;
      }

      if (request.method === 'POST' && url.pathname === '/v1/evaluation/verify-truthfulness') {
        const body = await readJson(request, maxBytes);
        if (typeof body.text !== 'string') {
          sendJson(response, 400, { error: 'Expected string text field in body', requestId });
          return;
        }
        const confirmedFacts = Array.isArray(body.confirmedFacts)
          ? (body.confirmedFacts as CandidateFact[])
          : [];
        const result = verifyTruthfulness(
          body.text,
          confirmedFacts,
          typeof body.targetCompany === 'string' ? body.targetCompany : undefined
        );
        sendJson(response, 200, { result, requestId });
        return;
      }

      if (request.method === 'POST' && url.pathname === '/v1/apply/submit') {
        const body = await readJson(request, maxBytes);
        if (!body.job || typeof body.job !== 'object') {
          sendJson(response, 400, { error: 'Expected job object in body', requestId });
          return;
        }

        const activeContractRecord = await dependencies.repository.getActiveSprintContract(
          tenant.tenantId
        );
        if (!activeContractRecord) {
          sendJson(response, 400, {
            error: 'Active Sprint Contract required for ATS application',
            requestId,
          });
          return;
        }

        const controlState = await dependencies.repository.getControlState(tenant.tenantId);

        // Build candidate profile from request or default to contract sender identity
        const candidateProfile: CandidateConfirmedProfile = (body.profile as CandidateConfirmedProfile) || {
          firstName: activeContractRecord.contract.senderIdentity.name.split(' ')[0] || 'Applicant',
          lastName: activeContractRecord.contract.senderIdentity.name.split(' ').slice(1).join(' ') || '',
          email: activeContractRecord.contract.senderIdentity.email,
          location: activeContractRecord.contract.locations[0],
        };

        // Driver setup: allows mock injection for testing and simulated execution
        const mockDriverConfig = body.mockDriver as
          | {
              fields?: FormField[];
              html?: string;
              submitResult?: {
                success?: boolean;
                confirmationNumber?: string;
                screenshotUrl?: string;
                htmlAfterSubmit?: string;
                error?: string;
              };
            }
          | undefined;

        const driver: PlaywrightApplyDriver = {
          extractFields: async (_url: string) => ({
            html: mockDriverConfig?.html || '<html><body><form></form></body></html>',
            fields: mockDriverConfig?.fields || [
              { id: 'first_name', name: 'first_name', label: 'First Name', type: 'text', required: true },
              { id: 'last_name', name: 'last_name', label: 'Last Name', type: 'text', required: true },
              { id: 'email', name: 'email', label: 'Email', type: 'email', required: true },
            ],
          }),
          submitForm: async (_url: string, answers: Record<string, string | boolean | number>) => ({
            success: mockDriverConfig?.submitResult?.success ?? true,
            confirmationNumber: mockDriverConfig?.submitResult?.confirmationNumber || `CONF-${Date.now()}`,
            screenshotUrl: mockDriverConfig?.submitResult?.screenshotUrl || 'https://storage.careerops.local/proofs/proof.png',
            submittedPayload: answers,
            htmlAfterSubmit: mockDriverConfig?.submitResult?.htmlAfterSubmit || '<html><body>Application submitted successfully!</body></html>',
            error: mockDriverConfig?.submitResult?.error,
          }),
        };

        const worker = new AtsApplyWorker(driver);
        const runner = new AtsApplyRunner(worker);

        // Fetch existing applications if tracker is available
        const existingApps = dependencies.applicationTracker
          ? (await dependencies.applicationTracker.listApplications(tenant.tenantId)).map((a) => ({
              company: a.company,
              role: a.role,
              externalJobId: a.externalJobId,
              createdAt: a.createdAt,
            }))
          : [];

        const job = body.job as unknown as JobPosting;
        const evaluationScore = typeof body.evaluationScore === 'number' ? body.evaluationScore : 4.0;

        const runnerResult = await runner.execute({
          tenantId: tenant.tenantId,
          contract: activeContractRecord.contract,
          profile: candidateProfile,
          job,
          evaluationScore,
          tailoredCvText: typeof body.tailoredCvText === 'string' ? body.tailoredCvText : undefined,
          tailoredCoverLetterText:
            typeof body.tailoredCoverLetterText === 'string'
              ? body.tailoredCoverLetterText
              : undefined,
          resumeUrl: typeof body.resumeUrl === 'string' ? body.resumeUrl : undefined,
          scoreThreshold: typeof body.scoreThreshold === 'number' ? body.scoreThreshold : 3.5,
          existingApplications: existingApps,
          isKillSwitchActive: () => controlState.globalKillSwitch,
          isChannelPaused: (ch: string) => controlState.pausedChannels.includes(ch as any),
        });

        if (runnerResult.status === 'applied') {
          if (dependencies.applicationTracker) {
            try {
              await dependencies.applicationTracker.createApplication(
                tenant.tenantId,
                identity.subject,
                {
                  company: job.company,
                  role: job.title,
                  sourceUrl: job.url,
                  externalJobId: job.externalId || job.sourceId,
                  channel: 'ats',
                  score: evaluationScore,
                  metadata: {
                    autoSubmitted: true,
                    submissionId: runnerResult.proof?.submissionId,
                  },
                }
              );
            } catch {
              // Ignore if already tracking
            }
          }

          globalActivityHub.broadcast({
            id: randomUUID(),
            tenantId: tenant.tenantId,
            eventType: 'application_submitted',
            title: `Application submitted: ${job.company}`,
            description: `Autonomous ATS application submitted for ${job.company} - ${job.title}`,
            severity: 'info',
            actorSubject: identity.subject,
            createdAt: new Date().toISOString(),
            metadata: {
              jobId: job.sourceId || job.externalId,
              company: job.company,
              role: job.title,
              proofSha256: runnerResult.proof?.payloadSha256,
              confirmationNumber: runnerResult.proof?.confirmationNumber,
            },
          });
        } else if (runnerResult.status === 'assist_required') {
          if (dependencies.assistQueue && runnerResult.assistQueueItem) {
            await dependencies.assistQueue.enqueue(
              tenant.tenantId,
              runnerResult.assistQueueItem,
              identity.subject
            );
          }

          globalActivityHub.broadcast({
            id: randomUUID(),
            tenantId: tenant.tenantId,
            eventType: 'assist_action_required',
            title: `Assist required: ${job.company}`,
            description: `Assist Queue handoff: ${runnerResult.reason} for ${job.company} - ${job.title}`,
            severity: 'warn',
            actorSubject: identity.subject,
            createdAt: new Date().toISOString(),
            metadata: {
              jobId: job.sourceId || job.externalId,
              company: job.company,
              role: job.title,
              reason: runnerResult.reason,
            },
          });
        }

        sendJson(response, 200, { result: runnerResult, requestId });
        return;
      }

      if (request.method === 'GET' && url.pathname === '/v1/assist-queue') {
        if (!dependencies.assistQueue) {
          sendJson(response, 200, { items: [], requestId });
          return;
        }
        const statusParam = url.searchParams.get('status') as AssistQueueStatus | null;
        const items = await dependencies.assistQueue.list(
          tenant.tenantId,
          statusParam || undefined
        );
        sendJson(response, 200, { items, requestId });
        return;
      }

      const assistMatch = url.pathname.match(
        /^\/v1\/assist-queue\/([0-9a-fA-F-]{36})\/(open|complete|dismiss)$/
      );
      if (request.method === 'POST' && assistMatch) {
        if (!dependencies.assistQueue) {
          sendJson(response, 501, { error: 'Assist queue repository not configured', requestId });
          return;
        }
        const [, assistId, action] = assistMatch;
        let item;
        if (action === 'open') {
          item = await dependencies.assistQueue.markOpened(
            tenant.tenantId,
            assistId,
            identity.subject
          );
        } else if (action === 'complete') {
          const body = await readJson(request, maxBytes);
          item = await dependencies.assistQueue.complete(
            tenant.tenantId,
            assistId,
            typeof body.assistNotes === 'string' ? body.assistNotes : undefined,
            identity.subject
          );
        } else if (action === 'dismiss') {
          item = await dependencies.assistQueue.dismiss(
            tenant.tenantId,
            assistId,
            identity.subject
          );
        }
        sendJson(response, 200, { item, requestId });
        return;
      }

      if (request.method === 'POST' && url.pathname === '/v1/inbound/classify-email') {
        const body = await readJson(request, maxBytes);
        if (typeof body.senderEmail !== 'string' || typeof body.subject !== 'string' || typeof body.bodyText !== 'string') {
          sendJson(response, 400, {
            error: 'Expected senderEmail, subject, and bodyText strings in body',
            requestId,
          });
          return;
        }

        const classifier = new EmailReplyClassifier();
        const classification = classifier.classify({
          senderEmail: body.senderEmail,
          senderName: typeof body.senderName === 'string' ? body.senderName : undefined,
          subject: body.subject,
          bodyText: body.bodyText,
        });

        sendJson(response, 200, { classification, requestId });
        return;
      }

      if (request.method === 'POST' && url.pathname === '/v1/inbound/process-message') {
        const body = await readJson(request, maxBytes);
        if (!body.message || typeof body.message !== 'object') {
          sendJson(response, 400, { error: 'Expected message object in body', requestId });
          return;
        }

        const msg = body.message as unknown as InboundEmailMessage;
        const classifier = new EmailReplyClassifier();
        const classification = classifier.classify({
          senderEmail: msg.sender?.email || (msg as any).senderEmail || '',
          senderName: msg.sender?.name || (msg as any).senderName,
          subject: msg.subject || '',
          bodyText: msg.bodyText || '',
        });

        // Record inbound message if repository configured
        let recordedRecord;
        if (dependencies.inbound) {
          recordedRecord = await dependencies.inbound.recordMessage(
            tenant.tenantId,
            {
              provider: msg.provider || 'webhook',
              externalMessageId: msg.id || randomUUID(),
              threadId: msg.threadId,
              senderEmail: classification.senderInfo.email,
              senderName: classification.senderInfo.name,
              subject: classification.sanitizedSubject,
              snippet: classification.sanitizedBody.slice(0, 200),
              classification: classification.category,
              requiresAction: classification.requiresScheduling,
              handled: false,
              metadata: {
                confidence: classification.confidence,
                schedulingUrl: classification.schedulingUrl,
              },
              receivedAt: msg.receivedAt || new Date().toISOString(),
            },
            identity.subject
          );
        }

        // Auto-scheduler execution
        const calendarConnector: CalendarConnector = (body.mockCalendar as CalendarConnector) || new GoogleCalendarConnector({
          accessToken: 'default_token',
        });

        const activeContract = await dependencies.repository.getActiveSprintContract(tenant.tenantId);
        const candidateName = typeof body.candidateName === 'string'
          ? body.candidateName
          : activeContract?.contract.senderIdentity.name || 'Candidate';

        const scheduler = new AutoScheduler(
          calendarConnector,
          {
            timeZone: typeof body.timeZone === 'string' ? body.timeZone : 'UTC',
            startHour: 9,
            endHour: 17,
            meetingDurationMinutes: 30,
            bufferMinutes: 15,
            candidateName,
          },
          body.mockEmail as any
        );

        const schedulingResult = await scheduler.processInbound(
          classification,
          msg.id,
          msg.threadId
        );

        // Update application tracker & broadcast activity
        if (schedulingResult.action === 'interview_booked') {
          globalActivityHub.broadcast({
            id: randomUUID(),
            tenantId: tenant.tenantId,
            eventType: 'interview_scheduled',
            title: `Interview scheduled: ${classification.senderInfo.company || 'Recruiter'}`,
            description: `Auto-booked interview slot: ${schedulingResult.calendarEvent?.start}`,
            severity: 'success',
            actorSubject: identity.subject,
            createdAt: new Date().toISOString(),
            metadata: {
              eventId: schedulingResult.calendarEvent?.id,
              meetUrl: schedulingResult.calendarEvent?.meetUrl,
              company: classification.senderInfo.company,
            },
          });

          if (dependencies.applicationTracker && classification.senderInfo.company) {
            const apps = await dependencies.applicationTracker.listApplications(tenant.tenantId);
            const matchedApp = apps.find(
              (a) => a.company.toLowerCase() === classification.senderInfo.company?.toLowerCase()
            );
            if (matchedApp && (matchedApp.status === 'applied' || matchedApp.status === 'replied')) {
              try {
                await dependencies.applicationTracker.transitionApplication(
                  tenant.tenantId,
                  matchedApp.id,
                  identity.subject,
                  {
                    toStatus: 'interviewing',
                    reason: `Auto-scheduled interview from recruiter email reply`,
                    metadata: {
                      calendarEventId: schedulingResult.calendarEvent?.id,
                      meetUrl: schedulingResult.calendarEvent?.meetUrl,
                    },
                  }
                );
              } catch {
                // Ignore if transition disallowed
              }
            }
          }
        } else if (classification.category === 'rejection') {
          globalActivityHub.broadcast({
            id: randomUUID(),
            tenantId: tenant.tenantId,
            eventType: 'rejection_received',
            title: `Update received: ${classification.senderInfo.company || 'Application'}`,
            description: `Recruiter indicated position is filled or not moving forward`,
            severity: 'info',
            actorSubject: identity.subject,
            createdAt: new Date().toISOString(),
            metadata: {
              company: classification.senderInfo.company,
            },
          });

          if (dependencies.applicationTracker && classification.senderInfo.company) {
            const apps = await dependencies.applicationTracker.listApplications(tenant.tenantId);
            const matchedApp = apps.find(
              (a) => a.company.toLowerCase() === classification.senderInfo.company?.toLowerCase()
            );
            if (matchedApp && matchedApp.status !== 'rejected' && matchedApp.status !== 'withdrawn') {
              try {
                await dependencies.applicationTracker.transitionApplication(
                  tenant.tenantId,
                  matchedApp.id,
                  identity.subject,
                  {
                    toStatus: 'rejected',
                    reason: `Automated detection from company email rejection notice`,
                  }
                );
              } catch {
                // Ignore
              }
            }
          }
        }

        sendJson(response, 200, {
          classification,
          schedulingResult,
          inboundRecord: recordedRecord,
          requestId,
        });
        return;
      }

      if (request.method === 'GET' && url.pathname === '/v1/inbound/messages') {
        if (!dependencies.inbound) {
          sendJson(response, 200, { messages: [], requestId });
          return;
        }
        const limitParam = parseInt(url.searchParams.get('limit') || '50', 10);
        const messages = await dependencies.inbound.listMessages(
          tenant.tenantId,
          isNaN(limitParam) ? 50 : limitParam
        );
        sendJson(response, 200, { messages, requestId });
        return;
      }

      if (request.method === 'POST' && url.pathname === '/v1/calendar/free-busy') {
        const body = await readJson(request, maxBytes);
        const timeMin = typeof body.timeMin === 'string' ? body.timeMin : new Date().toISOString();
        const timeMax =
          typeof body.timeMax === 'string'
            ? body.timeMax
            : new Date(Date.now() + 7 * 86400000).toISOString();
        const timeZone = typeof body.timeZone === 'string' ? body.timeZone : 'UTC';

        const calendarConnector: CalendarConnector =
          (body.mockCalendar as CalendarConnector) ||
          new GoogleCalendarConnector({ accessToken: 'default_token' });

        const busySlots = await calendarConnector.listFreeBusy(timeMin, timeMax, timeZone);
        sendJson(response, 200, { timeMin, timeMax, timeZone, busySlots, requestId });
        return;
      }

      if (request.method === 'POST' && url.pathname === '/v1/people') {
        if (!dependencies.outreach) {
          sendJson(response, 501, { error: 'Outreach repository not configured', requestId });
          return;
        }
        const body = await readJson(request, maxBytes);
        if (
          typeof body.email !== 'string' ||
          typeof body.name !== 'string' ||
          typeof body.company !== 'string' ||
          typeof body.title !== 'string' ||
          typeof body.roleDomain !== 'string' ||
          typeof body.relationship !== 'string' ||
          typeof body.verificationSource !== 'string'
        ) {
          sendJson(response, 400, {
            error:
              'Expected email, name, company, title, roleDomain, relationship, and verificationSource in body',
            requestId,
          });
          return;
        }

        // HARD LINE H4: Reject any unverified or guessed contacts
        const compliance = new OutreachComplianceEngine();
        try {
          compliance.assertAuthorizedContact(body.email, body.verificationSource);
        } catch (err) {
          sendJson(response, 422, {
            error: err instanceof Error ? err.message : 'Invalid contact verification source (H4)',
            requestId,
          });
          return;
        }

        const person = await dependencies.outreach.addPerson(
          tenant.tenantId,
          {
            email: body.email,
            name: body.name,
            company: body.company,
            title: body.title,
            roleDomain: body.roleDomain as any,
            relationship: body.relationship as any,
            verificationSource: body.verificationSource as any,
            timeZone: typeof body.timeZone === 'string' ? body.timeZone : 'America/New_York',
            linkedinUrl: typeof body.linkedinUrl === 'string' ? body.linkedinUrl : undefined,
            lastContactedAt: typeof body.lastContactedAt === 'string' ? body.lastContactedAt : undefined,
            crmStage: (body.crmStage as any) || 'lead',
            notes: typeof body.notes === 'string' ? body.notes : undefined,
            howICanHelp: typeof body.howICanHelp === 'string' ? body.howICanHelp : undefined,
          },
          identity.subject
        );

        sendJson(response, 201, { person, requestId });
        return;
      }

      if (request.method === 'GET' && url.pathname === '/v1/people') {
        if (!dependencies.outreach) {
          sendJson(response, 200, { people: [], requestId });
          return;
        }
        const companyParam = url.searchParams.get('company') || undefined;
        const targetRoleParam = url.searchParams.get('targetRoleTitle') || undefined;

        const people = await dependencies.outreach.listPeople(tenant.tenantId, companyParam);

        if (companyParam) {
          const ranker = new PersonRanker();
          const ranked = ranker.rankAndSort(people, {
            targetCompany: companyParam,
            targetRoleTitle: targetRoleParam,
          });
          sendJson(response, 200, { people: ranked, requestId });
          return;
        }

        sendJson(response, 200, { people, requestId });
        return;
      }

      if (request.method === 'POST' && url.pathname === '/v1/outreach/send') {
        if (!dependencies.outreach) {
          sendJson(response, 501, { error: 'Outreach repository not configured', requestId });
          return;
        }
        const body = await readJson(request, maxBytes);
        if (
          typeof body.personId !== 'string' ||
          typeof body.targetRoleTitle !== 'string' ||
          typeof body.hook !== 'string'
        ) {
          sendJson(response, 400, {
            error: 'Expected personId, targetRoleTitle, and hook in body',
            requestId,
          });
          return;
        }

        const activeContractRecord = await dependencies.repository.getActiveSprintContract(
          tenant.tenantId
        );
        if (!activeContractRecord) {
          sendJson(response, 400, {
            error: 'Active Sprint Contract required for email outreach',
            requestId,
          });
          return;
        }

        const controlState = await dependencies.repository.getControlState(tenant.tenantId);
        if (controlState.globalKillSwitch) {
          sendJson(response, 400, {
            error: 'Tenant global kill switch is currently active',
            requestId,
          });
          return;
        }
        if (controlState.pausedChannels.includes('email')) {
          sendJson(response, 400, {
            error: 'Email outreach channel is paused for tenant',
            requestId,
          });
          return;
        }

        const person = await dependencies.outreach.getPerson(tenant.tenantId, body.personId);
        if (!person) {
          sendJson(response, 404, { error: 'Person contact not found', requestId });
          return;
        }

        // Check Mailbox health & adaptive caps
        const metrics = await dependencies.outreach.getMailboxMetrics(tenant.tenantId);
        const capManager = new AdaptiveCapManager(
          activeContractRecord.contract.dailyCaps.emails,
          10
        );
        const health = capManager.evaluateHealth(metrics);

        // Auto-pause trigger: bounce rate > 5% or complaint
        if (health.shouldAutoPause) {
          await dependencies.repository.setChannelPauseWithAudit({
            tenantId: tenant.tenantId,
            actorSubject: identity.subject,
            channel: 'email',
            paused: true,
            occurredAt: new Date().toISOString(),
            metadata: { autoPauseReason: health.autoPauseReason || 'Mailbox health violation' },
          });

          sendJson(response, 422, {
            error: `Email outreach auto-paused: ${health.autoPauseReason}`,
            health,
            requestId,
          });
          return;
        }

        const suppressionList = await dependencies.outreach.listSuppression(tenant.tenantId);
        const existingOutreach = await dependencies.outreach.listOutreachForCompany(
          tenant.tenantId,
          person.company
        );

        const engine = new OutreachEngine(
          activeContractRecord.contract,
          body.mockEmail as any,
          capManager
        );

        const execution = await engine.executeOutreach({
          person,
          targetRoleTitle: body.targetRoleTitle,
          companyName: person.company,
          sequenceStep: (body.sequenceStep as 1 | 2 | 3) || 1,
          confirmedHook: body.hook,
          suppressionList,
          existingOutreachToCompany: existingOutreach.map((o) => ({
            personId: o.person_id,
            roleTitle: o.person_title || body.targetRoleTitle,
            sentAt: o.sent_at,
            status: o.status,
          })),
          currentSentToday: metrics.sentCount,
          now: typeof body.now === 'string' ? new Date(body.now) : undefined,
        });

        if (execution.status === 'sent') {
          await dependencies.outreach.recordOutreachMessage(
            tenant.tenantId,
            {
              personId: person.id,
              applicationId: null,
              sequenceStep: (body.sequenceStep as number) || 1,
              subject: execution.subject || '',
              bodyText: execution.bodyText || '',
              sentAt: new Date().toISOString(),
              status: 'sent',
              metadata: {
                wordCount: execution.wordCount,
                messageId: execution.sendResult?.messageId,
              },
            },
            identity.subject
          );

          await dependencies.outreach.updatePersonStage(
            tenant.tenantId,
            person.id,
            'contacted',
            new Date().toISOString(),
            identity.subject
          );

          globalActivityHub.broadcast({
            id: randomUUID(),
            tenantId: tenant.tenantId,
            eventType: 'outreach_sent',
            title: `Outreach sent: ${person.name} (${person.company})`,
            description: `Sent personalized email regarding ${body.targetRoleTitle}`,
            severity: 'info',
            actorSubject: identity.subject,
            createdAt: new Date().toISOString(),
            metadata: {
              personId: person.id,
              company: person.company,
              email: person.email,
              wordCount: execution.wordCount,
            },
          });
        }

        sendJson(response, 200, { execution, requestId });
        return;
      }

      if (request.method === 'POST' && url.pathname === '/v1/outreach/opt-out') {
        if (!dependencies.outreach) {
          sendJson(response, 501, { error: 'Outreach repository not configured', requestId });
          return;
        }
        const body = await readJson(request, maxBytes);
        if (typeof body.email !== 'string') {
          sendJson(response, 400, { error: 'Expected email in body', requestId });
          return;
        }

        const optOutEmail = String(body.email).toLowerCase().trim();
        const reason = (body.reason as any) || 'opt_out';
        await dependencies.outreach.addSuppression(
          tenant.tenantId,
          { email: optOutEmail, reason },
          identity.subject
        );

        // Update person stage if exists
        const people = await dependencies.outreach.listPeople(tenant.tenantId);
        const match = people.find((p) => p.email.toLowerCase() === optOutEmail);
        if (match) {
          await dependencies.outreach.updatePersonStage(
            tenant.tenantId,
            match.id,
            'opted_out',
            undefined,
            identity.subject
          );
        }

        sendJson(response, 200, { success: true, email: body.email, reason, requestId });
        return;
      }

      if (request.method === 'GET' && url.pathname === '/v1/outreach/health') {
        if (!dependencies.outreach) {
          sendJson(response, 200, { health: null, requestId });
          return;
        }
        const metrics = await dependencies.outreach.getMailboxMetrics(tenant.tenantId);
        const activeContractRecord = await dependencies.repository.getActiveSprintContract(
          tenant.tenantId
        );
        const maxCap = activeContractRecord?.contract.dailyCaps.emails || 30;
        const capManager = new AdaptiveCapManager(maxCap, 10);
        const health = capManager.evaluateHealth(metrics);

        sendJson(response, 200, { metrics, health, currentCap: capManager.getCurrentCap(), requestId });
        return;
      }

      if (request.method === 'POST' && url.pathname === '/v1/linkedin/oauth/token') {
        const body = await readJson(request, maxBytes);
        // Hard Line H1 Security Gate: Rejects any passwords or cookies
        const token = LinkedInSecurityGate.validateOAuthResponse(body);
        sendJson(response, 200, {
          status: 'valid_oauth_token',
          tokenType: token.token_type,
          scope: token.scope,
          requestId,
        });
        return;
      }

      if (request.method === 'POST' && url.pathname === '/v1/linkedin/import-export') {
        const body = await readJson(request, maxBytes);
        if (typeof body.csvContent !== 'string') {
          sendJson(response, 400, { error: 'Expected csvContent string in body', requestId });
          return;
        }

        const parser = new LinkedInExportParser();
        const connections = parser.parseConnectionsCsv(body.csvContent);
        const peopleToImport = parser.toPeople(tenant.tenantId, connections);

        let importedCount = 0;
        if (dependencies.outreach) {
          for (const p of peopleToImport) {
            try {
              await dependencies.outreach.addPerson(tenant.tenantId, p, identity.subject);
              importedCount++;
            } catch {
              // Skip individual invalid rows
            }
          }
        } else {
          importedCount = peopleToImport.length;
        }

        globalActivityHub.broadcast({
          id: randomUUID(),
          tenantId: tenant.tenantId,
          eventType: 'linkedin_export_imported',
          title: `LinkedIn Export Imported: ${importedCount} contacts`,
          description: `Ingested ${importedCount} warm 1st-degree connections into Person Graph`,
          severity: 'success',
          actorSubject: identity.subject,
          createdAt: new Date().toISOString(),
          metadata: {
            importedCount,
          },
        });

        sendJson(response, 200, {
          importedCount,
          sampleContacts: peopleToImport.slice(0, 5),
          requestId,
        });
        return;
      }

      if (request.method === 'POST' && url.pathname === '/v1/linkedin/profile-audit') {
        const body = await readJson(request, maxBytes);
        const activeContractRecord = await dependencies.repository.getActiveSprintContract(
          tenant.tenantId
        );
        const targetRoles =
          Array.isArray(body.targetRoles) && body.targetRoles.length > 0
            ? (body.targetRoles as string[])
            : activeContractRecord?.contract.roles || ['Software Engineer'];

        const auditor = new LinkedInProfileAuditor();
        const audit = auditor.auditProfile(
          {
            currentHeadline: typeof body.currentHeadline === 'string' ? body.currentHeadline : undefined,
            currentAbout: typeof body.currentAbout === 'string' ? body.currentAbout : undefined,
            currentSkills: Array.isArray(body.currentSkills) ? (body.currentSkills as string[]) : undefined,
            targetRoles,
          },
          activeContractRecord?.contract
        );

        if (dependencies.linkedinAudit) {
          await dependencies.linkedinAudit.saveAudit(tenant.tenantId, audit, identity.subject);
        }

        sendJson(response, 200, { audit, requestId });
        return;
      }

      if (request.method === 'GET' && url.pathname === '/v1/assist-queue/linkedin') {
        if (!dependencies.assistQueue) {
          sendJson(response, 200, { items: [], count: 0, requestId });
          return;
        }
        const allPending = await dependencies.assistQueue.list(tenant.tenantId, 'pending');
        const linkedinItems = allPending.filter((i) => i.platform === 'linkedin_assist');

        sendJson(response, 200, {
          items: linkedinItems,
          count: linkedinItems.length,
          userGestureRequired: true,
          requestId,
        });
        return;
      }

      if (request.method === 'POST' && url.pathname === '/v1/linkedin/report-restriction') {
        const body = await readJson(request, maxBytes);
        if (typeof body.noticeType !== 'string') {
          sendJson(response, 400, { error: 'Expected noticeType string in body', requestId });
          return;
        }

        const manager = new LinkedInRestrictionManager();
        const result = manager.handleRestrictionReport({
          noticeType: body.noticeType as any,
          details: typeof body.details === 'string' ? body.details : undefined,
          reportedAt: new Date().toISOString(),
        });

        // Standing consent invariant: Auto-pause channel immediately
        await dependencies.repository.setChannelPauseWithAudit({
          tenantId: tenant.tenantId,
          actorSubject: identity.subject,
          channel: 'linkedin_assist',
          paused: true,
          occurredAt: new Date().toISOString(),
          metadata: {
            reason: result.auditReason,
            reportedNotice: body.noticeType,
          },
        });

        globalActivityHub.broadcast({
          id: randomUUID(),
          tenantId: tenant.tenantId,
          eventType: 'linkedin_restriction_reported',
          title: `LinkedIn Assist Auto-Paused: ${body.noticeType}`,
          description: result.recommendedUserAction,
          severity: 'warn',
          actorSubject: identity.subject,
          createdAt: new Date().toISOString(),
          metadata: {
            noticeType: body.noticeType,
            auditReason: result.auditReason,
          },
        });

        sendJson(response, 200, { result, channelPaused: true, requestId });
        return;
      }

      if (request.method === 'POST' && url.pathname === '/v1/sprint/start') {
        const body = await readJson(request, maxBytes);
        const activeContractRecord = await dependencies.repository.getActiveSprintContract(
          tenant.tenantId
        );

        // HARD LINE H6: Check any input descriptions or notes for prohibited guarantees
        if (typeof body.marketingNote === 'string') {
          OutcomeForecaster.validateNoOutcomeGuarantees(body.marketingNote);
        }
        if (typeof body.goalDescription === 'string') {
          OutcomeForecaster.validateNoOutcomeGuarantees(body.goalDescription);
        }

        const targetRoles =
          Array.isArray(body.targetRoles) && body.targetRoles.length > 0
            ? (body.targetRoles as string[])
            : activeContractRecord?.contract.roles || ['Software Engineer'];

        const enabledChannels =
          Array.isArray(body.enabledChannels) && body.enabledChannels.length > 0
            ? (body.enabledChannels as any)
            : activeContractRecord?.contract.enabledChannels || ['ats', 'email', 'referral', 'linkedin_assist'];

        const targetDurationHours =
          typeof body.targetDurationHours === 'number'
            ? body.targetDurationHours
            : 72;

        const orchestrator = new SprintOrchestrator();
        const { sprint, initialArms } = orchestrator.initializeSprint(
          tenant.tenantId,
          {
            targetRoles,
            enabledChannels,
            targetDurationHours,
            dailyAtsCap: activeContractRecord?.contract.dailyCaps.applications || 15,
            dailyEmailCap: activeContractRecord?.contract.dailyCaps.emails || 20,
          },
          activeContractRecord?.id
        );

        let createdSprint = sprint;
        if (dependencies.sprint) {
          createdSprint = await dependencies.sprint.createSprint(
            tenant.tenantId,
            sprint,
            initialArms,
            identity.subject
          );
        }

        const forecast = orchestrator.getForecast(createdSprint);

        globalActivityHub.broadcast({
          id: randomUUID(),
          tenantId: tenant.tenantId,
          eventType: 'sprint_started',
          title: `Sprint Mode Started: ${targetDurationHours}h`,
          description: `Sprint initiated for ${targetRoles.join(', ')} across ${enabledChannels.join(', ')}`,
          severity: 'info',
          actorSubject: identity.subject,
          createdAt: new Date().toISOString(),
          metadata: {
            sprintId: createdSprint.id,
            duration: targetDurationHours,
            expectedInterviewsMin: forecast.expectedInterviewsMin,
            expectedInterviewsMax: forecast.expectedInterviewsMax,
          },
        });

        sendJson(response, 201, {
          sprint: createdSprint,
          initialArms,
          forecast,
          phase: 'T0_INITIALIZING',
          requestId,
        });
        return;
      }

      if (request.method === 'GET' && url.pathname === '/v1/sprint/current') {
        if (!dependencies.sprint) {
          sendJson(response, 200, { sprint: null, requestId });
          return;
        }

        const active = await dependencies.sprint.getActiveSprint(tenant.tenantId);
        if (!active) {
          sendJson(response, 200, { sprint: null, requestId });
          return;
        }

        const orchestrator = new SprintOrchestrator();
        const phase = orchestrator.getSprintPhase(active.sprint);
        const autoPause = orchestrator.checkAutoPause(active.sprint);
        const forecast = orchestrator.getForecast(active.sprint);

        sendJson(response, 200, {
          sprint: active.sprint,
          arms: active.arms,
          phase,
          autoPause,
          forecast,
          requestId,
        });
        return;
      }

      if (request.method === 'POST' && url.pathname === '/v1/sprint/pause') {
        if (!dependencies.sprint) {
          sendJson(response, 501, { error: 'Sprint repository not configured', requestId });
          return;
        }

        const active = await dependencies.sprint.getActiveSprint(tenant.tenantId);
        if (!active) {
          sendJson(response, 404, { error: 'No active sprint found', requestId });
          return;
        }

        const updated = await dependencies.sprint.updateSprintStatus(
          tenant.tenantId,
          active.sprint.id,
          'paused',
          identity.subject
        );

        globalActivityHub.broadcast({
          id: randomUUID(),
          tenantId: tenant.tenantId,
          eventType: 'sprint_paused',
          title: 'Sprint Mode Paused',
          description: 'Candidate or auto-pause trigger paused active sprint waves.',
          severity: 'warn',
          actorSubject: identity.subject,
          createdAt: new Date().toISOString(),
          metadata: { sprintId: active.sprint.id },
        });

        sendJson(response, 200, { sprint: updated, requestId });
        return;
      }

      if (request.method === 'POST' && url.pathname === '/v1/sprint/resume') {
        if (!dependencies.sprint) {
          sendJson(response, 501, { error: 'Sprint repository not configured', requestId });
          return;
        }

        const active = await dependencies.sprint.getActiveSprint(tenant.tenantId);
        if (!active) {
          sendJson(response, 404, { error: 'No active or paused sprint found', requestId });
          return;
        }

        const updated = await dependencies.sprint.updateSprintStatus(
          tenant.tenantId,
          active.sprint.id,
          'active',
          identity.subject
        );

        globalActivityHub.broadcast({
          id: randomUUID(),
          tenantId: tenant.tenantId,
          eventType: 'sprint_resumed',
          title: 'Sprint Mode Resumed',
          description: 'Active sprint waves resumed.',
          severity: 'info',
          actorSubject: identity.subject,
          createdAt: new Date().toISOString(),
          metadata: { sprintId: active.sprint.id },
        });

        sendJson(response, 200, { sprint: updated, requestId });
        return;
      }

      if (request.method === 'GET' && url.pathname === '/v1/sprint/forecast') {
        const targetRolesParam = url.searchParams.get('roles')?.split(',') || ['Software Engineer'];
        const durationParam = parseInt(url.searchParams.get('duration') || '72', 10);
        const forecaster = new OutcomeForecaster();

        const forecast = forecaster.generateForecast({
          config: {
            targetRoles: targetRolesParam,
            enabledChannels: ['ats', 'email', 'referral', 'linkedin_assist'],
            targetDurationHours: isNaN(durationParam) ? 72 : durationParam,
          },
        });

        sendJson(response, 200, { forecast, requestId });
        return;
      }

      if (request.method === 'POST' && url.pathname === '/v1/sprint/rebalance') {
        if (!dependencies.sprint) {
          sendJson(response, 501, { error: 'Sprint repository not configured', requestId });
          return;
        }

        const active = await dependencies.sprint.getActiveSprint(tenant.tenantId);
        if (!active) {
          sendJson(response, 404, { error: 'No active sprint found', requestId });
          return;
        }

        const orchestrator = new SprintOrchestrator();
        const updatedAllocations = orchestrator.rebalanceAllocations(active.arms);

        const armsToSave: AllocationArm[] = updatedAllocations.map((u) => ({
          id: u.armId,
          channel: u.channel,
          targetRole: u.targetRole,
          templateId: u.templateId,
          weight: u.weight,
          pulls: u.pulls,
          successes: u.successes,
          status: u.status,
        }));

        await dependencies.sprint.saveAllocations(
          tenant.tenantId,
          active.sprint.id,
          armsToSave,
          identity.subject
        );

        sendJson(response, 200, { updatedAllocations, requestId });
        return;
      }

      if (request.method === 'GET' && url.pathname === '/v1/sprint/report') {
        if (!dependencies.sprint) {
          sendJson(response, 501, { error: 'Sprint repository not configured', requestId });
          return;
        }

        const active = await dependencies.sprint.getActiveSprint(tenant.tenantId);
        if (!active) {
          sendJson(response, 404, { error: 'No sprint found for report generation', requestId });
          return;
        }

        const orchestrator = new SprintOrchestrator();
        const report = orchestrator.generateReport(active.sprint, active.arms);

        sendJson(response, 200, { report, requestId });
        return;
      }

      if (request.method === 'POST' && url.pathname === '/v1/sprint/trigger-event') {
        const body = await readJson(request, maxBytes);
        const coordinator = new AutoPauseCoordinator();
        const sprintId = typeof body.sprintId === 'string' ? body.sprintId : 'default_sprint';

        let result: any;
        if (body.alertType === 'linkedin_restriction' || body.alertType === 'mailbox_warning') {
          result = coordinator.evaluateExternalAlert(
            sprintId,
            body.alertType,
            typeof body.details === 'string' ? body.details : 'External safety threshold alert'
          );
        } else if (body.metrics) {
          const evalResults = coordinator.evaluateMetrics(sprintId, body.metrics as any);
          result = evalResults[0] || { shouldPause: false, affectedChannels: [] };
        } else {
          sendJson(response, 400, { error: 'Expected alertType or metrics in body', requestId });
          return;
        }

        if (result.shouldPause && result.event && dependencies.sprint) {
          await dependencies.sprint.recordAutoPauseEvent(
            tenant.tenantId,
            result.event,
            identity.subject
          );

          for (const ch of result.affectedChannels) {
            await dependencies.repository.setChannelPauseWithAudit({
              tenantId: tenant.tenantId,
              actorSubject: identity.subject,
              channel: ch,
              paused: true,
              occurredAt: new Date().toISOString(),
              metadata: {
                triggerType: result.event.triggerType,
                details: result.event.details,
              },
            });
          }
        }

        sendJson(response, 200, { result, requestId });
        return;
      }

      sendJson(response, 404, { error: 'Not found', requestId });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Request failed';
      const status =
        error instanceof SyntaxError || (error instanceof Error && error.name === 'ZodError')
          ? 400
          : /Hard Line H[1-6]|Hard Line H1/i.test(message)
            ? (/Hard Line H6/i.test(message) ? 400 : 403)
          : /active Sprint Contract must be revoked|reviewed fact is immutable|already tracking/i.test(
                message
              )
            ? 409
            : /Only the fact contributor/i.test(message)
              ? 403
              : /Career Graph fact not found|Application not found/i.test(message)
                ? 404
                : /token|identity|membership|bearer|authorization/i.test(message)
                  ? 401
                  : /size limit/i.test(message)
                    ? 413
                    : /JSON|body|Career Graph envelope|Authenticated tenant and actor|Illegal application status transition|Proof of submission|A clear reason is required/i.test(
                          message
                        )
                      ? 400
                      : 500;
      sendJson(response, status, {
        error: status === 500 ? 'Internal server error' : message,
        requestId,
      });
    }
  });
}
