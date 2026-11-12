import { randomUUID } from 'node:crypto';
import type {
  EmailConnector,
  EmailFetchQuery,
  InboundEmailMessage,
  OutboundEmailMessage,
  SendResult,
} from './email-types';

export const OUTLOOK_LEAST_PRIVILEGE_SCOPES = [
  'Mail.Send',
  'Mail.ReadWrite',
  'offline_access',
] as const;

export interface OutlookConnectorConfig {
  accessToken: string;
  refreshToken?: string;
  tokenExpiresAt?: number;
  refreshAccessToken?: () => Promise<string>;
  transport?: OutlookTransport;
}

export interface OutlookTransport {
  listMessages(query?: EmailFetchQuery): Promise<InboundEmailMessage[]>;
  getMessage(id: string): Promise<InboundEmailMessage | null>;
  sendMessage(message: OutboundEmailMessage): Promise<{ id: string; conversationId?: string }>;
}

export class OutlookConnector implements EmailConnector {
  readonly provider = 'microsoft' as const;
  private readonly config: OutlookConnectorConfig;

  constructor(config: OutlookConnectorConfig) {
    this.config = config;
  }

  private async ensureFreshToken(): Promise<string> {
    if (this.config.tokenExpiresAt && Date.now() >= this.config.tokenExpiresAt - 60000) {
      if (this.config.refreshAccessToken) {
        const newToken = await this.config.refreshAccessToken();
        this.config.accessToken = newToken;
        return newToken;
      }
    }
    return this.config.accessToken;
  }

  public async fetchRecentMessages(query?: EmailFetchQuery): Promise<InboundEmailMessage[]> {
    await this.ensureFreshToken();
    if (this.config.transport) {
      return this.config.transport.listMessages(query);
    }
    return [];
  }

  public async getMessage(messageId: string): Promise<InboundEmailMessage | null> {
    await this.ensureFreshToken();
    if (this.config.transport) {
      return this.config.transport.getMessage(messageId);
    }
    return null;
  }

  public async getThread(threadId: string): Promise<InboundEmailMessage[]> {
    await this.ensureFreshToken();
    const messages = await this.fetchRecentMessages({ limit: 50 });
    return messages.filter((m) => m.threadId === threadId);
  }

  public async sendMessage(message: OutboundEmailMessage): Promise<SendResult> {
    await this.ensureFreshToken();
    const now = new Date().toISOString();

    if (this.config.transport) {
      try {
        const res = await this.config.transport.sendMessage(message);
        return {
          success: true,
          messageId: res.id,
          threadId: res.conversationId || message.threadId,
          sentAt: now,
        };
      } catch (err) {
        return {
          success: false,
          messageId: '',
          sentAt: now,
          error: err instanceof Error ? err.message : 'Failed to send Outlook message',
        };
      }
    }

    const generatedId = `ms_${randomUUID()}`;
    return {
      success: true,
      messageId: generatedId,
      threadId: message.threadId || generatedId,
      sentAt: now,
    };
  }
}

