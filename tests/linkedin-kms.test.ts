import { describe, expect, it, vi } from 'vitest';
import {
  AwsKmsTenantKeyManagementService,
  type AwsCredentials,
} from '../apps/api/src/linkedin/aws-kms';

const credentials: AwsCredentials = {
  accessKeyId: 'AKIATESTKEY',
  secretAccessKey: 'test-secret-access-key',
  sessionToken: 'test-session-token',
};

describe('AWS KMS tenant key management service', () => {
  it('generates a 256-bit tenant data key with encryption context and SigV4 headers', async () => {
    const plaintext = Buffer.alloc(32, 7);
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(
        JSON.stringify({
          Plaintext: plaintext.toString('base64'),
          CiphertextBlob: 'wrapped-data-key',
          KeyId: 'arn:aws:kms:ap-south-1:123456789012:key/test-key',
        }),
        { status: 200, headers: { 'content-type': 'application/x-amz-json-1.1' } }
      )
    );
    const kms = new AwsKmsTenantKeyManagementService({
      region: 'ap-south-1',
      keyId: 'arn:aws:kms:ap-south-1:123456789012:key/test-key',
      fetcher,
      credentialsProvider: async () => credentials,
      now: () => new Date('2026-11-16T08:00:00.000Z'),
    });

    const generated = await kms.generateDataKey('tenant-42', 'linkedin-oauth-token');

    expect(generated.plaintextKey.equals(plaintext)).toBe(true);
    expect(generated.wrappedKey).toBe('wrapped-data-key');
    expect(generated.keyVersion).toContain('test-key');
    const [url, request] = fetcher.mock.calls[0];
    expect(url).toBe('https://kms.ap-south-1.amazonaws.com/');
    expect(request?.method).toBe('POST');
    expect(new Headers(request?.headers).get('x-amz-target')).toBe('TrentService.GenerateDataKey');
    expect(new Headers(request?.headers).get('x-amz-security-token')).toBe('test-session-token');
    expect(new Headers(request?.headers).get('authorization')).toContain('AWS4-HMAC-SHA256');
    expect(JSON.parse(String(request?.body))).toMatchObject({
      KeyId: 'arn:aws:kms:ap-south-1:123456789012:key/test-key',
      KeySpec: 'AES_256',
      EncryptionContext: {
        tenant_id: 'tenant-42',
        purpose: 'linkedin-oauth-token',
      },
    });
  });

  it('unwraps only with the same tenant and purpose encryption context', async () => {
    const plaintext = Buffer.alloc(32, 9);
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        new Response(JSON.stringify({ Plaintext: plaintext.toString('base64') }), { status: 200 })
      );
    const kms = new AwsKmsTenantKeyManagementService({
      region: 'us-east-1',
      keyId: 'test-key',
      fetcher,
      credentialsProvider: async () => credentials,
      now: () => new Date('2026-11-16T08:00:00.000Z'),
    });

    const result = await kms.unwrapDataKey(
      'tenant-a',
      'encrypted-key-blob',
      'arn:aws:kms:us-east-1:123456789012:key/test-key',
      'linkedin-token-vault'
    );

    expect(result.equals(plaintext)).toBe(true);
    expect(JSON.parse(String(fetcher.mock.calls[0][1]?.body))).toMatchObject({
      CiphertextBlob: 'encrypted-key-blob',
      EncryptionContext: {
        tenant_id: 'tenant-a',
        purpose: 'linkedin-token-vault',
      },
    });
  });

  it('fails closed on invalid tenant contexts and malformed KMS data keys', async () => {
    const fetcher = vi.fn<typeof fetch>();
    const kms = new AwsKmsTenantKeyManagementService({
      region: 'ap-south-1',
      keyId: 'test-key',
      fetcher,
      credentialsProvider: async () => credentials,
    });
    await expect(kms.generateDataKey('', 'linkedin-token-vault')).rejects.toThrow(
      'Invalid AWS KMS tenant encryption context'
    );
    expect(fetcher).not.toHaveBeenCalled();

    fetcher.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          Plaintext: Buffer.alloc(16).toString('base64'),
          CiphertextBlob: 'wrapped',
          KeyId: 'test-key',
        }),
        { status: 200 }
      )
    );
    await expect(kms.generateDataKey('tenant-a', 'linkedin-token-vault')).rejects.toThrow(
      '256-bit data key'
    );
  });

  it('rejects malformed or expired credential responses rather than falling back to local keys', async () => {
    const fetcher = vi.fn<typeof fetch>();
    const kms = new AwsKmsTenantKeyManagementService({
      region: 'ap-south-1',
      keyId: 'test-key',
      fetcher,
      credentialsProvider: async () => {
        throw new Error('role credentials unavailable');
      },
    });
    await expect(kms.generateDataKey('tenant-a', 'linkedin-token-vault')).rejects.toThrow(
      'role credentials unavailable'
    );
    expect(fetcher).not.toHaveBeenCalled();
  });
});
