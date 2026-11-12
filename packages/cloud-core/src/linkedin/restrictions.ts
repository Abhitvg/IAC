import { z } from 'zod';

export const LinkedInRestrictionNoticeTypeEnum = z.enum([
  'invitation_limit_reached',
  'account_warning',
  'captcha_prompt',
  'action_blocked',
  'other',
]);

export type LinkedInRestrictionNoticeType = z.infer<typeof LinkedInRestrictionNoticeTypeEnum>;

export interface LinkedInRestrictionReport {
  noticeType: LinkedInRestrictionNoticeType;
  details?: string;
  reportedAt: string;
}

export interface RestrictionHandlingResult {
  channelAutoPaused: 'linkedin_assist';
  auditReason: string;
  recommendedUserAction: string;
}

export class LinkedInRestrictionManager {
  /**
   * Handles user-reported LinkedIn restriction and triggers mandatory channel auto-pause.
   */
  public handleRestrictionReport(report: LinkedInRestrictionReport): RestrictionHandlingResult {
    let auditReason = `User reported LinkedIn restriction: ${report.noticeType}`;
    if (report.details) {
      auditReason += ` - ${report.details}`;
    }

    let recommendedUserAction = 'Halt all manual LinkedIn connection requests for 7 days.';
    if (report.noticeType === 'invitation_limit_reached') {
      recommendedUserAction = 'LinkedIn weekly invitation limit reached. System paused LinkedIn assist queue until next weekly reset.';
    } else if (report.noticeType === 'account_warning') {
      recommendedUserAction = 'Account security notice from LinkedIn. Do not perform any outreach actions until reviewed.';
    }

    return {
      channelAutoPaused: 'linkedin_assist',
      auditReason,
      recommendedUserAction,
    };
  }
}

