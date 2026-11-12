import { describe, expect, it, vi } from 'vitest';
import {
  GMAIL_LEAST_PRIVILEGE_SCOPES,
  GmailConnector,
} from '../packages/cloud-core/src/connectors/email/gmail-connector';
import {
  OUTLOOK_LEAST_PRIVILEGE_SCOPES,
  OutlookConnector,
} from '../packages/cloud-core/src/connectors/email/outlook-connector';
import { ImapSmtpConnector } from '../packages/cloud-core/src/connectors/email/imap-smtp-connector';
import type { InboundEmailMessage } from '../packages/cloud-core/src/connectors/email/email-types';

describe('Milestone M6 - Email Connectors', () => {
  it('enforces least-privilege scopes for Gmail OAuth', () => {
    expect(GMAIL_LEAST_PRIVILEGE_SCOPES).toContain(
      'https://www.googleapis.com/auth/gmail.send'
    );
    expect(GMAIL_LEAST_PRIVILEGE_SCOPES).toContain(
      'https://www.googleapis.com/auth/gmail.readonly'
    );
    expect(GMAIL_LEAST_PRIVILEGE_SCOPES).not.toContain(
      'https://mail.google.com/' // Full mailbox access forbidden
    );
  });

  it('GmailConnector sends messages and refreshes expired tokens', async () => {
    const refreshSpy = vi.fn(async () => 'fresh_access_token');
    const sendTransportSpy = vi.fn(async () => ({
      id: 'msg_123',
      threadId: 'thread_456',
    }));

    const connector = new GmailConnector({
      accessToken: 'expired_token',
      tokenExpiresAt: Date.now() - 5000, // Expired!
      refreshAccessToken: refreshSpy,
      transport: {
        listMessages: async () => [],
        getMessage: async () => null,
        sendMessage: sendTransportSpy,
      },
    });

    const result = await connector.sendMessage({
      recipient: 'recruiter@company.com',
      subject: 'Re: Interview Availability',
      bodyText: 'Thank you for following up!',
      threadId: 'thread_456',
    });

    expect(refreshSpy).toHaveBeenCalled();
    expect(sendTransportSpy).toHaveBeenCalled();
    expect(result.success).toBe(true);
    expect(result.messageId).toBe('msg_123');
    expect(result.threadId).toBe('thread_456');
  });

  it('OutlookConnector lists messages and sends via Microsoft Graph transport', async () => {
    expect(OUTLOOK_LEAST_PRIVILEGE_SCOPES).toContain('Mail.Send');
    expect(OUTLOOK_LEAST_PRIVILEGE_SCOPES).toContain('Mail.ReadWrite');

    const sampleInbound: InboundEmailMessage = {
      id: 'ms_inbound_1',
      provider: 'microsoft',
      threadId: 'conv_1',
      sender: { email: 'hr@startup.io', name: 'Sarah HR' },
      recipient: 'candidate@example.com',
      subject: 'Interview with Engineering Team',
      bodyText: 'We would love to invite you for a 30 min chat.',
      headers: {},
      receivedAt: new Date().toISOString(),
    };

    const connector = new OutlookConnector({
      accessToken: 'valid_ms_token',
      transport: {
        listMessages: async () => [sampleInbound],
        getMessage: async (id) => (id === 'ms_inbound_1' ? sampleInbound : null),
        sendMessage: async () => ({ id: 'ms_out_1', conversationId: 'conv_1' }),
      },
    });

    const messages = await connector.fetchRecentMessages();
    expect(messages).toHaveLength(1);
    expect(messages[0].sender.email).toBe('hr@startup.io');

    const thread = await connector.getThread('conv_1');
    expect(thread).toHaveLength(1);

    const sent = await connector.sendMessage({
      recipient: 'hr@startup.io',
      subject: 'Re: Interview with Engineering Team',
      bodyText: 'Available Tuesday at 2pm!',
    });
    expect(sent.success).toBe(true);
    expect(sent.messageId).toBe('ms_out_1');
  });

  it('ImapSmtpConnector supports standard RFC mail servers without OAuth', async () => {
    const connector = new ImapSmtpConnector({
      imap: { host: 'imap.mail.com', port: 993, secure: true, user: 'u', pass: 'p' },
      smtp: { host: 'smtp.mail.com', port: 465, secure: true, user: 'u', pass: 'p' },
      transport: {
        fetchMessages: async () => [
          {
            id: 'imap_1',
            provider: 'imap_smtp',
            sender: { email: 'team@tech.com' },
            recipient: 'candidate@example.com',
            subject: 'Next Steps',
            bodyText: 'Please share your availability.',
            headers: {},
            receivedAt: new Date().toISOString(),
          },
        ],
        send: async () => ({ messageId: 'smtp_ack_1' }),
      },
    });

    const messages = await connector.fetchRecentMessages();
    expect(messages).toHaveLength(1);

    const sendRes = await connector.sendMessage({
      recipient: 'team@tech.com',
      subject: 'Re: Next Steps',
      bodyText: 'Here is my availability.',
    });
    expect(sendRes.success).toBe(true);
    expect(sendRes.messageId).toBe('smtp_ack_1');
  });
});

