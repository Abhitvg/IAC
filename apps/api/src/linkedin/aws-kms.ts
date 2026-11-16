import { createHash, createHmac } from 'node:crypto';
import type { GeneratedDataKey, TenantKeyManagementService } from '../../../../packages/cloud-core/src/encryption';

export interface AwsCredentials {
  accessKeyId: string;
  secretAccessKey: string;
  sessionToken?: string;
}

interface AwsCredentialDocument {
  AccessKeyId?: unknown;
  SecretAccessKey?: unknown;
  Token?: unknown;
  Expiration?: unknown;
}

export interface AwsKmsTenantKeyManagementConfig {
  region: string;
  keyId: string;
  fetcher?: typeof fetch;
  credentialsProvider?: () => Promise<AwsCredentials>;
  now?: () => Date;
}

function required(value: string, label: string): string {
  const normalized = value.trim();
  if (!normalized) throw new Error('AWS KMS ' + label + ' is required');
  return normalized;
}

function sha256(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

function hmac(key: Buffer | string, value: string): Buffer {
  return createHmac('sha256', key).update(value, 'utf8').digest();
}

function signingKey(secret: string, date: string, region: string): Buffer {
  const dateKey = hmac('AWS4' + secret, date);
  const regionKey = hmac(dateKey, region);
  const serviceKey = hmac(regionKey, 'kms');
  return hmac(serviceKey, 'aws4_request');
}

function validateContext(tenantId: string, context: string): Record<string, string> {
  if (!tenantId || tenantId.length > 128 || !context || context.length > 256) {
    throw new Error('Invalid AWS KMS tenant encryption context');
  }
  return { tenant_id: tenantId, purpose: context };
}

function parseCredentials(payload: AwsCredentialDocument): AwsCredentials {
  if (
    typeof payload.AccessKeyId !== 'string' ||
    typeof payload.SecretAccessKey !== 'string' ||
    !payload.AccessKeyId ||
    !payload.SecretAccessKey
  ) {
    throw new Error('AWS container credential response is invalid');
  }
  return {
    accessKeyId: payload.AccessKeyId,
    secretAccessKey: payload.SecretAccessKey,
    ...(typeof payload.Token === 'string' && payload.Token ? { sessionToken: payload.Token } : {}),
  };
}

export class AwsKmsTenantKeyManagementService implements TenantKeyManagementService {
  private readonly fetcher: typeof fetch;
  private readonly region: string;
  private readonly keyId: string;
  private readonly now: () => Date;
  private readonly credentialsProvider: () => Promise<AwsCredentials>;
  private cachedCredentials: { value: AwsCredentials; expiresAt: number } | null = null;

  constructor(private readonly config: AwsKmsTenantKeyManagementConfig) {
    this.region = required(config.region, 'region');
    this.keyId = required(config.keyId, 'key ID');
    if (!/^[a-z0-9-]+-\d$/.test(this.region)) {
      throw new Error('AWS KMS region is invalid');
    }
    this.fetcher = config.fetcher ?? fetch;
    this.now = config.now ?? (() => new Date());
    this.credentialsProvider = config.credentialsProvider ?? (() => this.loadCredentials());
  }

  private async loadCredentials(): Promise<AwsCredentials> {
    const accessKeyId = process.env.AWS_ACCESS_KEY_ID?.trim();
    const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY?.trim();
    const sessionToken = process.env.AWS_SESSION_TOKEN?.trim();
    if (accessKeyId || secretAccessKey) {
      if (!accessKeyId || !secretAccessKey) {
        throw new Error('Both AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY must be configured');
      }
      return { accessKeyId, secretAccessKey, ...(sessionToken ? { sessionToken } : {}) };
    }

    const cached = this.cachedCredentials;
    if (cached && cached.expiresAt - Date.now() > 60_000) return cached.value;

    // ECS task-role credentials are fetched only from AWS's fixed link-local endpoint.
    const relativeUri = process.env.AWS_CONTAINER_CREDENTIALS_RELATIVE_URI?.trim();
    if (!relativeUri || !relativeUri.startsWith('/') || relativeUri.startsWith('//')) {
      throw new Error(
        'AWS credentials are unavailable; configure an ECS task role or AWS environment credentials'
      );
    }
    const response = await this.fetcher('http://169.254.170.2' + relativeUri, {
      method: 'GET',
      headers: process.env.AWS_CONTAINER_AUTHORIZATION_TOKEN
        ? { authorization: process.env.AWS_CONTAINER_AUTHORIZATION_TOKEN }
        : {},
      signal: AbortSignal.timeout(5_000),
    });
    if (!response.ok) {
      throw new Error('AWS task-role credential request failed with HTTP ' + response.status);
    }
    const payload = (await response.json()) as AwsCredentialDocument;
    const value = parseCredentials(payload);
    const expiry = typeof payload.Expiration === 'string' ? Date.parse(payload.Expiration) : NaN;
    this.cachedCredentials = {
      value,
      expiresAt: Number.isFinite(expiry) ? expiry : Date.now() + 5 * 60_000,
    };
    return value;
  }

  private async call<T>(
    operation: 'GenerateDataKey' | 'Decrypt',
    payload: Record<string, unknown>
  ): Promise<T> {
    const credentials = await this.credentialsProvider();
    const now = this.now();
    const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '');
    const dateStamp = amzDate.slice(0, 8);
    const host = 'kms.' + this.region + '.amazonaws.com';
    const target = 'TrentService.' + operation;
    const body = JSON.stringify(payload);
    const payloadHash = sha256(body);
    const headers: Record<string, string> = {
      'content-type': 'application/x-amz-json-1.1',
      host,
      'x-amz-date': amzDate,
      'x-amz-target': target,
    };
    if (credentials.sessionToken) headers['x-amz-security-token'] = credentials.sessionToken;

    const signedHeaderNames = Object.keys(headers).sort();
    const canonicalHeaders = signedHeaderNames
      .map((name) => name + ':' + headers[name].trim() + '\n')
      .join('');
    const signedHeaders = signedHeaderNames.join(';');
    const canonicalRequest = [
      'POST',
      '/',
      '',
      canonicalHeaders,
      signedHeaders,
      payloadHash,
    ].join('\n');
    const credentialScope = dateStamp + '/' + this.region + '/kms/aws4_request';
    const stringToSign = [
      'AWS4-HMAC-SHA256',
      amzDate,
      credentialScope,
      sha256(canonicalRequest),
    ].join('\n');
    const signature = createHmac(
      'sha256',
      signingKey(credentials.secretAccessKey, dateStamp, this.region)
    )
      .update(stringToSign, 'utf8')
      .digest('hex');
    const authorization = [
      'AWS4-HMAC-SHA256 Credential=' + credentials.accessKeyId + '/' + credentialScope,
      'SignedHeaders=' + signedHeaders,
      'Signature=' + signature,
    ].join(', ');

    const response = await this.fetcher('https://' + host + '/', {
      method: 'POST',
      headers: { ...headers, authorization },
      body,
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) {
      // Do not surface KMS response bodies or request metadata that might contain key information.
      throw new Error('AWS KMS ' + operation + ' failed with HTTP ' + response.status);
    }
    return (await response.json()) as T;
  }

  async generateDataKey(tenantId: string, context: string): Promise<GeneratedDataKey> {
    const response = await this.call<{
      Plaintext?: unknown;
      CiphertextBlob?: unknown;
      KeyId?: unknown;
    }>('GenerateDataKey', {
      KeyId: this.keyId,
      KeySpec: 'AES_256',
      EncryptionContext: validateContext(tenantId, context),
    });
    if (
      typeof response.Plaintext !== 'string' ||
      typeof response.CiphertextBlob !== 'string' ||
      typeof response.KeyId !== 'string'
    ) {
      throw new Error('AWS KMS returned an invalid GenerateDataKey response');
    }
    const plaintextKey = Buffer.from(response.Plaintext, 'base64');
    if (plaintextKey.length !== 32) {
      plaintextKey.fill(0);
      throw new Error('AWS KMS did not return a 256-bit data key');
    }
    return {
      plaintextKey,
      wrappedKey: response.CiphertextBlob,
      keyVersion: response.KeyId,
    };
  }

  async unwrapDataKey(
    tenantId: string,
    wrappedKey: string,
    keyVersion: string,
    context: string
  ): Promise<Buffer> {
    if (!wrappedKey || wrappedKey.length > 16_384 || !keyVersion || keyVersion.length > 2048) {
      throw new Error('AWS KMS encrypted data key is invalid');
    }
    const response = await this.call<{ Plaintext?: unknown }>('Decrypt', {
      CiphertextBlob: wrappedKey,
      KeyId: keyVersion,
      EncryptionContext: validateContext(tenantId, context),
    });
    if (typeof response.Plaintext !== 'string') {
      throw new Error('AWS KMS returned an invalid Decrypt response');
    }
    const plaintextKey = Buffer.from(response.Plaintext, 'base64');
    if (plaintextKey.length !== 32) {
      plaintextKey.fill(0);
      throw new Error('AWS KMS did not return a 256-bit data key');
    }
    return plaintextKey;
  }
}
