import { randomUUID } from 'node:crypto';
import type { CalendarConnector, CalendarEventRecord, TimeSlot } from '../connectors/calendar/calendar-types';
import type { EmailConnector, SendResult } from '../connectors/email/email-types';
import type { ClassificationResult } from './classifier';

export interface SchedulingPreferences {
  timeZone: string;
  startHour: number; // e.g. 9 (9am)
  endHour: number;   // e.g. 17 (5pm)
  meetingDurationMinutes: number; // default 30
  bufferMinutes: number; // default 15
  candidateName: string;
}

export interface SchedulingResult {
  action: 'interview_booked' | 'scheduling_link_extracted' | 'slots_proposed' | 'rejection_handled' | 'ignored';
  calendarEvent?: CalendarEventRecord;
  sendResult?: SendResult;
  proposedSlots?: TimeSlot[];
  schedulingUrl?: string;
  notes?: string;
}

export class AutoScheduler {
  private readonly calendar: CalendarConnector;
  private readonly email?: EmailConnector;
  private readonly preferences: SchedulingPreferences;

  constructor(
    calendar: CalendarConnector,
    preferences: SchedulingPreferences,
    email?: EmailConnector
  ) {
    this.calendar = calendar;
    this.preferences = preferences;
    this.email = email;
  }

  /**
   * Generates next available candidate slots within working hours, avoiding busy periods.
   */
  public async findAvailableSlots(daysAhead = 5): Promise<TimeSlot[]> {
    const now = new Date();
    const timeMin = new Date(now.getTime() + 24 * 3600 * 1000).toISOString(); // start tomorrow
    const timeMax = new Date(now.getTime() + (daysAhead + 1) * 24 * 3600 * 1000).toISOString();

    const busySlots = await this.calendar.listFreeBusy(timeMin, timeMax, this.preferences.timeZone);
    const availableSlots: TimeSlot[] = [];

    // Loop through upcoming business days
    for (let dayOffset = 1; dayOffset <= daysAhead; dayOffset++) {
      const dayDate = new Date(now.getTime() + dayOffset * 24 * 3600 * 1000);
      const dayOfWeek = dayDate.getUTCDay();
      // Skip weekends (0 = Sun, 6 = Sat)
      if (dayOfWeek === 0 || dayOfWeek === 6) continue;

      const yyyy = dayDate.getUTCFullYear();
      const mm = String(dayDate.getUTCMonth() + 1).padStart(2, '0');
      const dd = String(dayDate.getUTCDate()).padStart(2, '0');

      // Check hourly slots between startHour and endHour
      for (let hour = this.preferences.startHour; hour < this.preferences.endHour; hour++) {
        const slotStart = new Date(`${yyyy}-${mm}-${dd}T${String(hour).padStart(2, '0')}:00:00.000Z`);
        const slotEnd = new Date(slotStart.getTime() + this.preferences.meetingDurationMinutes * 60 * 1000);

        const isBusy = busySlots.some((busy) => {
          const bStart = new Date(busy.start).getTime() - this.preferences.bufferMinutes * 60 * 1000;
          const bEnd = new Date(busy.end).getTime() + this.preferences.bufferMinutes * 60 * 1000;
          return slotStart.getTime() < bEnd && slotEnd.getTime() > bStart;
        });

        if (!isBusy) {
          availableSlots.push({
            start: slotStart.toISOString(),
            end: slotEnd.toISOString(),
          });
          if (availableSlots.length >= 5) break;
        }
      }
      if (availableSlots.length >= 5) break;
    }

    return availableSlots;
  }

  /**
   * Processes classified inbound message and executes auto-scheduling response.
   */
  public async processInbound(
    classification: ClassificationResult,
    originalMessageId?: string,
    threadId?: string
  ): Promise<SchedulingResult> {
    // 1. If self-scheduling link is present
    if (classification.schedulingUrl) {
      return {
        action: 'scheduling_link_extracted',
        schedulingUrl: classification.schedulingUrl,
        notes: `Extracted candidate self-scheduling link: ${classification.schedulingUrl}`,
      };
    }

    // 2. If it's an interview invite requesting a time
    if (classification.category === 'interview_invite' && classification.requiresScheduling) {
      const freeSlots = await this.findAvailableSlots();
      if (freeSlots.length > 0) {
        const selectedSlot = freeSlots[0];

        // Book on calendar
        const eventTitle = `Interview: ${this.preferences.candidateName} / ${
          classification.senderInfo.company || 'Hiring Team'
        }`;
        const calendarEvent = await this.calendar.createEvent({
          title: eventTitle,
          description: `Auto-scheduled interview with ${classification.senderInfo.name || classification.senderInfo.email}`,
          start: selectedSlot.start,
          end: selectedSlot.end,
          timeZone: this.preferences.timeZone,
          attendees: [{ email: classification.senderInfo.email, name: classification.senderInfo.name }],
          conferenceData: { createRequest: true, provider: 'google_meet' },
        });

        // Send auto-response email if email connector is available
        let sendResult: SendResult | undefined;
        if (this.email) {
          const formattedDate = new Date(selectedSlot.start).toUTCString();
          const bodyText = `Hi ${classification.senderInfo.name || 'there'},\n\nThank you for reaching out! I would love to connect. I have scheduled our introductory conversation for ${formattedDate}.\n\nLooking forward to speaking!\n\nBest regards,\n${this.preferences.candidateName}`;

          sendResult = await this.email.sendMessage({
            recipient: classification.senderInfo.email,
            recipientName: classification.senderInfo.name,
            subject: `Re: ${classification.sanitizedSubject}`,
            bodyText,
            inReplyToMessageId: originalMessageId,
            threadId,
          });
        }

        return {
          action: 'interview_booked',
          calendarEvent,
          sendResult,
          notes: `Confirmed interview slot and booked calendar event at ${selectedSlot.start}`,
        };
      }

      return {
        action: 'slots_proposed',
        proposedSlots: freeSlots,
        notes: 'Identified candidate open slots',
      };
    }

    // 3. Rejection
    if (classification.category === 'rejection') {
      return {
        action: 'rejection_handled',
        notes: 'Inbound message identified as rejection; logged in tracking system',
      };
    }

    return {
      action: 'ignored',
      notes: `Category ${classification.category} did not require automated calendar action`,
    };
  }
}

