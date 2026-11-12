import { randomUUID } from 'node:crypto';
import type { Person } from '../person-graph/person-types';
import { createAssistQueueItem, type AssistQueueItem } from '../apply/assist-queue';

export interface LinkedInAssistAction {
  id: string;
  personId: string;
  name: string;
  company: string;
  title: string;
  profileUrl: string;
  actionType: 'connect_with_note' | 'send_message';
  prefilledText: string;
  characterCount: number;
  warmth: number;
  userGestureRequired: true;
}

export class LinkedInAssistProtocol {
  /**
   * Generates a compliant connection request note or direct message (< 300 chars).
   */
  public generateAssistNote(
    person: Person,
    targetRoleTitle: string,
    candidateName: string,
    hook: string
  ): string {
    const firstName = person.name.split(' ')[0] || 'there';
    // Connection note limit is 300 chars on LinkedIn
    const note = `Hi ${firstName}, saw your work on ${person.company}'s engineering team. I'm a SWE focused on ${hook} and applying for the ${targetRoleTitle} role. Would love to connect! - ${candidateName}`;
    return note.slice(0, 300);
  }

  /**
   * Enqueues prepared LinkedIn actions into the Assist Queue.
   * Strictly enforces userGestureRequired: true (Hard Line H1).
   */
  public createAssistActionItem(
    tenantId: string,
    person: Person,
    targetRoleTitle: string,
    candidateName: string,
    hook: string
  ): AssistQueueItem {
    const prefilledText = this.generateAssistNote(person, targetRoleTitle, candidateName, hook);
    const profileUrl = person.linkedinUrl || `https://www.linkedin.com/search/results/people/?keywords=${encodeURIComponent(person.name + ' ' + person.company)}`;

    return createAssistQueueItem({
      tenantId,
      company: person.company,
      role: targetRoleTitle,
      platform: 'linkedin_assist',
      targetUrl: profileUrl,
      handOffReason: 'linkedin_assist',
      userGestureRequired: true, // Code-level invariant H1
      prefilledPayload: {
        personId: person.id,
        recipientName: person.name,
        actionType: person.relationship === '1st_degree' ? 'send_message' : 'connect_with_note',
        prefilledText,
        characterCount: prefilledText.length,
      },
      assistNotes: `Warmest 1st-degree contact at ${person.company}. Click to open profile and prefill personalized note.`,
    });
  }
}

