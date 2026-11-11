import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { randomUUID } from 'node:crypto';
import { readBearerToken } from '../../../packages/cloud-core/src/auth';
import { createConsentRecord } from '../../../packages/cloud-core/src/contract';
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
        const activeContract = await dependencies.repository.getActiveSprintContract(tenant.tenantId);
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
          : /active Sprint Contract must be revoked/i.test(message)
            ? 409
            : /token|identity|membership|bearer|authorization/i.test(message)
              ? 401
              : /size limit/i.test(message)
                ? 413
                : /JSON|body/i.test(message)
                  ? 400
                  : 500;
      sendJson(response, status, {
        error: status === 500 ? 'Internal server error' : message,
        requestId,
      });
    }
  });
}
