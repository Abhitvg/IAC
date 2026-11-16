import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { randomUUID } from 'node:crypto';
import { readBearerToken } from '../../../packages/cloud-core/src/auth';
import { createConsentRecord } from '../../../packages/cloud-core/src/contract';
import {
  CareerGraphFactReviewSchema,
  validateCareerGraphFact,
} from '../../../packages/cloud-core/src/career-graph';
import { resolveTenantContext } from '../../../packages/cloud-core/src/tenant';
import type { CloudApiDependencies } from './ports';
import { LinkedInApiError } from './linkedin/client';

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

function sendHtml(response: ServerResponse, status: number, message: string): void {
  response.writeHead(status, {
    'content-type': 'text/html; charset=utf-8',
    'cache-control': 'no-store',
    'content-security-policy':
      "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
    'x-content-type-options': 'nosniff',
    'referrer-policy': 'no-referrer',
    'x-frame-options': 'DENY',
  });
  response.end(
    '<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">' +
      '<title>CareerOps LinkedIn connection</title><body style="font:16px system-ui;max-width:36rem;margin:12vh auto;padding:0 1.5rem;background:#0b1220;color:#e2e8f0">' +
      '<h1 style="font-size:1.4rem">CareerOps LinkedIn connection</h1><p>' +
      message +
      '</p><p>You can close this tab and return to CareerOps.</p></body></html>'
  );
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

      // This is the sole unauthenticated LinkedIn endpoint. A 256-bit one-time state
      // binds the callback to the tenant/member saved at OAuth start; no tenant ID,
      // access token, or session credential is accepted from the browser.
      if (url.pathname === '/oauth/linkedin/callback') {
        const integration = dependencies.linkedin;
        if (!integration) {
          sendHtml(response, 503, 'LinkedIn integration is not configured on this deployment.');
          return;
        }
        if (request.method !== 'GET') {
          response.setHeader('allow', 'GET');
          sendHtml(response, 405, 'This callback only accepts a browser redirect.');
          return;
        }
        const stateValues = url.searchParams.getAll('state');
        const codeValues = url.searchParams.getAll('code');
        const errorValues = url.searchParams.getAll('error');
        const descriptionValues = url.searchParams.getAll('error_description');
        const state = stateValues[0] ?? '';
        const code = codeValues[0] ?? null;
        const providerError = errorValues[0] ?? null;
        const hasProviderError = url.searchParams.has('error');
        const allowedParams = hasProviderError
          ? ['state', 'error', 'error_description']
          : ['state', 'code'];
        if (
          stateValues.length !== 1 ||
          codeValues.length > 1 ||
          errorValues.length > 1 ||
          descriptionValues.length > 1 ||
          !/^[A-Za-z0-9_-]{40,64}$/.test(state) ||
          [...url.searchParams.keys()].some((key) => !allowedParams.includes(key)) ||
          (hasProviderError ? !providerError?.trim() || Boolean(code) : !code || code.length > 4096)
        ) {
          sendHtml(
            response,
            400,
            'The LinkedIn authorization response was invalid. Start the connection again in CareerOps.'
          );
          return;
        }
        try {
          if (hasProviderError) {
            const cancelled = await integration.oauth.cancelAuthorizationCallback(state);
            sendHtml(
              response,
              cancelled ? 200 : 400,
              cancelled
                ? 'LinkedIn authorization was not completed. No connection was added.'
                : 'The authorization request expired or was already used. Start again in CareerOps.'
            );
            return;
          }
          await integration.oauth.completeAuthorizationCallback({ code: code!, state });
          sendHtml(
            response,
            200,
            'LinkedIn was connected successfully. Return to CareerOps and refresh the connection status.'
          );
        } catch {
          // Do not reflect provider error descriptions, codes, tokens, state, or tenant details.
          sendHtml(
            response,
            400,
            'LinkedIn could not complete the connection. Return to CareerOps and try again.'
          );
        }
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

      if (url.pathname.startsWith('/v1/linkedin/')) {
        const integration = dependencies.linkedin;
        if (!integration) {
          sendJson(response, 503, {
            error: 'LinkedIn integration is not configured on this deployment',
            requestId,
          });
          return;
        }
        const linkedInIdentity = { tenantId: tenant.tenantId, subject: tenant.subject };
        const auditLinkedIn = async (
          action: string,
          entityId: string,
          metadata: Record<string, string | number | boolean | null>
        ) => {
          const controls = await dependencies.repository.getControlState(tenant.tenantId);
          if (controls.tenantId !== tenant.tenantId) {
            throw new Error('LinkedIn tenant control context mismatch');
          }
          if (controls.globalKillSwitch) {
            throw new Error('LinkedIn writes are disabled by the global kill switch');
          }
          if (controls.pausedChannels.includes('linkedin_assist')) {
            throw new Error('LinkedIn channel is paused for this tenant');
          }
          if (!dependencies.repository.recordLinkedInAction) {
            throw new Error('LinkedIn action audit logging is unavailable; execution is disabled');
          }
          await dependencies.repository.recordLinkedInAction({
            tenantId: tenant.tenantId,
            actorSubject: tenant.subject,
            action,
            entityId,
            occurredAt: new Date().toISOString(),
            metadata,
          });
        };

        if (request.method === 'GET' && url.pathname === '/v1/linkedin/status') {
          const { getLinkedInCapabilities } = await import('./linkedin/client');
          const storedTokens = await integration.tokens.get(linkedInIdentity);
          let tokenSet = storedTokens;
          let tokenRefreshError = false;
          if (storedTokens) {
            try {
              tokenSet = await integration.oauth.getValidToken(linkedInIdentity);
            } catch {
              // A status request must still expose a reconnect state when refresh is unavailable.
              // Do not leak provider errors or token material to the desktop renderer.
              tokenSet = storedTokens;
              tokenRefreshError = true;
            }
          }
          const accessTokenExpired = Boolean(tokenSet && tokenSet.expiresAt <= Date.now());
          const refreshTokenExpired = Boolean(
            tokenSet?.refreshTokenExpiresAt && tokenSet.refreshTokenExpiresAt <= Date.now()
          );
          const reauthorizationRequired = Boolean(
            tokenSet && accessTokenExpired && (!tokenSet.refreshToken || refreshTokenExpired)
          );
          sendJson(response, 200, {
            connected: Boolean(tokenSet && tokenSet.expiresAt > Date.now()),
            reauthorizationRequired,
            tokenRefreshError,
            expiresAt: tokenSet?.expiresAt ?? null,
            capabilities: getLinkedInCapabilities(
              tokenSet && tokenSet.expiresAt > Date.now() ? tokenSet : null,
              integration.entitlements
            ),
            entitlements: integration.entitlements,
            scheduledPublishingEnabled: Boolean(dependencies.linkedinScheduler),
            requestId,
          });
          return;
        }

        if (request.method === 'POST' && url.pathname === '/v1/linkedin/oauth/start') {
          const body = await readJson(request, maxBytes);
          if (Object.keys(body).some((key) => key !== 'scopes')) {
            sendJson(response, 400, { error: 'Only the scopes field is accepted', requestId });
            return;
          }
          const requestedScopes = body.scopes;
          if (
            requestedScopes !== undefined &&
            (!Array.isArray(requestedScopes) ||
              requestedScopes.some((scope) => typeof scope !== 'string'))
          ) {
            sendJson(response, 400, { error: 'scopes must be an array of strings', requestId });
            return;
          }
          const scopes = (requestedScopes as string[] | undefined) ?? undefined;
          const allowedScopes = new Set([
            'openid',
            'profile',
            'email',
            'w_member_social',
            ...(integration.entitlements.communityManagementApproved
              ? ['w_organization_social', 'w_member_social_feed', 'w_organization_social_feed']
              : []),
          ]);
          if (scopes?.some((scope) => !allowedScopes.has(scope))) {
            sendJson(response, 403, {
              error: 'Requested LinkedIn scope is not enabled for this application',
              requestId,
            });
            return;
          }
          const authorizationUrl = await integration.oauth.createAuthorizationUrl(
            linkedInIdentity,
            scopes
          );
          sendJson(response, 200, { authorizationUrl, requestId });
          return;
        }

        if (url.pathname === '/v1/linkedin/scheduled-posts' && request.method === 'GET') {
          const scheduler = dependencies.linkedinScheduler;
          if (!scheduler) {
            sendJson(response, 503, {
              error: 'LinkedIn scheduled publishing is not enabled on this deployment',
              requestId,
            });
            return;
          }
          const limitRaw = url.searchParams.get('limit');
          const limit = limitRaw === null ? 50 : Number(limitRaw);
          if (!Number.isInteger(limit) || limit < 1 || limit > 100 || url.searchParams.size > 1) {
            sendJson(response, 400, {
              error: 'limit must be an integer between 1 and 100',
              requestId,
            });
            return;
          }
          const scheduledPosts = await scheduler.list(tenant.tenantId, tenant.subject, limit);
          sendJson(response, 200, { scheduledPosts, requestId });
          return;
        }

        if (request.method === 'POST' && url.pathname === '/v1/linkedin/scheduled-posts') {
          const scheduler = dependencies.linkedinScheduler;
          if (!scheduler) {
            sendJson(response, 503, {
              error: 'LinkedIn scheduled publishing is not enabled on this deployment',
              requestId,
            });
            return;
          }
          const body = await readJson(request, maxBytes);
          if (
            typeof body.commentary !== 'string' ||
            typeof body.scheduledAt !== 'string' ||
            typeof body.idempotencyKey !== 'string' ||
            Object.keys(body).some(
              (key) => !['commentary', 'scheduledAt', 'idempotencyKey'].includes(key)
            )
          ) {
            sendJson(response, 400, {
              error: 'Expected commentary, scheduledAt and idempotencyKey strings',
              requestId,
            });
            return;
          }
          const scheduledAtMs = Date.parse(body.scheduledAt);
          if (
            !body.commentary.trim() ||
            body.commentary.length > 3000 ||
            !/(?:Z|[+-]\\d{2}:\\d{2})$/i.test(body.scheduledAt) ||
            !Number.isFinite(scheduledAtMs) ||
            scheduledAtMs < Date.now() + 2 * 60_000 ||
            scheduledAtMs > Date.now() + 90 * 24 * 60 * 60_000 ||
            !/^[A-Za-z0-9_-]{12,64}$/.test(body.idempotencyKey)
          ) {
            sendJson(response, 400, {
              error:
                'Post text must be 1–3000 characters; schedule time must include a timezone and be 2 minutes to 90 days ahead; idempotency key must be 12–64 safe characters',
              requestId,
            });
            return;
          }
          const tokenSet = await integration.oauth.getValidToken(linkedInIdentity);
          if (!tokenSet || !tokenSet.grantedScopes.includes('w_member_social')) {
            sendJson(response, 409, {
              error: 'Connect LinkedIn with the w_member_social scope before scheduling a post',
              requestId,
            });
            return;
          }
          await auditLinkedIn('linkedin.member.post.schedule.requested', body.idempotencyKey, {
            contentLength: body.commentary.length,
            scheduledAt: new Date(scheduledAtMs).toISOString(),
          });
          const scheduledPost = await scheduler.create({
            tenantId: tenant.tenantId,
            subject: tenant.subject,
            commentary: body.commentary,
            scheduledAt: new Date(scheduledAtMs).toISOString(),
            idempotencyKey: body.idempotencyKey,
          });
          sendJson(response, 201, { scheduledPost, requestId });
          return;
        }

        const scheduledPostCancelMatch = url.pathname.match(
          /^\/v1\/linkedin\/scheduled-posts\/([0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})$/i
        );
        if (request.method === 'DELETE' && scheduledPostCancelMatch) {
          const scheduler = dependencies.linkedinScheduler;
          if (!scheduler) {
            sendJson(response, 503, {
              error: 'LinkedIn scheduled publishing is not enabled on this deployment',
              requestId,
            });
            return;
          }
          if (!dependencies.repository.recordLinkedInAction) {
            throw new Error('LinkedIn action audit logging is unavailable');
          }
          await dependencies.repository.recordLinkedInAction({
            tenantId: tenant.tenantId,
            actorSubject: tenant.subject,
            action: 'linkedin.member.post.schedule.cancel.requested',
            entityId: scheduledPostCancelMatch[1],
            occurredAt: new Date().toISOString(),
            metadata: {},
          });
          const cancelled = await scheduler.cancel(
            tenant.tenantId,
            tenant.subject,
            scheduledPostCancelMatch[1]
          );
          if (!cancelled) {
            sendJson(response, 409, {
              error: 'Scheduled post was not found or is no longer cancellable',
              requestId,
            });
            return;
          }
          sendJson(response, 200, { cancelled: true, requestId });
          return;
        }

        if (request.method === 'POST' && url.pathname === '/v1/linkedin/oauth/callback') {
          const body = await readJson(request, maxBytes);
          if (
            typeof body.code !== 'string' ||
            typeof body.state !== 'string' ||
            Object.keys(body).some((key) => key !== 'code' && key !== 'state')
          ) {
            sendJson(response, 400, {
              error: 'Expected exactly code and state strings',
              requestId,
            });
            return;
          }
          const result = await integration.oauth.completeAuthorization({
            code: body.code,
            state: body.state,
            identity: linkedInIdentity,
          });
          sendJson(response, 200, { ...result, requestId });
          return;
        }

        if (request.method === 'DELETE' && url.pathname === '/v1/linkedin/connection') {
          await integration.oauth.disconnect(linkedInIdentity);
          sendJson(response, 200, { disconnected: true, requestId });
          return;
        }

        if (request.method === 'POST' && url.pathname === '/v1/linkedin/posts') {
          const body = await readJson(request, maxBytes);
          if (
            typeof body.commentary !== 'string' ||
            Object.keys(body).some((key) => key !== 'commentary')
          ) {
            sendJson(response, 400, {
              error: 'Expected exactly one commentary string',
              requestId,
            });
            return;
          }
          const tokenSet = await integration.oauth.getValidToken(linkedInIdentity);
          if (!tokenSet) {
            sendJson(response, 409, { error: 'Connect LinkedIn before publishing', requestId });
            return;
          }
          const authorUrn = `urn:li:person:${tokenSet.memberId}`;
          await auditLinkedIn('linkedin.member.post.publish.requested', authorUrn, {
            contentLength: body.commentary.length,
            postFormat: 'text',
          });
          const result = await integration.api.publishMemberTextPost(
            tokenSet,
            authorUrn,
            body.commentary
          );
          sendJson(response, 201, { postId: result.id, status: result.status, requestId });
          return;
        }

        if (request.method === 'POST' && url.pathname === '/v1/linkedin/polls') {
          const body = await readJson(request, maxBytes);
          const allowedDurations = ['ONE_DAY', 'THREE_DAYS', 'SEVEN_DAYS', 'FOURTEEN_DAYS'];
          if (
            typeof body.commentary !== 'string' ||
            typeof body.question !== 'string' ||
            !Array.isArray(body.options) ||
            body.options.some((option) => typeof option !== 'string') ||
            typeof body.duration !== 'string' ||
            !allowedDurations.includes(body.duration) ||
            Object.keys(body).some(
              (key) => !['commentary', 'question', 'options', 'duration'].includes(key)
            )
          ) {
            sendJson(response, 400, {
              error:
                'Expected commentary, question, options (string array) and an approved poll duration',
              requestId,
            });
            return;
          }
          if (
            !body.commentary.trim() ||
            body.commentary.length > 3000 ||
            !body.question.trim() ||
            body.question.length > 140 ||
            body.options.length < 2 ||
            body.options.length > 4 ||
            body.options.some((option) => !option.trim() || option.length > 30) ||
            new Set(body.options.map((option) => option.trim().toLocaleLowerCase())).size !==
              body.options.length
          ) {
            sendJson(response, 400, {
              error:
                'Poll commentary must be 1–3000 characters, question 1–140 characters, and 2–4 unique options of 1–30 characters each',
              requestId,
            });
            return;
          }
          const tokenSet = await integration.oauth.getValidToken(linkedInIdentity);
          if (!tokenSet) {
            sendJson(response, 409, {
              error: 'Connect LinkedIn before publishing a poll',
              requestId,
            });
            return;
          }
          if (!tokenSet.grantedScopes.includes('w_member_social')) {
            sendJson(response, 409, {
              error: 'LinkedIn poll publishing requires the w_member_social scope',
              requestId,
            });
            return;
          }
          const authorUrn = `urn:li:person:${tokenSet.memberId}`;
          await auditLinkedIn('linkedin.member.poll.publish.requested', authorUrn, {
            commentaryLength: body.commentary.length,
            questionLength: body.question.length,
            optionCount: body.options.length,
            duration: body.duration,
          });
          const result = await integration.api.publishMemberPoll(
            tokenSet,
            authorUrn,
            body.commentary,
            body.question,
            body.options,
            body.duration as 'ONE_DAY' | 'THREE_DAYS' | 'SEVEN_DAYS' | 'FOURTEEN_DAYS'
          );
          sendJson(response, 201, { postId: result.id, status: result.status, requestId });
          return;
        }

        if (request.method === 'POST' && url.pathname === '/v1/linkedin/organization/posts') {
          const body = await readJson(request, maxBytes);
          if (
            typeof body.organizationUrn !== 'string' ||
            typeof body.commentary !== 'string' ||
            Object.keys(body).some((key) => key !== 'organizationUrn' && key !== 'commentary')
          ) {
            sendJson(response, 400, {
              error: 'Expected organizationUrn and commentary strings',
              requestId,
            });
            return;
          }
          if (!integration.entitlements.communityManagementApproved) {
            sendJson(response, 403, {
              error: 'LinkedIn Community Management API approval is required',
              requestId,
            });
            return;
          }
          const tokenSet = await integration.oauth.getValidToken(linkedInIdentity);
          if (!tokenSet) {
            sendJson(response, 409, { error: 'Connect LinkedIn before publishing', requestId });
            return;
          }
          await auditLinkedIn(
            'linkedin.organization.post.publish.requested',
            body.organizationUrn,
            { contentLength: body.commentary.length, postFormat: 'text' }
          );
          const result = await integration.api.publishOrganizationTextPost(
            tokenSet,
            body.organizationUrn,
            body.commentary
          );
          sendJson(response, 201, { postId: result.id, status: result.status, requestId });
          return;
        }

        if (request.method === 'POST' && url.pathname === '/v1/linkedin/organization/image-posts') {
          const body = await readJson(request, maxBytes);
          if (
            typeof body.organizationUrn !== 'string' ||
            !/^urn:li:organization:\d+$/.test(body.organizationUrn) ||
            typeof body.commentary !== 'string' ||
            !body.commentary.trim() ||
            body.commentary.trim().length > 3000 ||
            typeof body.imageUrn !== 'string' ||
            !/^urn:li:image:[A-Za-z0-9_-]+$/.test(body.imageUrn) ||
            typeof body.altText !== 'string' ||
            !body.altText.trim() ||
            body.altText.trim().length > 120 ||
            Object.keys(body).some(
              (key) => !['organizationUrn', 'commentary', 'imageUrn', 'altText'].includes(key)
            )
          ) {
            sendJson(response, 400, {
              error: 'Expected organizationUrn, 1–3000 character commentary, imageUrn and 1–120 character altText',
              requestId,
            });
            return;
          }
          if (!integration.entitlements.communityManagementApproved) {
            sendJson(response, 403, {
              error: 'LinkedIn Community Management API approval is required',
              requestId,
            });
            return;
          }
          const tokenSet = await integration.oauth.getValidToken(linkedInIdentity);
          if (!tokenSet) {
            sendJson(response, 409, { error: 'Connect LinkedIn before publishing', requestId });
            return;
          }
          if (!tokenSet.grantedScopes.includes('w_organization_social')) {
            sendJson(response, 403, {
              error: 'LinkedIn organization image publishing requires the w_organization_social scope',
              requestId,
            });
            return;
          }
          await auditLinkedIn(
            'linkedin.organization.image_post.publish.requested',
            body.imageUrn,
            {
              organizationUrn: body.organizationUrn,
              commentaryLength: body.commentary.length,
              altTextLength: body.altText.length,
              postFormat: 'image',
            }
          );
          const result = await integration.api.publishOrganizationImagePost(
            tokenSet,
            body.organizationUrn,
            body.commentary,
            body.imageUrn,
            body.altText
          );
          sendJson(response, 201, { postId: result.id, status: result.status, requestId });
          return;
        }

        if (request.method === 'POST' && url.pathname === '/v1/linkedin/organization/comments') {
          const body = await readJson(request, maxBytes);
          if (
            typeof body.organizationUrn !== 'string' ||
            typeof body.targetUrn !== 'string' ||
            typeof body.objectUrn !== 'string' ||
            typeof body.commentary !== 'string' ||
            Object.keys(body).some(
              (key) => !['organizationUrn', 'targetUrn', 'objectUrn', 'commentary'].includes(key)
            )
          ) {
            sendJson(response, 400, {
              error: 'Expected organizationUrn, targetUrn, objectUrn, and commentary strings',
              requestId,
            });
            return;
          }
          if (!integration.entitlements.communityManagementApproved) {
            sendJson(response, 403, {
              error: 'LinkedIn Community Management API approval is required',
              requestId,
            });
            return;
          }
          const tokenSet = await integration.oauth.getValidToken(linkedInIdentity);
          if (!tokenSet) {
            sendJson(response, 409, { error: 'Connect LinkedIn before commenting', requestId });
            return;
          }
          await auditLinkedIn('linkedin.organization.comment.create.requested', body.targetUrn, {
            organizationUrn: body.organizationUrn,
            contentLength: body.commentary.length,
          });
          const result = await integration.api.createOrganizationComment(
            tokenSet,
            body.organizationUrn,
            body.targetUrn,
            body.objectUrn,
            body.commentary
          );
          sendJson(response, 201, { commentId: result.id, status: result.status, requestId });
          return;
        }

        if (request.method === 'POST' && url.pathname === '/v1/linkedin/organization/reactions') {
          const body = await readJson(request, maxBytes);
          const allowedReactions = [
            'LIKE',
            'PRAISE',
            'EMPATHY',
            'INTEREST',
            'APPRECIATION',
            'ENTERTAINMENT',
          ];
          if (
            typeof body.organizationUrn !== 'string' ||
            typeof body.rootUrn !== 'string' ||
            typeof body.reactionType !== 'string' ||
            !allowedReactions.includes(body.reactionType) ||
            Object.keys(body).some(
              (key) => !['organizationUrn', 'rootUrn', 'reactionType'].includes(key)
            )
          ) {
            sendJson(response, 400, {
              error: 'Expected organizationUrn, rootUrn, and a supported reactionType',
              requestId,
            });
            return;
          }
          if (!integration.entitlements.communityManagementApproved) {
            sendJson(response, 403, {
              error: 'LinkedIn Community Management API approval is required',
              requestId,
            });
            return;
          }
          const tokenSet = await integration.oauth.getValidToken(linkedInIdentity);
          if (!tokenSet) {
            sendJson(response, 409, { error: 'Connect LinkedIn before reacting', requestId });
            return;
          }
          await auditLinkedIn('linkedin.organization.reaction.create.requested', body.rootUrn, {
            organizationUrn: body.organizationUrn,
            reactionType: body.reactionType,
          });
          const result = await integration.api.createOrganizationReaction(
            tokenSet,
            body.organizationUrn,
            body.rootUrn,
            body.reactionType as
              'LIKE' | 'PRAISE' | 'EMPATHY' | 'INTEREST' | 'APPRECIATION' | 'ENTERTAINMENT'
          );
          sendJson(response, 201, { status: result.status, requestId });
          return;
        }

        if (request.method === 'POST' && url.pathname === '/v1/linkedin/comments') {
          const body = await readJson(request, maxBytes);
          if (
            typeof body.targetUrn !== 'string' ||
            typeof body.objectUrn !== 'string' ||
            typeof body.commentary !== 'string' ||
            Object.keys(body).some((key) => !['targetUrn', 'objectUrn', 'commentary'].includes(key))
          ) {
            sendJson(response, 400, {
              error: 'Expected targetUrn, objectUrn, and commentary strings',
              requestId,
            });
            return;
          }
          const tokenSet = await integration.oauth.getValidToken(linkedInIdentity);
          if (!tokenSet) {
            sendJson(response, 409, { error: 'Connect LinkedIn before commenting', requestId });
            return;
          }
          await auditLinkedIn('linkedin.member.comment.create.requested', body.targetUrn, {
            contentLength: body.commentary.length,
          });
          const result = await integration.api.createMemberComment(
            tokenSet,
            body.targetUrn,
            body.objectUrn,
            body.commentary
          );
          sendJson(response, 201, { commentId: result.id, status: result.status, requestId });
          return;
        }

        if (request.method === 'POST' && url.pathname === '/v1/linkedin/reactions') {
          const body = await readJson(request, maxBytes);
          const allowedReactions = [
            'LIKE',
            'PRAISE',
            'EMPATHY',
            'INTEREST',
            'APPRECIATION',
            'ENTERTAINMENT',
          ];
          if (
            typeof body.rootUrn !== 'string' ||
            typeof body.reactionType !== 'string' ||
            !allowedReactions.includes(body.reactionType) ||
            Object.keys(body).some((key) => key !== 'rootUrn' && key !== 'reactionType')
          ) {
            sendJson(response, 400, {
              error: 'Expected rootUrn and a supported reactionType',
              requestId,
            });
            return;
          }
          const tokenSet = await integration.oauth.getValidToken(linkedInIdentity);
          if (!tokenSet) {
            sendJson(response, 409, { error: 'Connect LinkedIn before reacting', requestId });
            return;
          }
          await auditLinkedIn('linkedin.member.reaction.create.requested', body.rootUrn, {
            reactionType: body.reactionType,
          });
          const result = await integration.api.createMemberReaction(
            tokenSet,
            body.rootUrn,
            body.reactionType as
              'LIKE' | 'PRAISE' | 'EMPATHY' | 'INTEREST' | 'APPRECIATION' | 'ENTERTAINMENT'
          );
          sendJson(response, 201, { status: result.status, requestId });
          return;
        }

        if (request.method === 'DELETE' && url.pathname === '/v1/linkedin/reactions') {
          const entityUrn = url.searchParams.get('entityUrn');
          if (!entityUrn || url.searchParams.size !== 1) {
            sendJson(response, 400, {
              error: 'Provide exactly one entityUrn query parameter',
              requestId,
            });
            return;
          }
          const tokenSet = await integration.oauth.getValidToken(linkedInIdentity);
          if (!tokenSet) {
            sendJson(response, 409, {
              error: 'Connect LinkedIn before removing a reaction',
              requestId,
            });
            return;
          }
          await auditLinkedIn('linkedin.member.reaction.delete.requested', entityUrn, {});
          const result = await integration.api.deleteMemberReaction(tokenSet, entityUrn);
          sendJson(response, 200, { status: result.status, requestId });
          return;
        }

        if (request.method === 'DELETE' && url.pathname === '/v1/linkedin/organization/reactions') {
          const organizationUrn = url.searchParams.get('organizationUrn');
          const entityUrn = url.searchParams.get('entityUrn');
          if (!organizationUrn || !entityUrn || url.searchParams.size !== 2) {
            sendJson(response, 400, {
              error: 'Provide exactly organizationUrn and entityUrn query parameters',
              requestId,
            });
            return;
          }
          if (!integration.entitlements.communityManagementApproved) {
            sendJson(response, 403, {
              error: 'LinkedIn Community Management API approval is required',
              requestId,
            });
            return;
          }
          const tokenSet = await integration.oauth.getValidToken(linkedInIdentity);
          if (!tokenSet) {
            sendJson(response, 409, {
              error: 'Connect LinkedIn before removing a reaction',
              requestId,
            });
            return;
          }
          await auditLinkedIn('linkedin.organization.reaction.delete.requested', entityUrn, {
            organizationUrn,
          });
          const result = await integration.api.deleteOrganizationReaction(
            tokenSet,
            organizationUrn,
            entityUrn
          );
          sendJson(response, 200, { status: result.status, requestId });
          return;
        }

        sendJson(response, 404, { error: 'LinkedIn route not found', requestId });
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

      sendJson(response, 404, { error: 'Not found', requestId });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Request failed';
      if (error instanceof LinkedInApiError) {
        const status =
          error.status === 401
            ? 401
            : error.status === 403
              ? 403
              : error.status === 429
                ? 429
                : error.status >= 500
                  ? 502
                  : 400;
        if (error.retryAfterSeconds) {
          response.setHeader('retry-after', String(error.retryAfterSeconds));
        }
        sendJson(response, status, {
          error:
            status === 401
              ? 'LinkedIn authorization expired; reconnect the account'
              : status === 403
                ? 'LinkedIn denied this action; verify product approval, granted scopes, and Page role'
                : status === 429
                  ? 'LinkedIn rate limit reached; retry after the indicated delay'
                  : status === 502
                    ? 'LinkedIn API is temporarily unavailable'
                    : 'LinkedIn rejected the requested operation',
          requestId,
        });
        return;
      }
      const status =
        error instanceof SyntaxError || (error instanceof Error && error.name === 'ZodError')
          ? 400
          : /LinkedIn writes are disabled|LinkedIn channel is paused/i.test(message)
            ? 423
            : /active Sprint Contract must be revoked|reviewed fact is immutable|LinkedIn image asset is not AVAILABLE/i.test(message)
              ? 409
              : /Only the fact contributor/i.test(message)
                ? 403
                : /Career Graph fact not found/i.test(message)
                  ? 404
                  : /token|identity|membership|bearer|authorization/i.test(message)
                    ? 401
                    : /size limit/i.test(message)
                      ? 413
                      : /JSON|body|Career Graph envelope|Authenticated tenant and actor/i.test(
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
