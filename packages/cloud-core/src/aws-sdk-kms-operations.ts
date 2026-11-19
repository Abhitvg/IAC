import type { KmsDataKeyOperations } from './kms-key-provider';

interface AwsSdkCommand<Input> {
  readonly input: Input;
}

interface AwsSdkCommandConstructor<Input> {
  new (input: Input): AwsSdkCommand<Input>;
}

interface AwsSdkKmsClient {
  send(command: AwsSdkCommand<unknown>): Promise<{
    Plaintext?: Uint8Array;
    CiphertextBlob?: Uint8Array;
    KeyId?: string;
  }>;
  destroy?(): void;
}

export interface AwsSdkKmsCommandSet {
  GenerateDataKeyCommand: AwsSdkCommandConstructor<{
    KeyId: string;
    KeySpec: 'AES_256';
    EncryptionContext: Record<string, string>;
  }>;
  DecryptCommand: AwsSdkCommandConstructor<{
    KeyId: string;
    CiphertextBlob: Uint8Array;
    EncryptionContext: Record<string, string>;
  }>;
}

/**
 * Thin AWS SDK v3 command adapter. Construct KMSClient with the task-role
 * credential chain and bounded request timeouts in the composition root, then
 * pass the SDK command constructors here. No AWS credentials are accepted.
 */
export class AwsSdkKmsDataKeyOperations implements KmsDataKeyOperations {
  private destroyed = false;

  constructor(
    private readonly client: AwsSdkKmsClient,
    private readonly commands: AwsSdkKmsCommandSet
  ) {
    if (!client || typeof client.send !== 'function' || !commands?.GenerateDataKeyCommand || !commands?.DecryptCommand) {
      throw new Error('Invalid AWS SDK KMS adapter configuration');
    }
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.client.destroy?.();
  }

  async generateDataKey(input: {
    KeyId: string;
    KeySpec: 'AES_256';
    EncryptionContext: Record<string, string>;
  }): Promise<{ Plaintext?: Uint8Array; CiphertextBlob?: Uint8Array; KeyId?: string }> {
    if (this.destroyed) throw new Error('AWS SDK KMS operations adapter has been destroyed');
    return this.client.send(new this.commands.GenerateDataKeyCommand(input));
  }

  async decrypt(input: {
    KeyId: string;
    CiphertextBlob: Uint8Array;
    EncryptionContext: Record<string, string>;
  }): Promise<{ Plaintext?: Uint8Array; KeyId?: string }> {
    if (this.destroyed) throw new Error('AWS SDK KMS operations adapter has been destroyed');
    return this.client.send(new this.commands.DecryptCommand(input));
  }
}
