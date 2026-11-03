import { create } from 'zustand';
import {
  JobApplication,
  ApplicationStatus,
  CareerOpsStats,
} from '../services/careerOps/types';
import {
  evaluateJobDescription,
  generateTailoredResume,
  generateCoverLetter,
  generateOutreachNotes,
  CoverLetterAngle,
  CoverLetterExperienceLevel,
  ProviderConfig,
} from '../services/careerOps/careerOpsService';

const STORAGE_KEY = 'career_ops_pipeline_v2';
const LEGACY_STORAGE_KEY = 'career_ops_pipeline_v1';

export const DEMO_SAMPLE_APPLICATIONS: JobApplication[] = [
  {
    id: 'demo-sample-1',
    company: 'Alignerr',
    role: 'Senior Software Developer (AI Assisted Coding)',
    url: 'https://alignerr.com',
    salaryRange: '$75 - $95 / hr',
    location: 'Remote, US/Global',
    workType: 'remote',
    status: 'interviewing',
    score: 4.8,
    recommendation: 'apply',
    jdText:
      'Evaluate frontier AI coding models side-by-side on real personal git repos (e.g. open-source repositories). Write bug fixes, test suites, and provide expert technical justifications.',
    createdAt: Date.now() - 86400000 * 2,
    updatedAt: Date.now() - 3600000,
    notes: 'Demo record: Mock technical round completed with 15/15 test cases passed.',
    isDemo: true,
  },
  {
    id: 'demo-sample-2',
    company: 'Datadog',
    role: 'Staff Distributed Systems Engineer',
    url: 'https://datadoghq.com/careers',
    salaryRange: '$185,000 - $225,000 / yr',
    location: 'Remote, US',
    workType: 'remote',
    status: 'evaluated',
    score: 4.4,
    recommendation: 'apply',
    jdText:
      'Build high-throughput metrics ingestion pipelines processing millions of events per second with Kafka, Go, and low-latency distributed storage.',
    createdAt: Date.now() - 86400000 * 4,
    updatedAt: Date.now() - 86400000 * 2,
    notes: 'Demo record: Strong match on Kafka and distributed telemetry.',
    isDemo: true,
  },
  {
    id: 'demo-sample-3',
    company: 'Legacy Financial Corp',
    role: 'Enterprise COBOL & On-Premises Mainframe Admin',
    url: 'https://example.com/job',
    salaryRange: '$90,000 - $110,000 / yr',
    location: 'Onsite, Chicago IL',
    workType: 'onsite',
    status: 'scouted',
    score: 2.1,
    recommendation: 'skip',
    jdText:
      'Maintain legacy batch processing scripts in IBM Mainframe COBOL environment. Onsite presence required 5 days/week. No sponsorship available.',
    createdAt: Date.now() - 86400000 * 6,
    updatedAt: Date.now() - 86400000 * 5,
    notes: 'Demo record: Score 2.1/5.0 - Do Not Apply. Preserved time by skipping weak fit.',
    isDemo: true,
  },
];

function calculateStats(apps: JobApplication[]): CareerOpsStats {
  // Only genuine, non-demo applications count toward production stats
  const realApps = apps.filter((a) => !a.isDemo);
  const totalTracked = realApps.length;
  const scoutedCount = realApps.filter((a) => a.status === 'scouted').length;
  const evaluatedCount = realApps.filter((a) => a.status === 'evaluated').length;
  const appliedCount = realApps.filter((a) => a.status === 'applied').length;
  const interviewingCount = realApps.filter((a) => a.status === 'interviewing').length;
  const offerCount = realApps.filter((a) => a.status === 'offer').length;
  const rejectedCount = realApps.filter((a) => a.status === 'rejected').length;
  const evaluatedApps = realApps.filter((a) => typeof a.score === 'number' && a.score > 0);
  const highFitCount = evaluatedApps.filter((a) => (a.score as number) >= 4.0).length;
  const avgScore =
    evaluatedApps.length > 0
      ? Math.round(
          (evaluatedApps.reduce((acc, a) => acc + (a.score || 0), 0) / evaluatedApps.length) * 10
        ) / 10
      : 0;

  return {
    totalTracked,
    scoutedCount,
    evaluatedCount,
    appliedCount,
    interviewingCount,
    offerCount,
    rejectedCount,
    avgScore,
    highFitCount,
  };
}

function loadInitialApplications(): JobApplication[] {
  if (typeof window !== 'undefined' && typeof localStorage !== 'undefined') {
    try {
      // 1. Try v2 storage first
      const rawV2 = localStorage.getItem(STORAGE_KEY);
      if (rawV2) {
        const parsed = JSON.parse(rawV2);
        if (Array.isArray(parsed)) return parsed;
      }

      // 2. Try legacy storage with migration: clean out old unflagged demo data
      const rawV1 = localStorage.getItem(LEGACY_STORAGE_KEY);
      if (rawV1) {
        const parsed = JSON.parse(rawV1);
        if (Array.isArray(parsed)) {
          // Filter out legacy hardcoded sample items
          const genuine = parsed.filter(
            (a) => a && a.id && !a.id.startsWith('job-sample-')
          );
          localStorage.setItem(STORAGE_KEY, JSON.stringify(genuine));
          localStorage.removeItem(LEGACY_STORAGE_KEY);
          return genuine;
        }
      }
    } catch (e) {
      console.warn('[CareerOps] Failed to read localStorage pipeline:', e);
    }
  }

  // Pure clean empty state for production fresh start
  return [];
}

interface CareerOpsState {
  applications: JobApplication[];
  activeJobId: string | null;
  filterStatus: 'all' | ApplicationStatus;
  searchQuery: string;
  isEvaluating: boolean;
  isTailoring: boolean;
  isDemoMode: boolean;
  stats: CareerOpsStats;

  // Actions
  addJob: (job: Partial<JobApplication>) => string;
  updateJob: (id: string, updates: Partial<JobApplication>) => void;
  deleteJob: (id: string) => void;
  setActiveJobId: (id: string | null) => void;
  setFilterStatus: (status: 'all' | ApplicationStatus) => void;
  setSearchQuery: (query: string) => void;
  enableDemoMode: () => void;
  clearDemoData: () => void;
  saveFormAnswer: (jobId: string, questionId: string, questionText: string, answer: string, isCopied?: boolean) => void;

  evaluateJob: (
    id: string,
    resumeText: string,
    config?: ProviderConfig
  ) => Promise<void>;
  tailorResumeForJob: (
    id: string,
    resumeText: string,
    config?: ProviderConfig
  ) => Promise<string>;
  generateCoverLetterForJob: (
    id: string,
    resumeText: string,
    angle?: CoverLetterAngle,
    level?: CoverLetterExperienceLevel,
    config?: ProviderConfig
  ) => Promise<string>;
  generateOutreachForJob: (
    id: string,
    config?: ProviderConfig
  ) => Promise<void>;

  exportPipelineJson: () => string;
  importPipelineJson: (jsonStr: string) => boolean;
}

export const useCareerOpsStore = create<CareerOpsState>((set, get) => {
  const initialApps = loadInitialApplications();

  const persist = (apps: JobApplication[]) => {
    if (typeof window !== 'undefined' && typeof localStorage !== 'undefined') {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(apps));
      } catch (e) {
        console.warn('[CareerOps] Failed to save localStorage:', e);
      }
    }
  };

  return {
    applications: initialApps,
    activeJobId: initialApps[0]?.id || null,
    filterStatus: 'all',
    searchQuery: '',
    isEvaluating: false,
    isTailoring: false,
    isDemoMode: initialApps.some((a) => a.isDemo),
    stats: calculateStats(initialApps),

    addJob: (jobData) => {
      // New application enters as scouted and unevaluated without automatic high scores
      const newJob: JobApplication = {
        id: 'job-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6),
        company: jobData.company || 'New Company',
        role: jobData.role || 'Software Engineer',
        url: jobData.url || '',
        salaryRange: jobData.salaryRange || 'Pending Evaluation',
        location: jobData.location || 'Remote',
        workType: jobData.workType || 'remote',
        status: jobData.status || 'scouted',
        score: jobData.score !== undefined ? jobData.score : null,
        recommendation:
          jobData.recommendation ||
          (typeof jobData.score === 'number'
            ? jobData.score >= 4.0
              ? 'apply'
              : 'skip'
            : 'unevaluated'),
        jdText: jobData.jdText || '',
        createdAt: Date.now(),
        updatedAt: Date.now(),
        notes: jobData.notes || '',
        isDemo: jobData.isDemo || false,
        ...jobData,
      };

      const updated = [newJob, ...get().applications];
      persist(updated);
      set({
        applications: updated,
        activeJobId: newJob.id,
        stats: calculateStats(updated),
      });
      return newJob.id;
    },

    updateJob: (id, updates) => {
      const updated = get().applications.map((app) =>
        app.id === id ? { ...app, ...updates, updatedAt: Date.now() } : app
      );
      persist(updated);
      set({ applications: updated, stats: calculateStats(updated) });
    },

    deleteJob: (id) => {
      const updated = get().applications.filter((a) => a.id !== id);
      const nextActive = get().activeJobId === id ? updated[0]?.id || null : get().activeJobId;
      persist(updated);
      set({
        applications: updated,
        activeJobId: nextActive,
        stats: calculateStats(updated),
      });
    },

    setActiveJobId: (id) => set({ activeJobId: id }),
    setFilterStatus: (filterStatus) => set({ filterStatus }),
    setSearchQuery: (searchQuery) => set({ searchQuery }),

    enableDemoMode: () => {
      const current = get().applications;
      const demoApps = DEMO_SAMPLE_APPLICATIONS.map((d) => ({
        ...d,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      }));
      const merged = [...demoApps, ...current.filter((a) => !a.isDemo)];
      persist(merged);
      set({
        applications: merged,
        activeJobId: demoApps[0]?.id || null,
        isDemoMode: true,
        stats: calculateStats(merged),
      });
    },

    clearDemoData: () => {
      const genuine = get().applications.filter((a) => !a.isDemo);
      persist(genuine);
      set({
        applications: genuine,
        activeJobId: genuine[0]?.id || null,
        isDemoMode: false,
        stats: calculateStats(genuine),
      });
    },

    saveFormAnswer: (jobId: string, questionId: string, questionText: string, answer: string, isCopied: boolean = false) => {
      const job = get().applications.find((a) => a.id === jobId);
      if (!job) return;

      const currentAnswers = job.formAnswers || {};
      const updatedAnswers = {
        ...currentAnswers,
        [questionId]: {
          questionId,
          questionText,
          answer,
          isCopied,
          copiedAt: isCopied ? Date.now() : currentAnswers[questionId]?.copiedAt,
          characterCount: answer.length,
        },
      };

      get().updateJob(jobId, {
        formAnswers: updatedAnswers,
        updatedAt: Date.now(),
      });
    },

    evaluateJob: async (id, resumeText, config) => {
      const job = get().applications.find((a) => a.id === id);
      if (!job) return;

      set({ isEvaluating: true });
      try {
        const report = await evaluateJobDescription(
          job.jdText,
          resumeText,
          job.role,
          job.company,
          config
        );

        get().updateJob(id, {
          score: report.score,
          recommendation: report.recommendation,
          status: 'evaluated',
          evaluationReport: report,
          salaryRange: report.compensationEstimate.estimatedRange,
        });
      } finally {
        set({ isEvaluating: false });
      }
    },

    tailorResumeForJob: async (id, resumeText, config) => {
      const job = get().applications.find((a) => a.id === id);
      if (!job) return '';

      set({ isTailoring: true });
      try {
        const tailored = await generateTailoredResume(
          job.jdText,
          resumeText,
          job.role,
          job.company,
          config
        );
        get().updateJob(id, { tailoredResume: tailored });
        return tailored;
      } finally {
        set({ isTailoring: false });
      }
    },

    generateCoverLetterForJob: async (
      id,
      resumeText,
      angle = 'problem_solver',
      level = 'senior',
      config
    ) => {
      const job = get().applications.find((a) => a.id === id);
      if (!job) return '';

      const letter = await generateCoverLetter(
        job.jdText,
        resumeText,
        job.company,
        job.role,
        angle,
        level,
        config
      );
      get().updateJob(id, { coverLetter: letter });
      return letter;
    },

    generateOutreachForJob: async (id, config) => {
      const job = get().applications.find((a) => a.id === id);
      if (!job) return;

      const angle = job.evaluationReport?.strategicAngle || 'scalable architecture';
      const notes = await generateOutreachNotes(job.company, job.role, angle, config);
      get().updateJob(id, {
        outreachNote: `=== LINKEDIN RECRUITER (<= 300 chars) ===\n${notes.linkedinRecruiter}\n\n=== LINKEDIN HIRING MANAGER (<= 300 chars) ===\n${notes.linkedinHiringManager}\n\n=== COLD APPLICATION EMAIL DRAFT ===\nSubject: ${notes.coldEmailSubject}\n\n${notes.coldEmailBody}`,
      });
    },

    exportPipelineJson: () => {
      return JSON.stringify(get().applications, null, 2);
    },

    importPipelineJson: (jsonStr) => {
      try {
        const parsed = JSON.parse(jsonStr);
        if (Array.isArray(parsed) && parsed.length > 0) {
          persist(parsed);
          set({
            applications: parsed,
            activeJobId: parsed[0]?.id || null,
            stats: calculateStats(parsed),
          });
          return true;
        }
      } catch (e) {
        console.error('[CareerOps] Import failed:', e);
      }
      return false;
    },
  };
});
