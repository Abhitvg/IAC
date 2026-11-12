import { z } from 'zod';
import { sanitizeUntrustedText } from '../sanitizer';

export const InboundCategoryEnum = z.enum([
  'interview_invite',
  'assessment',
  'info_request',
  'rejection',
  'referral_confirmation',
  'spam',
  'other',
]);

export type InboundCategory = z.infer<typeof InboundCategoryEnum>;

export interface ExtractedProposedSlot {
  rawText: string;
  startIso?: string;
  endIso?: string;
}

export interface ClassificationResult {
  category: InboundCategory;
  confidence: number;
  urgency: 'urgent' | 'normal' | 'low';
  requiresScheduling: boolean;
  schedulingUrl?: string;
  assessmentUrl?: string;
  proposedSlots: ExtractedProposedSlot[];
  sanitizedSubject: string;
  sanitizedBody: string;
  senderInfo: {
    name?: string;
    email: string;
    company?: string;
  };
  summary: string;
  defangedTokensDetected: boolean;
}

const SCHEDULING_LINK_REGEX =
  /https?:\/\/(?:www\.)?(?:calendly\.com|chilipiper\.com|savvycal\.com|goodtime\.io|meetings\.hubspot\.com|app\.reclaim\.ai)\/[^\s"'>)]+/gi;

const ASSESSMENT_LINK_REGEX =
  /https?:\/\/(?:www\.)?(?:hackerrank\.com|codesignal\.com|codility\.com|testgorilla\.com|karat\.com|leetcode\.com)\/[^\s"'>)]+/gi;

export class EmailReplyClassifier {
  /**
   * Sanitizes untrusted inbound text (H5) and classifies the message deterministically.
   */
  public classify(input: {
    senderEmail: string;
    senderName?: string;
    subject: string;
    bodyText: string;
  }): ClassificationResult {
    // HARD LINE H5: All external email text is untrusted data.
    const rawCombined = `${input.subject}\n${input.bodyText}`;
    const sanitizedSubject = sanitizeUntrustedText(input.subject);
    const sanitizedBody = sanitizeUntrustedText(input.bodyText);
    const defangedTokensDetected =
      sanitizedSubject.includes('[defanged-injection-token]') ||
      sanitizedBody.includes('[defanged-injection-token]');

    const contentLower = `${sanitizedSubject.toLowerCase()}\n${sanitizedBody.toLowerCase()}`;

    // Extract links
    const schedulingLinks = input.bodyText.match(SCHEDULING_LINK_REGEX);
    const schedulingUrl = schedulingLinks ? schedulingLinks[0] : undefined;

    const assessmentLinks = input.bodyText.match(ASSESSMENT_LINK_REGEX);
    const assessmentUrl = assessmentLinks ? assessmentLinks[0] : undefined;

    // Extract proposed time slots (basic date / hour heuristics)
    const proposedSlots = this.extractProposedTimeSlots(sanitizedBody);

    // Rule-based classification
    let category: InboundCategory = 'other';
    let confidence = 0.5;
    let urgency: 'urgent' | 'normal' | 'low' = 'normal';
    let requiresScheduling = false;

    // 1. Rejection signals
    if (
      contentLower.includes('unfortunately') ||
      contentLower.includes('not moving forward') ||
      contentLower.includes('pursuing other candidates') ||
      contentLower.includes('decided to move forward with another') ||
      contentLower.includes('wish you the best in your job search') ||
      contentLower.includes('impressed by your background, however')
    ) {
      category = 'rejection';
      confidence = 0.95;
      urgency = 'low';
    }
    // 2. Technical Assessment / Coding Challenge
    else if (
      contentLower.includes('coding challenge') ||
      contentLower.includes('technical assessment') ||
      contentLower.includes('take-home assignment') ||
      contentLower.includes('online assessment') ||
      Boolean(assessmentUrl)
    ) {
      category = 'assessment';
      confidence = assessmentUrl ? 0.98 : 0.9;
      urgency = 'urgent';
    }
    // 3. Referral confirmation
    else if (
      contentLower.includes('submitted your referral') ||
      contentLower.includes('referred you for the') ||
      contentLower.includes('referral received')
    ) {
      category = 'referral_confirmation';
      confidence = 0.92;
      urgency = 'normal';
    }
    // 4. Information request (documents, work auth, salary questions before scheduling)
    else if (
      (contentLower.includes('updated resume') ||
        contentLower.includes('portfolio link') ||
        contentLower.includes('work authorization') ||
        contentLower.includes('provide additional information') ||
        contentLower.includes('salary expectations')) &&
      !schedulingUrl
    ) {
      category = 'info_request';
      confidence = 0.88;
      urgency = 'normal';
    }
    // 5. Interview invite signals
    else if (
      contentLower.includes('interview') ||
      contentLower.includes('phone screen') ||
      contentLower.includes('introductory call') ||
      contentLower.includes('chat about your background') ||
      contentLower.includes('speak with the team') ||
      contentLower.includes('connect for 30 minutes') ||
      Boolean(schedulingUrl)
    ) {
      category = 'interview_invite';
      confidence = schedulingUrl ? 0.98 : 0.92;
      urgency = 'urgent';
      requiresScheduling = true;
    }
    // 6. Spam
    else if (
      contentLower.includes('crypto investment') ||
      contentLower.includes('seo services') ||
      contentLower.includes('marketing list') ||
      contentLower.includes('unsubscribe here') && contentLower.includes('newsletter')
    ) {
      category = 'spam';
      confidence = 0.85;
      urgency = 'low';
    }

    // Try extracting sender company
    const domainMatch = input.senderEmail.match(/@([^.]+)\./);
    const domainCompany = domainMatch ? domainMatch[1].charAt(0).toUpperCase() + domainMatch[1].slice(1) : undefined;

    return {
      category,
      confidence,
      urgency,
      requiresScheduling,
      schedulingUrl,
      assessmentUrl,
      proposedSlots,
      sanitizedSubject,
      sanitizedBody,
      senderInfo: {
        name: input.senderName,
        email: input.senderEmail,
        company: domainCompany,
      },
      summary: `Inbound email classified as ${category} (${Math.round(confidence * 100)}% confidence)`,
      defangedTokensDetected,
    };
  }

  private extractProposedTimeSlots(text: string): ExtractedProposedSlot[] {
    const slots: ExtractedProposedSlot[] = [];
    const timeRegex = /(?:monday|tuesday|wednesday|thursday|friday|mon|tue|wed|thu|fri)[,\s]+[a-z0-9\s/]+(?:at|from)\s+[0-9]{1,2}(?::[0-9]{2})?\s*(?:am|pm)?/gi;
    const matches = text.match(timeRegex);
    if (matches) {
      for (const m of matches) {
        slots.push({ rawText: m.trim() });
      }
    }
    return slots;
  }
}
