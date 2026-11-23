import { create } from 'zustand';
import {
  JobApplication,
  ApplicationStatus,
  CareerOpsStats,
  CareerOpsSource,
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
import { discoverJobsFromCareerPage } from '../services/careerOps/discoveryService';

const STORAGE_KEY = 'career_ops_pipeline_v2';
const LEGACY_STORAGE_KEY = 'career_ops_pipeline_v1';
const SOURCES_STORAGE_KEY = 'career_ops_discovery_sources_v1';

export const DEFAULT_DISCOVERY_SOURCES: CareerOpsSource[] = [
  {
    id: 'source-anthropic',
    label: 'Anthropic Careers',
    url: 'https://job-boards.greenhouse.io/anthropic',
    keywords: ['AI', 'Engineer', 'Systems', 'Research'],
    enabled: true,
    autoEvaluate: false,
  },
  {
    id: 'source-datadog',
    label: 'Datadog Careers',
    url: 'https://job-boards.greenhouse.io/datadog',
    keywords: ['Distributed', 'Go', 'Infrastructure', 'Software'],
    enabled: true,
    autoEvaluate: false,
  },
];

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
    evaluationReport: {
      score: 4.8,
      recommendation: 'apply',
      verdictHeadline: '🟢 Recommended: Exceptional Alignment (4.8/5.0)',
      summary:
        'Exceptional overlap with candidate experience in automated test architectures, AST parsing, and frontier LLM code evaluation.',
      weightedRequirements: [
        {
          requirement: 'Python & TypeScript Test Suite Architecture',
          weight: 'critical',
          fit: 'strong',
          evidence:
            'Over 250 unit and integration tests with 98% coverage in candidate repositories.',
        },
        {
          requirement: 'Frontier AI Code Benchmarking & Rigorous Quality Auditing',
          weight: 'critical',
          fit: 'strong',
          evidence:
            'Hands-on experience benchmarking LLM code outputs against deterministic test suites.',
        },
        {
          requirement: 'Deterministic AST & Syntax Parsing',
          weight: 'high',
          fit: 'strong',
          evidence: 'Built custom AST linters and syntactic correctness validators.',
        },
        {
          requirement: 'Asynchronous Remote Collaboration',
          weight: 'medium',
          fit: 'strong',
          evidence:
            'Demonstrated history of high-velocity independent deliverables and open-source contributions.',
        },
      ],
      levelStrategy:
        'Position as Senior/Staff level code reviewer capable of crafting benchmark datasets and gold-standard evaluation rubrics.',
      identifiedGaps: [
        'Alignerr-specific internal grading taxonomy (rapid ramp during initial onboarding).',
      ],
      strategicAngle:
        'Highlight deep test-suite design and deterministic regression detection on mission-critical codebases.',
      compensationEstimate: {
        estimatedRange: '$75 - $95 / hr',
        analysis:
          'Stated explicitly in job posting. High percentile for specialized AI code evaluation.',
      },
      workAuthAlert: undefined,
      topInterviewStories: [
        'Building a 200+ case regression test suite for automated code verification',
        'Root-causing concurrency edge cases under heavy asynchronous loads',
        'Authoring technical guidelines that reduced reviewer disagreements by 40%',
      ],
    },
    tailoredResume: `\\documentclass[letterpaper,10pt]{article}
\\usepackage{latexsym}
\\usepackage[empty]{fullpage}
\\usepackage{titlesec}
\\usepackage{marvosym}
\\usepackage[usenames,dvipsnames]{color}
\\usepackage{verbatim}
\\usepackage{enumitem}
\\usepackage[hidelinks]{hyperref}
\\usepackage{fancyhdr}
\\pagestyle{fancy}
\\fancyhf{}
\\renewcommand{\\headrulewidth}{0pt}
\\renewcommand{\\footrulewidth}{0pt}
\\addtolength{\\oddsidemargin}{-0.5in}
\\addtolength{\\textwidth}{1in}
\\addtolength{\\topmargin}{-.5in}
\\addtolength{\\textheight}{1.0in}
\\urlstyle{same}
\\raggedbottom
\\raggedright
\\setlength{\\tabcolsep}{0in}

\\begin{document}
\\begin{center}
  \\textbf{\\Huge \\scshape Candidate Engineer} \\\\ \\vspace{1pt}
  \\small +1-555-0199 $|$ \\href{mailto:candidate@example.com}{\\underline{candidate@example.com}} $|$ 
  \\href{https://linkedin.com/in/candidate}{\\underline{linkedin.com/in/candidate}} $|$
  \\href{https://github.com/candidate}{\\underline{github.com/candidate}}
\\end{center}

\\section{Technical Summary}
Senior Software Engineer specializing in automated evaluation pipelines, AST-level code validation, and high-coverage test architecture. Proven experience benchmarking code generation and hardening mission-critical developer tools.

\\section{Experience}
\\textbf{Senior Systems Engineer} $|$ Cloud Platforms \\hfill Jan 2022 -- Present\\\\
\\begin{itemize}[noitemsep,topsep=0pt]
  \\item Architected automated test suites with 98\\% code coverage for high-throughput distributed microservices.
  \\item Benchmarked frontier AI models on live repository testbeds, evaluating semantic correctness and security.
  \\item Authored comprehensive technical rubrics adopted by engineering teams for standardized code reviews.
\\end{itemize}

\\section{Skills}
\\textbf{Languages}: TypeScript, Python, Go, SQL, Bash\\\\
\\textbf{Tooling}: Docker, Git, CI/CD, Vitest, PyTest, AST Parsers, Distributed Telemetry
\\end{document}`,
    coverLetter: `Dear Hiring Team at Alignerr,

I am writing to express my strong enthusiasm for the Senior Software Developer (AI Assisted Coding) position. With extensive experience architecting automated regression test suites, conducting AST-level static analysis, and benchmarking code generation against deterministic specifications, I am eager to help your team calibrate frontier AI models.

Throughout my work, I have focused on ensuring that code generated by AI is not just plausible, but mathematically sound, secure, and rigorously tested. I look forward to bringing this engineering discipline to Alignerr's benchmark evaluations.

Thank you for your consideration.

Sincerely,
Candidate Engineer`,
    outreachNote: `LinkedIn Connection Note (238 chars):
Hi Alignerr Team, saw your Senior Developer (AI Assisted Coding) opening. I specialize in AST code verification, comprehensive test suite architecture, and LLM benchmarking. Would love to contribute to your evaluation pipeline! Best, Candidate

Email Draft:
Subject: Alignerr Senior Developer (AI Assisted Coding) - Application Follow-up
Hi Alignerr Recruiting Team,

I submitted my application for the Senior Software Developer (AI Assisted Coding) role. My background centers on building automated regression test suites and evaluating frontier model code outputs for correctness and security. I would welcome the opportunity to discuss how my experience aligns with your evaluation benchmarks.

Best regards,
Candidate Engineer`,
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
    evaluationReport: {
      score: 4.4,
      recommendation: 'apply',
      verdictHeadline: '🟢 Recommended: Strong Fit (4.4/5.0)',
      summary:
        'Robust alignment with candidate background in high-throughput Kafka event streaming, low-latency telemetry pipelines, and Go microservices.',
      weightedRequirements: [
        {
          requirement: 'Apache Kafka & Distributed Ingestion Architecture',
          weight: 'critical',
          fit: 'strong',
          evidence: 'Production telemetry pipelines processing high-volume event streams.',
        },
        {
          requirement: 'Go / Low-Latency Systems Programming',
          weight: 'critical',
          fit: 'strong',
          evidence:
            'Experience profiling memory allocations and optimizing concurrency in distributed nodes.',
        },
        {
          requirement: 'Multi-Tenant High Availability & Disaster Recovery',
          weight: 'high',
          fit: 'strong',
          evidence: 'Designed multi-region failover and horizontal partition rebalancing.',
        },
      ],
      levelStrategy:
        'Focus on technical depth in stream processing, partition management, and P99 latency reduction.',
      identifiedGaps: ['Proprietary Datadog storage engine internals (standard learning curve).'],
      strategicAngle:
        'Emphasize proven experience keeping ingestion reliable during traffic spikes.',
      compensationEstimate: {
        estimatedRange: '$185,000 - $225,000 / yr',
        analysis: 'Stated in job posting. Matches Staff engineer market band.',
      },
      topInterviewStories: [
        'Scaling Kafka event ingestion to handle 5x traffic surges during black swan events',
        'Tuning Go garbage collection pauses to reduce P99 latency by 35%',
      ],
    },
    tailoredResume: `\\documentclass[letterpaper,10pt]{article}
\\usepackage[empty]{fullpage}
\\begin{document}
\\textbf{\\Huge Candidate Engineer} \\\\
Staff Distributed Systems Engineer -- Telemetry \\& Kafka Pipelines
\\end{document}`,
    outreachNote: `LinkedIn Connection Note (225 chars):
Hi Datadog Team, saw the Staff Distributed Systems Engineer opening. I have spent years architecting high-throughput Kafka ingestion pipelines and optimizing Go services under heavy loads. Excited about Datadog's scale! Best, Candidate`,
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

function loadInitialSources(): CareerOpsSource[] {
  if (typeof window === 'undefined' || typeof localStorage === 'undefined') {
    return DEFAULT_DISCOVERY_SOURCES;
  }
  try {
    const raw = localStorage.getItem(SOURCES_STORAGE_KEY);
    if (!raw) return DEFAULT_DISCOVERY_SOURCES;
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed) || parsed.length === 0) return DEFAULT_DISCOVERY_SOURCES;
    let modified = false;
    const validated = parsed
      .filter((source): source is CareerOpsSource =>
        Boolean(
          source &&
          typeof source.id === 'string' &&
          typeof source.label === 'string' &&
          typeof source.url === 'string' &&
          source.url.startsWith('https://') &&
          Array.isArray(source.keywords) &&
          typeof source.enabled === 'boolean'
        )
      )
      .map((source) => {
        let updatedUrl = source.url;
        if (source.url === 'https://jobs.ashbyhq.com/anthropic') {
          updatedUrl = 'https://job-boards.greenhouse.io/anthropic';
          modified = true;
        } else if (source.url === 'https://boards.greenhouse.io/datadog') {
          updatedUrl = 'https://job-boards.greenhouse.io/datadog';
          modified = true;
        }
        return {
          ...source,
          url: updatedUrl,
          autoEvaluate: source.autoEvaluate === true,
        };
      });
    if (modified) {
      persistSources(validated);
    }
    return validated;
  } catch (error) {
    console.warn('[CareerOps] Failed to read discovery sources:', error);
    return DEFAULT_DISCOVERY_SOURCES;
  }
}

function persistSources(sources: CareerOpsSource[]) {
  if (typeof window === 'undefined' || typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(SOURCES_STORAGE_KEY, JSON.stringify(sources));
  } catch (error) {
    console.warn('[CareerOps] Failed to save discovery sources:', error);
  }
}

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
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
        if (Array.isArray(parsed) && parsed.length === 0) return []; // Explicitly cleared by user
      }

      // 2. Try legacy storage with migration: clean out old unflagged demo data
      const rawV1 = localStorage.getItem(LEGACY_STORAGE_KEY);
      if (rawV1) {
        const parsed = JSON.parse(rawV1);
        if (Array.isArray(parsed)) {
          // Filter out legacy hardcoded sample items
          const genuine = parsed.filter((a) => a && a.id && !a.id.startsWith('job-sample-'));
          localStorage.setItem(STORAGE_KEY, JSON.stringify(genuine));
          localStorage.removeItem(LEGACY_STORAGE_KEY);
          if (genuine.length > 0) return genuine;
        }
      }
    } catch (e) {
      console.warn('[CareerOps] Failed to read localStorage pipeline:', e);
    }
  }

  // A fresh install must represent the user's real pipeline, not fabricated sample applications.
  // Demo records remain available through the explicit enableDemoMode() action.
  return [];
}

interface CareerOpsState {
  applications: JobApplication[];
  sources: CareerOpsSource[];
  isDiscovering: boolean;
  lastDiscoveryAt: number | null;
  activeJobId: string | null;
  filterStatus: 'all' | ApplicationStatus;
  searchQuery: string;
  isEvaluating: boolean;
  isTailoring: boolean;
  isDemoMode: boolean;
  stats: CareerOpsStats;

  // Actions
  addJob: (job: Partial<JobApplication>) => string;
  addSource: (source: {
    label: string;
    url: string;
    keywords?: string[];
    autoEvaluate?: boolean;
  }) => string;
  updateSource: (id: string, updates: Partial<CareerOpsSource>) => void;
  removeSource: (id: string) => void;
  discoverJobsFromSources: (
    resumeText?: string,
    providerConfig?: ProviderConfig
  ) => Promise<{ imported: number; skipped: number; errors: string[] }>;
  updateJob: (id: string, updates: Partial<JobApplication>) => void;
  deleteJob: (id: string) => void;
  setActiveJobId: (id: string | null) => void;
  setFilterStatus: (status: 'all' | ApplicationStatus) => void;
  setSearchQuery: (query: string) => void;
  enableDemoMode: () => void;
  clearDemoData: () => void;
  saveFormAnswer: (
    jobId: string,
    questionId: string,
    questionText: string,
    answer: string,
    isCopied?: boolean
  ) => void;

  evaluateJob: (id: string, resumeText: string, config?: ProviderConfig) => Promise<void>;
  tailorResumeForJob: (id: string, resumeText: string, config?: ProviderConfig) => Promise<string>;
  generateCoverLetterForJob: (
    id: string,
    resumeText: string,
    angle?: CoverLetterAngle,
    level?: CoverLetterExperienceLevel,
    config?: ProviderConfig
  ) => Promise<string>;
  generateOutreachForJob: (id: string, config?: ProviderConfig) => Promise<void>;

  exportPipelineJson: () => string;
  importPipelineJson: (jsonStr: string) => boolean;
}

export const useCareerOpsStore = create<CareerOpsState>((set, get) => {
  const initialApps = loadInitialApplications();
  const initialSources = loadInitialSources();

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
    sources: initialSources,
    isDiscovering: false,
    lastDiscoveryAt: null,
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
        salaryRange: jobData.salaryRange || 'Not disclosed',
        location: jobData.location || 'Not specified',
        workType: jobData.workType,
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

    addSource: (sourceData) => {
      let parsedUrl: URL;
      try {
        parsedUrl = new URL(sourceData.url.trim());
      } catch {
        throw new Error('Enter a valid career page URL.');
      }
      if (parsedUrl.protocol !== 'https:' || parsedUrl.username || parsedUrl.password) {
        throw new Error(
          'Career page sources must use public HTTPS URLs without embedded credentials.'
        );
      }
      const label = sourceData.label.trim();
      if (!label) throw new Error('Give this career page source a name.');
      const duplicate = get().sources.find((source) => source.url === parsedUrl.toString());
      if (duplicate) return duplicate.id;
      const source: CareerOpsSource = {
        id: 'source-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6),
        label,
        url: parsedUrl.toString(),
        keywords: (sourceData.keywords || [])
          .map((item) => item.trim())
          .filter(Boolean)
          .slice(0, 20),
        enabled: true,
        autoEvaluate: sourceData.autoEvaluate === true,
      };
      const updated = [source, ...get().sources];
      persistSources(updated);
      set({ sources: updated });
      return source.id;
    },

    updateSource: (id, updates) => {
      const updated = get().sources.map((source) =>
        source.id === id ? { ...source, ...updates } : source
      );
      persistSources(updated);
      set({ sources: updated });
    },

    removeSource: (id) => {
      const updated = get().sources.filter((source) => source.id !== id);
      persistSources(updated);
      set({ sources: updated });
    },

    discoverJobsFromSources: async (resumeText = '', providerConfig) => {
      if (get().isDiscovering) return { imported: 0, skipped: 0, errors: [] };
      const activeSources = get().sources.filter((source) => source.enabled);
      if (activeSources.length === 0) {
        return { imported: 0, skipped: 0, errors: ['Add and enable a career page source first.'] };
      }

      set({ isDiscovering: true });
      let imported = 0;
      let skipped = 0;
      const errors: string[] = [];
      try {
        for (const source of activeSources) {
          try {
            const result = await discoverJobsFromCareerPage(source);
            skipped += result.skipped;
            errors.push(...result.errors.slice(0, 10));
            for (const discovered of result.jobs) {
              const details = discovered.details;
              const normalizedUrl = details.url.replace(/#.*$/, '');
              const exists = get().applications.some(
                (application) => application.url?.replace(/#.*$/, '') === normalizedUrl
              );
              if (exists) {
                skipped += 1;
                continue;
              }
              const newJobId = get().addJob({
                company: details.company || source.label,
                role: details.role || 'Unknown role',
                url: details.url,
                salaryRange: details.salaryRange || 'Not disclosed',
                location: details.location || 'Not specified',
                workType: details.workType,
                jdText: details.jdText,
                status: 'scouted',
                notes: `Discovered from ${source.label}. Review the source posting before evaluation.`,
              });
              imported += 1;

              if (source.autoEvaluate) {
                if (!resumeText.trim()) {
                  errors.push(
                    `${source.label}: auto-evaluation skipped because no resume is loaded.`
                  );
                } else {
                  try {
                    await get().evaluateJob(newJobId, resumeText, providerConfig);
                  } catch (error) {
                    errors.push(
                      `${details.company} — ${details.role}: evaluation failed: ${error instanceof Error ? error.message : 'Unknown error'}`
                    );
                  }
                }
              }
            }
            get().updateSource(source.id, {
              lastCheckedAt: Date.now(),
              lastError: result.errors.length ? result.errors.slice(0, 3).join(' | ') : undefined,
            });
          } catch (error) {
            const message = error instanceof Error ? error.message : 'Discovery failed.';
            errors.push(`${source.label}: ${message}`);
            get().updateSource(source.id, { lastCheckedAt: Date.now(), lastError: message });
          }
        }
        return { imported, skipped, errors };
      } finally {
        set({ isDiscovering: false, lastDiscoveryAt: Date.now() });
      }
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

    saveFormAnswer: (
      jobId: string,
      questionId: string,
      questionText: string,
      answer: string,
      isCopied: boolean = false
    ) => {
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
