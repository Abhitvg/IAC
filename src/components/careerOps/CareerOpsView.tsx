import React, { useState } from 'react';
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
} from 'lucide-react';
import { useCareerOpsStore } from '../../store/useCareerOpsStore';
import { useAppStore } from '../../store/useAppStore';
import { usePracticeStore } from '../../store/usePracticeStore';
import { ApplicationStatus, JobApplication } from '../../services/careerOps/types';

export function CareerOpsView() {
  const {
    applications,
    activeJobId,
    filterStatus,
    searchQuery,
    isEvaluating,
    isTailoring,
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

  const {
    resumeText,
    setJobDescriptionText,
    setTargetRole,
    setToast,
    settings,
  } = useAppStore();

  const { setActiveView, createCompanyPlan } = usePracticeStore();

  // Internal sub-tab state
  const [subTab, setSubTab] = useState<'pipeline' | 'evaluator' | 'tailor' | 'outreach'>('pipeline');
  const [copiedField, setCopiedField] = useState<string | null>(null);

  // New Job Input Modal / Form
  const [newCompany, setNewCompany] = useState('');
  const [newRole, setNewRole] = useState('');
  const [newUrl, setNewUrl] = useState('');
  const [newSalary, setNewSalary] = useState('');
  const [newLocation, setNewLocation] = useState('Remote');
  const [newJdText, setNewJdText] = useState('');
  const [showNewModal, setShowNewModal] = useState(false);
  const [coverAngle, setCoverAngle] = useState<'problem_solver' | 'technical_depth' | 'fast_impact' | 'cultural_alignment'>('problem_solver');

  const activeJob = applications.find((a) => a.id === activeJobId) || applications[0] || null;

  const handleCopy = (text: string, fieldName: string) => {
    navigator.clipboard.writeText(text);
    setCopiedField(fieldName);
    setToast(`Copied ${fieldName} to clipboard!`);
    setTimeout(() => setCopiedField(null), 2000);
  };

  const handleCreateJobAndEvaluate = async () => {
    if (!newCompany.trim() || !newRole.trim()) {
      setToast('Please provide at least a Company name and Role title.');
      return;
    }

    const id = addJob({
      company: newCompany.trim(),
      role: newRole.trim(),
      url: newUrl.trim(),
      salaryRange: newSalary.trim() || 'Market Rate',
      location: newLocation.trim(),
      jdText: newJdText.trim(),
      status: 'scouted',
    });

    setShowNewModal(false);
    setNewCompany('');
    setNewRole('');
    setNewUrl('');
    setNewSalary('');
    setNewJdText('');

    setToast(`Added ${newRole} at ${newCompany}. Starting CareerOps evaluation...`);
    setSubTab('evaluator');

    const providerConfig = settings?.aiProvider
      ? {
          type: settings.aiProvider,
          apiKey: '',
          model: settings.aiModel || 'openai/gpt-oss-120b',
        }
      : undefined;

    await evaluateJob(id, resumeText, providerConfig);
    setToast('CareerOps A-H Evaluation completed!');
  };

  const handleRunEvaluation = async (id: string) => {
    const job = applications.find((a) => a.id === id);
    if (!job) return;

    setToast(`Evaluating "${job.role}" against your CV...`);
    const providerConfig = settings?.aiProvider
      ? {
          type: settings.aiProvider,
          apiKey: '',
          model: settings.aiModel || 'openai/gpt-oss-120b',
        }
      : undefined;

    await evaluateJob(id, resumeText, providerConfig);
    setToast('Evaluation complete!');
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
              <span style={{ fontSize: '14px', fontWeight: 800, letterSpacing: '-0.02em', color: '#ffffff' }}>
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
            { id: 'pipeline', label: '📋 Pipeline Board', count: applications.length },
            { id: 'evaluator', label: '⚡ A-H Job Evaluator', activeBadge: activeJob?.recommendation === 'apply' ? '🟢 4.0+' : 'Evaluator' },
            { id: 'tailor', label: '📝 ATS Resume & Cover Letter', activeBadge: activeJob?.tailoredResume ? 'Ready' : undefined },
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
                  activeJob.score >= 4.0
                    ? 'rgba(34, 197, 94, 0.2)'
                    : 'rgba(239, 68, 68, 0.2)',
                color: activeJob.score >= 4.0 ? '#4ade80' : '#f87171',
                border:
                  activeJob.score >= 4.0
                    ? '1px solid rgba(34, 197, 94, 0.4)'
                    : '1px solid rgba(239, 68, 68, 0.4)',
              }}
            >
              ★ {activeJob.score} / 5.0
            </span>
          </div>
        )}
      </div>

      {/* Main Workspace Content Area */}
      <div style={{ flex: 1, overflow: 'auto', padding: '16px' }}>
        {/* TAB 1: PIPELINE BOARD */}
        {subTab === 'pipeline' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {/* Filter & Search Bar */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: '10px',
                background: 'rgba(255, 255, 255, 0.03)',
                padding: '8px 12px',
                borderRadius: '10px',
                border: '1px solid rgba(255, 255, 255, 0.08)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: 1, minWidth: '240px' }}>
                <Search size={14} color="#64748b" />
                <input
                  type="text"
                  placeholder="Filter by company, role, or keywords..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  style={{
                    background: 'transparent',
                    border: 'none',
                    color: '#ffffff',
                    fontSize: '12px',
                    width: '100%',
                    outline: 'none',
                  }}
                />
              </div>

              {/* Status Filter Chips */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '5px', flexWrap: 'wrap' }}>
                <span style={{ fontSize: '11px', color: '#64748b', marginRight: '4px' }}>Status:</span>
                {(['all', 'scouted', 'evaluated', 'applied', 'interviewing', 'offer', 'rejected'] as const).map(
                  (st) => (
                    <button
                      key={st}
                      onClick={() => setFilterStatus(st)}
                      style={{
                        padding: '3px 8px',
                        borderRadius: '6px',
                        fontSize: '10px',
                        fontWeight: 700,
                        cursor: 'pointer',
                        background: filterStatus === st ? '#4f46e5' : 'rgba(255, 255, 255, 0.05)',
                        color: filterStatus === st ? '#ffffff' : '#94a3b8',
                        border: 'none',
                        textTransform: 'capitalize',
                      }}
                    >
                      {st}
                    </button>
                  )
                )}
              </div>
            </div>

            {/* Application Cards List */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(360px, 1fr))', gap: '14px' }}>
              {filteredApps.map((job) => {
                const isSelected = job.id === activeJobId;
                const isApply = job.score >= 4.0;
                return (
                  <div
                    key={job.id}
                    onClick={() => setActiveJobId(job.id)}
                    style={{
                      background: isSelected
                        ? 'linear-gradient(145deg, rgba(30, 41, 59, 0.85), rgba(15, 23, 42, 0.95))'
                        : 'rgba(15, 23, 42, 0.6)',
                      border: isSelected
                        ? '1px solid rgba(249, 115, 22, 0.5)'
                        : '1px solid rgba(255, 255, 255, 0.08)',
                      borderRadius: '12px',
                      padding: '14px',
                      cursor: 'pointer',
                      transition: 'all 0.18s ease',
                      boxShadow: isSelected ? '0 4px 20px rgba(249, 115, 22, 0.15)' : 'none',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '10px',
                    }}
                  >
                    {/* Header: Company & Fit Badge */}
                    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '8px' }}>
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <Building size={14} color="#f97316" />
                          <span style={{ fontSize: '13px', fontWeight: 800, color: '#f8fafc' }}>{job.company}</span>
                        </div>
                        <h4 style={{ margin: '3px 0 0', fontSize: '12px', fontWeight: 600, color: '#cbd5e1' }}>
                          {job.role}
                        </h4>
                      </div>

                      {/* 1-5 Score Badge */}
                      <div
                        style={{
                          display: 'flex',
                          flexDirection: 'column',
                          alignItems: 'flex-end',
                        }}
                      >
                        <span
                          style={{
                            fontSize: '12px',
                            fontWeight: 900,
                            padding: '2px 8px',
                            borderRadius: '6px',
                            background: isApply ? 'rgba(34, 197, 94, 0.2)' : 'rgba(239, 68, 68, 0.2)',
                            color: isApply ? '#4ade80' : '#f87171',
                            border: isApply ? '1px solid rgba(34, 197, 94, 0.4)' : '1px solid rgba(239, 68, 68, 0.4)',
                          }}
                        >
                          ★ {job.score.toFixed(1)} / 5.0
                        </span>
                        <span
                          style={{
                            fontSize: '9px',
                            fontWeight: 700,
                            marginTop: '2px',
                            color: isApply ? '#86efac' : '#fca5a5',
                            textTransform: 'uppercase',
                          }}
                        >
                          {isApply ? '✓ Apply' : '✗ Skip'}
                        </span>
                      </div>
                    </div>

                    {/* Metadata: Salary & Location */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', fontSize: '11px', color: '#94a3b8' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <DollarSign size={12} color="#34d399" />
                        <span>{job.salaryRange || 'Market Benchmark'}</span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <MapPin size={12} color="#60a5fa" />
                        <span>{job.location || 'Remote'}</span>
                      </div>
                    </div>

                    {/* Notes / Snippet */}
                    {job.notes && (
                      <p
                        style={{
                          margin: 0,
                          fontSize: '11px',
                          color: '#94a3b8',
                          background: 'rgba(0, 0, 0, 0.25)',
                          padding: '6px 8px',
                          borderRadius: '6px',
                          borderLeft: '2px solid #6366f1',
                        }}
                      >
                        {job.notes}
                      </p>
                    )}

                    {/* Footer Actions: Status Dropdown & App Synergy Buttons */}
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        marginTop: 'auto',
                        paddingTop: '8px',
                        borderTop: '1px solid rgba(255, 255, 255, 0.06)',
                        gap: '6px',
                      }}
                    >
                      {/* Status Selector */}
                      <select
                        value={job.status}
                        onClick={(e) => e.stopPropagation()}
                        onChange={(e) => updateJob(job.id, { status: e.target.value as ApplicationStatus })}
                        style={{
                          background: 'rgba(255, 255, 255, 0.06)',
                          border: '1px solid rgba(255, 255, 255, 0.12)',
                          borderRadius: '6px',
                          color: '#e2e8f0',
                          fontSize: '10px',
                          fontWeight: 700,
                          padding: '3px 6px',
                          outline: 'none',
                          cursor: 'pointer',
                        }}
                      >
                        <option value="scouted">Scouted</option>
                        <option value="evaluated">Evaluated</option>
                        <option value="applied">Applied</option>
                        <option value="interviewing">Interviewing</option>
                        <option value="offer">Offer</option>
                        <option value="rejected">Rejected</option>
                      </select>

                      <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleSendToGym(job);
                          }}
                          title="Generate 7-Day Interview Plan in Practice Gym"
                          style={{
                            padding: '3px 7px',
                            borderRadius: '6px',
                            background: 'rgba(99, 102, 241, 0.15)',
                            color: '#a5b4fc',
                            border: '1px solid rgba(99, 102, 241, 0.3)',
                            fontSize: '10px',
                            fontWeight: 700,
                            cursor: 'pointer',
                          }}
                        >
                          🏋️ Gym
                        </button>

                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleSendToCopilot(job);
                          }}
                          title="Load Role into Live Teleprompter Copilot"
                          style={{
                            padding: '3px 7px',
                            borderRadius: '6px',
                            background: 'rgba(16, 185, 129, 0.15)',
                            color: '#6ee7b7',
                            border: '1px solid rgba(16, 185, 129, 0.3)',
                            fontSize: '10px',
                            fontWeight: 700,
                            cursor: 'pointer',
                          }}
                        >
                          🛡️ Copilot
                        </button>

                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            deleteJob(job.id);
                          }}
                          title="Delete Application"
                          style={{
                            padding: '3px 6px',
                            borderRadius: '6px',
                            background: 'transparent',
                            color: '#64748b',
                            border: 'none',
                            cursor: 'pointer',
                          }}
                        >
                          <Trash2 size={12} />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* TAB 2: A-H JOB EVALUATOR */}
        {subTab === 'evaluator' && activeJob && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', maxWidth: '960px', margin: '0 auto' }}>
            {/* Top Score Banner */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '16px 20px',
                borderRadius: '12px',
                background:
                  activeJob.score >= 4.0
                    ? 'linear-gradient(135deg, rgba(34, 197, 94, 0.15), rgba(15, 23, 42, 0.9))'
                    : 'linear-gradient(135deg, rgba(239, 68, 68, 0.15), rgba(15, 23, 42, 0.9))',
                border:
                  activeJob.score >= 4.0
                    ? '1px solid rgba(34, 197, 94, 0.4)'
                    : '1px solid rgba(239, 68, 68, 0.4)',
              }}
            >
              <div>
                <span
                  style={{
                    fontSize: '11px',
                    fontWeight: 800,
                    textTransform: 'uppercase',
                    letterSpacing: '0.05em',
                    color: activeJob.score >= 4.0 ? '#4ade80' : '#f87171',
                  }}
                >
                  CAREEROPS VERDICT
                </span>
                <h3 style={{ margin: '4px 0 0', fontSize: '18px', fontWeight: 800, color: '#f8fafc' }}>
                  {activeJob.evaluationReport?.verdictHeadline ||
                    (activeJob.score >= 4.0
                      ? `🟢 Recommended: Strong Fit (${activeJob.score}/5.0)`
                      : `🔴 Do Not Apply: Low Alignment (${activeJob.score}/5.0)`)}
                </h3>
                <p style={{ margin: '6px 0 0', fontSize: '12px', color: '#cbd5e1', maxWidth: '640px' }}>
                  {activeJob.evaluationReport?.summary ||
                    'Evaluated across core technical stack, systems complexity, and role level alignment.'}
                </p>
              </div>

              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: '32px', fontWeight: 900, color: activeJob.score >= 4.0 ? '#4ade80' : '#f87171' }}>
                  {activeJob.score.toFixed(1)}
                  <span style={{ fontSize: '14px', color: '#94a3b8' }}> / 5.0</span>
                </div>
                <button
                  onClick={() => handleRunEvaluation(activeJob.id)}
                  disabled={isEvaluating}
                  style={{
                    marginTop: '8px',
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

            {/* Block B: Weighted Requirements Audit */}
            <div
              style={{
                background: 'rgba(15, 23, 42, 0.65)',
                border: '1px solid rgba(255, 255, 255, 0.08)',
                borderRadius: '12px',
                padding: '16px',
              }}
            >
              <h4 style={{ margin: '0 0 12px', fontSize: '13px', fontWeight: 800, color: '#f8fafc' }}>
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
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '14px' }}>
              <div
                style={{
                  background: 'rgba(15, 23, 42, 0.65)',
                  border: '1px solid rgba(255, 255, 255, 0.08)',
                  borderRadius: '12px',
                  padding: '14px',
                }}
              >
                <h4 style={{ margin: '0 0 8px', fontSize: '12px', fontWeight: 800, color: '#f8fafc' }}>
                  🎯 Strategic Positioning Angle
                </h4>
                <p style={{ margin: 0, fontSize: '12px', color: '#cbd5e1', lineHeight: '1.5' }}>
                  {activeJob.evaluationReport?.strategicAngle ||
                    'Emphasize high-scale distributed reliability and clean code practices.'}
                </p>
                <div style={{ marginTop: '10px', paddingTop: '10px', borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                  <span style={{ fontSize: '11px', color: '#94a3b8' }}>Level Strategy: </span>
                  <span style={{ fontSize: '11px', fontWeight: 700, color: '#f1f5f9' }}>
                    {activeJob.evaluationReport?.levelStrategy || 'Senior Software Engineer'}
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
                <h4 style={{ margin: '0 0 8px', fontSize: '12px', fontWeight: 800, color: '#f8fafc' }}>
                  💰 Compensation Benchmark
                </h4>
                <div style={{ fontSize: '16px', fontWeight: 900, color: '#34d399' }}>
                  {activeJob.evaluationReport?.compensationEstimate?.estimatedRange || activeJob.salaryRange}
                </div>
                <p style={{ margin: '4px 0 0', fontSize: '11px', color: '#94a3b8' }}>
                  {activeJob.evaluationReport?.compensationEstimate?.analysis ||
                    'Based on verified remote Senior Software Engineer compensation percentiles.'}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* TAB 3: ATS RESUME & COVER LETTER TAILOR */}
        {subTab === 'tailor' && activeJob && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', maxWidth: '960px', margin: '0 auto' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '10px' }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 800, color: '#f8fafc' }}>
                  ATS Resume & Cover Letter Tailoring Engine
                </h3>
                <p style={{ margin: '2px 0 0', fontSize: '11px', color: '#94a3b8' }}>
                  Mirrors high-value keywords from the JD without fabricating facts. Space Grotesk + DM Sans format.
                </p>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <button
                  onClick={async () => {
                    setToast('Tailoring resume for ATS scanning...');
                    await tailorResumeForJob(activeJob.id, resumeText);
                    setToast('ATS Resume ready!');
                  }}
                  disabled={isTailoring}
                  style={{
                    padding: '6px 12px',
                    borderRadius: '8px',
                    background: 'linear-gradient(135deg, #4f46e5, #6366f1)',
                    color: '#ffffff',
                    border: 'none',
                    fontSize: '11px',
                    fontWeight: 700,
                    cursor: 'pointer',
                  }}
                >
                  {isTailoring ? 'Tailoring...' : '⚡ Generate Tailored Resume'}
                </button>

                <button
                  onClick={async () => {
                    setToast('Drafting 4-angle cover letter...');
                    await generateCoverLetterForJob(activeJob.id, resumeText, coverAngle);
                    setToast('Cover Letter drafted!');
                  }}
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
              </div>
            </div>

            {/* Cover Letter Angle Selector */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                background: 'rgba(255, 255, 255, 0.03)',
                padding: '6px 12px',
                borderRadius: '8px',
                border: '1px solid rgba(255, 255, 255, 0.06)',
                fontSize: '11px',
              }}
            >
              <span style={{ color: '#94a3b8' }}>Cover Letter Angle:</span>
              {(['problem_solver', 'technical_depth', 'fast_impact', 'cultural_alignment'] as const).map((ang) => (
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
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: '12px', fontWeight: 800, color: '#f8fafc' }}>
                    📄 ATS Tailored Resume
                  </span>
                  {activeJob.tailoredResume && (
                    <button
                      onClick={() => handleCopy(activeJob.tailoredResume!, 'Tailored Resume')}
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
                      <span>{copiedField === 'Tailored Resume' ? 'Copied!' : 'Copy Markdown'}</span>
                    </button>
                  )}
                </div>

                <textarea
                  readOnly
                  value={
                    activeJob.tailoredResume ||
                    'Click "Generate Tailored Resume" to create an ATS-optimized CV matching this specific job description.'
                  }
                  style={{
                    width: '100%',
                    height: '380px',
                    background: 'rgba(0, 0, 0, 0.35)',
                    border: '1px solid rgba(255, 255, 255, 0.06)',
                    borderRadius: '8px',
                    color: '#e2e8f0',
                    fontFamily: 'monospace',
                    fontSize: '11px',
                    padding: '10px',
                    resize: 'none',
                    lineHeight: '1.5',
                  }}
                />
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
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: '12px', fontWeight: 800, color: '#f8fafc' }}>
                    ✉️ Research-Backed Cover Letter
                  </span>
                  {activeJob.coverLetter && (
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
                  )}
                </div>

                <textarea
                  readOnly
                  value={
                    activeJob.coverLetter ||
                    'Click "Draft Cover Letter" to generate a research-backed, 3-paragraph letter hooked into this company.'
                  }
                  style={{
                    width: '100%',
                    height: '380px',
                    background: 'rgba(0, 0, 0, 0.35)',
                    border: '1px solid rgba(255, 255, 255, 0.06)',
                    borderRadius: '8px',
                    color: '#e2e8f0',
                    fontFamily: 'Inter, system-ui, sans-serif',
                    fontSize: '11px',
                    padding: '10px',
                    resize: 'none',
                    lineHeight: '1.6',
                  }}
                />
              </div>
            </div>
          </div>
        )}

        {/* TAB 4: OUTREACH & CONTACTO */}
        {subTab === 'outreach' && activeJob && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', maxWidth: '860px', margin: '0 auto' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 800, color: '#f8fafc' }}>
                  Outreach & Contact Discovery (Contacto)
                </h3>
                <p style={{ margin: '2px 0 0', fontSize: '11px', color: '#94a3b8' }}>
                  Draft high-conversion DMs under the 300-character LinkedIn limit and formal application emails.
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
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
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
        )}
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
                style={{ background: 'transparent', border: 'none', color: '#64748b', cursor: 'pointer' }}
              >
                ✕
              </button>
            </div>

            <p style={{ margin: 0, fontSize: '11px', color: '#94a3b8' }}>
              Paste a job description or portal link. CareerOps scores it 1.0 to 5.0 against your active CV and tells you whether to apply.
            </p>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
              <div>
                <label style={{ fontSize: '10px', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase' }}>
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
                <label style={{ fontSize: '10px', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase' }}>
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
              <label style={{ fontSize: '10px', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase' }}>
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

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '6px' }}>
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
    </div>
  );
}
