import { randomUUID } from 'node:crypto';
import type {
  CalendarConnector,
  CalendarEventInput,
  CalendarEventRecord,
  TimeSlot,
} from './calendar-types';

export const GOOGLE_CALENDAR_SCOPES = [
  'https://www.googleapis.com/auth/calendar.events',
  'https://www.googleapis.com/auth/calendar.readonly',
] as const;

export interface GoogleCalendarConfig {
  accessToken: string;
  refreshToken?: string;
  tokenExpiresAt?: number;
  refreshAccessToken?: () => Promise<string>;
  transport?: GoogleCalendarTransport;
}

export interface GoogleCalendarTransport {
  getFreeBusy(timeMin: string, timeMax: string, timeZone?: string): Promise<TimeSlot[]>;
  createEvent(event: CalendarEventInput): Promise<CalendarEventRecord>;
  listEvents(timeMin?: string, limit?: number): Promise<CalendarEventRecord[]>;
}

export class GoogleCalendarConnector implements CalendarConnector {
  readonly provider = 'google' as const;
  private readonly config: GoogleCalendarConfig;

  constructor(config: GoogleCalendarConfig) {
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

  public async listFreeBusy(
    timeMin: string,
    timeMax: string,
    timeZone?: string
  ): Promise<TimeSlot[]> {
    await this.ensureFreshToken();
    if (this.config.transport) {
      return this.config.transport.getFreeBusy(timeMin, timeMax, timeZone);
    }
    return [];
  }

  public async createEvent(event: CalendarEventInput): Promise<CalendarEventRecord> {
    await this.ensureFreshToken();
    if (this.config.transport) {
      return this.config.transport.createEvent(event);
    }

    const id = `gcal_${randomUUID()}`;
    return {
      id,
      provider: 'google',
      title: event.title,
      description: event.description,
      start: event.start,
      end: event.end,
      timeZone: event.timeZone || 'UTC',
      attendees: event.attendees || [],
      meetUrl: `https://meet.google.com/abc-${id.slice(0, 4)}-xyz`,
      htmlLink: `https://calendar.google.com/event?eid=${id}`,
      status: 'confirmed',
      createdAt: new Date().toISOString(),
    };
  }

  public async listUpcomingEvents(
    timeMin?: string,
    limit?: number
  ): Promise<CalendarEventRecord[]> {
    await this.ensureFreshToken();
    if (this.config.transport) {
      return this.config.transport.listEvents(timeMin, limit);
    }
    return [];
  }
}

