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
          const tokenSet = await integration.tokens.get(linkedInIdentity);
          sendJson(response, 200, {
            connected: Boolean(tokenSet && tokenSet.expiresAt > Date.now()),
            expiresAt: tokenSet?.expiresAt ?? null,
            capabilities: getLinkedInCapabilities(tokenSet, integration.entitlements),
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
          const tokenSet = await integration.tokens.get(linkedInIdentity);
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
          const tokenSet = await integration.tokens.get(linkedInIdentity);
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
          const tokenSet = await integration.tokens.get(linkedInIdentity);
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
          const tokenSet = await integration.tokens.get(linkedInIdentity);
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
          const tokenSet = await integration.tokens.get(linkedInIdentity);
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
          const tokenSet = await integration.tokens.get(linkedInIdentity);
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
          const tokenSet = await integration.tokens.get(linkedInIdentity);
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
          const tokenSet = await integration.tokens.get(linkedInIdentity);
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
      const status =
        error instanceof SyntaxError || (error instanceof Error && error.name === 'ZodError')
          ? 400
          : /active Sprint Contract must be revoked|reviewed fact is immutable/i.test(message)
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
