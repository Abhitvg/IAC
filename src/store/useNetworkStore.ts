import { create } from 'zustand';
import { NetworkContact, RelationshipStage } from '../services/careerOps/types';
import { ParsedLinkedInContact } from '../services/careerOps/linkedInCsvParser';

const STORAGE_KEY = 'career_ops_network_contacts_v1';

export const INITIAL_DEMO_CONTACTS: NetworkContact[] = [
  {
    id: 'contact-demo-1',
    name: 'Sarah Chen',
    title: 'VP of Engineering',
    company: 'Alignerr',
    linkedinUrl: 'https://linkedin.com/in/sarah-chen-alignerr',
    email: 'sarah.chen@example.com',
    stage: 'outreach_queued',
    isSuppressed: false,
    outreachDraft:
      'Hi Sarah, saw your post on automated test frameworks for AI coding benchmarks. I built AST regression suites with 98% coverage and would love to connect!',
    notes: 'Hiring leader for AI Assisted Coding team. Strong overlap on AST validation.',
    connectedOn: '2026-03-15',
    createdAt: Date.now() - 86400000 * 3,
    updatedAt: Date.now() - 3600000 * 4,
  },
  {
    id: 'contact-demo-2',
    name: 'Marcus Brody',
    title: 'Staff Distributed Systems Engineer',
    company: 'Datadog',
    linkedinUrl: 'https://linkedin.com/in/marcus-brody-datadog',
    email: 'mbrody@example.com',
    stage: 'replied',
    isSuppressed: false,
    lastContactedAt: Date.now() - 86400000 * 1,
    outreachDraft:
      'Hi Marcus, loved your tech talk on low-latency Kafka consumer rebalancing. Working on similar high-throughput ingestion pipelines. Would value exchanging notes!',
    notes: 'Replied: Open to a 15-min referral chat this Thursday afternoon.',
    connectedOn: '2026-02-10',
    createdAt: Date.now() - 86400000 * 7,
    updatedAt: Date.now() - 86400000 * 1,
  },
  {
    id: 'contact-demo-3',
    name: 'Elena Rostova',
    title: 'Technical Recruiter',
    company: 'Stripe',
    linkedinUrl: 'https://linkedin.com/in/elena-rostova-stripe',
    stage: 'referral_offered',
    isSuppressed: false,
    lastContactedAt: Date.now() - 86400000 * 2,
    outreachDraft:
      'Hi Elena, I applied for the Staff Infrastructure role. A current principal architect mentioned reaching out to align on multi-region clusters.',
    notes: 'Internal referral link generated and submitted to Stripe Workday portal.',
    connectedOn: '2026-01-20',
    createdAt: Date.now() - 86400000 * 14,
    updatedAt: Date.now() - 86400000 * 2,
  },
  {
    id: 'contact-demo-4',
    name: 'David Vance',
    title: 'Engineering Director',
    company: 'Previous Employer Corp',
    linkedinUrl: 'https://linkedin.com/in/david-vance',
    stage: 'discovered',
    isSuppressed: true,
    suppressionReason: 'Current employer / Conflict of interest policy',
    notes: 'Suppressed from automated outreach by candidate Do-Not-Contact rule.',
    connectedOn: '2024-05-12',
    createdAt: Date.now() - 86400000 * 30,
    updatedAt: Date.now() - 86400000 * 10,
  },
];

function loadSavedContacts(): NetworkContact[] {
  if (typeof window !== 'undefined' && typeof localStorage !== 'undefined') {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) return parsed;
      }
    } catch (e) {
      console.warn('[NetworkStore] Failed to load contacts from localStorage:', e);
    }
  }
  return INITIAL_DEMO_CONTACTS;
}

function persistContacts(contacts: NetworkContact[]) {
  if (typeof window !== 'undefined' && typeof localStorage !== 'undefined') {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(contacts));
    } catch (e) {
      console.warn('[NetworkStore] Failed to persist contacts:', e);
    }
  }
}

interface NetworkState {
  contacts: NetworkContact[];
  selectedContactId: string | null;
  searchQuery: string;
  stageFilter: RelationshipStage | 'all';
  suppressionFilter: 'all' | 'active_only' | 'suppressed_only';
  companyFilter: string | 'all';
  isImportModalOpen: boolean;
  isAssistQueueModalOpen: boolean;

  // Actions
  setSearchQuery: (query: string) => void;
  setStageFilter: (stage: RelationshipStage | 'all') => void;
  setSuppressionFilter: (filter: 'all' | 'active_only' | 'suppressed_only') => void;
  setCompanyFilter: (company: string | 'all') => void;
  setSelectedContactId: (id: string | null) => void;
  setIsImportModalOpen: (open: boolean) => void;
  setIsAssistQueueModalOpen: (open: boolean) => void;

  addContact: (data: Omit<NetworkContact, 'id' | 'createdAt' | 'updatedAt'>) => string;
  updateContact: (id: string, updates: Partial<NetworkContact>) => void;
  deleteContact: (id: string) => void;
  toggleSuppression: (id: string, reason?: string) => void;
  advanceStage: (id: string, stage: RelationshipStage) => void;
  importFromLinkedInCsv: (
    parsed: ParsedLinkedInContact[],
    defaultStage?: RelationshipStage,
    jobId?: string
  ) => { imported: number; duplicates: number };
  markAssistSent: (contactId: string) => void;
  resetToDemo: () => void;
  clearAll: () => void;
}

export const useNetworkStore = create<NetworkState>((set, get) => ({
  contacts: loadSavedContacts(),
  selectedContactId: null,
  searchQuery: '',
  stageFilter: 'all',
  suppressionFilter: 'all',
  companyFilter: 'all',
  isImportModalOpen: false,
  isAssistQueueModalOpen: false,

  setSearchQuery: (query) => set({ searchQuery: query }),
  setStageFilter: (stage) => set({ stageFilter: stage }),
  setSuppressionFilter: (suppressionFilter) => set({ suppressionFilter }),
  setCompanyFilter: (companyFilter) => set({ companyFilter }),
  setSelectedContactId: (id) => set({ selectedContactId: id }),
  setIsImportModalOpen: (open) => set({ isImportModalOpen: open }),
  setIsAssistQueueModalOpen: (open) => set({ isAssistQueueModalOpen: open }),

  addContact: (data) => {
    const id = `contact-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const now = Date.now();
    const newContact: NetworkContact = {
      ...data,
      id,
      createdAt: now,
      updatedAt: now,
    };
    const updated = [newContact, ...get().contacts];
    persistContacts(updated);
    set({ contacts: updated, selectedContactId: id });
    return id;
  },

  updateContact: (id, updates) => {
    const updated = get().contacts.map((c) =>
      c.id === id ? { ...c, ...updates, updatedAt: Date.now() } : c
    );
    persistContacts(updated);
    set({ contacts: updated });
  },

  deleteContact: (id) => {
    const updated = get().contacts.filter((c) => c.id !== id);
    persistContacts(updated);
    set({
      contacts: updated,
      selectedContactId: get().selectedContactId === id ? null : get().selectedContactId,
    });
  },

  toggleSuppression: (id, reason) => {
    const updated = get().contacts.map((c) => {
      if (c.id === id) {
        const nextSuppressed = !c.isSuppressed;
        return {
          ...c,
          isSuppressed: nextSuppressed,
          suppressionReason: nextSuppressed
            ? reason || 'Candidate flagged as Do-Not-Contact'
            : undefined,
          updatedAt: Date.now(),
        };
      }
      return c;
    });
    persistContacts(updated);
    set({ contacts: updated });
  },

  advanceStage: (id, stage) => {
    const updated = get().contacts.map((c) => {
      if (c.id === id) {
        return {
          ...c,
          stage,
          lastContactedAt: stage === 'sent' ? Date.now() : c.lastContactedAt,
          updatedAt: Date.now(),
        };
      }
      return c;
    });
    persistContacts(updated);
    set({ contacts: updated });
  },

  importFromLinkedInCsv: (parsed, defaultStage = 'discovered', jobId) => {
    const current = get().contacts;
    const existingUrls = new Set(
      current.map((c) => (c.linkedinUrl || '').trim().toLowerCase()).filter(Boolean)
    );
    const existingKeys = new Set(
      current.map((c) => `${c.name.trim().toLowerCase()}::${c.company.trim().toLowerCase()}`)
    );

    let importedCount = 0;
    let duplicateCount = 0;
    const newItems: NetworkContact[] = [];
    const now = Date.now();

    for (const item of parsed) {
      const cleanUrl = (item.linkedinUrl || '').trim().toLowerCase();
      const nameCompKey = `${item.fullName.trim().toLowerCase()}::${item.company.trim().toLowerCase()}`;

      if ((cleanUrl && existingUrls.has(cleanUrl)) || existingKeys.has(nameCompKey)) {
        duplicateCount++;
        continue;
      }

      if (cleanUrl) existingUrls.add(cleanUrl);
      existingKeys.add(nameCompKey);

      newItems.push({
        id: `contact-li-${now}-${Math.random().toString(36).slice(2, 7)}`,
        name: item.fullName,
        title: item.position || 'Professional',
        company: item.company || 'Unknown',
        linkedinUrl: item.linkedinUrl,
        email: item.email,
        stage: defaultStage,
        isSuppressed: false,
        jobId,
        connectedOn: item.connectedOn,
        notes: item.connectedOn ? `Connected on LinkedIn: ${item.connectedOn}` : undefined,
        createdAt: now,
        updatedAt: now,
      });
      importedCount++;
    }

    if (newItems.length > 0) {
      const allContacts = [...newItems, ...current];
      persistContacts(allContacts);
      set({ contacts: allContacts });
    }

    return { imported: importedCount, duplicates: duplicateCount };
  },

  markAssistSent: (contactId) => {
    const now = Date.now();
    const updated = get().contacts.map((c) =>
      c.id === contactId
        ? {
            ...c,
            stage: 'sent' as RelationshipStage,
            lastContactedAt: now,
            updatedAt: now,
          }
        : c
    );
    persistContacts(updated);
    set({ contacts: updated });
  },

  resetToDemo: () => {
    persistContacts(INITIAL_DEMO_CONTACTS);
    set({ contacts: INITIAL_DEMO_CONTACTS, selectedContactId: null });
  },

  clearAll: () => {
    persistContacts([]);
    set({ contacts: [], selectedContactId: null });
  },
}));
