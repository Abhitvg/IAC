import { createHash, createHmac } from 'node:crypto';
import type { GeneratedDataKey, TenantKeyProvider } from './encryption';

interface AwsCredentials {
  accessKeyId: string;
  secretAccessKey: string;
  sessionToken?: string;
}

interface KmsResponse {
  Plaintext?: string;
  CiphertextBlob?: string;
  KeyId?: string;
  __type?: string;
}

export interface AwsKmsTenantKeyProviderOptions {
  region: string;
  keyArn: string;
  fetcher?: typeof fetch;
  credentialsProvider?: () => Promise<AwsCredentials>;
  environment?: NodeJS.ProcessEnv;
}

function validateTenantContext(tenantId: string, context: string): void {
  if (
    !tenantId ||
    tenantId.length > 128 ||
    !/^[A-Za-z0-9._:@/-]+$/.test(tenantId) ||
    !context ||
    context.length > 256 ||
    !/^[A-Za-z0-9._:@/-]+$/.test(context)
  ) {
    throw new Error('Invalid KMS tenant encryption context');
  }
}

function sha256(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

function hmac(key: Buffer | string, value: string): Buffer {
  return createHmac('sha256', key).update(value, 'utf8').digest();
}

function signingKey(secret: string, date: string, region: string): Buffer {
  const dateKey = hmac(Buffer.from(`AWS4${secret}`, 'utf8'), date);
  const regionKey = hmac(dateKey, region);
  const serviceKey = hmac(regionKey, 'kms');
  return hmac(serviceKey, 'aws4_request');
}

async function defaultCredentialsProvider(
  environment: NodeJS.ProcessEnv,
  fetcher: typeof fetch
): Promise<AwsCredentials> {
  const accessKeyId = environment.AWS_ACCESS_KEY_ID;
  const secretAccessKey = environment.AWS_SECRET_ACCESS_KEY;
  if (accessKeyId && secretAccessKey) {
    return {
      accessKeyId,
      secretAccessKey,
      ...(environment.AWS_SESSION_TOKEN
        ? { sessionToken: environment.AWS_SESSION_TOKEN }
        : {}),
    };
  }

  const relativeUri = environment.AWS_CONTAINER_CREDENTIALS_RELATIVE_URI;
  const fullUri = environment.AWS_CONTAINER_CREDENTIALS_FULL_URI;
  let endpoint: URL;
  if (relativeUri) {
    if (!relativeUri.startsWith('/') || relativeUri.includes('..')) {
      throw new Error('Invalid ECS container credentials endpoint');
    }
    endpoint = new URL(relativeUri, 'http://169.254.170.2');
  } else if (fullUri) {
    endpoint = new URL(fullUri);
    const allowedHosts = new Set(['169.254.170.2', '127.0.0.1', 'localhost', '[::1]']);
    if (endpoint.protocol !== 'http:' || !allowedHosts.has(endpoint.hostname)) {
      throw new Error('ECS full credentials URI must use a trusted link-local or loopback host');
    }
  } else {
    throw new Error(
      'AWS credentials unavailable: use the ECS task role or temporary AWS environment credentials'
    );
  }

  const headers: Record<string, string> = {};
  if (environment.AWS_CONTAINER_AUTHORIZATION_TOKEN) {
    headers.Authorization = environment.AWS_CONTAINER_AUTHORIZATION_TOKEN;
  }
  if (environment.AWS_CONTAINER_AUTHORIZATION_TOKEN_FILE) {
    const { readFile } = await import('node:fs/promises');
    headers.Authorization = (
      await readFile(environment.AWS_CONTAINER_AUTHORIZATION_TOKEN_FILE, 'utf8')
    ).trim();
  }

  const response = await fetcher(endpoint, {
    method: 'GET',
    headers,
    signal: AbortSignal.timeout(3000),
  });
  if (!response.ok) throw new Error('Unable to obtain ECS task-role credentials');

  const payload = (await response.json()) as {
    AccessKeyId?: string;
    SecretAccessKey?: string;
    Token?: string;
    Expiration?: string;
  };
  if (!payload.AccessKeyId || !payload.SecretAccessKey || !payload.Token) {
    throw new Error('ECS task-role credential response is incomplete');
  }
  if (payload.Expiration && Date.parse(payload.Expiration) <= Date.now() + 30_000) {
    throw new Error('ECS task-role credentials are expired or about to expire');
  }
  return {
    accessKeyId: payload.AccessKeyId,
    secretAccessKey: payload.SecretAccessKey,
    sessionToken: payload.Token,
  };
}

function encryptionContext(tenantId: string, context: string): Record<string, string> {
  validateTenantContext(tenantId, context);
  return {
    'careerops:application': 'careerops',
    'careerops:tenant_id': tenantId,
    'careerops:data_context': context,
  };
}

/** SigV4-signed AWS KMS JSON client. ECS task-role credentials are used in production. */
export class AwsKmsTenantKeyProvider implements TenantKeyProvider {
  private readonly fetcher: typeof fetch;
  private readonly environment: NodeJS.ProcessEnv;
  private readonly credentialsProvider: () => Promise<AwsCredentials>;

  constructor(private readonly options: AwsKmsTenantKeyProviderOptions) {
    if (!/^[a-z]{2}(-gov)?-[a-z]+-[0-9]+$/.test(options.region)) {
      throw new Error('Invalid AWS region for KMS');
    }
    if (
      !/^arn:(aws|aws-us-gov|aws-cn):kms:[a-z0-9-]+:[0-9]{12}:key\/[A-Za-z0-9-]+$/.test(
        options.keyArn
      )
    ) {
      throw new Error('CAREEROPS_KMS_KEY_ARN must be a KMS key ARN, not an alias');
    }
    this.fetcher = options.fetcher ?? fetch;
    this.environment = options.environment ?? process.env;
    this.credentialsProvider =
      options.credentialsProvider ??
      (() => defaultCredentialsProvider(this.environment, this.fetcher));
  }

  async generateDataKey(tenantId: string, context: string): Promise<GeneratedDataKey> {
    const result = await this.callKms('TrentService.GenerateDataKey', {
      KeyId: this.options.keyArn,
      KeySpec: 'AES_256',
      EncryptionContext: encryptionContext(tenantId, context),
    });
    if (!result.Plaintext || !result.CiphertextBlob || !result.KeyId) {
      throw new Error('AWS KMS GenerateDataKey returned an incomplete response');
    }

    const plaintextKey = Buffer.from(result.Plaintext, 'base64');
    const wrappedKey = Buffer.from(result.CiphertextBlob, 'base64');
    if (plaintextKey.length !== 32 || wrappedKey.length === 0 || wrappedKey.length > 8192) {
      plaintextKey.fill(0);
      throw new Error('AWS KMS GenerateDataKey returned invalid key material');
    }
    return {
      plaintextKey,
      wrappedKey: wrappedKey.toString('base64'),
      keyVersion: result.KeyId,
    };
  }

  async unwrapDataKey(
    tenantId: string,
    wrappedKey: string,
    keyVersion: string,
    context: string
  ): Promise<Buffer> {
    if (keyVersion !== this.options.keyArn) {
      throw new Error('Encrypted envelope references an unconfigured KMS key');
    }
    if (
      !wrappedKey ||
      wrappedKey.length > 12_000 ||
      !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(wrappedKey)
    ) {
      throw new Error('Invalid KMS encrypted data key');
    }

    const result = await this.callKms('TrentService.Decrypt', {
      KeyId: this.options.keyArn,
      CiphertextBlob: wrappedKey,
      EncryptionContext: encryptionContext(tenantId, context),
    });
    if (!result.Plaintext || result.KeyId !== this.options.keyArn) {
      throw new Error('AWS KMS Decrypt returned an unexpected key');
    }

    const plaintextKey = Buffer.from(result.Plaintext, 'base64');
    if (plaintextKey.length !== 32) {
      plaintextKey.fill(0);
      throw new Error('AWS KMS Decrypt returned invalid key material');
    }
    return plaintextKey;
  }

  private async callKms(target: string, body: Record<string, unknown>): Promise<KmsResponse> {
    const credentials = await this.credentialsProvider();
    const amzDate = new Date().toISOString().replace(/[:-]|\.\d{3}/g, '');
    const date = amzDate.slice(0, 8);
    const payload = JSON.stringify(body);
    const payloadHash = sha256(payload);
    const host = `kms.${this.options.region}.${
      this.options.region.startsWith('cn-') ? 'amazonaws.com.cn' : 'amazonaws.com'
    }`;
    const headers: Record<string, string> = {
      'content-type': 'application/x-amz-json-1.1',
      host,
      'x-amz-date': amzDate,
      'x-amz-target': target,
    };
    if (credentials.sessionToken) {
      headers['x-amz-security-token'] = credentials.sessionToken;
    }

    const signedHeaderNames = Object.keys(headers).sort();
    const canonicalHeaders = signedHeaderNames
      .map((name) => `${name}:${headers[name].trim()}\n`)
      .join('');
    const canonicalRequest = [
      'POST',
      '/',
      '',
      canonicalHeaders,
      signedHeaderNames.join(';'),
      payloadHash,
    ].join('\n');
    const scope = `${date}/${this.options.region}/kms/aws4_request`;
    const stringToSign = [
      'AWS4-HMAC-SHA256',
      amzDate,
      scope,
      sha256(canonicalRequest),
    ].join('\n');
    const signature = hmac(
      signingKey(credentials.secretAccessKey, date, this.options.region),
      stringToSign
    ).toString('hex');
    headers.Authorization =
      `AWS4-HMAC-SHA256 Credential=${credentials.accessKeyId}/${scope}, SignedHeaders=${signedHeaderNames.join(';')}, Signature=${signature}`;

    const response = await this.fetcher(`https://${host}/`, {
      method: 'POST',
      headers,
      body: payload,
      signal: AbortSignal.timeout(10_000),
    });
    const responseBody = (await response.json()) as KmsResponse;
    if (!response.ok) {
      const code = responseBody.__type?.split('#').pop()?.split(':').pop() ?? 'KmsRequestFailed';
      throw new Error(`AWS KMS request failed: ${code}`);
    }
    return responseBody;
  }
}
