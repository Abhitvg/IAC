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
  authorizedToWorkVerified: boolean;
  requiresSponsorshipVerified: boolean;
  salaryExpectation: string;
  earliestStartDate: string;
  noticePeriod: string;
  coreTechStack: string;
  briefPitch: string;
  isUserSupplied?: boolean;
}

const STORAGE_KEY = 'career_ops_candidate_vault_v2';
const LEGACY_STORAGE_KEY = 'career_ops_candidate_vault_v1';

/**
 * Clean, un-fabricated initial state with explicitly unknown or empty values.
 * Zero fabricated personal experience, metrics, titles, or compensation.
 */
export const INITIAL_CANDIDATE_VAULT: CandidateVaultProfile = {
  firstName: '',
  lastName: '',
  fullName: '',
  email: '',
  phone: '',
  location: '',
  city: '',
  state: '',
  country: '',
  linkedin: '',
  github: '',
  portfolio: '',
  currentCompany: '',
  currentTitle: '',
  yearsOfExperience: '',
  authorizedToWork: false,
  requiresSponsorship: false,
  authorizedToWorkVerified: false,
  requiresSponsorshipVerified: false,
  salaryExpectation: '',
  earliestStartDate: '',
  noticePeriod: '',
  coreTechStack: '',
  briefPitch: '', // not generated until sufficient verified source information exists
  isUserSupplied: false,
};

/**
 * Checks if a legacy stored profile matches the known fabricated demo defaults.
 */
function isKnownFabricatedDemoProfile(profile: any): boolean {
  if (!profile || typeof profile !== 'object') return false;
  return (
    profile.email === 'abhishek@example.com' ||
    profile.phone === '+1-123-456-7890' ||
    profile.salaryExpectation === '$160,000 - $195,000 / yr' ||
    profile.currentCompany === 'Independent Systems Engineer'
  );
}

function clearUnknownPlaceholder(value: unknown): string {
  if (typeof value !== 'string') return '';
  const normalized = value.trim().toLowerCase();
  return ['unknown', 'not specified', 'n/a', 'none', 'null'].includes(normalized) ? '' : value;
}

function normalizeVaultProfile(profile: Partial<CandidateVaultProfile>): CandidateVaultProfile {
  return {
    ...INITIAL_CANDIDATE_VAULT,
    ...profile,
    location: clearUnknownPlaceholder(profile.location),
    city: clearUnknownPlaceholder(profile.city),
    state: clearUnknownPlaceholder(profile.state),
    country: clearUnknownPlaceholder(profile.country),
    currentCompany: clearUnknownPlaceholder(profile.currentCompany),
    currentTitle: clearUnknownPlaceholder(profile.currentTitle),
    yearsOfExperience: clearUnknownPlaceholder(profile.yearsOfExperience),
    salaryExpectation: clearUnknownPlaceholder(profile.salaryExpectation),
    authorizedToWorkVerified: profile.authorizedToWorkVerified === true,
    requiresSponsorshipVerified: profile.requiresSponsorshipVerified === true,
  };
}

function loadVaultFromStorage(): CandidateVaultProfile {
  if (typeof window !== 'undefined' && typeof localStorage !== 'undefined') {
    try {
      // 1. Try v2 storage first
      const rawV2 = localStorage.getItem(STORAGE_KEY);
      if (rawV2) {
        const parsed = JSON.parse(rawV2);
        if (!isKnownFabricatedDemoProfile(parsed)) {
          return normalizeVaultProfile(parsed);
        }
      }

      // 2. Try legacy v1 storage with safe migration
      const rawV1 = localStorage.getItem(LEGACY_STORAGE_KEY);
      if (rawV1) {
        const legacyParsed = JSON.parse(rawV1);
        if (isKnownFabricatedDemoProfile(legacyParsed)) {
          console.info(
            '[CandidateVault] Sanitized legacy fabricated demonstration data from storage.'
          );
          // Remove legacy fake record and return initial clean state
          localStorage.removeItem(LEGACY_STORAGE_KEY);
          return INITIAL_CANDIDATE_VAULT;
        } else {
          // Genuine user-supplied data from v1: migrate to v2
          const migrated = normalizeVaultProfile({ ...legacyParsed, isUserSupplied: true });
          localStorage.setItem(STORAGE_KEY, JSON.stringify(migrated));
          localStorage.removeItem(LEGACY_STORAGE_KEY);
          return migrated;
        }
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
  resetToDefaults: () => boolean;
  exportVaultJson: () => string;
  importVaultJson: (jsonStr: string) => boolean;
}

export const useCandidateVaultStore = create<CandidateVaultState>((set, get) => ({
  profile: loadVaultFromStorage(),

  updateProfile: (updates) => {
    const updated = { ...get().profile, ...updates, isUserSupplied: true };
    if (updates.firstName !== undefined || updates.lastName !== undefined) {
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
    if (typeof window !== 'undefined' && typeof localStorage !== 'undefined') {
      try {
        // Remove the legacy copy first, then the current copy. Do not change the
        // in-memory profile unless both persisted copies have been removed.
        localStorage.removeItem(LEGACY_STORAGE_KEY);
        localStorage.removeItem(STORAGE_KEY);
      } catch (e) {
        console.error('[CandidateVault] Reset failed:', e);
        return false;
      }
    }

    set({ profile: INITIAL_CANDIDATE_VAULT });
    return true;
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
