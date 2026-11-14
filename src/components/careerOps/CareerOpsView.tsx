import { copyToClipboard } from '../../utils/clipboard';
import React, { useEffect, useMemo, useState } from 'react';
import {
  Briefcase,
  TrendingUp,
  Target,
  Sparkles,
  FileText,
  Mail,
  Send,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Copy,
  Download,
  ExternalLink,
  Plus,
  Trash2,
  Search,
  Filter,
  ArrowRight,
  ShieldAlert,
  Sliders,
  DollarSign,
  Building,
  MapPin,
  Clock,
  Compass,
  UserCheck,
  Calendar,
  Zap,
  Code,
  Eye,
  Upload,
  Radar,
} from 'lucide-react';
import {
  parseJobPageContent,
  fetchJobPostingFromUrl,
  detectAtsPlatform,
} from '../../services/careerOps/jobScraperService';
import { useCandidateVaultStore } from '../../store/useCandidateVaultStore';
import { predictInterviewLoop } from '../../services/careerOps/jobInterviewPredictor';
import {
  calculateFollowUpTimeline,
  getNextDueFollowUp,
} from '../../services/careerOps/followUpService';
import {
  openInOverleaf,
  parseLatexForVisualPreview,
} from '../../services/careerOps/overleafPusher';
import {
  exportTailoredResumeToPdf,
  exportCoverLetterToPdf,
  exportApplicationBundleToPdf,
} from '../../services/careerOps/resumePdfExporter';
import { useCareerOpsStore } from '../../store/useCareerOpsStore';
import { detectGhostJobRisk } from '../../services/careerOps/ghostJobDetector';
import { CareerDiscoveryPanel } from './CareerDiscoveryPanel';
import { useAppStore } from '../../store/useAppStore';
import { usePracticeStore } from '../../store/usePracticeStore';
import { ApplicationStatus, JobApplication } from '../../services/careerOps/types';
import { resolveOrMigrateModel, AIProviderId } from '../../services/models/modelRegistry';
import {
  generateBrowserAutoFillScript,
  generateAutoFillBookmarklet,
  generatePlaywrightAutoFillScript,
} from '../../services/careerOps/autoFillService';
import { TodayView } from './TodayView';
import { PipelineView } from './PipelineView';
import { JobDrawerModal } from './JobDrawerModal';
import { NetworkView } from './NetworkView';
import { InboxView } from './InboxView';
import { InterviewsView } from './InterviewsView';
import { InsightsView } from './InsightsView';
import { ControlsView } from './ControlsView';
import { OnboardingFlowModal } from './OnboardingFlowModal';
import { useCareerOpsOnboardingStore } from '../../store/useCareerOpsOnboardingStore';

interface CareerOpsEmptyTabProps {
  tabName: string;
  tagline: string;
  description: string;
  icon: React.ComponentType<{ size?: number | string; color?: string; style?: React.CSSProperties; className?: string }>;
  applications: JobApplication[];
  onSelectJob: (id: string) => void;
  onEvaluateNew: () => void;
  onLoadDemo: () => void;
}

function CareerOpsEmptyTab({
  tabName,
  tagline,
  description,
  icon: Icon,
  applications,
  onSelectJob,
  onEvaluateNew,
  onLoadDemo,
}: CareerOpsEmptyTabProps) {
  return (
    <div
      style={{
        maxWidth: '860px',
        margin: '24px auto',
        padding: '36px 24px',
        background: 'rgba(15, 23, 42, 0.65)',
        borderRadius: '16px',
        border: '1px dashed rgba(249, 115, 22, 0.35)',
        textAlign: 'center',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: '16px',
      }}
    >
      <div
        style={{
          width: 54,
          height: 54,
          borderRadius: 14,
          background: 'rgba(249, 115, 22, 0.15)',
          border: '1px solid rgba(249, 115, 22, 0.35)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: '#fb923c',
        }}
      >
        <Icon size={26} />
      </div>

      <div>
        <h3 style={{ margin: '0 0 6px', fontSize: '18px', fontWeight: 800, color: '#f8fafc' }}>
          {tabName}
        </h3>
        <p style={{ margin: '0 0 8px', fontSize: '12px', fontWeight: 600, color: '#fb923c' }}>
          {tagline}
        </p>
        <p
          style={{
            margin: 0,
            fontSize: '12px',
            color: '#94a3b8',
            maxWidth: '520px',
            lineHeight: 1.6,
          }}
        >
          {description}
        </p>
      </div>

      {applications.length > 0 ? (
        <div style={{ width: '100%', maxWidth: '640px', marginTop: '8px' }}>
          <p
            style={{
              fontSize: '11px',
              fontWeight: 700,
              color: '#cbd5e1',
              marginBottom: '10px',
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
            }}
          >
            Select a target role from your pipeline:
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {applications.map((app) => (
              <div
                key={app.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '10px 14px',
                  borderRadius: '10px',
                  background: 'rgba(255, 255, 255, 0.04)',
                  border: '1px solid rgba(255, 255, 255, 0.08)',
                  textAlign: 'left',
                }}
              >
                <div>
                  <div style={{ fontSize: '13px', fontWeight: 700, color: '#f8fafc' }}>
                    {app.role}
                  </div>
                  <div style={{ fontSize: '11px', color: '#94a3b8' }}>
                    {app.company} • {app.location || 'Remote'}
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  {typeof app.score === 'number' && (
                    <span
                      style={{
                        fontSize: '11px',
                        fontWeight: 800,
                        padding: '2px 8px',
                        borderRadius: '6px',
                        background:
                          app.score >= 4.0 ? 'rgba(34, 197, 94, 0.2)' : 'rgba(239, 68, 68, 0.2)',
                        color: app.score >= 4.0 ? '#4ade80' : '#f87171',
                      }}
                    >
                      ★ {app.score.toFixed(1)} / 5.0
                    </span>
                  )}
                  <button
                    onClick={() => onSelectJob(app.id)}
                    style={{
                      padding: '5px 12px',
                      borderRadius: '6px',
                      background: 'linear-gradient(135deg, #f97316, #ea580c)',
                      color: '#ffffff',
                      border: 'none',
                      fontSize: '11px',
                      fontWeight: 700,
                      cursor: 'pointer',
                    }}
                  >
                    Select Target →
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div
          style={{
            display: 'flex',
            gap: '12px',
            marginTop: '8px',
            flexWrap: 'wrap',
            justifyContent: 'center',
          }}
        >
          <button
            onClick={onLoadDemo}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '8px 16px',
              borderRadius: '8px',
              background: 'linear-gradient(135deg, #f97316, #ea580c)',
              color: '#ffffff',
              border: 'none',
              fontSize: '12px',
              fontWeight: 700,
              cursor: 'pointer',
              boxShadow: '0 4px 12px rgba(249, 115, 22, 0.35)',
            }}
          >
            <Zap size={14} />
            <span>Load Sample Applications</span>
          </button>
          <button
            onClick={onEvaluateNew}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '8px 16px',
              borderRadius: '8px',
              background: 'rgba(255, 255, 255, 0.08)',
              color: '#e2e8f0',
              border: '1px solid rgba(255, 255, 255, 0.15)',
              fontSize: '12px',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            <Plus size={14} />
            <span>+ Evaluate New Job</span>
          </button>
        </div>
      )}
    </div>
  );
}

export function CareerOpsView() {
  const {
    applications,
    sources,
    isDiscovering,
    discoverJobsFromSources,
    activeJobId,
    filterStatus,
    searchQuery,
    isEvaluating,
    isTailoring,
    isDemoMode,
    enableDemoMode,
    clearDemoData,
    stats,
    addJob,
    updateJob,
    deleteJob,
    setActiveJobId,
    setFilterStatus,
    setSearchQuery,
    evaluateJob,
    tailorResumeForJob,
    generateCoverLetterForJob,
    generateOutreachForJob,
  } = useCareerOpsStore();

  const { resumeText, setJobDescriptionText, setTargetRole, setToast, settings } = useAppStore();

  const careerOpsProviderConfig = useMemo(
    () =>
      settings?.aiProvider
        ? {
            type: settings.aiProvider,
            apiKey: settings.apiKey || '',
            model: resolveOrMigrateModel(
              settings.aiProvider as AIProviderId,
              settings.aiModel,
              'llm'
            ).resolvedModel,
          }
        : undefined,
    [settings?.aiProvider, settings?.apiKey, settings?.aiModel]
  );

  const { setActiveView, createCompanyPlan } = usePracticeStore();

  useEffect(() => {
    const scanIfDue = () => {
      const due = sources.some(
        (source) =>
          source.enabled &&
          (!source.lastCheckedAt || Date.now() - source.lastCheckedAt >= 12 * 60 * 60 * 1000)
      );
      if (due && !isDiscovering) {
        void discoverJobsFromSources(resumeText, careerOpsProviderConfig);
      }
    };

    scanIfDue();
    const timer = window.setInterval(scanIfDue, 30 * 60 * 1000);
    return () => window.clearInterval(timer);
  }, [sources, isDiscovering, discoverJobsFromSources, resumeText, careerOpsProviderConfig]);

  // Internal sub-tab state
  const { openOnboarding } = useCareerOpsOnboardingStore();
  const [subTab, setSubTab] = useState<
    'today' | 'pipeline' | 'network' | 'inbox' | 'interviews' | 'insights' | 'controls' | 'discovery' | 'evaluator' | 'tailor' | 'outreach'
  >('today');
  const [copiedField, setCopiedField] = useState<string | null>(null);

  // Job Drawer State
  const [drawerJob, setDrawerJob] = useState<JobApplication | null>(null);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const selectedJobForDrawer = useMemo(() => {
    if (!drawerJob) return null;
    return applications.find((a) => a.id === drawerJob.id) || drawerJob;
  }, [applications, drawerJob]);

  // New Job Input Modal / Form
  const [newCompany, setNewCompany] = useState('');
  const [newRole, setNewRole] = useState('');
  const [newUrl, setNewUrl] = useState('');
  const [newSalary, setNewSalary] = useState('');
  const [newLocation, setNewLocation] = useState('Not specified');
  const [newJdText, setNewJdText] = useState('');
  const [showNewModal, setShowNewModal] = useState(false);
  const [coverAngle, setCoverAngle] = useState<
    'problem_solver' | 'technical_depth' | 'fast_impact' | 'cultural_alignment'
  >('problem_solver');
  const [coverLevel, setCoverLevel] = useState<'senior' | 'mid' | 'entry' | 'career_switcher'>(
    'senior'
  );
  const [showAutoFillModal, setShowAutoFillModal] = useState(false);
  const [autoFillMode, setAutoFillMode] = useState<'console' | 'bookmarklet' | 'playwright'>(
    'console'
  );

  // Candidate Vault Modal
  const [showVaultModal, setShowVaultModal] = useState(false);
  const [vaultSubTab, setVaultSubTab] = useState<
    'personal' | 'work_auth' | 'preferences' | 'pitch'
  >('personal');
  const candidateVault = useCandidateVaultStore((s) => s.profile);
  const updateCandidateVault = useCandidateVaultStore((s) => s.updateProfile);
  const resetCandidateVault = useCandidateVaultStore((s) => s.resetToDefaults);
  const exportCandidateVault = useCandidateVaultStore((s) => s.exportVaultJson);
  const importCandidateVault = useCandidateVaultStore((s) => s.importVaultJson);
  const loadAbhishekProfile = useCandidateVaultStore((s) => s.loadAbhishekProfile);

  // Resume View Mode (Modern Executive Sans as default - No raw LaTeX shown by default)
  const [resumeViewMode, setResumeViewMode] = useState<'modern_sans' | 'classic_serif' | 'code'>('modern_sans');
  const [coverLetterViewMode, setCoverLetterViewMode] = useState<'document' | 'edit'>('document');
  const [activeDocTab, setActiveDocTab] = useState<'resume' | 'cover_letter'>('resume');
  const [isGeneratingAll, setIsGeneratingAll] = useState(false);

  // Job Scraper URL state in Evaluator Modal
  const [scrapeUrlInput, setScrapeUrlInput] = useState('');
  const [detectedAtsInModal, setDetectedAtsInModal] = useState<string | null>(null);
  const [isImportingJob, setIsImportingJob] = useState(false);

  const handleScrapeUrl = async () => {
    if (!scrapeUrlInput.trim()) {
      setToast('Please enter a job posting URL.');
      return;
    }
    const ats = detectAtsPlatform(scrapeUrlInput);
    setDetectedAtsInModal(ats);

    try {
      let parsed;
      if (newJdText.trim()) {
        // Pasted job descriptions are parsed locally and never sent to a remote scraper.
        parsed = parseJobPageContent(newJdText, scrapeUrlInput);
      } else {
        setIsImportingJob(true);
        parsed = await fetchJobPostingFromUrl(scrapeUrlInput);
      }

      setNewCompany(parsed.company);
      setNewRole(parsed.role);
      setNewUrl(parsed.url);
      setNewSalary(parsed.salaryRange || '');
      setNewLocation(parsed.location || 'Not specified');
      if (parsed.jdText) setNewJdText(parsed.jdText);
      setToast(
        `Imported job-page content for ${parsed.company}. Review the extracted details before saving.`
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not import this job posting.';
      setToast(message);
    } finally {
      setIsImportingJob(false);
    }
  };

  const activeJob = applications.find((a) => a.id === activeJobId) || applications[0] || null;

  const handleCopy = async (text: string, fieldName: string) => {
    await copyToClipboard(text);
    setCopiedField(fieldName);
    setToast(`Copied ${fieldName} to clipboard!`);
    setTimeout(() => setCopiedField(null), 2000);
  };

  const handleDownloadTex = (texContent: string, company: string, role: string) => {
    try {
      const element = document.createElement('a');
      const file = new Blob([texContent], { type: 'text/x-tex;charset=utf-8' });
      element.href = URL.createObjectURL(file);
      const cleanComp = (company || 'Company').replace(/[^a-zA-Z0-9]/g, '_');
      const cleanRole = (role || 'Role').replace(/[^a-zA-Z0-9]/g, '_');
      element.download = `${cleanComp}_${cleanRole}_Resume.tex`;
      document.body.appendChild(element);
      element.click();
      document.body.removeChild(element);
      setToast(`Downloaded ${cleanComp}_${cleanRole}_Resume.tex!`);
    } catch (e) {
      console.error('Failed to download .tex file', e);
    }
  };

  const handleDownloadCoverLetter = (letterContent: string, company: string, role: string) => {
    try {
      const element = document.createElement('a');
      const file = new Blob([letterContent], { type: 'text/markdown;charset=utf-8' });
      element.href = URL.createObjectURL(file);
      const cleanComp = (company || 'Company').replace(/[^a-zA-Z0-9]/g, '_');
      const cleanRole = (role || 'Role').replace(/[^a-zA-Z0-9]/g, '_');
      element.download = `${cleanComp}_${cleanRole}_CoverLetter.md`;
      document.body.appendChild(element);
      element.click();
      document.body.removeChild(element);
      setToast(`Downloaded ${cleanComp}_${cleanRole}_CoverLetter.md!`);
    } catch (e) {
      console.error('Failed to download cover letter', e);
    }
  };

  const handleCreateJobAndEvaluate = async () => {
    if (!newCompany.trim() || !newRole.trim()) {
      setToast('Please provide at least a Company name and Role title.');
      return;
    }
    if (!newJdText.trim()) {
      setToast('Add the complete job description before running an evaluation.');
      return;
    }
    if (!resumeText.trim()) {
      setToast('Import or add your resume before evaluating a job.');
      return;
    }

    const id = addJob({
      company: newCompany.trim(),
      role: newRole.trim(),
      url: newUrl.trim(),
      salaryRange: newSalary.trim() || 'Not disclosed',
      location: newLocation.trim(),
      jdText: newJdText.trim(),
      status: 'scouted',
    });

    setShowNewModal(false);
    setNewCompany('');
    setNewRole('');
    setNewUrl('');
    setNewSalary('');
    setNewLocation('Not specified');
    setNewJdText('');

    setToast(`Added ${newRole} at ${newCompany}. Starting CareerOps evaluation...`);
    setSubTab('evaluator');

    const providerConfig = settings?.aiProvider
      ? {
          type: settings.aiProvider,
          apiKey: settings.apiKey || '',
          model: resolveOrMigrateModel(settings.aiProvider as AIProviderId, settings.aiModel, 'llm')
            .resolvedModel,
        }
      : undefined;

    try {
      await evaluateJob(id, resumeText, providerConfig);
      setToast(
        providerConfig?.apiKey
          ? 'AI evaluation completed. Review the evidence and gaps before deciding.'
          : 'Preliminary keyword scan completed. This is not a verified fit assessment.'
      );
    } catch (error) {
      setToast(
        `Job saved, but evaluation failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  };

  const handleRunEvaluation = async (id: string) => {
    const job = applications.find((a) => a.id === id);
    if (!job) return;

    setToast(`Evaluating "${job.role}" against your CV...`);
    const providerConfig = settings?.aiProvider
      ? {
          type: settings.aiProvider,
          apiKey: settings.apiKey || '',
          model: resolveOrMigrateModel(settings.aiProvider as AIProviderId, settings.aiModel, 'llm')
            .resolvedModel,
        }
      : undefined;

    try {
      await evaluateJob(id, resumeText, providerConfig);
      setToast(
        providerConfig?.apiKey
          ? 'AI evaluation completed. Review the evidence and gaps before deciding.'
          : 'Preliminary keyword scan completed. This is not a verified fit assessment.'
      );
    } catch (error) {
      setToast(`Evaluation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  };

  const handleSendToGym = (job: JobApplication) => {
    createCompanyPlan(job.company, job.role, job.jdText, resumeText, 7);
    setActiveView('mock_gym');
    setToast(`Loaded ${job.company} into Mock Practice Gym!`);
  };

  const handleSendToCopilot = (job: JobApplication) => {
    setTargetRole(`${job.role} at ${job.company}`);
    if (job.jdText) setJobDescriptionText(job.jdText);
    setActiveView('teleprompter');
    setToast(`Loaded ${job.role} at ${job.company} into Live Copilot!`);
  };

  const filteredApps = applications.filter((app) => {
    if (filterStatus !== 'all' && app.status !== filterStatus) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      return (
        app.company.toLowerCase().includes(q) ||
        app.role.toLowerCase().includes(q) ||
        (app.notes && app.notes.toLowerCase().includes(q))
      );
    }
    return true;
  });

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        width: '100%',
        background: 'linear-gradient(180deg, #090d16 0%, #030712 100%)',
        color: '#f8fafc',
        overflow: 'hidden',
        fontFamily: 'Inter, system-ui, sans-serif',
      }}
    >
      {/* Top Banner: CareerOps Stats & High-Signal Metric Ribbon */}
      <div
        style={{
          borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
          background: 'rgba(15, 23, 42, 0.65)',
          backdropFilter: 'blur(12px)',
          padding: '8px 16px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '12px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div
            style={{
              width: '32px',
              height: '32px',
              borderRadius: '8px',
              background: 'linear-gradient(135deg, #f97316, #ea580c)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 0 14px rgba(249, 115, 22, 0.45)',
            }}
          >
            <Briefcase size={18} color="#ffffff" />
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span
                style={{
                  fontSize: '14px',
                  fontWeight: 800,
                  letterSpacing: '-0.02em',
                  color: '#ffffff',
                }}
              >
                CareerOps Intelligence
              </span>
              <span
                style={{
                  fontSize: '9px',
                  fontWeight: 800,
                  padding: '2px 6px',
                  borderRadius: '12px',
                  background: 'rgba(249, 115, 22, 0.2)',
                  color: '#fb923c',
                  border: '1px solid rgba(249, 115, 22, 0.4)',
                }}
              >
                LOCAL-FIRST AGENT
              </span>
            </div>
            <p style={{ margin: 0, fontSize: '11px', color: '#94a3b8' }}>
              Apply better to fewer • 1-5 Fit Scoring • ATS Resume & Cover Letter Tailoring
            </p>
          </div>
        </div>

        {/* Quick KPI Stat Badges */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '4px 10px',
              borderRadius: '8px',
              background: 'rgba(255, 255, 255, 0.04)',
              border: '1px solid rgba(255, 255, 255, 0.08)',
              fontSize: '11px',
            }}
          >
            <Target size={13} color="#94a3b8" />
            <span style={{ color: '#94a3b8' }}>Tracked:</span>
            <span style={{ fontWeight: 800, color: '#f8fafc' }}>{stats.totalTracked}</span>
          </div>

          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '4px 10px',
              borderRadius: '8px',
              background: 'rgba(34, 197, 94, 0.1)',
              border: '1px solid rgba(34, 197, 94, 0.3)',
              fontSize: '11px',
            }}
          >
            <span style={{ color: '#4ade80' }}>🔥 High Fit (≥4.0):</span>
            <span style={{ fontWeight: 800, color: '#4ade80' }}>{stats.highFitCount}</span>
          </div>

          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '4px 10px',
              borderRadius: '8px',
              background: 'rgba(99, 102, 241, 0.1)',
              border: '1px solid rgba(99, 102, 241, 0.3)',
              fontSize: '11px',
            }}
          >
            <TrendingUp size={13} color="#818cf8" />
            <span style={{ color: '#818cf8' }}>Avg Fit:</span>
            <span style={{ fontWeight: 800, color: '#c7d2fe' }}>{stats.avgScore} / 5.0</span>
          </div>

          {applications.length === 0 ? (
            <button
              onClick={() => enableDemoMode()}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '5px',
                padding: '5px 12px',
                borderRadius: '8px',
                background: 'rgba(249, 115, 22, 0.15)',
                color: '#fb923c',
                border: '1px solid rgba(249, 115, 22, 0.35)',
                fontSize: '11px',
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              <Zap size={14} />
              <span>Load Demo Data</span>
            </button>
          ) : isDemoMode ? (
            <button
              onClick={() => clearDemoData()}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '5px',
                padding: '4px 10px',
                borderRadius: '8px',
                background: 'rgba(255, 255, 255, 0.05)',
                color: '#94a3b8',
                border: '1px solid rgba(255, 255, 255, 0.12)',
                fontSize: '10px',
                fontWeight: 600,
                cursor: 'pointer',
              }}
              title="Clear demo data to work with your own clean pipeline"
            >
              <span style={{ color: '#fb923c' }}>Demo Mode</span>
              <span style={{ color: '#f87171' }}>✕ Clear</span>
            </button>
          ) : null}

          <button
            onClick={() => setShowVaultModal(true)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '5px',
              padding: '5px 12px',
              borderRadius: '8px',
              background: 'rgba(99, 102, 241, 0.15)',
              color: '#a5b4fc',
              border: '1px solid rgba(99, 102, 241, 0.35)',
              fontSize: '11px',
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            <UserCheck size={14} />
            <span>Candidate Vault</span>
          </button>

          <button
            onClick={() => setShowNewModal(true)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '5px',
              padding: '5px 12px',
              borderRadius: '8px',
              background: 'linear-gradient(135deg, #f97316, #ea580c)',
              color: '#ffffff',
              border: 'none',
              fontSize: '11px',
              fontWeight: 700,
              cursor: 'pointer',
              boxShadow: '0 2px 8px rgba(249, 115, 22, 0.35)',
            }}
          >
            <Plus size={14} />
            <span>Evaluate Job</span>
          </button>
        </div>
      </div>

      {/* Quick Start Welcome Banner if No Applications */}
      {applications.length === 0 && (
        <div
          style={{
            margin: '10px 16px 0',
            padding: '10px 16px',
            borderRadius: '10px',
            background: 'linear-gradient(90deg, rgba(249, 115, 22, 0.12), rgba(79, 70, 229, 0.12))',
            border: '1px solid rgba(249, 115, 22, 0.3)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '10px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Sparkles size={16} color="#fb923c" />
            <span style={{ fontSize: '12px', color: '#f8fafc', fontWeight: 700 }}>
              Quick Start:
            </span>
            <span style={{ fontSize: '12px', color: '#cbd5e1' }}>
              Load sample applications to test A-H fit scoring, ATS LaTeX resume tailoring, and LinkedIn outreach out of the box.
            </span>
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              onClick={() => openOnboarding()}
              style={{
                padding: '5px 12px',
                borderRadius: '6px',
                background: 'linear-gradient(135deg, #6366f1, #3b82f6)',
                color: '#ffffff',
                border: 'none',
                fontSize: '11px',
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              🚀 60s Onboarding
            </button>
            <button
              onClick={() => enableDemoMode()}
              style={{
                padding: '5px 12px',
                borderRadius: '6px',
                background: 'linear-gradient(135deg, #f97316, #ea580c)',
                color: '#ffffff',
                border: 'none',
                fontSize: '11px',
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              ⚡ Load Demo Applications
            </button>
            <button
              onClick={() => setShowNewModal(true)}
              style={{
                padding: '5px 12px',
                borderRadius: '6px',
                background: 'rgba(255, 255, 255, 0.08)',
                color: '#cbd5e1',
                border: '1px solid rgba(255, 255, 255, 0.15)',
                fontSize: '11px',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              + Evaluate a Job
            </button>
          </div>
        </div>
      )}

      {/* Main Workspace Navigation Tabs */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '6px 16px',
          borderBottom: '1px solid rgba(255, 255, 255, 0.06)',
          background: 'rgba(15, 23, 42, 0.4)',
        }}
      >
        <div style={{ display: 'flex', gap: '6px' }}>
          {[
            { id: 'today', label: '☀️ Today' },
            { id: 'pipeline', label: '📋 Pipeline Board', count: applications.length },
            { id: 'network', label: '👥 Network & Assist Queue' },
            { id: 'inbox', label: '📬 Inbox' },
            { id: 'interviews', label: '🎙️ Interviews' },
            { id: 'insights', label: '📊 Insights' },
            { id: 'controls', label: '⚙️ Controls & Privacy' },
            { id: 'discovery', label: '🔎 Job Discovery' },
            {
              id: 'evaluator',
              label: '⚡ A-H Job Evaluator',
              activeBadge: activeJob?.recommendation === 'apply' ? '🟢 4.0+' : 'Evaluator',
            },
            {
              id: 'tailor',
              label: '📝 ATS Resume & Cover Letter',
              activeBadge: activeJob?.tailoredResume ? 'Ready' : undefined,
            },
            { id: 'outreach', label: '🤝 Outreach & Contacto (<= 300 chars)' },
          ].map((tab) => {
            const isActive = subTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setSubTab(tab.id as any)}
                style={{
                  padding: '5px 12px',
                  borderRadius: '6px',
                  fontSize: '11px',
                  fontWeight: 700,
                  cursor: 'pointer',
                  border: isActive ? '1px solid rgba(249, 115, 22, 0.4)' : '1px solid transparent',
                  background: isActive ? 'rgba(249, 115, 22, 0.15)' : 'transparent',
                  color: isActive ? '#fb923c' : '#94a3b8',
                  transition: 'all 0.15s ease',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                }}
              >
                <span>{tab.label}</span>
                {tab.count !== undefined && (
                  <span
                    style={{
                      fontSize: '9px',
                      padding: '1px 5px',
                      borderRadius: '10px',
                      background: 'rgba(255, 255, 255, 0.08)',
                      color: '#cbd5e1',
                    }}
                  >
                    {tab.count}
                  </span>
                )}
                {tab.activeBadge && (
                  <span
                    style={{
                      fontSize: '9px',
                      padding: '1px 5px',
                      borderRadius: '10px',
                      background: 'rgba(34, 197, 94, 0.2)',
                      color: '#4ade80',
                    }}
                  >
                    {tab.activeBadge}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Active Target Job Context Indicator */}
        {activeJob && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '11px' }}>
            <span style={{ color: '#64748b' }}>Active Job:</span>
            <span style={{ fontWeight: 700, color: '#f8fafc' }}>
              {activeJob.role} @ {activeJob.company}
            </span>
            <span
              style={{
                fontSize: '10px',
                fontWeight: 800,
                padding: '1px 6px',
                borderRadius: '6px',
                background:
                  typeof activeJob.score === 'number' && activeJob.score >= 4.0
                    ? 'rgba(34, 197, 94, 0.2)'
                    : 'rgba(148, 163, 184, 0.2)',
                color:
                  typeof activeJob.score === 'number' && activeJob.score >= 4.0
                    ? '#4ade80'
                    : '#94a3b8',
                border:
                  typeof activeJob.score === 'number' && activeJob.score >= 4.0
                    ? '1px solid rgba(34, 197, 94, 0.4)'
                    : '1px solid rgba(148, 163, 184, 0.3)',
              }}
            >
              ★ {typeof activeJob.score === 'number' ? activeJob.score : 'N/A'} / 5.0
            </span>
          </div>
        )}
      </div>

      {/* Main Workspace Content Area */}
      <div style={{ flex: 1, overflow: 'auto', padding: '16px' }}>
        {subTab === 'today' && (
          <TodayView
            onNavigateToTab={(tab) => setSubTab(tab as any)}
            onSelectJob={(job) => {
              setActiveJobId(job.id);
              setDrawerJob(job);
              setIsDrawerOpen(true);
            }}
            onOpenAssistQueue={() => setSubTab('network')}
          />
        )}

        {subTab === 'network' && (
          <NetworkView
            applications={applications}
            onSelectJob={(jobId) => {
              const job = applications.find((a) => a.id === jobId);
              if (job) {
                setDrawerJob(job);
                setIsDrawerOpen(true);
              }
            }}
          />
        )}

        {subTab === 'inbox' && (
          <InboxView
            applications={applications}
            onSelectJob={(job) => {
              setDrawerJob(job);
              setIsDrawerOpen(true);
            }}
          />
        )}

        {subTab === 'interviews' && (
          <InterviewsView
            applications={applications}
            resumeText={resumeText}
            onOpenJobDrawer={(job) => {
              setDrawerJob(job);
              setIsDrawerOpen(true);
            }}
          />
        )}

        {subTab === 'insights' && (
          <InsightsView applications={applications} />
        )}

        {subTab === 'controls' && (
          <ControlsView />
        )}

        {subTab === 'discovery' && (
          <CareerDiscoveryPanel resumeText={resumeText} providerConfig={careerOpsProviderConfig} />
        )}

        {/* TAB 1: PIPELINE BOARD */}
        {subTab === 'pipeline' && (
          <PipelineView
            onSelectJob={(job) => {
              setActiveJobId(job.id);
              setDrawerJob(job);
              setIsDrawerOpen(true);
            }}
            onOpenEvaluator={(job) => {
              setActiveJobId(job.id);
              setDrawerJob(job);
              setIsDrawerOpen(true);
            }}
            onOpenTailor={(job) => {
              setActiveJobId(job.id);
              setDrawerJob(job);
              setIsDrawerOpen(true);
            }}
            onOpenOutreach={(job) => {
              setActiveJobId(job.id);
              setDrawerJob(job);
              setIsDrawerOpen(true);
            }}
            onAddNewJob={() => setShowNewModal(true)}
          />
        )}

        {/* TAB 2: A-H JOB EVALUATOR */}
        {subTab === 'evaluator' &&
          (activeJob ? (
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: '16px',
                maxWidth: '960px',
                margin: '0 auto',
              }}
            >
            {/* Top Score Banner */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '16px 20px',
                borderRadius: '12px',
                background:
                  typeof activeJob.score === 'number' && activeJob.score >= 4.0
                    ? 'linear-gradient(135deg, rgba(34, 197, 94, 0.15), rgba(15, 23, 42, 0.9))'
                    : 'linear-gradient(135deg, rgba(148, 163, 184, 0.1), rgba(15, 23, 42, 0.9))',
                border:
                  typeof activeJob.score === 'number' && activeJob.score >= 4.0
                    ? '1px solid rgba(34, 197, 94, 0.4)'
                    : '1px solid rgba(148, 163, 184, 0.3)',
              }}
            >
              <div>
                <span
                  style={{
                    fontSize: '11px',
                    fontWeight: 800,
                    textTransform: 'uppercase',
                    letterSpacing: '0.05em',
                    color:
                      typeof activeJob.score === 'number' && activeJob.score >= 4.0
                        ? '#4ade80'
                        : '#94a3b8',
                  }}
                >
                  CAREEROPS VERDICT
                </span>
                <h3
                  style={{ margin: '4px 0 0', fontSize: '18px', fontWeight: 800, color: '#f8fafc' }}
                >
                  {activeJob.evaluationReport?.verdictHeadline ||
                    (typeof activeJob.score === 'number'
                      ? activeJob.score >= 4.0
                        ? `🟢 Recommended: Strong Fit (${activeJob.score}/5.0)`
                        : `🔴 Do Not Apply: Low Alignment (${activeJob.score}/5.0)`
                      : '⚪ Pending A-H Evaluation')}
                </h3>
                <p
                  style={{
                    margin: '6px 0 0',
                    fontSize: '12px',
                    color: '#cbd5e1',
                    maxWidth: '640px',
                  }}
                >
                  {activeJob.evaluationReport?.summary ||
                    'Evaluated across core technical stack, systems complexity, and role level alignment.'}
                </p>
              </div>

              <div style={{ textAlign: 'right' }}>
                <div
                  style={{
                    fontSize: '32px',
                    fontWeight: 900,
                    color:
                      typeof activeJob.score === 'number' && activeJob.score >= 4.0
                        ? '#4ade80'
                        : '#94a3b8',
                  }}
                >
                  {typeof activeJob.score === 'number' ? activeJob.score.toFixed(1) : '—'}
                  <span style={{ fontSize: '14px', color: '#94a3b8' }}> / 5.0</span>
                </div>
                <div
                  style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '8px' }}
                >
                  <button
                    onClick={() => handleRunEvaluation(activeJob.id)}
                    disabled={isEvaluating}
                    style={{
                      padding: '5px 12px',
                      borderRadius: '6px',
                      background: 'rgba(255, 255, 255, 0.1)',
                      color: '#ffffff',
                      border: '1px solid rgba(255, 255, 255, 0.2)',
                      fontSize: '11px',
                      fontWeight: 700,
                      cursor: 'pointer',
                    }}
                  >
                    {isEvaluating ? 'Evaluating...' : '↻ Re-Evaluate'}
                  </button>

                  <button
                    onClick={() => {
                      if (activeJob.url && activeJob.url.startsWith('https://')) {
                        window.open(activeJob.url, '_blank', 'noopener,noreferrer');
                        setToast(
                          `Opened ${activeJob.company} application portal. Confirm submission only after you actually submit.`
                        );
                      } else {
                        setToast('A valid HTTPS application URL is required.');
                      }
                    }}
                    style={{
                      padding: '5px 12px',
                      borderRadius: '6px',
                      background:
                        activeJob.status === 'applied'
                          ? 'rgba(34, 197, 94, 0.2)'
                          : 'linear-gradient(135deg, #10b981, #059669)',
                      color: '#ffffff',
                      border: '1px solid rgba(34, 197, 94, 0.4)',
                      fontSize: '11px',
                      fontWeight: 700,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px',
                    }}
                  >
                    <CheckCircle2 size={12} />
                    <span>Open Application Portal</span>
                  </button>
                </div>
              </div>
            </div>

            {/* Work Authorization Alert if present */}
            {activeJob.evaluationReport?.workAuthAlert && (
              <div
                style={{
                  padding: '10px 14px',
                  borderRadius: '8px',
                  background: 'rgba(245, 158, 11, 0.12)',
                  border: '1px solid rgba(245, 158, 11, 0.35)',
                  fontSize: '12px',
                  color: '#fbbf24',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                }}
              >
                <ShieldAlert size={16} />
                <span>{activeJob.evaluationReport.workAuthAlert}</span>
              </div>
            )}

            {/* Ghost Job & Freshness Radar Card */}
            {(() => {
              const ghost = detectGhostJobRisk(
                activeJob.jdText,
                activeJob.createdAt,
                activeJob.location,
                activeJob.salaryRange
              );
              return (
                <div
                  style={{
                    padding: '12px 18px',
                    borderRadius: '12px',
                    background: 'rgba(15, 23, 42, 0.65)',
                    border: `1px solid ${ghost.badgeColor}35`,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    flexWrap: 'wrap',
                    gap: '12px',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <div
                      style={{
                        padding: '8px',
                        borderRadius: '10px',
                        background: `${ghost.badgeColor}20`,
                        color: ghost.badgeColor,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      <Radar size={18} />
                    </div>
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{ fontSize: '13px', fontWeight: 800, color: '#f8fafc' }}>
                          Ghost Job & Requisition Freshness Radar
                        </span>
                        <span
                          style={{
                            fontSize: '10px',
                            fontWeight: 800,
                            padding: '2px 7px',
                            borderRadius: '5px',
                            background: `${ghost.badgeColor}22`,
                            color: ghost.badgeColor,
                            border: `1px solid ${ghost.badgeColor}44`,
                          }}
                        >
                          {ghost.badgeLabel}
                        </span>
                      </div>
                      <p style={{ margin: '3px 0 0', fontSize: '11px', color: '#94a3b8' }}>
                        {ghost.signals.join(' • ')}
                      </p>
                    </div>
                  </div>

                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: '9px', color: '#64748b', fontWeight: 800, letterSpacing: '0.05em' }}>
                      GHOST RISK
                    </div>
                    <div style={{ fontSize: '16px', fontWeight: 900, color: ghost.badgeColor }}>
                      {ghost.ghostRiskScore}%
                    </div>
                  </div>
                </div>
              );
            })()}

            {/* Block B: Weighted Requirements Audit */}
            <div
              style={{
                background: 'rgba(15, 23, 42, 0.65)',
                border: '1px solid rgba(255, 255, 255, 0.08)',
                borderRadius: '12px',
                padding: '16px',
              }}
            >
              <h4
                style={{ margin: '0 0 12px', fontSize: '13px', fontWeight: 800, color: '#f8fafc' }}
              >
                📋 Block B: Weighted Requirements Audit
              </h4>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {(activeJob.evaluationReport?.weightedRequirements || []).map((req, idx) => {
                  const isStrong = req.fit === 'strong';
                  const isPartial = req.fit === 'partial';
                  return (
                    <div
                      key={idx}
                      style={{
                        padding: '10px 12px',
                        borderRadius: '8px',
                        background: 'rgba(255, 255, 255, 0.03)',
                        border: '1px solid rgba(255, 255, 255, 0.06)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: '12px',
                      }}
                    >
                      <div style={{ flex: 1 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <span
                            style={{
                              fontSize: '9px',
                              fontWeight: 800,
                              padding: '1px 5px',
                              borderRadius: '4px',
                              background:
                                req.weight === 'critical'
                                  ? 'rgba(239, 68, 68, 0.2)'
                                  : 'rgba(99, 102, 241, 0.2)',
                              color: req.weight === 'critical' ? '#f87171' : '#a5b4fc',
                              textTransform: 'uppercase',
                            }}
                          >
                            {req.weight}
                          </span>
                          <span style={{ fontSize: '12px', fontWeight: 700, color: '#f1f5f9' }}>
                            {req.requirement}
                          </span>
                        </div>
                        <p style={{ margin: '3px 0 0', fontSize: '11px', color: '#94a3b8' }}>
                          {req.evidence}
                        </p>
                      </div>

                      <span
                        style={{
                          fontSize: '11px',
                          fontWeight: 800,
                          padding: '2px 8px',
                          borderRadius: '6px',
                          background: isStrong
                            ? 'rgba(34, 197, 94, 0.15)'
                            : isPartial
                              ? 'rgba(245, 158, 11, 0.15)'
                              : 'rgba(239, 68, 68, 0.15)',
                          color: isStrong ? '#4ade80' : isPartial ? '#fbbf24' : '#f87171',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {isStrong ? '✓ Strong Fit' : isPartial ? '~ Partial' : '✗ Gap'}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Block C & D: Strategy, Gaps & Compensation */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
                gap: '14px',
              }}
            >
              <div
                style={{
                  background: 'rgba(15, 23, 42, 0.65)',
                  border: '1px solid rgba(255, 255, 255, 0.08)',
                  borderRadius: '12px',
                  padding: '14px',
                }}
              >
                <h4
                  style={{ margin: '0 0 8px', fontSize: '12px', fontWeight: 800, color: '#f8fafc' }}
                >
                  🎯 Strategic Positioning Angle
                </h4>
                <p style={{ margin: 0, fontSize: '12px', color: '#cbd5e1', lineHeight: '1.5' }}>
                  {activeJob.evaluationReport?.strategicAngle ||
                    'Select a verified example from the source resume that maps to the most important job requirement.'}
                </p>
                <div
                  style={{
                    marginTop: '10px',
                    paddingTop: '10px',
                    borderTop: '1px solid rgba(255,255,255,0.06)',
                  }}
                >
                  <span style={{ fontSize: '11px', color: '#94a3b8' }}>Level Strategy: </span>
                  <span style={{ fontSize: '11px', fontWeight: 700, color: '#f1f5f9' }}>
                    {activeJob.evaluationReport?.levelStrategy || 'Seniority not assessed'}
                  </span>
                </div>
              </div>

              <div
                style={{
                  background: 'rgba(15, 23, 42, 0.65)',
                  border: '1px solid rgba(255, 255, 255, 0.08)',
                  borderRadius: '12px',
                  padding: '14px',
                }}
              >
                <h4
                  style={{ margin: '0 0 8px', fontSize: '12px', fontWeight: 800, color: '#f8fafc' }}
                >
                  💰 Compensation Benchmark
                </h4>
                <div style={{ fontSize: '16px', fontWeight: 900, color: '#34d399' }}>
                  {activeJob.evaluationReport?.compensationEstimate?.estimatedRange ||
                    activeJob.salaryRange}
                </div>
                <p style={{ margin: '4px 0 0', fontSize: '11px', color: '#94a3b8' }}>
                  {activeJob.evaluationReport?.compensationEstimate?.analysis ||
                    'No compensation analysis available. Check the employer’s posted range or official compensation information.'}
                </p>
              </div>
            </div>

            {/* Predicted Interview Loop (Mock Gym Bridge) */}
            {(() => {
              const predictedLoop = predictInterviewLoop(
                activeJob.company,
                activeJob.role,
                activeJob.jdText
              );
              return (
                <div
                  style={{
                    background: 'rgba(15, 23, 42, 0.85)',
                    border: '1px solid rgba(99, 102, 241, 0.35)',
                    borderRadius: '12px',
                    padding: '16px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '14px',
                    boxShadow: '0 8px 24px rgba(0, 0, 0, 0.3)',
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      flexWrap: 'wrap',
                      gap: '8px',
                    }}
                  >
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <span style={{ fontSize: '13px', fontWeight: 800, color: '#f8fafc' }}>
                          🎯 Predicted Interview Loop: {activeJob.company}
                        </span>
                        <span
                          style={{
                            fontSize: '9px',
                            fontWeight: 800,
                            padding: '2px 6px',
                            borderRadius: '12px',
                            background: 'rgba(99, 102, 241, 0.2)',
                            color: '#a5b4fc',
                            border: '1px solid rgba(99, 102, 241, 0.4)',
                          }}
                        >
                          {predictedLoop.technicalQuestions.length} TECH +{' '}
                          {predictedLoop.behavioralQuestions.length} STAR
                        </span>
                      </div>
                      <p style={{ margin: '3px 0 0', fontSize: '11px', color: '#94a3b8' }}>
                        {predictedLoop.overview}
                      </p>
                    </div>

                    <button
                      onClick={() => handleSendToGym(activeJob)}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                        padding: '6px 14px',
                        borderRadius: '8px',
                        background: 'linear-gradient(135deg, #6366f1, #4f46e5)',
                        color: '#ffffff',
                        border: 'none',
                        fontSize: '11px',
                        fontWeight: 700,
                        cursor: 'pointer',
                        boxShadow: '0 2px 10px rgba(99, 102, 241, 0.4)',
                      }}
                    >
                      <Zap size={13} />
                      <span>🏋️ Launch Practice in Mock Gym</span>
                    </button>
                  </div>

                  {/* Stage Timeline */}
                  {predictedLoop.stages && predictedLoop.stages.length > 0 && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                      <span style={{ fontSize: '10px', fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                        Predicted Multi-Round Interview Pipeline
                      </span>
                      <div
                        style={{
                          display: 'grid',
                          gridTemplateColumns: `repeat(auto-fit, minmax(160px, 1fr))`,
                          gap: '8px',
                        }}
                      >
                        {predictedLoop.stages.map((stage) => (
                          <div
                            key={stage.stageNumber}
                            style={{
                              padding: '10px',
                              borderRadius: '8px',
                              background: 'rgba(30, 41, 59, 0.6)',
                              border: '1px solid rgba(99, 102, 241, 0.25)',
                              display: 'flex',
                              flexDirection: 'column',
                              gap: '4px',
                            }}
                          >
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                              <span style={{ fontSize: '10px', fontWeight: 800, color: '#818cf8' }}>
                                Round {stage.stageNumber}
                              </span>
                              <span style={{ fontSize: '9px', fontWeight: 700, padding: '1px 5px', borderRadius: '4px', background: 'rgba(255, 255, 255, 0.08)', color: '#cbd5e1' }}>
                                {stage.duration}
                              </span>
                            </div>
                            <span style={{ fontSize: '11px', fontWeight: 700, color: '#f1f5f9' }}>
                              {stage.name}
                            </span>
                            <span style={{ fontSize: '10px', color: '#94a3b8', lineHeight: 1.3 }}>
                              {stage.focus}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Technical Questions */}
                  <div>
                    <h5
                      style={{
                        margin: '0 0 8px',
                        fontSize: '11px',
                        fontWeight: 800,
                        color: '#818cf8',
                        textTransform: 'uppercase',
                        letterSpacing: '0.05em',
                      }}
                    >
                      Technical Architecture & Coding Questions
                    </h5>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      {predictedLoop.technicalQuestions.map((tq) => (
                        <div
                          key={tq.id}
                          style={{
                            padding: '10px 12px',
                            borderRadius: '8px',
                            background: 'rgba(255, 255, 255, 0.03)',
                            border: '1px solid rgba(255, 255, 255, 0.06)',
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '4px',
                          }}
                        >
                          <div
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'space-between',
                              gap: '8px',
                            }}
                          >
                            <span style={{ fontSize: '12px', fontWeight: 700, color: '#f1f5f9' }}>
                              {tq.prompt}
                            </span>
                            <div
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '6px',
                                flexShrink: 0,
                              }}
                            >
                              <span
                                style={{
                                  fontSize: '9px',
                                  fontWeight: 800,
                                  padding: '1px 6px',
                                  borderRadius: '4px',
                                  background:
                                    tq.difficulty === 'Hard'
                                      ? 'rgba(239, 68, 68, 0.2)'
                                      : 'rgba(245, 158, 11, 0.2)',
                                  color: tq.difficulty === 'Hard' ? '#f87171' : '#fbbf24',
                                }}
                              >
                                {tq.difficulty}
                              </span>
                              <button
                                onClick={() => handleCopy(tq.prompt, 'Interview Question')}
                                style={{
                                  padding: '2px 6px',
                                  borderRadius: '4px',
                                  background: 'rgba(255, 255, 255, 0.06)',
                                  color: '#cbd5e1',
                                  border: '1px solid rgba(255, 255, 255, 0.1)',
                                  fontSize: '10px',
                                  cursor: 'pointer',
                                }}
                              >
                                Copy
                              </button>
                            </div>
                          </div>
                          <span style={{ fontSize: '10px', color: '#94a3b8' }}>
                            <strong>Focus:</strong> {tq.companyContext}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Behavioral STAR Questions */}
                  <div>
                    <h5
                      style={{
                        margin: '0 0 8px',
                        fontSize: '11px',
                        fontWeight: 800,
                        color: '#f97316',
                        textTransform: 'uppercase',
                        letterSpacing: '0.05em',
                      }}
                    >
                      Behavioral STAR Culture & Crisis Probes
                    </h5>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      {predictedLoop.behavioralQuestions.map((bq) => (
                        <div
                          key={bq.id}
                          style={{
                            padding: '10px 12px',
                            borderRadius: '8px',
                            background: 'rgba(255, 255, 255, 0.03)',
                            border: '1px solid rgba(255, 255, 255, 0.06)',
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '4px',
                          }}
                        >
                          <div
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'space-between',
                              gap: '8px',
                            }}
                          >
                            <span style={{ fontSize: '12px', fontWeight: 700, color: '#f1f5f9' }}>
                              {bq.prompt}
                            </span>
                            <button
                              onClick={() => handleCopy(bq.prompt, 'Behavioral Question')}
                              style={{
                                padding: '2px 6px',
                                borderRadius: '4px',
                                background: 'rgba(255, 255, 255, 0.06)',
                                color: '#cbd5e1',
                                border: '1px solid rgba(255, 255, 255, 0.1)',
                                fontSize: '10px',
                                cursor: 'pointer',
                                flexShrink: 0,
                              }}
                            >
                              Copy
                            </button>
                          </div>
                          <span style={{ fontSize: '10px', color: '#94a3b8' }}>
                            <strong>Rubric:</strong> {bq.companyContext}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              );
            })()}
          </div>
        ) : (
          <CareerOpsEmptyTab
            tabName="⚡ A-H Job Evaluator"
            tagline="1.0 to 5.0 Precision Fit Scoring & Gap Analysis"
            description="The A-H Evaluator audits candidate match against required tech stacks, compensation thresholds, work authorization, and seniority alignment before you apply."
            icon={Zap}
            applications={applications}
            onSelectJob={(id) => setActiveJobId(id)}
            onEvaluateNew={() => setShowNewModal(true)}
            onLoadDemo={enableDemoMode}
          />
        ))}

        {/* TAB 3: ATS RESUME & COVER LETTER TAILOR */}
        {subTab === 'tailor' &&
          (activeJob ? (
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: '16px',
                maxWidth: '960px',
                margin: '0 auto',
              }}
            >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: '10px',
              }}
            >
              <div>
                <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 800, color: '#f8fafc' }}>
                  ATS Resume & Cover Letter Tailoring Engine
                </h3>
                <p style={{ margin: '2px 0 0', fontSize: '11px', color: '#94a3b8' }}>
                  Sourabh Bajaj (sb2nov) LaTeX ATS standard. Single-page dense layout • 100%
                  compilable in Overleaf/pdflatex • Zero fabrication.
                </p>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                <button
                  onClick={async () => {
                    setIsGeneratingAll(true);
                    const providerConfig = settings?.aiProvider
                      ? {
                          type: settings.aiProvider,
                          apiKey: settings.apiKey || '',
                          model: settings.model,
                        }
                      : undefined;
                    setToast(`🚀 Generating complete application pack for ${activeJob.company}...`);
                    try {
                      await Promise.all([
                        tailorResumeForJob(activeJob.id, resumeText, providerConfig),
                        generateCoverLetterForJob(activeJob.id, resumeText, coverAngle, coverLevel, providerConfig),
                        generateOutreachForJob(activeJob.id, providerConfig),
                      ]);
                      setToast(`🎉 Complete application pack ready for ${activeJob.company}!`);
                    } catch (err) {
                      setToast('Application pack generation completed.');
                    } finally {
                      setIsGeneratingAll(false);
                    }
                  }}
                  disabled={isGeneratingAll || isTailoring}
                  style={{
                    padding: '6px 14px',
                    borderRadius: '8px',
                    background: 'linear-gradient(135deg, #2563eb, #7c3aed)',
                    color: '#ffffff',
                    border: 'none',
                    fontSize: '11px',
                    fontWeight: 800,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    boxShadow: '0 3px 10px rgba(37, 99, 235, 0.4)',
                  }}
                  title="Generate Tailored Resume, Cover Letter, and Outreach notes in 1 click"
                >
                  <Sparkles size={13} />
                  <span>{isGeneratingAll ? 'Generating Pack...' : '🚀 1-Click Application Pack'}</span>
                </button>

                {activeJob.tailoredResume && activeJob.coverLetter && (
                  <button
                    onClick={() => {
                      exportApplicationBundleToPdf(
                        activeJob.tailoredResume!,
                        activeJob.coverLetter!,
                        activeJob.role,
                        activeJob.company,
                        candidateVault,
                        resumeViewMode === 'classic_serif' ? 'classic_serif' : 'modern_sans'
                      );
                      setToast('📦 Downloading complete application bundle (Resume + Cover Letter)...');
                    }}
                    style={{
                      padding: '6px 13px',
                      borderRadius: '8px',
                      background: 'linear-gradient(135deg, #10b981, #059669)',
                      color: '#ffffff',
                      border: 'none',
                      fontSize: '11px',
                      fontWeight: 800,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '5px',
                      boxShadow: '0 3px 10px rgba(16, 185, 129, 0.35)',
                    }}
                    title="Download both Tailored Resume and Cover Letter PDFs in sequence"
                  >
                    <Download size={13} />
                    <span>📦 Download Bundle (Both PDFs)</span>
                  </button>
                )}

                <button
                  onClick={async () => {
                    const providerConfig = settings?.aiProvider
                      ? {
                          type: settings.aiProvider,
                          apiKey: settings.apiKey || '',
                          model: settings.model,
                        }
                      : undefined;
                    setToast('Tailoring resume for ATS scanning...');
                    await tailorResumeForJob(activeJob.id, resumeText, providerConfig);
                    setToast('ATS Resume ready!');
                  }}
                  disabled={isTailoring || isGeneratingAll}
                  style={{
                    padding: '6px 12px',
                    borderRadius: '8px',
                    background: 'rgba(255, 255, 255, 0.08)',
                    color: '#f8fafc',
                    border: '1px solid rgba(255, 255, 255, 0.15)',
                    fontSize: '11px',
                    fontWeight: 700,
                    cursor: 'pointer',
                  }}
                >
                  {isTailoring ? 'Tailoring...' : '⚡ Tailor Resume'}
                </button>

                <button
                  onClick={async () => {
                    const providerConfig = settings?.aiProvider
                      ? {
                          type: settings.aiProvider,
                          apiKey: settings.apiKey || '',
                          model: settings.model,
                        }
                      : undefined;
                    setToast('Drafting 4-paragraph cover letter...');
                    await generateCoverLetterForJob(
                      activeJob.id,
                      resumeText,
                      coverAngle,
                      coverLevel,
                      providerConfig
                    );
                    setToast('Cover Letter drafted!');
                  }}
                  disabled={isGeneratingAll}
                  style={{
                    padding: '6px 12px',
                    borderRadius: '8px',
                    background: 'rgba(255, 255, 255, 0.08)',
                    color: '#f8fafc',
                    border: '1px solid rgba(255, 255, 255, 0.15)',
                    fontSize: '11px',
                    fontWeight: 700,
                    cursor: 'pointer',
                  }}
                >
                  ✍️ Draft Cover Letter
                </button>

                <button
                  onClick={() => setShowAutoFillModal(true)}
                  style={{
                    padding: '6px 12px',
                    borderRadius: '8px',
                    background: 'linear-gradient(135deg, #8b5cf6, #7c3aed)',
                    color: '#ffffff',
                    border: 'none',
                    fontSize: '11px',
                    fontWeight: 700,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '5px',
                    boxShadow: '0 2px 8px rgba(139, 92, 246, 0.35)',
                  }}
                >
                  <Sparkles size={13} />
                  <span>🤖 1-Click Auto-Fill</span>
                </button>

                <button
                  onClick={() => {
                    if (activeJob.url && activeJob.url.startsWith('https://')) {
                      window.open(activeJob.url, '_blank', 'noopener,noreferrer');
                      setToast(
                        `Opened ${activeJob.company} application portal. Mark it applied only after submission.`
                      );
                    } else {
                      setToast('A valid HTTPS application URL is required.');
                    }
                  }}
                  style={{
                    padding: '6px 12px',
                    borderRadius: '8px',
                    background:
                      activeJob.status === 'applied'
                        ? 'rgba(34, 197, 94, 0.2)'
                        : 'linear-gradient(135deg, #10b981, #059669)',
                    color: '#ffffff',
                    border:
                      activeJob.status === 'applied' ? '1px solid rgba(34, 197, 94, 0.5)' : 'none',
                    fontSize: '11px',
                    fontWeight: 700,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '5px',
                  }}
                >
                  <CheckCircle2 size={13} />
                  <span>{activeJob.status === 'applied' ? '✓ Applied' : '🚀 Apply to Job'}</span>
                </button>
              </div>
            </div>

            {/* Quick-Fill Banner if Abhishek profile not yet loaded */}
            {!candidateVault.fullName && (
              <div
                style={{
                  padding: '10px 14px',
                  borderRadius: '10px',
                  background: 'linear-gradient(135deg, rgba(37,99,235,0.15), rgba(6,182,212,0.15))',
                  border: '1px solid rgba(6,182,212,0.3)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: '10px',
                  flexWrap: 'wrap',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Sparkles size={16} color="#38bdf8" />
                  <span style={{ fontSize: '11px', color: '#e0f2fe' }}>
                    <strong>1-Click Quick-Fill:</strong> Load Abhishek Singh&apos;s verified engineering profile (Sheetal Electrotech, Virasat, Porcupine, JNU).
                  </span>
                </div>
                <button
                  onClick={() => {
                    loadAbhishekProfile();
                    setToast("⚡ Loaded Abhishek Singh's verified engineering profile!");
                  }}
                  style={{
                    padding: '5px 12px',
                    borderRadius: '6px',
                    background: '#0284c7',
                    color: '#ffffff',
                    border: 'none',
                    fontSize: '11px',
                    fontWeight: 700,
                    cursor: 'pointer',
                    whiteSpace: 'nowrap',
                  }}
                >
                  ⚡ Load Verified Profile
                </button>
              </div>
            )}

            {/* Cover Letter Blueprint Selectors (Indeed & Intuit Standard) */}
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: '8px',
                background: 'rgba(255, 255, 255, 0.03)',
                padding: '10px 14px',
                borderRadius: '10px',
                border: '1px solid rgba(255, 255, 255, 0.06)',
                fontSize: '11px',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                <span style={{ color: '#94a3b8', fontWeight: 600 }}>Candidate Profile:</span>
                {(
                  [
                    { id: 'senior', label: 'Senior / Staff' },
                    { id: 'mid', label: 'Mid-Level' },
                    { id: 'entry', label: 'Entry / New Grad' },
                    { id: 'career_switcher', label: 'Career Switcher' },
                  ] as const
                ).map((lvl) => (
                  <button
                    key={lvl.id}
                    onClick={() => setCoverLevel(lvl.id)}
                    style={{
                      padding: '2px 8px',
                      borderRadius: '6px',
                      fontSize: '10px',
                      fontWeight: 700,
                      background: coverLevel === lvl.id ? '#06b6d4' : 'rgba(255, 255, 255, 0.05)',
                      color: coverLevel === lvl.id ? '#042f2e' : '#94a3b8',
                      border: 'none',
                      cursor: 'pointer',
                    }}
                  >
                    {lvl.label}
                  </button>
                ))}
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                <span style={{ color: '#94a3b8', fontWeight: 600 }}>Strategy Angle:</span>
                {(
                  [
                    'problem_solver',
                    'technical_depth',
                    'fast_impact',
                    'cultural_alignment',
                  ] as const
                ).map((ang) => (
                  <button
                    key={ang}
                    onClick={() => setCoverAngle(ang)}
                    style={{
                      padding: '2px 8px',
                      borderRadius: '6px',
                      fontSize: '10px',
                      fontWeight: 700,
                      background: coverAngle === ang ? '#f97316' : 'rgba(255, 255, 255, 0.05)',
                      color: coverAngle === ang ? '#ffffff' : '#94a3b8',
                      border: 'none',
                      cursor: 'pointer',
                      textTransform: 'capitalize',
                    }}
                  >
                    {ang.replace('_', ' ')}
                  </button>
                ))}
              </div>
            </div>

            {/* Generated Outputs Display */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
              {/* Tailored Resume Panel */}
              <div
                style={{
                  background: 'rgba(15, 23, 42, 0.7)',
                  border: '1px solid rgba(255, 255, 255, 0.08)',
                  borderRadius: '12px',
                  padding: '14px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '10px',
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    flexWrap: 'wrap',
                    gap: '8px',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span style={{ fontSize: '12px', fontWeight: 800, color: '#f8fafc' }}>
                      📄 Tailored Executive ATS Resume
                    </span>
                    <span
                      style={{
                        padding: '1px 6px',
                        borderRadius: '4px',
                        background: 'rgba(16, 185, 129, 0.15)',
                        border: '1px solid rgba(16, 185, 129, 0.3)',
                        color: '#34d399',
                        fontSize: '9px',
                        fontWeight: 700,
                      }}
                    >
                      1-Page PDF • Ready to Apply
                    </span>
                  </div>

                  {activeJob.tailoredResume && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <button
                        onClick={() =>
                          exportTailoredResumeToPdf(
                            activeJob.tailoredResume!,
                            activeJob.role,
                            activeJob.company,
                            candidateVault,
                            resumeViewMode === 'classic_serif' ? 'classic_serif' : 'modern_sans'
                          )
                        }
                        style={{
                          padding: '4px 10px',
                          borderRadius: '6px',
                          background: 'linear-gradient(135deg, #2563eb, #1d4ed8)',
                          color: '#ffffff',
                          border: 'none',
                          fontSize: '11px',
                          fontWeight: 700,
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '5px',
                          boxShadow: '0 2px 6px rgba(37, 99, 235, 0.35)',
                        }}
                        title="Compile and download high-resolution PDF internally"
                      >
                        <Download size={12} />
                        <span>Download PDF</span>
                      </button>

                      <button
                        onClick={() => {
                          const parsed = parseLatexForVisualPreview(activeJob.tailoredResume!);
                          const cleanText = [
                            `${parsed.name} - ${parsed.role}`,
                            parsed.email,
                            '',
                            ...parsed.sections.flatMap((s) => [s.title.toUpperCase(), ...s.lines, '']),
                          ].join('\n');
                          handleCopy(cleanText, 'Tailored Resume');
                        }}
                        style={{
                          padding: '4px 8px',
                          borderRadius: '6px',
                          background: 'rgba(255, 255, 255, 0.06)',
                          color: '#94a3b8',
                          border: '1px solid rgba(255, 255, 255, 0.12)',
                          fontSize: '10px',
                          fontWeight: 600,
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '4px',
                        }}
                        title="Copy clean formatted resume text (no LaTeX code)"
                      >
                        <Copy size={11} />
                        <span>{copiedField === 'Tailored Resume' ? 'Copied Clean Resume!' : 'Copy Text'}</span>
                      </button>

                      <button
                        onClick={() =>
                          handleDownloadTex(
                            activeJob.tailoredResume!,
                            activeJob.company,
                            activeJob.role
                          )
                        }
                        style={{
                          padding: '3px 6px',
                          borderRadius: '6px',
                          background: 'transparent',
                          color: '#64748b',
                          border: '1px solid rgba(255, 255, 255, 0.08)',
                          fontSize: '9px',
                          fontWeight: 600,
                          cursor: 'pointer',
                        }}
                        title="For LaTeX power users only"
                      >
                        .tex
                      </button>
                    </div>
                  )}
                </div>

                <div
                  style={{
                    padding: '6px 10px',
                    borderRadius: '6px',
                    background: 'rgba(30, 41, 59, 0.5)',
                    border: '1px solid rgba(255, 255, 255, 0.05)',
                    fontSize: '10px',
                    color: '#94a3b8',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                  }}
                >
                  <span>
                    Style: <strong style={{ color: '#f8fafc' }}>{resumeViewMode === 'modern_sans' ? 'Modern Executive (Sans-Serif)' : resumeViewMode === 'classic_serif' ? 'Classic ATS (sb2nov Serif)' : 'Raw LaTeX Code'}</strong>
                  </span>
                  <div style={{ display: 'flex', gap: '4px' }}>
                    <button
                      onClick={() => setResumeViewMode('modern_sans')}
                      style={{
                        padding: '2px 8px',
                        borderRadius: '4px',
                        fontSize: '10px',
                        fontWeight: 700,
                        background:
                          resumeViewMode === 'modern_sans' ? 'rgba(56, 189, 248, 0.25)' : 'transparent',
                        color: resumeViewMode === 'modern_sans' ? '#38bdf8' : '#94a3b8',
                        border: 'none',
                        cursor: 'pointer',
                      }}
                      title="Modern high-density clean sans-serif layout"
                    >
                      ✨ Modern Sans
                    </button>
                    <button
                      onClick={() => setResumeViewMode('classic_serif')}
                      style={{
                        padding: '2px 8px',
                        borderRadius: '4px',
                        fontSize: '10px',
                        fontWeight: 700,
                        background:
                          resumeViewMode === 'classic_serif' ? 'rgba(56, 189, 248, 0.25)' : 'transparent',
                        color: resumeViewMode === 'classic_serif' ? '#38bdf8' : '#94a3b8',
                        border: 'none',
                        cursor: 'pointer',
                      }}
                      title="Classic academic sb2nov serif LaTeX style"
                    >
                      🏛️ Classic ATS Serif
                    </button>
                    <button
                      onClick={() => setResumeViewMode('code')}
                      style={{
                        padding: '2px 8px',
                        borderRadius: '4px',
                        fontSize: '10px',
                        fontWeight: 700,
                        background:
                          resumeViewMode === 'code' ? 'rgba(56, 189, 248, 0.25)' : 'transparent',
                        color: resumeViewMode === 'code' ? '#38bdf8' : '#94a3b8',
                        border: 'none',
                        cursor: 'pointer',
                      }}
                      title="Inspect raw LaTeX source"
                    >
                      Code (.tex)
                    </button>
                  </div>
                </div>

                {resumeViewMode === 'code' ? (
                  <textarea
                    readOnly
                    value={
                      activeJob.tailoredResume ||
                      'Click "Generate Tailored Resume" to create a 100% valid Sourabh Bajaj (sb2nov) LaTeX resume customized for ' +
                        activeJob.company +
                        '. Ready to compile in Overleaf or pdflatex.'
                    }
                    style={{
                      width: '100%',
                      height: '350px',
                      background: 'rgba(0, 0, 0, 0.35)',
                      border: '1px solid rgba(255, 255, 255, 0.06)',
                      borderRadius: '8px',
                      color: '#a5f3fc',
                      fontFamily: 'monospace',
                      fontSize: '11px',
                      padding: '10px',
                      resize: 'none',
                      lineHeight: '1.5',
                    }}
                  />
                ) : (
                  <div
                    style={{
                      width: '100%',
                      maxHeight: '520px',
                      overflowY: 'auto',
                      background: 'rgba(15, 23, 42, 0.4)',
                      border: '1px solid rgba(255, 255, 255, 0.08)',
                      borderRadius: '8px',
                      padding: '16px',
                    }}
                  >
                    {(() => {
                      const parsed = parseLatexForVisualPreview(activeJob.tailoredResume || '');
                      const displayName = candidateVault.fullName || parsed.name;
                      const displayRole = activeJob.role || parsed.role;
                      const isModern = resumeViewMode === 'modern_sans';
                      return (
                        <div
                          style={{
                            background: '#ffffff',
                            color: '#0f172a',
                            borderRadius: '4px',
                            boxShadow: '0 8px 30px rgba(0, 0, 0, 0.35)',
                            padding: '24px 28px',
                            maxWidth: '680px',
                            margin: '0 auto',
                            fontSize: '9pt',
                            lineHeight: 1.35,
                            fontFamily: isModern
                              ? '-apple-system, "Inter", "Segoe UI", Roboto, sans-serif'
                              : '"Times New Roman", Times, Georgia, serif',
                          }}
                        >
                          <div
                            style={{
                              textAlign: 'center',
                              borderBottom: isModern ? 'none' : '1px solid #111111',
                              paddingBottom: '6px',
                              marginBottom: '8px',
                            }}
                          >
                            <h2
                              style={{
                                margin: 0,
                                fontSize: isModern ? '18pt' : '19pt',
                                fontWeight: 800,
                                color: '#0f172a',
                                letterSpacing: isModern ? '-0.2px' : '0.2px',
                                textTransform: isModern ? 'uppercase' : 'none',
                              }}
                            >
                              {displayName}
                            </h2>
                            <div
                              style={{
                                fontSize: '9pt',
                                color: isModern ? '#1e40af' : '#334155',
                                fontWeight: 700,
                                marginTop: '2px',
                                textTransform: isModern ? 'uppercase' : 'none',
                                fontStyle: isModern ? 'normal' : 'italic',
                              }}
                            >
                              {displayRole}
                            </div>
                            <div style={{ fontSize: '8pt', color: '#475569', marginTop: '3px' }}>
                              {[
                                candidateVault.email || parsed.email,
                                candidateVault.phone,
                                candidateVault.location && candidateVault.location !== 'unknown' ? candidateVault.location : null,
                                candidateVault.github ? `GitHub: ${candidateVault.github.replace(/^https?:\/\//, '')}` : null,
                                candidateVault.portfolio ? `Portfolio: ${candidateVault.portfolio.replace(/^https?:\/\//, '')}` : null,
                              ]
                                .filter(Boolean)
                                .join(' | ')}
                            </div>
                          </div>
                          {parsed.sections.map((sec, idx) => {
                            const isSkills = /skills|technologies|proficiencies/i.test(sec.title);
                            return (
                              <div
                                key={idx}
                                style={{ marginBottom: '8px' }}
                              >
                                <div
                                  style={{
                                    fontSize: '8.5pt',
                                    fontWeight: 800,
                                    letterSpacing: '0.6px',
                                    color: '#0f172a',
                                    borderBottom: isModern ? '1.5px solid #0f172a' : '1px solid #111111',
                                    paddingBottom: '1px',
                                    marginBottom: '4px',
                                    textTransform: 'uppercase',
                                  }}
                                >
                                  {sec.title}
                                </div>
                                <div>
                                  {sec.lines.map((line, lIdx) => {
                                    if (line.startsWith('•') || line.startsWith('-')) {
                                      const cleanLine = line.replace(/^[-•]\s*/, '');
                                      return (
                                        <div
                                          key={lIdx}
                                          style={{
                                            fontSize: '8.5pt',
                                            lineHeight: 1.34,
                                            color: '#1e293b',
                                            marginBottom: '2px',
                                            paddingLeft: '14px',
                                            position: 'relative',
                                          }}
                                        >
                                          <span style={{ position: 'absolute', left: 4 }}>•</span>
                                          <span>{cleanLine}</span>
                                        </div>
                                      );
                                    }
                                    if (isSkills && line.includes(':')) {
                                      const [cat, ...rest] = line.split(':');
                                      return (
                                        <div key={lIdx} style={{ fontSize: '8.5pt', marginBottom: '2px' }}>
                                          <strong style={{ color: '#0f172a' }}>{cat.trim()}:</strong>{' '}
                                          <span style={{ color: '#334155' }}>{rest.join(':').trim()}</span>
                                        </div>
                                      );
                                    }
                                    if (line.includes('·') && !line.includes('Present') && !line.includes('202')) {
                                      return (
                                        <div key={lIdx} style={{ fontSize: '8pt', color: '#0284c7', fontWeight: 600, marginBottom: '2px' }}>
                                          {line}
                                        </div>
                                      );
                                    }
                                    if (line.includes('—') || line.includes('|')) {
                                      return (
                                        <div key={lIdx} style={{ fontSize: '8.5pt', fontWeight: 700, color: '#0f172a', marginTop: '3px', marginBottom: '1px' }}>
                                          {line}
                                        </div>
                                      );
                                    }
                                    return (
                                      <div key={lIdx} style={{ fontSize: '8.5pt', color: '#334155', marginBottom: '2px' }}>
                                        {line}
                                      </div>
                                    );
                                  })}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      );
                    })()}
                  </div>
                )}
              </div>

              {/* Cover Letter Panel */}
              <div
                style={{
                  background: 'rgba(15, 23, 42, 0.7)',
                  border: '1px solid rgba(255, 255, 255, 0.08)',
                  borderRadius: '12px',
                  padding: '14px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '10px',
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    flexWrap: 'wrap',
                    gap: '8px',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span style={{ fontSize: '12px', fontWeight: 800, color: '#f8fafc' }}>
                      ✉️ Software Engineer Cover Letter
                    </span>
                    <span
                      style={{
                        padding: '1px 6px',
                        borderRadius: '4px',
                        background: 'rgba(6, 182, 212, 0.15)',
                        border: '1px solid rgba(6, 182, 212, 0.3)',
                        color: '#67e8f9',
                        fontSize: '9px',
                        fontWeight: 700,
                      }}
                    >
                      Indeed & Intuit Standard
                    </span>
                  </div>

                  {activeJob.coverLetter && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <button
                        onClick={() =>
                          exportCoverLetterToPdf(
                            activeJob.coverLetter!,
                            activeJob.company,
                            activeJob.role,
                            candidateVault
                          )
                        }
                        style={{
                          padding: '4px 10px',
                          borderRadius: '6px',
                          background: 'linear-gradient(135deg, #0891b2, #0e7490)',
                          color: '#ffffff',
                          border: 'none',
                          fontSize: '11px',
                          fontWeight: 700,
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '5px',
                          boxShadow: '0 2px 6px rgba(8, 145, 178, 0.35)',
                        }}
                        title="Download executive letterhead Cover Letter as PDF"
                      >
                        <Download size={12} />
                        <span>Download PDF</span>
                      </button>

                      <button
                        onClick={() => handleCopy(activeJob.coverLetter!, 'Cover Letter')}
                        style={{
                          padding: '3px 8px',
                          borderRadius: '6px',
                          background: 'rgba(255, 255, 255, 0.06)',
                          color: '#94a3b8',
                          border: '1px solid rgba(255, 255, 255, 0.12)',
                          fontSize: '10px',
                          fontWeight: 600,
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '4px',
                        }}
                      >
                        <Copy size={11} />
                        <span>{copiedField === 'Cover Letter' ? 'Copied!' : 'Copy Letter'}</span>
                      </button>

                      <button
                        onClick={() =>
                          handleDownloadCoverLetter(
                            activeJob.coverLetter!,
                            activeJob.company,
                            activeJob.role
                          )
                        }
                        style={{
                          padding: '3px 6px',
                          borderRadius: '6px',
                          background: 'transparent',
                          color: '#64748b',
                          border: '1px solid rgba(255, 255, 255, 0.08)',
                          fontSize: '9px',
                          fontWeight: 600,
                          cursor: 'pointer',
                        }}
                        title="Download Markdown source"
                      >
                        .md
                      </button>
                    </div>
                  )}
                </div>

                <div
                  style={{
                    padding: '6px 10px',
                    borderRadius: '6px',
                    background: 'rgba(30, 41, 59, 0.5)',
                    border: '1px solid rgba(255, 255, 255, 0.05)',
                    fontSize: '10px',
                    color: '#94a3b8',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                  }}
                >
                  <span>
                    Standard: <strong>Indeed & Intuit Blueprint</strong> • 4-Paragraph Peer Voice
                  </span>
                  <div style={{ display: 'flex', gap: '4px' }}>
                    <button
                      onClick={() => setCoverLetterViewMode('document')}
                      style={{
                        padding: '2px 8px',
                        borderRadius: '4px',
                        fontSize: '10px',
                        fontWeight: 700,
                        background:
                          coverLetterViewMode === 'document' ? 'rgba(6, 182, 212, 0.25)' : 'transparent',
                        color: coverLetterViewMode === 'document' ? '#67e8f9' : '#94a3b8',
                        border: 'none',
                        cursor: 'pointer',
                      }}
                    >
                      📄 Letterhead View
                    </button>
                    <button
                      onClick={() => setCoverLetterViewMode('edit')}
                      style={{
                        padding: '2px 8px',
                        borderRadius: '4px',
                        fontSize: '10px',
                        fontWeight: 700,
                        background:
                          coverLetterViewMode === 'edit' ? 'rgba(6, 182, 212, 0.25)' : 'transparent',
                        color: coverLetterViewMode === 'edit' ? '#67e8f9' : '#94a3b8',
                        border: 'none',
                        cursor: 'pointer',
                      }}
                    >
                      📝 Edit Text
                    </button>
                  </div>
                </div>

                {coverLetterViewMode === 'edit' ? (
                  <textarea
                    value={activeJob.coverLetter || ''}
                    onChange={(e) => {
                      updateJob(activeJob.id, { coverLetter: e.target.value });
                    }}
                    placeholder="Click 'Draft Cover Letter' to generate a 4-paragraph software engineering cover letter tailored for this company."
                    style={{
                      width: '100%',
                      height: '520px',
                      background: 'rgba(0, 0, 0, 0.35)',
                      border: '1px solid rgba(255, 255, 255, 0.06)',
                      borderRadius: '8px',
                      color: '#e2e8f0',
                      fontFamily: 'Inter, system-ui, sans-serif',
                      fontSize: '11px',
                      padding: '12px',
                      resize: 'none',
                      lineHeight: '1.6',
                    }}
                  />
                ) : (
                  <div
                    style={{
                      width: '100%',
                      maxHeight: '520px',
                      overflowY: 'auto',
                      background: 'rgba(15, 23, 42, 0.4)',
                      border: '1px solid rgba(255, 255, 255, 0.08)',
                      borderRadius: '8px',
                      padding: '16px',
                    }}
                  >
                    {activeJob.coverLetter ? (
                      <div
                        style={{
                          background: '#ffffff',
                          color: '#1e293b',
                          borderRadius: '4px',
                          boxShadow: '0 8px 30px rgba(0, 0, 0, 0.35)',
                          padding: '24px 28px',
                          maxWidth: '680px',
                          margin: '0 auto',
                          fontSize: '9.5pt',
                          lineHeight: 1.5,
                          fontFamily: '-apple-system, "Inter", "Segoe UI", Roboto, sans-serif',
                        }}
                      >
                        <div style={{ borderBottom: '1.5px solid #cbd5e1', paddingBottom: '10px', marginBottom: '14px' }}>
                          <div style={{ fontSize: '17pt', fontWeight: 800, color: '#0f172a' }}>
                            {candidateVault.fullName || 'Abhishek Singh'}
                          </div>
                          <div style={{ fontSize: '8.5pt', fontWeight: 700, color: '#1e40af', marginTop: '2px', textTransform: 'uppercase' }}>
                            APPLICATION — {activeJob.role.toUpperCase()}, {activeJob.company.toUpperCase()}
                          </div>
                          <div style={{ fontSize: '8pt', color: '#64748b', marginTop: '4px' }}>
                            {[candidateVault.email, candidateVault.phone, candidateVault.location && candidateVault.location !== 'unknown' ? candidateVault.location : null].filter(Boolean).join(' | ')}
                          </div>
                        </div>

                        <div style={{ fontSize: '8.5pt', color: '#64748b', marginBottom: '10px' }}>
                          {new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
                        </div>

                        <div style={{ fontSize: '9pt', color: '#334155', lineHeight: 1.4, marginBottom: '12px' }}>
                          <strong style={{ color: '#0f172a' }}>Engineering Hiring Team</strong><br />
                          {activeJob.company}<br />
                        </div>

                        <div style={{ fontWeight: 700, color: '#0f172a', marginBottom: '10px', fontSize: '9.5pt' }}>
                          RE: Application for {activeJob.role}
                        </div>

                        {activeJob.coverLetter
                          .split(/\n\s*\n/)
                          .map((p, pIdx) => (
                            <p key={pIdx} style={{ marginBottom: '10px', textAlign: 'justify', color: '#1e293b' }}>
                              {p}
                            </p>
                          ))}

                        <div style={{ marginTop: '16px', fontSize: '9.5pt', color: '#1e293b' }}>
                          Sincerely,<br />
                          <strong style={{ color: '#0f172a' }}>{candidateVault.fullName || 'Abhishek Singh'}</strong>
                        </div>
                      </div>
                    ) : (
                      <div style={{ textAlign: 'center', padding: '40px 20px', color: '#94a3b8', fontSize: '11px' }}>
                        Click &quot;Draft Cover Letter&quot; or &quot;🚀 1-Click Application Pack&quot; to generate an executive letterhead cover letter.
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        ) : (
          <CareerOpsEmptyTab
            tabName="📝 ATS Resume & Cover Letter Engine"
            tagline="LaTeX (sb2nov) ATS-Compliant Tailoring • Zero Fabrication"
            description="Generates a customized, high-density single-page resume and targeted cover letter mathematically aligned with the target role."
            icon={FileText}
            applications={applications}
            onSelectJob={(id) => setActiveJobId(id)}
            onEvaluateNew={() => setShowNewModal(true)}
            onLoadDemo={enableDemoMode}
          />
        ))}

        {/* TAB 4: OUTREACH & CONTACTO */}
        {subTab === 'outreach' &&
          (activeJob ? (
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: '16px',
                maxWidth: '860px',
                margin: '0 auto',
              }}
            >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 800, color: '#f8fafc' }}>
                  Outreach & Contact Discovery (Contacto)
                </h3>
                <p style={{ margin: '2px 0 0', fontSize: '11px', color: '#94a3b8' }}>
                  Draft high-conversion DMs under the 300-character LinkedIn limit and formal
                  application emails.
                </p>
              </div>

              <button
                onClick={async () => {
                  setToast('Drafting outreach messages...');
                  await generateOutreachForJob(activeJob.id);
                  setToast('Outreach notes generated!');
                }}
                style={{
                  padding: '6px 12px',
                  borderRadius: '8px',
                  background: 'linear-gradient(135deg, #f97316, #ea580c)',
                  color: '#ffffff',
                  border: 'none',
                  fontSize: '11px',
                  fontWeight: 700,
                  cursor: 'pointer',
                }}
              >
                ⚡ Draft Contact Notes
              </button>
            </div>

            {/* Automated Follow-Up Cadence & Timeline Engine */}
            {(() => {
              const appliedTimestamp = activeJob.appliedAt;
              if (!appliedTimestamp || !['applied', 'interviewing'].includes(activeJob.status)) {
                return (
                  <div
                    style={{
                      padding: '14px',
                      borderRadius: '10px',
                      background: 'rgba(15, 23, 42, 0.65)',
                      border: '1px solid rgba(255,255,255,0.08)',
                      color: '#94a3b8',
                      fontSize: '11px',
                    }}
                  >
                    Follow-up reminders start after you confirm that the application was submitted.
                    Update this job’s status to Applied in the pipeline to start the Day 3 / 7 / 14
                    cadence.
                  </div>
                );
              }
              const timeline = calculateFollowUpTimeline(
                appliedTimestamp,
                activeJob.company,
                activeJob.role,
                activeJob.evaluationReport?.strategicAngle
              );
              return (
                <div
                  style={{
                    background: 'rgba(15, 23, 42, 0.8)',
                    border: '1px solid rgba(249, 115, 22, 0.3)',
                    borderRadius: '12px',
                    padding: '16px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '12px',
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <Calendar size={15} color="#fb923c" />
                      <span style={{ fontSize: '13px', fontWeight: 800, color: '#f8fafc' }}>
                        Automated Follow-Up Cadence (Day 3 • Day 7 • Day 14)
                      </span>
                    </div>
                    <span style={{ fontSize: '10px', color: '#94a3b8' }}>
                      Optimal conversion timing (Recruiter → Hiring Manager → Email)
                    </span>
                  </div>

                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
                      gap: '10px',
                    }}
                  >
                    {timeline.map((m) => (
                      <div
                        key={m.dayOffset}
                        style={{
                          padding: '12px',
                          borderRadius: '8px',
                          background: 'rgba(255, 255, 255, 0.03)',
                          border: m.isDue
                            ? '1px solid rgba(249, 115, 22, 0.5)'
                            : '1px solid rgba(255, 255, 255, 0.06)',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: '8px',
                        }}
                      >
                        <div
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                          }}
                        >
                          <span style={{ fontSize: '11px', fontWeight: 800, color: '#f1f5f9' }}>
                            {m.title}
                          </span>
                          <span
                            style={{
                              fontSize: '9px',
                              fontWeight: 800,
                              padding: '1px 5px',
                              borderRadius: '4px',
                              background: m.isDue
                                ? 'rgba(249, 115, 22, 0.25)'
                                : m.isOverdue
                                  ? 'rgba(239, 68, 68, 0.2)'
                                  : 'rgba(255, 255, 255, 0.06)',
                              color: m.isDue ? '#fb923c' : m.isOverdue ? '#f87171' : '#94a3b8',
                            }}
                          >
                            {m.isDue
                              ? '🔥 Due Now'
                              : m.isOverdue
                                ? '⚠️ Overdue'
                                : `In ${m.daysRemaining}d`}
                          </span>
                        </div>
                        <div style={{ fontSize: '10px', color: '#94a3b8' }}>
                          Channel:{' '}
                          <strong style={{ color: '#e2e8f0' }}>
                            {m.channel === 'linkedin' ? 'LinkedIn DM' : 'Email'}
                          </strong>{' '}
                          • {m.draftText.length} chars
                        </div>
                        <p
                          style={{
                            margin: 0,
                            fontSize: '10px',
                            color: '#cbd5e1',
                            fontStyle: 'italic',
                            maxHeight: '60px',
                            overflowY: 'auto',
                          }}
                        >
                          "{m.draftText}"
                        </p>
                        <button
                          onClick={() => handleCopy(m.draftText, `${m.title} Draft`)}
                          style={{
                            padding: '4px 8px',
                            borderRadius: '6px',
                            background: m.isDue
                              ? 'rgba(249, 115, 22, 0.2)'
                              : 'rgba(255, 255, 255, 0.05)',
                            color: m.isDue ? '#fb923c' : '#cbd5e1',
                            border: '1px solid rgba(255, 255, 255, 0.1)',
                            fontSize: '10px',
                            fontWeight: 700,
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: '4px',
                          }}
                        >
                          <Copy size={11} />
                          <span>Copy Follow-Up Draft</span>
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })()}

            {/* Generated Notes or Default View */}
            <div
              style={{
                background: 'rgba(15, 23, 42, 0.7)',
                border: '1px solid rgba(255, 255, 255, 0.08)',
                borderRadius: '12px',
                padding: '16px',
                display: 'flex',
                flexDirection: 'column',
                gap: '12px',
              }}
            >
              <div
                style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}
              >
                <span style={{ fontSize: '12px', fontWeight: 800, color: '#f8fafc' }}>
                  📬 Ready-to-Send Outreach Drafts
                </span>
                {activeJob.outreachNote && (
                  <button
                    onClick={() => handleCopy(activeJob.outreachNote!, 'Outreach Notes')}
                    style={{
                      padding: '3px 8px',
                      borderRadius: '6px',
                      background: 'rgba(255, 255, 255, 0.06)',
                      color: '#94a3b8',
                      border: '1px solid rgba(255, 255, 255, 0.12)',
                      fontSize: '10px',
                      fontWeight: 600,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px',
                    }}
                  >
                    <Copy size={11} />
                    <span>{copiedField === 'Outreach Notes' ? 'Copied!' : 'Copy All Drafts'}</span>
                  </button>
                )}
              </div>

              <textarea
                readOnly
                value={
                  activeJob.outreachNote ||
                  `=== LINKEDIN RECRUITER (<= 300 chars) ===\nHi! I saw the ${activeJob.role} opening at ${activeJob.company} and submitted my application. With background in distributed systems and high-throughput pipelines, I'd love to connect and follow your team's updates. Thanks!\n\n=== LINKEDIN HIRING MANAGER (<= 300 chars) ===\nHi! Noticed you're leading engineering for ${activeJob.role} at ${activeJob.company}. Having architected equivalent resilient backend services, I just applied and would love to follow your team's roadmap. Best regards!\n\n=== COLD APPLICATION EMAIL DRAFT ===\nSubject: Application: ${activeJob.role} — Production Systems Experience\n\nHi ${activeJob.company} Engineering Team,\n\nI recently applied for the ${activeJob.role} position on your careers portal. Given your team's focus on high-throughput reliability, I wanted to share a brief note highlighting relevant experience.\n\nMy resume and portfolio are attached. I would welcome the opportunity to connect for a brief introductory conversation.\n\nBest regards,\nCandidate`
                }
                style={{
                  width: '100%',
                  height: '320px',
                  background: 'rgba(0, 0, 0, 0.35)',
                  border: '1px solid rgba(255, 255, 255, 0.06)',
                  borderRadius: '8px',
                  color: '#e2e8f0',
                  fontFamily: 'monospace',
                  fontSize: '11px',
                  padding: '10px',
                  resize: 'none',
                  lineHeight: '1.6',
                }}
              />
            </div>
          </div>
        ) : (
          <CareerOpsEmptyTab
            tabName="🤝 Outreach & Contact Discovery (Contacto)"
            tagline="Compliant <=300 Character Cold Messages & Email Drafts"
            description="Identifies engineering managers and recruiters for your target role and drafts high-conversion, strictly grounded introductory notes."
            icon={Mail}
            applications={applications}
            onSelectJob={(id) => setActiveJobId(id)}
            onEvaluateNew={() => setShowNewModal(true)}
            onLoadDemo={enableDemoMode}
          />
        ))}
      </div>

      {/* New Job Evaluation Modal */}
      {showNewModal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0, 0, 0, 0.75)',
            backdropFilter: 'blur(8px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 9999,
            padding: '16px',
          }}
        >
          <div
            style={{
              width: '100%',
              maxWidth: '560px',
              background: '#0f172a',
              border: '1px solid rgba(249, 115, 22, 0.4)',
              borderRadius: '14px',
              padding: '20px',
              display: 'flex',
              flexDirection: 'column',
              gap: '12px',
              boxShadow: '0 20px 40px rgba(0, 0, 0, 0.6)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Briefcase size={18} color="#f97316" />
                <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 800, color: '#f8fafc' }}>
                  Evaluate New Job with CareerOps
                </h3>
              </div>
              <button
                onClick={() => setShowNewModal(false)}
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: '#64748b',
                  cursor: 'pointer',
                }}
              >
                ✕
              </button>
            </div>

            <p style={{ margin: 0, fontSize: '11px', color: '#94a3b8' }}>
              Paste a job description or portal link. CareerOps scores it 1.0 to 5.0 against your
              active CV and tells you whether to apply.
            </p>

            {/* 1-Click Job URL Importer */}
            <div
              style={{
                background: 'rgba(249, 115, 22, 0.08)',
                border: '1px solid rgba(249, 115, 22, 0.3)',
                borderRadius: '8px',
                padding: '10px',
                display: 'flex',
                flexDirection: 'column',
                gap: '6px',
              }}
            >
              <div
                style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}
              >
                <span
                  style={{
                    fontSize: '11px',
                    fontWeight: 700,
                    color: '#fb923c',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                  }}
                >
                  <Sparkles size={13} /> 1-Click Job URL Importer (Greenhouse, Lever, Workday,
                  Ashby)
                </span>
                {detectedAtsInModal && (
                  <span
                    style={{
                      fontSize: '9px',
                      fontWeight: 800,
                      padding: '1px 5px',
                      borderRadius: '4px',
                      background: 'rgba(249, 115, 22, 0.2)',
                      color: '#fb923c',
                    }}
                  >
                    {detectedAtsInModal.toUpperCase()} DETECTED
                  </span>
                )}
              </div>
              <div style={{ display: 'flex', gap: '6px' }}>
                <input
                  type="url"
                  placeholder="Paste URL (e.g. boards.greenhouse.io/datadog/jobs/12345)"
                  value={scrapeUrlInput}
                  onChange={(e) => {
                    setScrapeUrlInput(e.target.value);
                    if (e.target.value.includes('http')) {
                      setDetectedAtsInModal(detectAtsPlatform(e.target.value));
                    }
                  }}
                  style={{
                    flex: 1,
                    padding: '6px 10px',
                    borderRadius: '6px',
                    background: 'rgba(0, 0, 0, 0.3)',
                    border: '1px solid rgba(255, 255, 255, 0.15)',
                    color: '#ffffff',
                    fontSize: '11px',
                    outline: 'none',
                  }}
                />
                <button
                  type="button"
                  onClick={handleScrapeUrl}
                  disabled={isImportingJob}
                  style={{
                    padding: '6px 12px',
                    borderRadius: '6px',
                    background: 'linear-gradient(135deg, #f97316, #ea580c)',
                    color: '#ffffff',
                    border: 'none',
                    fontSize: '11px',
                    fontWeight: 700,
                    cursor: 'pointer',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {isImportingJob ? 'Fetching page…' : 'Fetch & Extract'}
                </button>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
              <div>
                <label
                  style={{
                    fontSize: '10px',
                    fontWeight: 700,
                    color: '#94a3b8',
                    textTransform: 'uppercase',
                  }}
                >
                  Company Name *
                </label>
                <input
                  type="text"
                  placeholder="e.g. Anthropic, Stripe, Alignerr"
                  value={newCompany}
                  onChange={(e) => setNewCompany(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '8px 10px',
                    borderRadius: '6px',
                    background: 'rgba(255, 255, 255, 0.05)',
                    border: '1px solid rgba(255, 255, 255, 0.1)',
                    color: '#ffffff',
                    fontSize: '12px',
                    marginTop: '4px',
                    outline: 'none',
                  }}
                />
              </div>

              <div>
                <label
                  style={{
                    fontSize: '10px',
                    fontWeight: 700,
                    color: '#94a3b8',
                    textTransform: 'uppercase',
                  }}
                >
                  Role Title *
                </label>
                <input
                  type="text"
                  placeholder="e.g. Senior Software Engineer"
                  value={newRole}
                  onChange={(e) => setNewRole(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '8px 10px',
                    borderRadius: '6px',
                    background: 'rgba(255, 255, 255, 0.05)',
                    border: '1px solid rgba(255, 255, 255, 0.1)',
                    color: '#ffffff',
                    fontSize: '12px',
                    marginTop: '4px',
                    outline: 'none',
                  }}
                />
              </div>
            </div>

            <div>
              <label
                style={{
                  fontSize: '10px',
                  fontWeight: 700,
                  color: '#94a3b8',
                  textTransform: 'uppercase',
                }}
              >
                Job Description (Paste Text or URL)
              </label>
              <textarea
                placeholder="Paste the full job requirements, tech stack, and responsibilities here..."
                value={newJdText}
                onChange={(e) => setNewJdText(e.target.value)}
                style={{
                  width: '100%',
                  height: '140px',
                  padding: '8px 10px',
                  borderRadius: '6px',
                  background: 'rgba(255, 255, 255, 0.05)',
                  border: '1px solid rgba(255, 255, 255, 0.1)',
                  color: '#ffffff',
                  fontSize: '11px',
                  marginTop: '4px',
                  resize: 'none',
                  outline: 'none',
                  lineHeight: '1.4',
                }}
              />
            </div>

            <div
              style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '6px' }}
            >
              <button
                onClick={() => setShowNewModal(false)}
                style={{
                  padding: '6px 12px',
                  borderRadius: '6px',
                  background: 'transparent',
                  color: '#94a3b8',
                  border: 'none',
                  fontSize: '11px',
                  cursor: 'pointer',
                }}
              >
                Cancel
              </button>

              <button
                onClick={handleCreateJobAndEvaluate}
                style={{
                  padding: '6px 14px',
                  borderRadius: '6px',
                  background: 'linear-gradient(135deg, #f97316, #ea580c)',
                  color: '#ffffff',
                  border: 'none',
                  fontSize: '11px',
                  fontWeight: 700,
                  cursor: 'pointer',
                  boxShadow: '0 2px 8px rgba(249, 115, 22, 0.4)',
                }}
              >
                Evaluate & Score
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 1-Click ATS Application Auto-Fill Modal */}
      {showAutoFillModal && activeJob && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0, 0, 0, 0.75)',
            backdropFilter: 'blur(8px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 9999,
            padding: '16px',
          }}
        >
          <div
            style={{
              width: '100%',
              maxWidth: '680px',
              background: '#0f172a',
              border: '1px solid rgba(139, 92, 246, 0.5)',
              borderRadius: '14px',
              padding: '20px',
              display: 'flex',
              flexDirection: 'column',
              gap: '12px',
              boxShadow: '0 20px 40px rgba(0, 0, 0, 0.7)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Sparkles size={18} color="#a78bfa" />
                <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 800, color: '#f8fafc' }}>
                  1-Click ATS Application Auto-Fill
                </h3>
              </div>
              <button
                onClick={() => setShowAutoFillModal(false)}
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: '#64748b',
                  cursor: 'pointer',
                  fontSize: '14px',
                }}
              >
                ✕
              </button>
            </div>

            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: '8px',
              }}
            >
              <p style={{ margin: 0, fontSize: '11px', color: '#94a3b8' }}>
                Instantly fills out application forms on <strong>Greenhouse</strong>,{' '}
                <strong>Lever</strong>, <strong>Workday</strong>, and <strong>Ashby</strong>. Uses
                native value setter overrides so React/Vue controlled inputs never get wiped.
              </p>
              <button
                onClick={() => {
                  setShowAutoFillModal(false);
                  setShowVaultModal(true);
                }}
                style={{
                  padding: '3px 8px',
                  borderRadius: '6px',
                  background: 'rgba(99, 102, 241, 0.15)',
                  color: '#a5b4fc',
                  border: '1px solid rgba(99, 102, 241, 0.35)',
                  fontSize: '10px',
                  fontWeight: 700,
                  cursor: 'pointer',
                }}
              >
                👤 Edit Profile in Candidate Vault
              </button>
            </div>

            {/* Mode Selector */}
            <div
              style={{
                display: 'flex',
                gap: '8px',
                borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
                paddingBottom: '8px',
              }}
            >
              {(
                [
                  { id: 'console', label: '⚡ Browser Console Script (Instant)' },
                  { id: 'bookmarklet', label: '🔖 1-Click Bookmarklet' },
                  { id: 'playwright', label: '🎭 Playwright Automation' },
                ] as const
              ).map((m) => (
                <button
                  key={m.id}
                  onClick={() => setAutoFillMode(m.id)}
                  style={{
                    padding: '4px 10px',
                    borderRadius: '6px',
                    fontSize: '11px',
                    fontWeight: 700,
                    background:
                      autoFillMode === m.id
                        ? 'rgba(139, 92, 246, 0.25)'
                        : 'rgba(255, 255, 255, 0.05)',
                    color: autoFillMode === m.id ? '#c4b5fd' : '#94a3b8',
                    border: autoFillMode === m.id ? '1px solid rgba(139, 92, 246, 0.5)' : 'none',
                    cursor: 'pointer',
                  }}
                >
                  {m.label}
                </button>
              ))}
            </div>

            {/* Mode Content */}
            {autoFillMode === 'console' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <div style={{ fontSize: '11px', color: '#cbd5e1' }}>
                  <strong>How to use:</strong> Open the job portal page in Chrome/Safari/Brave,
                  press{' '}
                  <kbd style={{ background: '#334155', padding: '2px 4px', borderRadius: '4px' }}>
                    Cmd+Option+J
                  </kbd>{' '}
                  (or{' '}
                  <kbd style={{ background: '#334155', padding: '2px 4px', borderRadius: '4px' }}>
                    F12
                  </kbd>{' '}
                  → Console), paste and hit Enter!
                </div>
                <textarea
                  readOnly
                  value={generateBrowserAutoFillScript(
                    candidateVault,
                    activeJob.coverLetter || '',
                    activeJob.tailoredResume || ''
                  )}
                  style={{
                    width: '100%',
                    height: '200px',
                    background: 'rgba(0, 0, 0, 0.4)',
                    border: '1px solid rgba(255, 255, 255, 0.08)',
                    borderRadius: '8px',
                    color: '#c4b5fd',
                    fontFamily: 'monospace',
                    fontSize: '10px',
                    padding: '8px',
                    resize: 'none',
                    lineHeight: '1.4',
                  }}
                />
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'flex-end',
                    gap: '8px',
                  }}
                >
                  <button
                    onClick={() =>
                      handleCopy(
                        generateBrowserAutoFillScript(
                          candidateVault,
                          activeJob.coverLetter || '',
                          activeJob.tailoredResume || ''
                        ),
                        'Auto-Fill Script'
                      )
                    }
                    style={{
                      padding: '6px 12px',
                      borderRadius: '8px',
                      background: 'rgba(255, 255, 255, 0.08)',
                      color: '#ffffff',
                      border: '1px solid rgba(255, 255, 255, 0.15)',
                      fontSize: '11px',
                      fontWeight: 600,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px',
                    }}
                  >
                    <Copy size={12} />
                    <span>
                      {copiedField === 'Auto-Fill Script' ? 'Copied!' : 'Copy Console Script'}
                    </span>
                  </button>

                  {activeJob.url && activeJob.url.startsWith('http') && (
                    <button
                      onClick={() => {
                        handleCopy(
                          generateBrowserAutoFillScript(
                            candidateVault,
                            activeJob.coverLetter || '',
                            activeJob.tailoredResume || ''
                          ),
                          'Auto-Fill Script'
                        );
                        window.open(activeJob.url, '_blank');
                        setToast(
                          `Opening ${activeJob.company} portal! Script copied — paste in Console (F12) to auto-fill.`
                        );
                      }}
                      style={{
                        padding: '6px 12px',
                        borderRadius: '8px',
                        background: 'linear-gradient(135deg, #10b981, #059669)',
                        color: '#ffffff',
                        border: 'none',
                        fontSize: '11px',
                        fontWeight: 700,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '4px',
                      }}
                    >
                      <ExternalLink size={12} />
                      <span>Launch Portal & Copy Script</span>
                    </button>
                  )}
                </div>
              </div>
            )}

            {autoFillMode === 'bookmarklet' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <div style={{ fontSize: '11px', color: '#cbd5e1' }}>
                  <strong>Bookmarklet instructions:</strong> Create a new browser bookmark named{' '}
                  <code>CareerOps Auto-Fill</code> and paste this URI as the URL. Click it while
                  viewing any job application form!
                </div>
                <input
                  readOnly
                  value={generateAutoFillBookmarklet(candidateVault, activeJob.coverLetter || '')}
                  style={{
                    width: '100%',
                    background: 'rgba(0, 0, 0, 0.4)',
                    border: '1px solid rgba(255, 255, 255, 0.08)',
                    borderRadius: '8px',
                    color: '#c4b5fd',
                    fontFamily: 'monospace',
                    fontSize: '10px',
                    padding: '8px',
                  }}
                />
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'flex-end',
                    gap: '8px',
                  }}
                >
                  <button
                    onClick={() =>
                      handleCopy(
                        generateAutoFillBookmarklet(candidateVault, activeJob.coverLetter || ''),
                        'Bookmarklet URL'
                      )
                    }
                    style={{
                      padding: '6px 12px',
                      borderRadius: '8px',
                      background: 'linear-gradient(135deg, #8b5cf6, #7c3aed)',
                      color: '#ffffff',
                      border: 'none',
                      fontSize: '11px',
                      fontWeight: 700,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px',
                    }}
                  >
                    <Copy size={12} />
                    <span>
                      {copiedField === 'Bookmarklet URL'
                        ? 'Copied Bookmarklet!'
                        : 'Copy Bookmarklet URI'}
                    </span>
                  </button>
                </div>
              </div>
            )}

            {autoFillMode === 'playwright' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <div style={{ fontSize: '11px', color: '#cbd5e1' }}>
                  Run locally with Node / Playwright: <code>node apply.mjs</code>. Opens Chromium,
                  navigates, and fills all form fields automatically.
                </div>
                <textarea
                  readOnly
                  value={generatePlaywrightAutoFillScript(
                    activeJob.url || 'https://boards.greenhouse.io',
                    candidateVault,
                    activeJob.coverLetter || ''
                  )}
                  style={{
                    width: '100%',
                    height: '200px',
                    background: 'rgba(0, 0, 0, 0.4)',
                    border: '1px solid rgba(255, 255, 255, 0.08)',
                    borderRadius: '8px',
                    color: '#c4b5fd',
                    fontFamily: 'monospace',
                    fontSize: '10px',
                    padding: '8px',
                    resize: 'none',
                    lineHeight: '1.4',
                  }}
                />
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'flex-end',
                    gap: '8px',
                  }}
                >
                  <button
                    onClick={() =>
                      handleCopy(
                        generatePlaywrightAutoFillScript(
                          activeJob.url || 'https://boards.greenhouse.io',
                          candidateVault,
                          activeJob.coverLetter || ''
                        ),
                        'Playwright Script'
                      )
                    }
                    style={{
                      padding: '6px 12px',
                      borderRadius: '8px',
                      background: 'rgba(255, 255, 255, 0.08)',
                      color: '#ffffff',
                      border: '1px solid rgba(255, 255, 255, 0.15)',
                      fontSize: '11px',
                      fontWeight: 600,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px',
                    }}
                  >
                    <Copy size={12} />
                    <span>
                      {copiedField === 'Playwright Script' ? 'Copied!' : 'Copy Playwright Code'}
                    </span>
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Candidate Profile & Screening Questions Vault Modal */}
      {showVaultModal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0, 0, 0, 0.75)',
            backdropFilter: 'blur(8px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 9999,
            padding: '16px',
          }}
        >
          <div
            style={{
              width: '100%',
              maxWidth: '680px',
              maxHeight: '85vh',
              overflowY: 'auto',
              background: '#0f172a',
              border: '1px solid rgba(99, 102, 241, 0.4)',
              borderRadius: '14px',
              padding: '20px',
              display: 'flex',
              flexDirection: 'column',
              gap: '14px',
              boxShadow: '0 20px 40px rgba(0, 0, 0, 0.7)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <UserCheck size={18} color="#818cf8" />
                <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 800, color: '#f8fafc' }}>
                  Candidate Profile & Screening Questions Vault
                </h3>
              </div>
              <button
                onClick={() => setShowVaultModal(false)}
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: '#64748b',
                  cursor: 'pointer',
                  fontSize: '14px',
                }}
              >
                ✕
              </button>
            </div>

            <p style={{ margin: 0, fontSize: '11px', color: '#94a3b8' }}>
              Persistent candidate profile synced directly to 1-Click ATS Auto-Fill. Changes are
              saved automatically to local storage.
            </p>

            {/* Vault Tabs */}
            <div
              style={{
                display: 'flex',
                gap: '8px',
                borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
                paddingBottom: '8px',
              }}
            >
              {[
                { id: 'personal', label: '👤 Personal & Links' },
                { id: 'work_auth', label: '🛂 Work Auth & Details' },
                { id: 'preferences', label: '🎯 Compensation & Start' },
                { id: 'pitch', label: '💬 Elevator Pitch & Stack' },
              ].map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setVaultSubTab(tab.id as any)}
                  style={{
                    padding: '4px 10px',
                    borderRadius: '6px',
                    fontSize: '11px',
                    fontWeight: 700,
                    background:
                      vaultSubTab === tab.id
                        ? 'rgba(99, 102, 241, 0.25)'
                        : 'rgba(255, 255, 255, 0.05)',
                    color: vaultSubTab === tab.id ? '#c7d2fe' : '#94a3b8',
                    border: vaultSubTab === tab.id ? '1px solid rgba(99, 102, 241, 0.4)' : 'none',
                    cursor: 'pointer',
                  }}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {/* Tab: Personal */}
            {vaultSubTab === 'personal' && (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                <div>
                  <label style={{ fontSize: '10px', fontWeight: 700, color: '#94a3b8' }}>
                    FIRST NAME
                  </label>
                  <input
                    type="text"
                    value={candidateVault.firstName}
                    onChange={(e) => updateCandidateVault({ firstName: e.target.value })}
                    style={{
                      width: '100%',
                      padding: '6px 8px',
                      borderRadius: '6px',
                      background: 'rgba(255,255,255,0.05)',
                      border: '1px solid rgba(255,255,255,0.1)',
                      color: '#ffffff',
                      fontSize: '11px',
                      marginTop: '3px',
                    }}
                  />
                </div>
                <div>
                  <label style={{ fontSize: '10px', fontWeight: 700, color: '#94a3b8' }}>
                    LAST NAME
                  </label>
                  <input
                    type="text"
                    value={candidateVault.lastName}
                    onChange={(e) => updateCandidateVault({ lastName: e.target.value })}
                    style={{
                      width: '100%',
                      padding: '6px 8px',
                      borderRadius: '6px',
                      background: 'rgba(255,255,255,0.05)',
                      border: '1px solid rgba(255,255,255,0.1)',
                      color: '#ffffff',
                      fontSize: '11px',
                      marginTop: '3px',
                    }}
                  />
                </div>
                <div>
                  <label style={{ fontSize: '10px', fontWeight: 700, color: '#94a3b8' }}>
                    EMAIL
                  </label>
                  <input
                    type="email"
                    value={candidateVault.email}
                    onChange={(e) => updateCandidateVault({ email: e.target.value })}
                    style={{
                      width: '100%',
                      padding: '6px 8px',
                      borderRadius: '6px',
                      background: 'rgba(255,255,255,0.05)',
                      border: '1px solid rgba(255,255,255,0.1)',
                      color: '#ffffff',
                      fontSize: '11px',
                      marginTop: '3px',
                    }}
                  />
                </div>
                <div>
                  <label style={{ fontSize: '10px', fontWeight: 700, color: '#94a3b8' }}>
                    PHONE
                  </label>
                  <input
                    type="tel"
                    value={candidateVault.phone}
                    onChange={(e) => updateCandidateVault({ phone: e.target.value })}
                    style={{
                      width: '100%',
                      padding: '6px 8px',
                      borderRadius: '6px',
                      background: 'rgba(255,255,255,0.05)',
                      border: '1px solid rgba(255,255,255,0.1)',
                      color: '#ffffff',
                      fontSize: '11px',
                      marginTop: '3px',
                    }}
                  />
                </div>
                <div style={{ gridColumn: 'span 2' }}>
                  <label style={{ fontSize: '10px', fontWeight: 700, color: '#94a3b8' }}>
                    LOCATION / CITY, STATE
                  </label>
                  <input
                    type="text"
                    value={candidateVault.location}
                    onChange={(e) => updateCandidateVault({ location: e.target.value })}
                    style={{
                      width: '100%',
                      padding: '6px 8px',
                      borderRadius: '6px',
                      background: 'rgba(255,255,255,0.05)',
                      border: '1px solid rgba(255,255,255,0.1)',
                      color: '#ffffff',
                      fontSize: '11px',
                      marginTop: '3px',
                    }}
                  />
                </div>
                <div>
                  <label style={{ fontSize: '10px', fontWeight: 700, color: '#94a3b8' }}>
                    LINKEDIN URL
                  </label>
                  <input
                    type="url"
                    value={candidateVault.linkedin}
                    onChange={(e) => updateCandidateVault({ linkedin: e.target.value })}
                    style={{
                      width: '100%',
                      padding: '6px 8px',
                      borderRadius: '6px',
                      background: 'rgba(255,255,255,0.05)',
                      border: '1px solid rgba(255,255,255,0.1)',
                      color: '#ffffff',
                      fontSize: '11px',
                      marginTop: '3px',
                    }}
                  />
                </div>
                <div>
                  <label style={{ fontSize: '10px', fontWeight: 700, color: '#94a3b8' }}>
                    GITHUB URL
                  </label>
                  <input
                    type="url"
                    value={candidateVault.github}
                    onChange={(e) => updateCandidateVault({ github: e.target.value })}
                    style={{
                      width: '100%',
                      padding: '6px 8px',
                      borderRadius: '6px',
                      background: 'rgba(255,255,255,0.05)',
                      border: '1px solid rgba(255,255,255,0.1)',
                      color: '#ffffff',
                      fontSize: '11px',
                      marginTop: '3px',
                    }}
                  />
                </div>
              </div>
            )}

            {/* Tab: Work Auth */}
            {vaultSubTab === 'work_auth' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '10px',
                    background: 'rgba(255,255,255,0.03)',
                    padding: '10px',
                    borderRadius: '8px',
                  }}
                >
                  <label
                    htmlFor="authCheck"
                    style={{ fontSize: '11px', color: '#f8fafc', cursor: 'pointer', flex: 1 }}
                  >
                    Legally authorized to work in the country
                  </label>
                  <select
                    id="authCheck"
                    value={
                      !candidateVault.authorizedToWorkVerified
                        ? 'unknown'
                        : candidateVault.authorizedToWork
                          ? 'yes'
                          : 'no'
                    }
                    onChange={(e) =>
                      updateCandidateVault({
                        authorizedToWork: e.target.value === 'yes',
                        authorizedToWorkVerified: e.target.value !== 'unknown',
                      })
                    }
                    style={{
                      padding: '5px 8px',
                      borderRadius: '6px',
                      background: '#1e293b',
                      color: '#f8fafc',
                      border: '1px solid rgba(255,255,255,0.15)',
                    }}
                  >
                    <option value="unknown">Not specified</option>
                    <option value="yes">Yes</option>
                    <option value="no">No</option>
                  </select>
                </div>

                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '10px',
                    background: 'rgba(255,255,255,0.03)',
                    padding: '10px',
                    borderRadius: '8px',
                  }}
                >
                  <label
                    htmlFor="sponCheck"
                    style={{ fontSize: '11px', color: '#f8fafc', cursor: 'pointer', flex: 1 }}
                  >
                    Will now or in the future require visa sponsorship
                  </label>
                  <select
                    id="sponCheck"
                    value={
                      !candidateVault.requiresSponsorshipVerified
                        ? 'unknown'
                        : candidateVault.requiresSponsorship
                          ? 'yes'
                          : 'no'
                    }
                    onChange={(e) =>
                      updateCandidateVault({
                        requiresSponsorship: e.target.value === 'yes',
                        requiresSponsorshipVerified: e.target.value !== 'unknown',
                      })
                    }
                    style={{
                      padding: '5px 8px',
                      borderRadius: '6px',
                      background: '#1e293b',
                      color: '#f8fafc',
                      border: '1px solid rgba(255,255,255,0.15)',
                    }}
                  >
                    <option value="unknown">Not specified</option>
                    <option value="yes">Yes</option>
                    <option value="no">No</option>
                  </select>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                  <div>
                    <label style={{ fontSize: '10px', fontWeight: 700, color: '#94a3b8' }}>
                      CURRENT COMPANY
                    </label>
                    <input
                      type="text"
                      value={candidateVault.currentCompany}
                      onChange={(e) => updateCandidateVault({ currentCompany: e.target.value })}
                      style={{
                        width: '100%',
                        padding: '6px 8px',
                        borderRadius: '6px',
                        background: 'rgba(255,255,255,0.05)',
                        border: '1px solid rgba(255,255,255,0.1)',
                        color: '#ffffff',
                        fontSize: '11px',
                        marginTop: '3px',
                      }}
                    />
                  </div>
                  <div>
                    <label style={{ fontSize: '10px', fontWeight: 700, color: '#94a3b8' }}>
                      CURRENT TITLE
                    </label>
                    <input
                      type="text"
                      value={candidateVault.currentTitle}
                      onChange={(e) => updateCandidateVault({ currentTitle: e.target.value })}
                      style={{
                        width: '100%',
                        padding: '6px 8px',
                        borderRadius: '6px',
                        background: 'rgba(255,255,255,0.05)',
                        border: '1px solid rgba(255,255,255,0.1)',
                        color: '#ffffff',
                        fontSize: '11px',
                        marginTop: '3px',
                      }}
                    />
                  </div>
                </div>
              </div>
            )}

            {/* Tab: Preferences */}
            {vaultSubTab === 'preferences' && (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                <div>
                  <label style={{ fontSize: '10px', fontWeight: 700, color: '#94a3b8' }}>
                    SALARY EXPECTATIONS
                  </label>
                  <input
                    type="text"
                    value={candidateVault.salaryExpectation}
                    onChange={(e) => updateCandidateVault({ salaryExpectation: e.target.value })}
                    style={{
                      width: '100%',
                      padding: '6px 8px',
                      borderRadius: '6px',
                      background: 'rgba(255,255,255,0.05)',
                      border: '1px solid rgba(255,255,255,0.1)',
                      color: '#ffffff',
                      fontSize: '11px',
                      marginTop: '3px',
                    }}
                  />
                </div>
                <div>
                  <label style={{ fontSize: '10px', fontWeight: 700, color: '#94a3b8' }}>
                    YEARS OF EXPERIENCE
                  </label>
                  <input
                    type="text"
                    value={candidateVault.yearsOfExperience}
                    onChange={(e) => updateCandidateVault({ yearsOfExperience: e.target.value })}
                    style={{
                      width: '100%',
                      padding: '6px 8px',
                      borderRadius: '6px',
                      background: 'rgba(255,255,255,0.05)',
                      border: '1px solid rgba(255,255,255,0.1)',
                      color: '#ffffff',
                      fontSize: '11px',
                      marginTop: '3px',
                    }}
                  />
                </div>
                <div>
                  <label style={{ fontSize: '10px', fontWeight: 700, color: '#94a3b8' }}>
                    EARLIEST START DATE
                  </label>
                  <input
                    type="text"
                    value={candidateVault.earliestStartDate}
                    onChange={(e) => updateCandidateVault({ earliestStartDate: e.target.value })}
                    style={{
                      width: '100%',
                      padding: '6px 8px',
                      borderRadius: '6px',
                      background: 'rgba(255,255,255,0.05)',
                      border: '1px solid rgba(255,255,255,0.1)',
                      color: '#ffffff',
                      fontSize: '11px',
                      marginTop: '3px',
                    }}
                  />
                </div>
                <div>
                  <label style={{ fontSize: '10px', fontWeight: 700, color: '#94a3b8' }}>
                    NOTICE PERIOD
                  </label>
                  <input
                    type="text"
                    value={candidateVault.noticePeriod}
                    onChange={(e) => updateCandidateVault({ noticePeriod: e.target.value })}
                    style={{
                      width: '100%',
                      padding: '6px 8px',
                      borderRadius: '6px',
                      background: 'rgba(255,255,255,0.05)',
                      border: '1px solid rgba(255,255,255,0.1)',
                      color: '#ffffff',
                      fontSize: '11px',
                      marginTop: '3px',
                    }}
                  />
                </div>
              </div>
            )}

            {/* Tab: Pitch */}
            {vaultSubTab === 'pitch' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                <div>
                  <label style={{ fontSize: '10px', fontWeight: 700, color: '#94a3b8' }}>
                    CORE TECH STACK KEYWORDS
                  </label>
                  <input
                    type="text"
                    value={candidateVault.coreTechStack}
                    onChange={(e) => updateCandidateVault({ coreTechStack: e.target.value })}
                    style={{
                      width: '100%',
                      padding: '6px 8px',
                      borderRadius: '6px',
                      background: 'rgba(255,255,255,0.05)',
                      border: '1px solid rgba(255,255,255,0.1)',
                      color: '#ffffff',
                      fontSize: '11px',
                      marginTop: '3px',
                    }}
                  />
                </div>
                <div>
                  <label style={{ fontSize: '10px', fontWeight: 700, color: '#94a3b8' }}>
                    ELEVATOR PITCH / "TELL ME ABOUT YOURSELF"
                  </label>
                  <textarea
                    value={candidateVault.briefPitch}
                    onChange={(e) => updateCandidateVault({ briefPitch: e.target.value })}
                    style={{
                      width: '100%',
                      height: '100px',
                      padding: '6px 8px',
                      borderRadius: '6px',
                      background: 'rgba(255,255,255,0.05)',
                      border: '1px solid rgba(255,255,255,0.1)',
                      color: '#ffffff',
                      fontSize: '11px',
                      marginTop: '3px',
                      resize: 'none',
                    }}
                  />
                </div>
              </div>
            )}

            {/* Bottom Actions */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                paddingTop: '10px',
                borderTop: '1px solid rgba(255,255,255,0.08)',
              }}
            >
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                <button
                  type="button"
                  onClick={() => {
                    loadAbhishekProfile();
                    setToast("⚡ Loaded Abhishek Singh's verified engineering profile!");
                  }}
                  style={{
                    padding: '5px 12px',
                    borderRadius: '6px',
                    background: 'linear-gradient(135deg, rgba(37,99,235,0.25), rgba(6,182,212,0.25))',
                    color: '#67e8f9',
                    border: '1px solid rgba(6,182,212,0.4)',
                    fontSize: '10px',
                    fontWeight: 700,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                  }}
                >
                  ⚡ Load Abhishek Singh Profile
                </button>
                <button
                  type="button"
                  onClick={() => {
                    handleCopy(exportCandidateVault(), 'Candidate Vault JSON');
                  }}
                  style={{
                    padding: '5px 10px',
                    borderRadius: '6px',
                    background: 'rgba(255,255,255,0.05)',
                    color: '#94a3b8',
                    border: '1px solid rgba(255,255,255,0.1)',
                    fontSize: '10px',
                    cursor: 'pointer',
                  }}
                >
                  Export JSON
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const json = prompt('Paste Candidate Vault JSON to import:');
                    if (json) {
                      const ok = importCandidateVault(json);
                      if (ok) setToast('Candidate Vault imported successfully!');
                      else setToast('Invalid Vault JSON.');
                    }
                  }}
                  style={{
                    padding: '5px 10px',
                    borderRadius: '6px',
                    background: 'rgba(255,255,255,0.05)',
                    color: '#94a3b8',
                    border: '1px solid rgba(255,255,255,0.1)',
                    fontSize: '10px',
                    cursor: 'pointer',
                  }}
                >
                  Import JSON
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (confirm('Reset candidate profile to verified defaults?')) {
                      resetCandidateVault();
                      setToast('Reset to defaults.');
                    }
                  }}
                  style={{
                    padding: '5px 10px',
                    borderRadius: '6px',
                    background: 'rgba(239,68,68,0.1)',
                    color: '#f87171',
                    border: '1px solid rgba(239,68,68,0.2)',
                    fontSize: '10px',
                    cursor: 'pointer',
                  }}
                >
                  Reset Defaults
                </button>
              </div>

              <button
                type="button"
                onClick={() => {
                  setShowVaultModal(false);
                  setToast('Candidate Vault synced to Auto-Fill!');
                }}
                style={{
                  padding: '6px 14px',
                  borderRadius: '6px',
                  background: 'linear-gradient(135deg, #6366f1, #4f46e5)',
                  color: '#ffffff',
                  border: 'none',
                  fontSize: '11px',
                  fontWeight: 700,
                  cursor: 'pointer',
                }}
              >
                Save & Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Global Slide-In Job Drawer */}
      <JobDrawerModal
        job={selectedJobForDrawer}
        isOpen={isDrawerOpen}
        onClose={() => setIsDrawerOpen(false)}
        onNavigateToGym={(j) => {
          if (j.company) {
            createCompanyPlan(j.company, j.role || 'Software Engineer', j.jdText || '', resumeText);
            setActiveView('mock_gym');
          }
        }}
        onOpenOverleaf={(j) => {
          if (j.tailoredResume) {
            openInOverleaf(j.tailoredResume);
          }
        }}
      />

      {/* 60-Second Onboarding Flow Modal */}
      <OnboardingFlowModal />
    </div>
  );
}
