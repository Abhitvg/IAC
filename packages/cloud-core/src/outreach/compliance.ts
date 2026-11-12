import { VerificationSourceEnum, type VerificationSource } from '../person-graph/person-types';

export class HardLineH4ViolationError extends Error {
  constructor(message = 'Hard Line H4: Outreach permitted only to verified business channels from licensed providers, public pages, or confirmed connections. Guessed or SMTP-probed emails are strictly prohibited.') {
    super(message);
    this.name = 'HardLineH4ViolationError';
  }
}

export interface SuppressionEntry {
  email?: string | null;
  domain?: string | null;
  reason: 'opt_out' | 'bounce' | 'spam_complaint' | 'manual';
}

export interface SenderIdentity {
  name: string;
  email: string;
  physicalAddress?: string;
  organization?: string;
}

export type Jurisdiction = 'US' | 'EU' | 'UK' | 'IN' | 'OTHER';

export class OutreachComplianceEngine {
  /**
   * Asserts contact has an authorized verification source (Hard Line H4).
   */
  public assertAuthorizedContact(email: string, source: string): void {
    const parsed = VerificationSourceEnum.safeParse(source);
    if (!parsed.success) {
      throw new HardLineH4ViolationError(
        `Hard Line H4: Contact ${email} has unauthorized verification source "${source}". Only licensed providers, public pages, or user connections are allowed.`
      );
    }
  }

  /**
   * Checks if an email address or its domain is on the suppression list.
   */
  public isSuppressed(email: string, suppressionList: SuppressionEntry[]): {
    suppressed: boolean;
    reason?: string;
  } {
    const normEmail = email.toLowerCase().trim();
    const domain = normEmail.split('@')[1];

    for (const entry of suppressionList) {
      if (entry.email && entry.email.toLowerCase().trim() === normEmail) {
        return { suppressed: true, reason: entry.reason };
      }
      if (entry.domain && domain && entry.domain.toLowerCase().trim() === domain) {
        return { suppressed: true, reason: `domain_${entry.reason}` };
      }
    }

    return { suppressed: false };
  }

  /**
   * Enforces recipient quiet hours (no emails between 8:00 PM and 8:00 AM recipient local time).
   */
  public checkQuietHours(
    recipientTimeZone = 'America/New_York',
    now = new Date()
  ): { inQuietHours: boolean; localHour: number } {
    let localHour = now.getUTCHours();
    try {
      const formatter = new Intl.DateTimeFormat('en-US', {
        timeZone: recipientTimeZone,
        hour: 'numeric',
        hour12: false,
      });
      localHour = parseInt(formatter.format(now), 10);
      if (localHour === 24) localHour = 0;
    } catch {
      // Fallback if time zone invalid
      localHour = now.getUTCHours();
    }

    // Quiet hours: 8:00 PM (20) to 8:00 AM (8)
    const inQuietHours = localHour >= 20 || localHour < 8;
    return { inQuietHours, localHour };
  }

  /**
   * Appends region-aware compliance footer with sender identity and unambiguous opt-out (H4).
   */
  public generateComplianceFooter(
    jurisdiction: Jurisdiction = 'US',
    sender: SenderIdentity,
    optOutUrl?: string
  ): string {
    const optOutText = optOutUrl
      ? `To opt out of future emails, click here: ${optOutUrl}`
      : `If you prefer not to hear from me, simply reply "unsubscribe" or "opt out" and I will immediately cease all communication.`;

    const addressText = sender.physicalAddress
      ? `${sender.name} | ${sender.physicalAddress}`
      : `${sender.name} (${sender.email})`;

    switch (jurisdiction) {
      case 'US':
        // CAN-SPAM Act compliant
        return `\n\n---\nSent by ${addressText}\n${optOutText}`;

      case 'EU':
      case 'UK':
        // GDPR / PECR B2B Legitimate Interest compliant
        return `\n\n---\nCommunication sent by ${addressText} based on legitimate professional interest. We process your contact details solely for direct professional correspondence.\n${optOutText}`;

      case 'IN':
        // India DPDP compliant
        return `\n\n---\nSender: ${addressText}. Purpose: Professional career inquiry.\n${optOutText}`;

      default:
        return `\n\n---\nSent by ${addressText}\n${optOutText}`;
    }
  }
}

