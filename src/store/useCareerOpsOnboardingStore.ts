import { create } from 'zustand';

export interface OnboardingPreferences {
  name: string;
  email: string;
  targetRoles: string[];
  seniority: 'senior' | 'staff' | 'principal' | 'lead';
  locations: string[];
  remotePreference: 'remote' | 'hybrid' | 'onsite' | 'any';
  salaryFloor: number;
  currency: string;
  requiresSponsorship: boolean;
}

export interface RankedJobPreview {
  id: string;
  company: string;
  role: string;
  salary: string;
  location: string;
  matchScore: number;
  matchReasons: string[];
}

export interface ProfileAuditSummary {
  score: number;
  headlineQuality: 'strong' | 'good' | 'needs_work';
  detectedSkills: string[];
  keyStrengths: string[];
  actionableGaps: string[];
}

export interface CareerOpsOnboardingState {
  currentStep: 1 | 2 | 3 | 4;
  startTime: number;
  timeToFirstValueMs: number | null;
  isOpen: boolean;
  preferences: OnboardingPreferences;
  profileAudit: ProfileAuditSummary;
  rankedJobs: RankedJobPreview[];
  gmailConnected: boolean;
  isSubmitting: boolean;

  // Actions
  openOnboarding: () => void;
  closeOnboarding: () => void;
  setStep: (step: 1 | 2 | 3 | 4) => void;
  updatePreferences: (updates: Partial<OnboardingPreferences>) => void;
  addTargetRole: (role: string) => void;
  removeTargetRole: (role: string) => void;
  connectGmail: () => Promise<boolean>;
  skipGmailConnection: () => void;
  finishOnboarding: () => { timeToFirstValueMs: number | null; preferences: OnboardingPreferences };
  resetOnboarding: () => void;
}

const DEFAULT_PREFERENCES: OnboardingPreferences = {
  name: 'Candidate Alex',
  email: 'alex.mercer@engineer.dev',
  targetRoles: ['Senior Full-Stack Engineer', 'Staff AI Systems Engineer'],
  seniority: 'senior',
  locations: ['San Francisco, CA', 'Remote - US'],
  remotePreference: 'remote',
  salaryFloor: 150000,
  currency: 'USD',
  requiresSponsorship: false,
};

const DEFAULT_PROFILE_AUDIT: ProfileAuditSummary = {
  score: 89,
  headlineQuality: 'strong',
  detectedSkills: ['TypeScript', 'React', 'Node.js', 'Distributed Systems', 'PostgreSQL', 'LLM Agents'],
  keyStrengths: [
    'Strong full-stack systems engineering depth',
    'Demonstrated experience with production high-concurrency architectures',
    'Clear architectural problem-solving evidence',
  ],
  actionableGaps: [
    'Add 1 quantified outcome metric (e.g. % latency reduction) to your most recent experience headline.',
  ],
};

const DEFAULT_RANKED_JOBS: RankedJobPreview[] = [
  {
    id: 'onboard-job-1',
    company: 'Anthropic',
    role: 'Senior Systems Engineer (Frontier Infrastructure)',
    salary: '$240,000 - $320,000',
    location: 'San Francisco, CA / Hybrid',
    matchScore: 96,
    matchReasons: ['9/10 core tech stack overlap', 'Compensation exceeds floor by $90k', 'Hiring manager outreach reachable'],
  },
  {
    id: 'onboard-job-2',
    company: 'Datadog',
    role: 'Staff Distributed Systems Engineer',
    salary: '$220,000 - $280,000',
    location: 'Remote, US',
    matchScore: 92,
    matchReasons: ['Verified remote policy', 'Strong alignment on high-throughput backend services', 'Internal alumni in 2nd-degree network'],
  },
  {
    id: 'onboard-job-3',
    company: 'Alignerr',
    role: 'Senior AI Evaluation Specialist',
    salary: '$180,000 - $230,000',
    location: 'Remote - Global',
    matchScore: 88,
    matchReasons: ['Frontier LLM evaluations match your recent projects', '100% Truthfulness score on verified skills'],
  },
];

export const useCareerOpsOnboardingStore = create<CareerOpsOnboardingState>((set, get) => ({
  currentStep: 1,
  startTime: Date.now(),
  timeToFirstValueMs: null,
  isOpen: false,
  preferences: DEFAULT_PREFERENCES,
  profileAudit: DEFAULT_PROFILE_AUDIT,
  rankedJobs: DEFAULT_RANKED_JOBS,
  gmailConnected: false,
  isSubmitting: false,

  openOnboarding: () => {
    set({
      isOpen: true,
      currentStep: 1,
      startTime: Date.now(),
      timeToFirstValueMs: null,
      gmailConnected: false,
    });
  },

  closeOnboarding: () => {
    set({ isOpen: false });
  },

  setStep: (step: 1 | 2 | 3 | 4) => {
    // If transitioning to Step 3 (First Value: audit + ranked jobs), record time-to-first-value
    if (step === 3 && get().timeToFirstValueMs === null) {
      const elapsed = Date.now() - get().startTime;
      set({ timeToFirstValueMs: elapsed });
    }
    set({ currentStep: step });
  },

  updatePreferences: (updates: Partial<OnboardingPreferences>) => {
    set((state) => ({
      preferences: { ...state.preferences, ...updates },
    }));
  },

  addTargetRole: (role: string) => {
    const trimmed = role.trim();
    if (!trimmed) return;
    const { targetRoles } = get().preferences;
    if (!targetRoles.includes(trimmed)) {
      set((state) => ({
        preferences: {
          ...state.preferences,
          targetRoles: [...state.preferences.targetRoles, trimmed],
        },
      }));
    }
  },

  removeTargetRole: (role: string) => {
    set((state) => ({
      preferences: {
        ...state.preferences,
        targetRoles: state.preferences.targetRoles.filter((r) => r !== role),
      },
    }));
  },

  connectGmail: async () => {
    set({ isSubmitting: true });
    // Simulate oauth consent grant
    await new Promise((r) => setTimeout(r, 300));
    set({ gmailConnected: true, isSubmitting: false });
    return true;
  },

  skipGmailConnection: () => {
    set({ gmailConnected: false });
  },

  finishOnboarding: () => {
    const { preferences, timeToFirstValueMs } = get();
    set({ isOpen: false });
    return { timeToFirstValueMs, preferences };
  },

  resetOnboarding: () => {
    set({
      currentStep: 1,
      startTime: Date.now(),
      timeToFirstValueMs: null,
      isOpen: false,
      preferences: DEFAULT_PREFERENCES,
      gmailConnected: false,
      isSubmitting: false,
    });
  },
}));
