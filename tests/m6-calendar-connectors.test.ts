import { describe, expect, it } from 'vitest';
import {
  GOOGLE_CALENDAR_SCOPES,
  GoogleCalendarConnector,
} from '../packages/cloud-core/src/connectors/calendar/google-calendar';
import {
  OUTLOOK_CALENDAR_SCOPES,
  OutlookCalendarConnector,
} from '../packages/cloud-core/src/connectors/calendar/outlook-calendar';
import type { TimeSlot } from '../packages/cloud-core/src/connectors/calendar/calendar-types';

describe('Milestone M6 - Calendar Connectors', () => {
  it('enforces least-privilege calendar scopes', () => {
    expect(GOOGLE_CALENDAR_SCOPES).toContain(
      'https://www.googleapis.com/auth/calendar.events'
    );
    expect(OUTLOOK_CALENDAR_SCOPES).toContain('Calendars.ReadWrite');
  });

  it('GoogleCalendarConnector queries free/busy slots and creates Meet events', async () => {
    const mockBusy: TimeSlot[] = [
      { start: '2026-11-15T14:00:00Z', end: '2026-11-15T15:00:00Z' },
    ];

    const connector = new GoogleCalendarConnector({
      accessToken: 'valid_gcal_token',
      transport: {
        getFreeBusy: async () => mockBusy,
        createEvent: async (event) => ({
          id: 'gcal_ev_1',
          provider: 'google',
          title: event.title,
          start: event.start,
          end: event.end,
          attendees: event.attendees || [],
          meetUrl: 'https://meet.google.com/xyz-1234-abc',
          status: 'confirmed',
          createdAt: new Date().toISOString(),
        }),
        listEvents: async () => [],
      },
    });

    const busy = await connector.listFreeBusy('2026-11-15T00:00:00Z', '2026-11-15T23:59:59Z');
    expect(busy).toHaveLength(1);
    expect(busy[0].start).toBe('2026-11-15T14:00:00Z');

    const created = await connector.createEvent({
      title: 'Technical Screen: Stripe',
      start: '2026-11-15T15:30:00Z',
      end: '2026-11-15T16:00:00Z',
      attendees: [{ email: 'recruiter@stripe.com' }],
    });

    expect(created.id).toBe('gcal_ev_1');
    expect(created.meetUrl).toBe('https://meet.google.com/xyz-1234-abc');
    expect(created.status).toBe('confirmed');
  });

  it('OutlookCalendarConnector creates Teams calendar meetings', async () => {
    const connector = new OutlookCalendarConnector({
      accessToken: 'valid_outlook_token',
      transport: {
        getFreeBusy: async () => [],
        createEvent: async (event) => ({
          id: 'ms_ev_1',
          provider: 'microsoft',
          title: event.title,
          start: event.start,
          end: event.end,
          attendees: event.attendees || [],
          meetUrl: 'https://teams.microsoft.com/l/meetup-join/1234',
          status: 'confirmed',
          createdAt: new Date().toISOString(),
        }),
        listEvents: async () => [],
      },
    });

    const created = await connector.createEvent({
      title: 'Intro Call: Microsoft',
      start: '2026-11-16T10:00:00Z',
      end: '2026-11-16T10:30:00Z',
      attendees: [{ email: 'recruiter@microsoft.com' }],
    });

    expect(created.provider).toBe('microsoft');
    expect(created.meetUrl).toContain('teams.microsoft.com');
  });
});
