import { create } from 'zustand';

export interface CandidateVaultProfile {
  firstName: string;
  lastName: string;
  fullName: string;
  email: string;
  phone: string;
  location: string;
  city: string;
  state: string;
  country: string;
  linkedin: string;
  github: string;
  portfolio: string;
  currentCompany: string;
  currentTitle: string;
  yearsOfExperience: string;
  authorizedToWork: boolean;
  requiresSponsorship: boolean;
  salaryExpectation: string;
  earliestStartDate: string;
  noticePeriod: string;
  coreTechStack: string;
  briefPitch: string;
}

const STORAGE_KEY = 'career_ops_candidate_vault_v1';

export const INITIAL_CANDIDATE_VAULT: CandidateVaultProfile = {
  firstName: 'Abhishek',
  lastName: 'Singh',
  fullName: 'Abhishek Singh',
  email: 'abhishek@example.com',
  phone: '+1-123-456-7890',
  location: 'San Francisco, CA, USA',
  city: 'San Francisco',
  state: 'CA',
  country: 'United States',
  linkedin: 'https://linkedin.com/in/abhisheksingh',
  github: 'https://github.com/Abhitvg',
  portfolio: 'https://github.com/Abhitvg',
  currentCompany: 'Independent Systems Engineer',
  currentTitle: 'Senior Software Engineer',
  yearsOfExperience: '6+',
  authorizedToWork: true,
  requiresSponsorship: false,
  salaryExpectation: '$160,000 - $195,000 / yr',
  earliestStartDate: '2 weeks',
  noticePeriod: '2 weeks notice',
  coreTechStack: 'Java, TypeScript, Python, Kafka, Docker, Kubernetes, AWS',
  briefPitch: 'Experienced systems engineer specialized in event-driven microservices, sub-50ms latency optimization, and distributed architectures.',
};

function loadVaultFromStorage(): CandidateVaultProfile {
  if (typeof window !== 'undefined' && typeof localStorage !== 'undefined') {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        return { ...INITIAL_CANDIDATE_VAULT, ...JSON.parse(raw) };
      }
    } catch (e) {
      console.warn('[CandidateVault] Failed to load from localStorage:', e);
    }
  }
  return INITIAL_CANDIDATE_VAULT;
}

interface CandidateVaultState {
  profile: CandidateVaultProfile;
  updateProfile: (updates: Partial<CandidateVaultProfile>) => void;
  resetToDefaults: () => void;
  exportVaultJson: () => string;
  importVaultJson: (jsonStr: string) => boolean;
}

export const useCandidateVaultStore = create<CandidateVaultState>((set, get) => ({
  profile: loadVaultFromStorage(),

  updateProfile: (updates) => {
    const updated = { ...get().profile, ...updates };
    if (updates.firstName || updates.lastName) {
      updated.fullName = `${updated.firstName || ''} ${updated.lastName || ''}`.trim();
    }
    set({ profile: updated });
    if (typeof window !== 'undefined' && typeof localStorage !== 'undefined') {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
      } catch (e) {
        console.error('[CandidateVault] Save failed:', e);
      }
    }
  },

  resetToDefaults: () => {
    set({ profile: INITIAL_CANDIDATE_VAULT });
    if (typeof window !== 'undefined' && typeof localStorage !== 'undefined') {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(INITIAL_CANDIDATE_VAULT));
    }
  },

  exportVaultJson: () => {
    return JSON.stringify(get().profile, null, 2);
  },

  importVaultJson: (jsonStr) => {
    try {
      const parsed = JSON.parse(jsonStr);
      if (typeof parsed === 'object' && parsed !== null) {
        get().updateProfile(parsed);
        return true;
      }
    } catch {
      return false;
    }
    return false;
  },
}));
