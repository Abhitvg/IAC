import { z } from 'zod';

export const EmailProviderEnum = z.enum(['google', 'microsoft', 'imap_smtp']);
export type EmailProvider = z.infer<typeof EmailProviderEnum>;

export interface InboundEmailMessage {
  id: string;
  provider: EmailProvider;
  threadId?: string;
  sender: {
    email: string;
    name?: string;
  };
  recipient: string;
  subject: string;
  bodyText: string;
  bodyHtml?: string;
  headers: Record<string, string>;
  receivedAt: string;
}

export interface OutboundEmailMessage {
  recipient: string;
  recipientName?: string;
  subject: string;
  bodyText: string;
  bodyHtml?: string;
  inReplyToMessageId?: string;
  threadId?: string;
  headers?: Record<string, string>;
}

export interface EmailFetchQuery {
  sinceTimestamp?: string;
  query?: string;
  limit?: number;
  label?: string;
}

export interface SendResult {
  success: boolean;
  messageId: string;
  threadId?: string;
  sentAt: string;
  error?: string;
}

export interface EmailConnector {
  readonly provider: EmailProvider;
  fetchRecentMessages(query?: EmailFetchQuery): Promise<InboundEmailMessage[]>;
  getMessage(messageId: string): Promise<InboundEmailMessage | null>;
  getThread(threadId: string): Promise<InboundEmailMessage[]>;
  sendMessage(message: OutboundEmailMessage): Promise<SendResult>;
}

