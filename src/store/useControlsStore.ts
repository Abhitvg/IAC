import { create } from 'zustand';

export interface DailyCaps {
  applications: number;
  emails: number;
  assistQueueItems: number;
  calendarEvents: number;
}

export interface ConnectorScope {
  scope: string;
  name: string;
  description: string;
  riskLevel: 'standard' | 'elevated' | 'restricted';
}

export interface ConnectorInfo {
  id: string;
  name: string;
  icon: string;
  accountEmail?: string;
  status: 'connected' | 'degraded' | 'disconnected' | 'revoked';
  lastSyncedAt: string;
  scopes: ConnectorScope[];
}

export interface DsarExportData {
  tenantId: string;
  requesterSubject: string;
  exportedAt: string;
  integrityChecksumSha256: string;
  recordCounts: {
    applications: number;
    contacts: number;
    outreachDrafts: number;
    facts: number;
    auditLogs: number;
  };
}

export interface DeletionReceipt {
  tenantId: string;
  requesterSubject: string;
  deletedAt: string;
  recordsPurged: {
    facts: number;
    contracts: number;
    applications: number;
    personGraphContacts: number;
    outreachHistory: number;
    assistQueueItems: number;
    auditLogs: number;
  };
  cryptoShreddingVerification: {
    tenantKeyId: string;
    keyState: 'purged' | 'zeroized';
    sha256Proof: string;
  };
}

export interface ControlsState {
  // Global & Kill Switch
  globalKillSwitch: boolean;
  shadowMode: boolean;
  killSwitchReason?: string;
  
  // Sprint Contract Parameters
  contractRevision: number;
  contractSignedAt: string;
  dailyCaps: DailyCaps;
  referralHoldDays: number;
  salaryFloor: {
    amount: number;
    currency: string;
  };
  requiresSponsorship: boolean;
  allowedCountries: string[];
  blocklistCompanies: string[];
  tone: 'professional' | 'direct' | 'warm' | 'concise';

  // Channels
  pausedChannels: Array<'ats' | 'email' | 'calendar' | 'linkedin_assist'>;

  // Connectors
  connectors: ConnectorInfo[];

  // DSAR State
  isExportingDsar: boolean;
  isPurgingData: boolean;
  dsarExportPackage: DsarExportData | null;
  deletionReceipt: DeletionReceipt | null;
  saveStatus: 'idle' | 'saving' | 'saved' | 'error';
  errorMessage: string | null;

  // Actions
  toggleKillSwitch: (enabled: boolean, reason?: string) => Promise<void>;
  toggleShadowMode: (enabled: boolean) => void;
  toggleChannel: (channel: 'ats' | 'email' | 'calendar' | 'linkedin_assist') => void;
  updateDailyCaps: (caps: Partial<DailyCaps>) => void;
  updateReferralHoldDays: (days: number) => void;
  updateSalaryFloor: (amount: number, currency?: string) => void;
  setRequiresSponsorship: (requires: boolean) => void;
  addBlocklistCompany: (company: string) => void;
  removeBlocklistCompany: (company: string) => void;
  setTone: (tone: 'professional' | 'direct' | 'warm' | 'concise') => void;
  saveSprintContract: () => Promise<boolean>;
  exportDsarData: () => Promise<DsarExportData>;
  purgeAccountData: (confirmationInput: string) => Promise<DeletionReceipt | null>;
  reconnectConnector: (connectorId: string) => Promise<void>;
  disconnectConnector: (connectorId: string) => Promise<void>;
  resetToDefaults: () => void;
}

const DEFAULT_CONNECTORS: ConnectorInfo[] = [
  {
    id: 'gmail',
    name: 'Gmail Workspace',
    icon: 'mail',
    accountEmail: 'candidate@domain.com',
    status: 'connected',
    lastSyncedAt: new Date(Date.now() - 1000 * 60 * 12).toISOString(),
    scopes: [
      {
        scope: 'https://www.googleapis.com/auth/gmail.send',
        name: 'Send Application Emails',
        description:
          'Transmits confirmed referral follow-ups and verified recruiter notes on your behalf. Bound strictly by your daily cap.',
        riskLevel: 'elevated',
      },
      {
        scope: 'https://www.googleapis.com/auth/gmail.readonly',
        name: 'Read Recruiter Inquiries',
        description:
          'Inspects incoming interview invitations and technical screening requests to populate your Inbox and pipeline.',
        riskLevel: 'standard',
      },
    ],
  },
  {
    id: 'calendar',
    name: 'Google Calendar',
    icon: 'calendar',
    accountEmail: 'candidate@domain.com',
    status: 'connected',
    lastSyncedAt: new Date(Date.now() - 1000 * 60 * 45).toISOString(),
    scopes: [
      {
        scope: 'https://www.googleapis.com/auth/calendar.events',
        name: 'Manage Interview Calendar',
        description:
          'Blocks practice rehearsal windows and imports confirmed interview loops into your IAC timeline.',
        riskLevel: 'standard',
      },
    ],
  },
  {
    id: 'linkedin',
    name: 'LinkedIn Assist Queue',
    icon: 'share-2',
    accountEmail: 'Candidate Profile (Local Tokenless)',
    status: 'connected',
    lastSyncedAt: new Date(Date.now() - 1000 * 60 * 5).toISOString(),
    scopes: [
      {
        scope: 'local://assist-queue',
        name: 'Human-in-the-Loop Assist Queue',
        description:
          'Zero automated scraping or headless browser sessions (Hard Line H1). Outbound connection requests require user clicks.',
        riskLevel: 'standard',
      },
    ],
  },
];

export const useControlsStore = create<ControlsState>((set, get) => ({
  globalKillSwitch: false,
  shadowMode: false,
  killSwitchReason: undefined,

  contractRevision: 3,
  contractSignedAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 6).toISOString(),
  dailyCaps: {
    applications: 20,
    emails: 15,
    assistQueueItems: 10,
    calendarEvents: 5,
  },
  referralHoldDays: 4,
  salaryFloor: {
    amount: 140000,
    currency: 'USD',
  },
  requiresSponsorship: false,
  allowedCountries: ['US', 'CA', 'GB'],
  blocklistCompanies: ['Current Employer Inc.', 'Stealth Rival Corp'],
  tone: 'professional',

  pausedChannels: [],
  connectors: DEFAULT_CONNECTORS,

  isExportingDsar: false,
  isPurgingData: false,
  dsarExportPackage: null,
  deletionReceipt: null,
  saveStatus: 'idle',
  errorMessage: null,

  toggleKillSwitch: async (enabled: boolean, reason?: string) => {
    set({
      globalKillSwitch: enabled,
      killSwitchReason: enabled ? (reason || 'Manual emergency stop triggered by candidate') : undefined,
    });
  },

  toggleShadowMode: (enabled: boolean) => {
    set({ shadowMode: enabled });
  },

  toggleChannel: (channel: 'ats' | 'email' | 'calendar' | 'linkedin_assist') => {
    const { pausedChannels } = get();
    const isPaused = pausedChannels.includes(channel);
    const updated = isPaused
      ? pausedChannels.filter((c) => c !== channel)
      : [...pausedChannels, channel];
    set({ pausedChannels: updated });
  },

  updateDailyCaps: (caps: Partial<DailyCaps>) => {
    set((state) => ({
      dailyCaps: { ...state.dailyCaps, ...caps },
    }));
  },

  updateReferralHoldDays: (days: number) => {
    const clamped = Math.max(1, Math.min(7, Math.round(days)));
    set({ referralHoldDays: clamped });
  },

  updateSalaryFloor: (amount: number, currency: string = 'USD') => {
    set({
      salaryFloor: {
        amount: Math.max(0, amount),
        currency,
      },
    });
  },

  setRequiresSponsorship: (requires: boolean) => {
    set({ requiresSponsorship: requires });
  },

  addBlocklistCompany: (company: string) => {
    const trimmed = company.trim();
    if (!trimmed) return;
    const { blocklistCompanies } = get();
    if (!blocklistCompanies.some((c) => c.toLowerCase() === trimmed.toLowerCase())) {
      set({ blocklistCompanies: [...blocklistCompanies, trimmed] });
    }
  },

  removeBlocklistCompany: (company: string) => {
    set((state) => ({
      blocklistCompanies: state.blocklistCompanies.filter((c) => c !== company),
    }));
  },

  setTone: (tone: 'professional' | 'direct' | 'warm' | 'concise') => {
    set({ tone });
  },

  saveSprintContract: async () => {
    set({ saveStatus: 'saving', errorMessage: null });
    try {
      await new Promise((r) => setTimeout(r, 120)); // Optimistic network simulation
      set((state) => ({
        contractRevision: state.contractRevision + 1,
        contractSignedAt: new Date().toISOString(),
        saveStatus: 'saved',
      }));
      setTimeout(() => set({ saveStatus: 'idle' }), 3000);
      return true;
    } catch (err: any) {
      set({ saveStatus: 'error', errorMessage: err?.message || 'Failed to save sprint contract' });
      return false;
    }
  },

  exportDsarData: async () => {
    set({ isExportingDsar: true, errorMessage: null });
    await new Promise((r) => setTimeout(r, 200));

    const exportBundle: DsarExportData = {
      tenantId: 'tenant-candidate-alpha-001',
      requesterSubject: 'subject-candidate-primary',
      exportedAt: new Date().toISOString(),
      integrityChecksumSha256: '9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08',
      recordCounts: {
        applications: 24,
        contacts: 18,
        outreachDrafts: 14,
        facts: 32,
        auditLogs: 156,
      },
    };

    set({ isExportingDsar: false, dsarExportPackage: exportBundle });
    return exportBundle;
  },

  purgeAccountData: async (confirmationInput: string) => {
    if (confirmationInput.trim().toUpperCase() !== 'DELETE MY ACCOUNT AND DATA') {
      set({ errorMessage: 'Confirmation string did not match required phrase exactly.' });
      return null;
    }

    set({ isPurgingData: true, errorMessage: null });
    await new Promise((r) => setTimeout(r, 250));

    const receipt: DeletionReceipt = {
      tenantId: 'tenant-candidate-alpha-001',
      requesterSubject: 'subject-candidate-primary',
      deletedAt: new Date().toISOString(),
      recordsPurged: {
        facts: 32,
        contracts: 3,
        applications: 24,
        personGraphContacts: 18,
        outreachHistory: 14,
        assistQueueItems: 9,
        auditLogs: 156,
      },
      cryptoShreddingVerification: {
        tenantKeyId: 'arn:aws:kms:us-east-1:candidate-vault-k-001',
        keyState: 'purged',
        sha256Proof: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
      },
    };

    set({
      isPurgingData: false,
      deletionReceipt: receipt,
      globalKillSwitch: true,
      pausedChannels: ['ats', 'email', 'calendar', 'linkedin_assist'],
      connectors: get().connectors.map((c) => ({ ...c, status: 'revoked' })),
    });

    return receipt;
  },

  reconnectConnector: async (connectorId: string) => {
    set((state) => ({
      connectors: state.connectors.map((c) =>
        c.id === connectorId ? { ...c, status: 'connected', lastSyncedAt: new Date().toISOString() } : c
      ),
    }));
  },

  disconnectConnector: async (connectorId: string) => {
    set((state) => ({
      connectors: state.connectors.map((c) =>
        c.id === connectorId ? { ...c, status: 'disconnected' } : c
      ),
    }));
  },

  resetToDefaults: () => {
    set({
      globalKillSwitch: false,
      shadowMode: false,
      dailyCaps: { applications: 20, emails: 15, assistQueueItems: 10, calendarEvents: 5 },
      referralHoldDays: 4,
      pausedChannels: [],
      salaryFloor: { amount: 140000, currency: 'USD' },
      tone: 'professional',
      dsarExportPackage: null,
      deletionReceipt: null,
      saveStatus: 'idle',
      errorMessage: null,
    });
  },
}));
