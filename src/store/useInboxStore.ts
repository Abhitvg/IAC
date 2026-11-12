import { create } from 'zustand';
import {
  EmailReplyClassifier,
  ClassificationResult,
  InboundCategory,
} from '../../packages/cloud-core/src/inbound/classifier';

export interface InboxMessage {
  id: string;
  senderName: string;
  senderEmail: string;
  isCandidate: boolean;
  timestamp: number;
  text: string;
}

export interface InboxThread {
  id: string;
  jobId?: string;
  company: string;
  role: string;
  senderName: string;
  senderEmail: string;
  subject: string;
  receivedAt: number;
  status: 'unread' | 'read' | 'replied' | 'archived';
  classification: ClassificationResult;
  suggestedReply: string;
  customReplyText?: string;
  messages: InboxMessage[];
}

const STORAGE_KEY = 'career_ops_inbox_threads_v1';
const classifier = new EmailReplyClassifier();

export const INITIAL_DEMO_THREADS: InboxThread[] = [
  {
    id: 'thread-demo-1',
    jobId: 'demo-sample-1',
    company: 'Alignerr',
    role: 'Senior Software Developer (AI Assisted Coding)',
    senderName: 'Rachel Kim',
    senderEmail: 'rachel.kim@alignerr.com',
    subject: 'Alignerr — Invitation for Senior Developer Technical Deep Dive',
    receivedAt: Date.now() - 1000 * 60 * 45, // 45 mins ago
    status: 'unread',
    classification: classifier.classify({
      senderName: 'Rachel Kim',
      senderEmail: 'rachel.kim@alignerr.com',
      subject: 'Alignerr — Invitation for Senior Developer Technical Deep Dive',
      bodyText:
        'Hi Candidate,\n\nThanks for applying! The team was very impressed by your automated test suite architecture and AST parsing background.\n\nWe would love to invite you to a 45-minute technical conversation with our Lead Evaluation Engineer. Please grab a slot that works best for you on my calendar:\nhttps://calendly.com/rachel-alignerr/technical-screen\n\nLooking forward to speaking with you!\n\nBest,\nRachel Kim\nTalent Lead, Alignerr',
    }),
    suggestedReply:
      'Hi Rachel,\n\nThank you for the update! I am excited to discuss our automated evaluation benchmarks and AST verification pipelines. I have booked a slot via your Calendly link for this Thursday at 2:00 PM EST.\n\nLooking forward to speaking with the team.\n\nBest regards,\nCandidate Engineer',
    messages: [
      {
        id: 'msg-1',
        senderName: 'Rachel Kim',
        senderEmail: 'rachel.kim@alignerr.com',
        isCandidate: false,
        timestamp: Date.now() - 1000 * 60 * 45,
        text: 'Hi Candidate,\n\nThanks for applying! The team was very impressed by your automated test suite architecture and AST parsing background.\n\nWe would love to invite you to a 45-minute technical conversation with our Lead Evaluation Engineer. Please grab a slot that works best for you on my calendar:\nhttps://calendly.com/rachel-alignerr/technical-screen\n\nLooking forward to speaking with you!\n\nBest,\nRachel Kim\nTalent Lead, Alignerr',
      },
    ],
  },
  {
    id: 'thread-demo-2',
    jobId: 'demo-sample-2',
    company: 'Datadog',
    role: 'Staff Distributed Systems Engineer',
    senderName: 'Michael Sterling',
    senderEmail: 'msterling@datadoghq.com',
    subject: 'Question regarding your application - Datadog Distributed Systems',
    receivedAt: Date.now() - 1000 * 60 * 60 * 3, // 3 hours ago
    status: 'unread',
    classification: classifier.classify({
      senderName: 'Michael Sterling',
      senderEmail: 'msterling@datadoghq.com',
      subject: 'Question regarding your application - Datadog Distributed Systems',
      bodyText:
        'Hi Candidate,\n\nWe are reviewing your application for the Staff Distributed Systems Engineer opening. Before we move forward with scheduling, could you confirm your current work authorization status in the United States and your expected salary range for this role?\n\nThank you,\nMichael Sterling\nTechnical Recruiting, Datadog',
    }),
    suggestedReply:
      'Hi Michael,\n\nThank you for reaching out. Yes, I am fully authorized to work in the United States and do not require visa sponsorship. My target total compensation aligns with the posted band around $185,000 - $225,000 base, flexible based on overall equity and team scope.\n\nPlease let me know if you need any additional details to proceed with scheduling.\n\nBest regards,\nCandidate Engineer',
    messages: [
      {
        id: 'msg-2',
        senderName: 'Michael Sterling',
        senderEmail: 'msterling@datadoghq.com',
        isCandidate: false,
        timestamp: Date.now() - 1000 * 60 * 60 * 3,
        text: 'Hi Candidate,\n\nWe are reviewing your application for the Staff Distributed Systems Engineer opening. Before we move forward with scheduling, could you confirm your current work authorization status in the United States and your expected salary range for this role?\n\nThank you,\nMichael Sterling\nTechnical Recruiting, Datadog',
      },
    ],
  },
  {
    id: 'thread-demo-3',
    company: 'Stripe',
    role: 'Staff Infrastructure Engineer',
    senderName: 'Elena Rostova',
    senderEmail: 'elena@stripe.com',
    subject: 'Your Stripe internal referral has been submitted!',
    receivedAt: Date.now() - 1000 * 60 * 60 * 24, // 1 day ago
    status: 'read',
    classification: classifier.classify({
      senderName: 'Elena Rostova',
      senderEmail: 'elena@stripe.com',
      subject: 'Your Stripe internal referral has been submitted!',
      bodyText:
        'Hi Candidate,\n\nI just submitted your referral for the Staff Infrastructure Engineer position through our internal employee portal. You should receive a confirmation email from our recruiting team shortly with your candidate tracking link.\n\nBest of luck!\nElena Rostova',
    }),
    suggestedReply:
      'Hi Elena,\n\nThank you so much for putting in the referral! I truly appreciate you championing my profile. I will keep an eye out for the recruiter email and keep you posted on the process.\n\nWarm regards,\nCandidate Engineer',
    messages: [
      {
        id: 'msg-3',
        senderName: 'Elena Rostova',
        senderEmail: 'elena@stripe.com',
        isCandidate: false,
        timestamp: Date.now() - 1000 * 60 * 60 * 24,
        text: 'Hi Candidate,\n\nI just submitted your referral for the Staff Infrastructure Engineer position through our internal employee portal. You should receive a confirmation email from our recruiting team shortly with your candidate tracking link.\n\nBest of luck!\nElena Rostova',
      },
    ],
  },
  {
    id: 'thread-demo-4',
    company: 'Legacy Corp',
    role: 'Systems Engineer',
    senderName: 'Automated Recruiting',
    senderEmail: 'no-reply@legacycorp.com',
    subject: 'Update regarding your application with Legacy Corp',
    receivedAt: Date.now() - 1000 * 60 * 60 * 48, // 2 days ago
    status: 'archived',
    classification: classifier.classify({
      senderName: 'Automated Recruiting',
      senderEmail: 'no-reply@legacycorp.com',
      subject: 'Update regarding your application with Legacy Corp',
      bodyText:
        'Dear Candidate,\n\nThank you for your interest in the Systems Engineer position. We were impressed by your background, however, we have decided to pursue other candidates whose experience more closely matches our specific domain needs at this time.\n\nWe wish you the best in your job search.\n\nSincerely,\nLegacy Corp Recruiting',
    }),
    suggestedReply: '',
    messages: [
      {
        id: 'msg-4',
        senderName: 'Automated Recruiting',
        senderEmail: 'no-reply@legacycorp.com',
        isCandidate: false,
        timestamp: Date.now() - 1000 * 60 * 60 * 48,
        text: 'Dear Candidate,\n\nThank you for your interest in the Systems Engineer position. We were impressed by your background, however, we have decided to pursue other candidates whose experience more closely matches our specific domain needs at this time.\n\nWe wish you the best in your job search.\n\nSincerely,\nLegacy Corp Recruiting',
      },
    ],
  },
];

function loadSavedThreads(): InboxThread[] {
  if (typeof window !== 'undefined' && typeof localStorage !== 'undefined') {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch (e) {
      console.warn('[InboxStore] Failed to read localStorage:', e);
    }
  }
  return INITIAL_DEMO_THREADS;
}

function persistThreads(threads: InboxThread[]) {
  if (typeof window !== 'undefined' && typeof localStorage !== 'undefined') {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(threads));
    } catch (e) {
      console.warn('[InboxStore] Failed to persist threads:', e);
    }
  }
}

interface InboxState {
  threads: InboxThread[];
  selectedThreadId: string | null;
  searchQuery: string;
  categoryFilter: InboundCategory | 'urgent' | 'all';
  statusFilter: 'all' | 'unread' | 'archived';

  // Actions
  setSearchQuery: (query: string) => void;
  setCategoryFilter: (filter: InboundCategory | 'urgent' | 'all') => void;
  setStatusFilter: (filter: 'all' | 'unread' | 'archived') => void;
  setSelectedThreadId: (id: string | null) => void;
  markAsRead: (id: string) => void;
  markAsArchived: (id: string) => void;
  unarchive: (id: string) => void;
  updateCustomReply: (id: string, text: string) => void;
  sendCandidateReply: (id: string, replyText: string) => void;
  resetToDemo: () => void;
  clearAll: () => void;
}

export const useInboxStore = create<InboxState>((set, get) => ({
  threads: loadSavedThreads(),
  selectedThreadId: 'thread-demo-1',
  searchQuery: '',
  categoryFilter: 'all',
  statusFilter: 'all',

  setSearchQuery: (query) => set({ searchQuery: query }),
  setCategoryFilter: (categoryFilter) => set({ categoryFilter }),
  setStatusFilter: (statusFilter) => set({ statusFilter }),
  setSelectedThreadId: (id) => {
    set({ selectedThreadId: id });
    if (id) {
      get().markAsRead(id);
    }
  },

  markAsRead: (id) => {
    const updated = get().threads.map((t) =>
      t.id === id && t.status === 'unread' ? { ...t, status: 'read' as const } : t
    );
    persistThreads(updated);
    set({ threads: updated });
  },

  markAsArchived: (id) => {
    const updated = get().threads.map((t) =>
      t.id === id ? { ...t, status: 'archived' as const } : t
    );
    persistThreads(updated);
    set({ threads: updated });
  },

  unarchive: (id) => {
    const updated = get().threads.map((t) =>
      t.id === id ? { ...t, status: 'read' as const } : t
    );
    persistThreads(updated);
    set({ threads: updated });
  },

  updateCustomReply: (id, text) => {
    const updated = get().threads.map((t) =>
      t.id === id ? { ...t, customReplyText: text } : t
    );
    persistThreads(updated);
    set({ threads: updated });
  },

  sendCandidateReply: (id, replyText) => {
    const now = Date.now();
    const updated = get().threads.map((t) => {
      if (t.id === id) {
        const candidateMsg: InboxMessage = {
          id: `msg-reply-${now}`,
          senderName: 'You (Candidate)',
          senderEmail: 'candidate@example.com',
          isCandidate: true,
          timestamp: now,
          text: replyText,
        };
        return {
          ...t,
          status: 'replied' as const,
          messages: [...t.messages, candidateMsg],
          customReplyText: '',
        };
      }
      return t;
    });
    persistThreads(updated);
    set({ threads: updated });
  },

  resetToDemo: () => {
    persistThreads(INITIAL_DEMO_THREADS);
    set({ threads: INITIAL_DEMO_THREADS, selectedThreadId: 'thread-demo-1' });
  },

  clearAll: () => {
    persistThreads([]);
    set({ threads: [], selectedThreadId: null });
  },
}));
