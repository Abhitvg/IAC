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

const STORAGE_KEY = 'career_ops_pipeline_v1';

function calculateStats(apps: JobApplication[]): CareerOpsStats {
  const totalTracked = apps.length;
  const scoutedCount = apps.filter((a) => a.status === 'scouted').length;
  const evaluatedCount = apps.filter((a) => a.status === 'evaluated').length;
  const appliedCount = apps.filter((a) => a.status === 'applied').length;
  const interviewingCount = apps.filter((a) => a.status === 'interviewing').length;
  const offerCount = apps.filter((a) => a.status === 'offer').length;
  const rejectedCount = apps.filter((a) => a.status === 'rejected').length;
  const highFitCount = apps.filter((a) => a.score >= 4.0).length;
  const avgScore =
    totalTracked > 0
      ? Math.round(
          (apps.reduce((acc, a) => acc + (a.score || 0), 0) / totalTracked) * 10
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
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) return parsed;
      }
    } catch (e) {
      console.warn('[CareerOps] Failed to read localStorage pipeline:', e);
    }
  }

  // Pre-loaded realistic sample data for instant exploration
  const sampleApps: JobApplication[] = [
    {
      id: 'job-sample-1',
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
        'Evaluate frontier AI coding models side-by-side on real personal git repos (e.g. DocFlow). Write bug fixes, test suites, and provide expert technical justifications.',
      createdAt: Date.now() - 86400000 * 2,
      updatedAt: Date.now() - 3600000,
      notes: 'Mock technical round completed with 15/15 test cases passed.',
    },
    {
      id: 'job-sample-2',
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
      notes: 'Strong match on Kafka and distributed telemetry.',
    },
    {
      id: 'job-sample-3',
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
      notes: 'Score 2.1/5.0 - Do Not Apply. Preserved time by skipping weak fit.',
    },
  ];

  return sampleApps;
}

interface CareerOpsState {
  applications: JobApplication[];
  activeJobId: string | null;
  filterStatus: 'all' | ApplicationStatus;
  searchQuery: string;
  isEvaluating: boolean;
  isTailoring: boolean;
  stats: CareerOpsStats;

  // Actions
  addJob: (job: Partial<JobApplication>) => string;
  updateJob: (id: string, updates: Partial<JobApplication>) => void;
  deleteJob: (id: string) => void;
  setActiveJobId: (id: string | null) => void;
  setFilterStatus: (status: 'all' | ApplicationStatus) => void;
  setSearchQuery: (query: string) => void;

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
    stats: calculateStats(initialApps),

    addJob: (jobData) => {
      const newJob: JobApplication = {
        id: 'job-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6),
        company: jobData.company || 'New Company',
        role: jobData.role || 'Software Engineer',
        url: jobData.url || '',
        salaryRange: jobData.salaryRange || 'Market Rate',
        location: jobData.location || 'Remote',
        workType: jobData.workType || 'remote',
        status: jobData.status || 'scouted',
        score: jobData.score || 4.0,
        recommendation: (jobData.score || 4.0) >= 4.0 ? 'apply' : 'skip',
        jdText: jobData.jdText || '',
        createdAt: Date.now(),
        updatedAt: Date.now(),
        notes: jobData.notes || '',
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
