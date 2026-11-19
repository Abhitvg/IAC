export type CareerOpsApiMethod = 'GET' | 'POST' | 'DELETE';

export interface CareerGraphFactSource {
  kind: 'user_input' | 'document' | 'integration' | 'import';
  reference?: string;
  evidenceSha256?: string;
}

export interface CareerGraphFactCreateInput {
  factKey: string;
  value:
    | string
    | number
    | boolean
    | null
    | string[]
    | Record<string, string | number | boolean | null>;
  source: CareerGraphFactSource;
}

export interface CareerGraphFactResponse {
  id: string;
  tenantId: string;
  factKey: string;
  version: number;
  value: CareerGraphFactCreateInput['value'];
  source: CareerGraphFactSource;
  createdBy: string;
  createdAt: string;
  review: {
    decision: 'confirmed' | 'rejected';
    reason?: string;
    reviewedBy: string;
    reviewedAt: string;
  } | null;
}

export interface CareerOpsApiClientOptions {
  baseUrl: string;
  getAccessToken: () => Promise<string | null>;
  fetchImpl?: typeof fetch;
  getTenantId?: () => string | null;
}

export class CareerOpsApiError extends Error {
  constructor(
    message: string,
    readonly status: number
  ) {
    super(message);
    this.name = 'CareerOpsApiError';
  }
}

function normalizeBaseUrl(value: string): string {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error('CareerOps API base URL must be an absolute URL');
  }

  const localDevelopment =
    url.protocol === 'http:' && (url.hostname === 'localhost' || url.hostname === '127.0.0.1');
  if (url.protocol !== 'https:' && !localDevelopment) {
    throw new Error('CareerOps API must use HTTPS outside localhost development');
  }
  if (url.username || url.password || url.search || url.hash) {
    throw new Error('CareerOps API base URL must not contain credentials, query, or fragment');
  }
  return url.toString().replace(/\/$/, '');
}

export function createCareerOpsApiClient(options: CareerOpsApiClientOptions) {
  const baseUrl = normalizeBaseUrl(options.baseUrl);
  const fetchImpl = options.fetchImpl ?? fetch;

  async function request<T>(
    path: string,
    init: Omit<RequestInit, 'credentials' | 'redirect'> & {
      method?: CareerOpsApiMethod;
    } = {}
  ): Promise<T> {
    const rawPath = path.split(/[?#]/, 1)[0] ?? '';
    if (
      !path.startsWith('/v1/') ||
      path.startsWith('//') ||
      rawPath.includes('\\') ||
      rawPath.split('/').some((segment) => segment === '.' || segment === '..') ||
      /%(?:2e|2f|5c|25)/i.test(rawPath)
    ) {
      throw new Error('CareerOps API requests must target a relative /v1/ endpoint');
    }

    const targetUrl = new URL(path, `${baseUrl}/`);
    const baseOrigin = new URL(baseUrl).origin;
    if (
      targetUrl.origin !== baseOrigin ||
      !targetUrl.pathname.startsWith('/v1/') ||
      targetUrl.pathname.includes('//') ||
      targetUrl.hash
    ) {
      throw new Error('CareerOps API requests must remain within the /v1/ namespace');
    }

    const method = init.method ?? 'GET';
    if (!['GET', 'POST', 'DELETE'].includes(method)) {
      throw new Error('Unsupported CareerOps API method');
    }

    const accessToken = await options.getAccessToken();
    if (!accessToken || accessToken.trim() !== accessToken) {
      throw new Error('A valid access token is required');
    }

    const headers = new Headers(init.headers);
    headers.set('accept', 'application/json');
    headers.set('authorization', `Bearer ${accessToken}`);
    if (init.body !== undefined && !headers.has('content-type')) {
      headers.set('content-type', 'application/json');
    }

    const tenantId = options.getTenantId?.();
    if (tenantId) headers.set('x-tenant-id', tenantId);

    const response = await fetchImpl(targetUrl, {
      ...init,
      method,
      headers,
      credentials: 'omit',
      redirect: 'error',
      cache: 'no-store',
    });

    if (response.status === 204) return undefined as T;

    const payload = (await response.json().catch(() => null)) as { error?: unknown } | null;
    if (!response.ok) {
      const message =
        payload && typeof payload.error === 'string'
          ? payload.error
          : 'CareerOps API request failed';
      throw new CareerOpsApiError(message, response.status);
    }
    return payload as T;
  }

  async function createCareerGraphFact(input: CareerGraphFactCreateInput) {
    return request<{ fact: CareerGraphFactResponse; requestId: string }>(
      '/v1/career-graph/facts',
      {
        method: 'POST',
        body: JSON.stringify(input),
      }
    );
  }

  async function listCareerGraphFacts(limit = 50) {
    if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
      throw new Error('Career Graph limit must be an integer between 1 and 100');
    }
    return request<{ facts: CareerGraphFactResponse[]; requestId: string }>(
      `/v1/career-graph/facts?limit=${limit}`
    );
  }

  async function reviewCareerGraphFact(
    factId: string,
    input: { decision: 'confirmed' | 'rejected'; reason?: string }
  ) {
    if (!/^[0-9a-f-]{36}$/i.test(factId)) {
      throw new Error('Career Graph fact ID must be a UUID');
    }
    return request<{ fact: CareerGraphFactResponse; requestId: string }>(
      `/v1/career-graph/facts/${encodeURIComponent(factId)}/review`,
      {
        method: 'POST',
        body: JSON.stringify(input),
      }
    );
  }

  return { request, createCareerGraphFact, listCareerGraphFacts, reviewCareerGraphFact };
}
