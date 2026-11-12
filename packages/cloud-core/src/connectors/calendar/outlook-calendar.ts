import { randomUUID } from 'node:crypto';
import type {
  CalendarConnector,
  CalendarEventInput,
  CalendarEventRecord,
  TimeSlot,
} from './calendar-types';

export const OUTLOOK_CALENDAR_SCOPES = [
  'Calendars.ReadWrite',
  'Calendars.Read',
  'offline_access',
] as const;

export interface OutlookCalendarConfig {
  accessToken: string;
  refreshToken?: string;
  tokenExpiresAt?: number;
  refreshAccessToken?: () => Promise<string>;
  transport?: OutlookCalendarTransport;
}

export interface OutlookCalendarTransport {
  getFreeBusy(timeMin: string, timeMax: string, timeZone?: string): Promise<TimeSlot[]>;
  createEvent(event: CalendarEventInput): Promise<CalendarEventRecord>;
  listEvents(timeMin?: string, limit?: number): Promise<CalendarEventRecord[]>;
}

export class OutlookCalendarConnector implements CalendarConnector {
  readonly provider = 'microsoft' as const;
  private readonly config: OutlookCalendarConfig;

  constructor(config: OutlookCalendarConfig) {
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

    const id = `ms_cal_${randomUUID()}`;
    return {
      id,
      provider: 'microsoft',
      title: event.title,
      description: event.description,
      start: event.start,
      end: event.end,
      timeZone: event.timeZone || 'UTC',
      attendees: event.attendees || [],
      meetUrl: `https://teams.microsoft.com/l/meetup-join/${id}`,
      htmlLink: `https://outlook.office.com/calendar/item/${id}`,
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

