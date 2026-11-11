import { verifyConsentRecord, type ConsentRecord } from './contract';

export type AutomationChannel = 'ats' | 'email' | 'calendar' | 'linkedin_assist';

export interface TenantControlState {
  tenantId: string;
  globalKillSwitch: boolean;
  pausedChannels: AutomationChannel[];
  updatedAt: string;
}

export interface ActionAuthorization {
  tenantId: string;
  subject: string;
  channel: AutomationChannel;
  action: string;
  now?: Date;
  dailyUsage: number;
}

export function assertActionAllowed(
  consent: ConsentRecord | null,
  controls: TenantControlState,
  request: ActionAuthorization,
  consentSigningSecret: string
): void {
  if (controls.tenantId !== request.tenantId) throw new Error('Tenant control context mismatch');
  if (controls.globalKillSwitch) throw new Error('Automation is globally paused');
  if (controls.pausedChannels.includes(request.channel))
    throw new Error('Automation channel is paused');
  if (!consent || !verifyConsentRecord(consent, consentSigningSecret))
    throw new Error('A valid, unrevoked Sprint Contract is required');
  if (consent.tenantId !== request.tenantId || consent.subject !== request.subject)
    throw new Error('Sprint Contract consent identity mismatch');
  const contract = consent.contract;

  const now = request.now ?? new Date();
  if (now < new Date(contract.startsAt) || now >= new Date(contract.endsAt)) {
    throw new Error('Sprint Contract is not active');
  }
  if (!contract.enabledChannels.includes(request.channel)) {
    throw new Error('Channel is not enabled in the Sprint Contract');
  }

  const cap =
    request.channel === 'ats'
      ? contract.dailyCaps.applications
      : request.channel === 'email'
        ? contract.dailyCaps.emails
        : request.channel === 'linkedin_assist'
          ? contract.dailyCaps.assistQueueItems
          : contract.dailyCaps.calendarEvents;

  if (!Number.isSafeInteger(request.dailyUsage) || request.dailyUsage < 0) {
    throw new Error('Daily usage counter is invalid');
  }
  if (request.dailyUsage >= cap) throw new Error('Daily action cap reached');
  if (!request.action.trim() || request.action.length > 80)
    throw new Error('Invalid action identifier');

  // LinkedIn is never an automated execution channel. The cloud service may only
  // prepare a queue item; the browser extension must execute nothing without a
  // direct user gesture in the user's own browser.
  if (request.channel === 'linkedin_assist' && request.action !== 'assist_queue.prepare') {
    throw new Error('LinkedIn actions may only be prepared for the user Assist Queue');
  }
}
