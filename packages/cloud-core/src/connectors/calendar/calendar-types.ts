import { z } from 'zod';

export const CalendarProviderEnum = z.enum(['google', 'microsoft']);
export type CalendarProvider = z.infer<typeof CalendarProviderEnum>;

export interface TimeSlot {
  start: string; // ISO 8601
  end: string;   // ISO 8601
}

export interface CalendarAttendee {
  email: string;
  name?: string;
  responseStatus?: 'accepted' | 'declined' | 'tentative' | 'needsAction';
}

export interface CalendarEventInput {
  title: string;
  description?: string;
  start: string; // ISO 8601
  end: string;   // ISO 8601
  timeZone?: string;
  attendees?: CalendarAttendee[];
  location?: string;
  conferenceData?: {
    createRequest?: boolean;
    provider?: 'google_meet' | 'teams' | 'zoom';
  };
}

export interface CalendarEventRecord {
  id: string;
  provider: CalendarProvider;
  title: string;
  description?: string;
  start: string;
  end: string;
  timeZone?: string;
  attendees: CalendarAttendee[];
  meetUrl?: string;
  htmlLink?: string;
  status: 'confirmed' | 'tentative' | 'cancelled';
  createdAt: string;
}

export interface CalendarConnector {
  readonly provider: CalendarProvider;
  listFreeBusy(timeMin: string, timeMax: string, timeZone?: string): Promise<TimeSlot[]>;
  createEvent(event: CalendarEventInput): Promise<CalendarEventRecord>;
  listUpcomingEvents(timeMin?: string, limit?: number): Promise<CalendarEventRecord[]>;
}
