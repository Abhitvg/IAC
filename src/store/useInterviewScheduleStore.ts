import { create } from 'zustand';

export type InterviewRoundType =
  | 'phone_screen'
  | 'technical_coding'
  | 'system_design'
  | 'behavioral'
  | 'onsite_loop';

export interface InterviewDebrief {
  completedAt: number;
  rating: number; // 1 to 5
  questionsAsked: string[];
  whatWentWell: string;
  areasToImprove: string;
  followUpNoteDraft?: string;
}

export interface ScheduledInterview {
  id: string;
  jobId: string;
  company: string;
  role: string;
  roundName: string;
  roundType: InterviewRoundType;
  scheduledAt: number; // timestamp ms
  durationMinutes: number;
  interviewerName?: string;
  interviewerRole?: string;
  meetingLink?: string;
  status: 'upcoming' | 'completed' | 'cancelled';
  notes?: string;
  debrief?: InterviewDebrief;
  createdAt: number;
  updatedAt: number;
}

const STORAGE_KEY = 'career_ops_interview_schedule_v1';

export const INITIAL_DEMO_INTERVIEWS: ScheduledInterview[] = [
  {
    id: 'interview-demo-1',
    jobId: 'demo-sample-1',
    company: 'Alignerr',
    role: 'Senior Software Developer (AI Assisted Coding)',
    roundName: 'Technical Deep Dive & AST Evaluation',
    roundType: 'technical_coding',
    scheduledAt: Date.now() + 1000 * 60 * 60 * 24 * 2, // 2 days from now
    durationMinutes: 45,
    interviewerName: 'Dr. Kevin Zhao',
    interviewerRole: 'Lead Evaluation Engineer',
    meetingLink: 'https://meet.google.com/abc-defg-hij',
    status: 'upcoming',
    notes: 'Focus on AST parsing, Python/TypeScript test harness architectures, and benchmark calibration.',
    createdAt: Date.now() - 1000 * 60 * 60 * 24,
    updatedAt: Date.now() - 1000 * 60 * 60 * 24,
  },
  {
    id: 'interview-demo-2',
    jobId: 'demo-sample-2',
    company: 'Datadog',
    role: 'Staff Distributed Systems Engineer',
    roundName: 'Distributed Storage & Kafka Ingestion',
    roundType: 'system_design',
    scheduledAt: Date.now() + 1000 * 60 * 60 * 24 * 5, // 5 days from now
    durationMinutes: 60,
    interviewerName: 'Sarah Jenkins',
    interviewerRole: 'Staff Infrastructure Architect',
    meetingLink: 'https://zoom.us/j/987654321',
    status: 'upcoming',
    notes: 'High-throughput telemetry ingestion, partition rebalancing, and low-latency buffer queues.',
    createdAt: Date.now() - 1000 * 60 * 60 * 48,
    updatedAt: Date.now() - 1000 * 60 * 60 * 48,
  },
  {
    id: 'interview-demo-3',
    jobId: 'demo-sample-3',
    company: 'Stripe',
    role: 'Staff Infrastructure Engineer',
    roundName: 'Recruiter Alignment & Scope Review',
    roundType: 'phone_screen',
    scheduledAt: Date.now() - 1000 * 60 * 60 * 24 * 3, // 3 days ago (completed)
    durationMinutes: 30,
    interviewerName: 'Elena Rostova',
    interviewerRole: 'Senior Technical Recruiter',
    meetingLink: 'https://stripe.zoom.us/j/123456789',
    status: 'completed',
    notes: 'Covered compensation expectations, team topology in Seattle, and multi-region Kubernetes initiatives.',
    debrief: {
      completedAt: Date.now() - 1000 * 60 * 60 * 24 * 3,
      rating: 5,
      questionsAsked: [
        'Walk through your experience scaling distributed consensus clusters.',
        'What are your compensation expectations and preferred work style?',
        'Why Stripe Infrastructure now?',
      ],
      whatWentWell: 'Clear alignment on compensation and strong delivery of past multi-region consensus migration.',
      areasToImprove: 'Review Stripe-specific engineering blog posts regarding their Sorbet and Envoy mesh layers.',
      followUpNoteDraft:
        'Hi Elena, thank you for taking the time to speak today! I really enjoyed hearing about Stripe\'s distributed infrastructure scaling goals. Looking forward to the technical loops.',
    },
    createdAt: Date.now() - 1000 * 60 * 60 * 24 * 7,
    updatedAt: Date.now() - 1000 * 60 * 60 * 24 * 3,
  },
];

function loadSavedInterviews(): ScheduledInterview[] {
  if (typeof window !== 'undefined' && typeof localStorage !== 'undefined') {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch (e) {
      console.warn('[InterviewStore] Failed to read localStorage:', e);
    }
  }
  return INITIAL_DEMO_INTERVIEWS;
}

function persistInterviews(interviews: ScheduledInterview[]) {
  if (typeof window !== 'undefined' && typeof localStorage !== 'undefined') {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(interviews));
    } catch (e) {
      console.warn('[InterviewStore] Failed to persist interviews:', e);
    }
  }
}

interface InterviewScheduleState {
  interviews: ScheduledInterview[];
  selectedInterviewId: string | null;
  statusFilter: 'all' | 'upcoming' | 'completed';
  searchQuery: string;

  setSelectedInterviewId: (id: string | null) => void;
  setStatusFilter: (filter: 'all' | 'upcoming' | 'completed') => void;
  setSearchQuery: (query: string) => void;

  addInterview: (data: Omit<ScheduledInterview, 'id' | 'createdAt' | 'updatedAt'>) => string;
  updateInterview: (id: string, updates: Partial<ScheduledInterview>) => void;
  deleteInterview: (id: string) => void;
  saveDebrief: (id: string, debrief: InterviewDebrief) => void;
  resetToDemo: () => void;
  clearAll: () => void;
}

export const useInterviewScheduleStore = create<InterviewScheduleState>((set, get) => ({
  interviews: loadSavedInterviews(),
  selectedInterviewId: 'interview-demo-1',
  statusFilter: 'all',
  searchQuery: '',

  setSelectedInterviewId: (id) => set({ selectedInterviewId: id }),
  setStatusFilter: (filter) => set({ statusFilter: filter }),
  setSearchQuery: (query) => set({ searchQuery: query }),

  addInterview: (data) => {
    const id = `interview-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const now = Date.now();
    const newInterview: ScheduledInterview = {
      ...data,
      id,
      createdAt: now,
      updatedAt: now,
    };
    const updated = [newInterview, ...get().interviews];
    persistInterviews(updated);
    set({ interviews: updated, selectedInterviewId: id });
    return id;
  },

  updateInterview: (id, updates) => {
    const updated = get().interviews.map((item) =>
      item.id === id ? { ...item, ...updates, updatedAt: Date.now() } : item
    );
    persistInterviews(updated);
    set({ interviews: updated });
  },

  deleteInterview: (id) => {
    const updated = get().interviews.filter((item) => item.id !== id);
    persistInterviews(updated);
    set({
      interviews: updated,
      selectedInterviewId: get().selectedInterviewId === id ? null : get().selectedInterviewId,
    });
  },

  saveDebrief: (id, debrief) => {
    const updated = get().interviews.map((item) => {
      if (item.id === id) {
        return {
          ...item,
          status: 'completed' as const,
          debrief,
          updatedAt: Date.now(),
        };
      }
      return item;
    });
    persistInterviews(updated);
    set({ interviews: updated });
  },

  resetToDemo: () => {
    persistInterviews(INITIAL_DEMO_INTERVIEWS);
    set({ interviews: INITIAL_DEMO_INTERVIEWS, selectedInterviewId: 'interview-demo-1' });
  },

  clearAll: () => {
    persistInterviews([]);
    set({ interviews: [], selectedInterviewId: null });
  },
}));

