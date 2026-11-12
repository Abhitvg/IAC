import { randomUUID } from 'node:crypto';
import type {
  EmailConnector,
  EmailFetchQuery,
  InboundEmailMessage,
  OutboundEmailMessage,
  SendResult,
} from './email-types';

export interface ImapSmtpConfig {
  imap: {
    host: string;
    port: number;
    secure: boolean;
    user: string;
    pass: string;
  };
  smtp: {
    host: string;
    port: number;
    secure: boolean;
    user: string;
    pass: string;
  };
  transport?: {
    fetchMessages(query?: EmailFetchQuery): Promise<InboundEmailMessage[]>;
    send(message: OutboundEmailMessage): Promise<{ messageId: string }>;
  };
}

export class ImapSmtpConnector implements EmailConnector {
  readonly provider = 'imap_smtp' as const;
  private readonly config: ImapSmtpConfig;

  constructor(config: ImapSmtpConfig) {
    this.config = config;
  }

  public async fetchRecentMessages(query?: EmailFetchQuery): Promise<InboundEmailMessage[]> {
    if (this.config.transport) {
      return this.config.transport.fetchMessages(query);
    }
    return [];
  }

  public async getMessage(messageId: string): Promise<InboundEmailMessage | null> {
    const messages = await this.fetchRecentMessages({ limit: 50 });
    return messages.find((m) => m.id === messageId) || null;
  }

  public async getThread(threadId: string): Promise<InboundEmailMessage[]> {
    const messages = await this.fetchRecentMessages({ limit: 50 });
    return messages.filter((m) => m.threadId === threadId);
  }

  public async sendMessage(message: OutboundEmailMessage): Promise<SendResult> {
    const now = new Date().toISOString();
    if (this.config.transport) {
      try {
        const res = await this.config.transport.send(message);
        return {
          success: true,
          messageId: res.messageId,
          threadId: message.threadId,
          sentAt: now,
        };
      } catch (err) {
        return {
          success: false,
          messageId: '',
          sentAt: now,
          error: err instanceof Error ? err.message : 'SMTP send failed',
        };
      }
    }

    const id = `smtp_${randomUUID()}`;
    return {
      success: true,
      messageId: id,
      threadId: message.threadId || id,
      sentAt: now,
    };
  }
}

