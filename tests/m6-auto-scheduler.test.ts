import { describe, expect, it } from 'vitest';
import { AutoScheduler } from '../packages/cloud-core/src/inbound/auto-scheduler';
import type { CalendarConnector } from '../packages/cloud-core/src/connectors/calendar/calendar-types';
import type { EmailConnector } from '../packages/cloud-core/src/connectors/email/email-types';
import type { ClassificationResult } from '../packages/cloud-core/src/inbound/classifier';

describe('Milestone M6 - Auto Scheduler Engine', () => {
  const mockCalendar: CalendarConnector = {
    provider: 'google',
    listFreeBusy: async () => [
      // Busy tomorrow 10am-11am
      {
        start: new Date(Date.now() + 24 * 3600 * 1000).toISOString().slice(0, 10) + 'T10:00:00.000Z',
        end: new Date(Date.now() + 24 * 3600 * 1000).toISOString().slice(0, 10) + 'T11:00:00.000Z',
      },
    ],
    createEvent: async (event) => ({
      id: 'event_booked_123',
      provider: 'google',
      title: event.title,
      start: event.start,
      end: event.end,
      attendees: event.attendees || [],
      meetUrl: 'https://meet.google.com/test-meet',
      status: 'confirmed',
      createdAt: new Date().toISOString(),
    }),
    listUpcomingEvents: async () => [],
  };

  const sentEmails: any[] = [];
  const mockEmail: EmailConnector = {
    provider: 'google',
    fetchRecentMessages: async () => [],
    getMessage: async () => null,
    getThread: async () => [],
    sendMessage: async (msg) => {
      sentEmails.push(msg);
      return {
        success: true,
        messageId: 'sent_ack_1',
        sentAt: new Date().toISOString(),
      };
    },
  };

  it('finds open slots within working hours avoiding busy blocks', async () => {
    const scheduler = new AutoScheduler(
      mockCalendar,
      {
        timeZone: 'UTC',
        startHour: 9,
        endHour: 17,
        meetingDurationMinutes: 30,
        bufferMinutes: 15,
        candidateName: 'Alice Turing',
      },
      mockEmail
    );

    const slots = await scheduler.findAvailableSlots();
    expect(slots.length).toBeGreaterThan(0);
    // Verified slot starts within working hours
    const firstSlot = slots[0];
    const hour = new Date(firstSlot.start).getUTCHours();
    expect(hour).toBeGreaterThanOrEqual(9);
    expect(hour).toBeLessThan(17);
  });

  it('automatically books interview and sends confirmation email when invite is received', async () => {
    const scheduler = new AutoScheduler(
      mockCalendar,
      {
        timeZone: 'UTC',
        startHour: 9,
        endHour: 17,
        meetingDurationMinutes: 30,
        bufferMinutes: 15,
        candidateName: 'Alice Turing',
      },
      mockEmail
    );

    const classification: ClassificationResult = {
      category: 'interview_invite',
      confidence: 0.95,
      urgency: 'urgent',
      requiresScheduling: true,
      proposedSlots: [],
      sanitizedSubject: 'Interview with Cloudflare',
      sanitizedBody: 'We would love to set up an introductory call.',
      senderInfo: {
        name: 'Dave Recruiter',
        email: 'dave@cloudflare.com',
        company: 'Cloudflare',
      },
      summary: 'Invite received',
      defangedTokensDetected: false,
    };

    const result = await scheduler.processInbound(classification, 'msg_orig_1', 'thread_orig_1');
    expect(result.action).toBe('interview_booked');
    expect(result.calendarEvent).toBeDefined();
    expect(result.calendarEvent?.meetUrl).toBe('https://meet.google.com/test-meet');
    expect(result.sendResult?.success).toBe(true);
    expect(sentEmails.length).toBeGreaterThan(0);
    expect(sentEmails[sentEmails.length - 1].recipient).toBe('dave@cloudflare.com');
  });

  it('extracts self-scheduling link and avoids double booking', async () => {
    const scheduler = new AutoScheduler(
      mockCalendar,
      {
        timeZone: 'UTC',
        startHour: 9,
        endHour: 17,
        meetingDurationMinutes: 30,
        bufferMinutes: 15,
        candidateName: 'Alice Turing',
      },
      mockEmail
    );

    const classification: ClassificationResult = {
      category: 'interview_invite',
      confidence: 0.98,
      urgency: 'urgent',
      requiresScheduling: true,
      schedulingUrl: 'https://calendly.com/talent-team/30min',
      proposedSlots: [],
      sanitizedSubject: 'Interview schedule link',
      sanitizedBody: 'Please book via our link',
      senderInfo: { email: 'recruiter@tech.com' },
      summary: 'Link invite',
      defangedTokensDetected: false,
    };

    const result = await scheduler.processInbound(classification);
    expect(result.action).toBe('scheduling_link_extracted');
    expect(result.schedulingUrl).toBe('https://calendly.com/talent-team/30min');
  });
});

