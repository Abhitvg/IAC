import type { SprintContract } from './contract';

export type AutomationChannel = 'ats' | 'email' | 'calendar' | 'linkedin_assist';

export interface TenantControlState {
  tenantId: string;
  globalKillSwitch: boolean;
  pausedChannels: AutomationChannel[];
  updatedAt: string;
}

export interface ActionAuthorization {
  tenantId: string;
  channel: AutomationChannel;
  action: string;
  now?: Date;
  dailyUsage: number;
}

export function assertActionAllowed(
  contract: SprintContract | null,
  controls: TenantControlState,
  request: ActionAuthorization
): void {
  if (controls.tenantId !== request.tenantId) throw new Error('Tenant control context mismatch');
  if (controls.globalKillSwitch) throw new Error('Automation is globally paused');
  if (controls.pausedChannels.includes(request.channel)) throw new Error('Automation channel is paused');
  if (!contract) throw new Error('An active Sprint Contract is required');

  const now = request.now ?? new Date();
  if (now < new Date(contract.startsAt) || now >= new Date(contract.endsAt)) {
    throw new Error('Sprint Contract is not active');
  }
  if (!contract.enabledChannels.includes(request.channel)) {
    throw new Error('Channel is not enabled in the Sprint Contract');
  }

  const cap = request.channel === 'ats'
    ? contract.dailyCaps.applications
    : request.channel === 'email'
      ? contract.dailyCaps.emails
      : request.channel === 'linkedin_assist'
        ? contract.dailyCaps.assistQueueItems
        : Number.MAX_SAFE_INTEGER;

  if (request.dailyUsage >= cap) throw new Error('Daily action cap reached');
  if (!request.action.trim() || request.action.length > 80) throw new Error('Invalid action identifier');
}
