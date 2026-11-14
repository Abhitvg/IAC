import React, { useState, useMemo, useEffect } from 'react';
import {
  Briefcase,
  Search,
  Filter,
  ArrowRight,
  TrendingUp,
  LayoutGrid,
  Table as TableIcon,
  CheckSquare,
  Square,
  Clock,
  Sparkles,
  AlertTriangle,
  RotateCcw,
  Sliders,
  DollarSign,
  MapPin,
  Building,
  CheckCircle2,
  Trash2,
  ExternalLink,
  ChevronDown,
  Download,
  Users,
  Zap,
} from 'lucide-react';
import {
  JobApplication,
  ApplicationStatus,
  JobStrategyType,
} from '../../services/careerOps/types';
import { useCareerOpsStore } from '../../store/useCareerOpsStore';
import { detectGhostJobRisk } from '../../services/careerOps/ghostJobDetector';
import {
  checkStrategyHold,
  REFERRAL_DISCLAIMER_COPY,
} from '../../../packages/cloud-core/src/apply/job-strategy';
import { exportTailoredResumeToPdf } from '../../services/careerOps/resumePdfExporter';
import { useCandidateVaultStore } from '../../store/useCandidateVaultStore';

interface PipelineViewProps {
  onSelectJob: (job: JobApplication) => void;
  onOpenEvaluator: (job: JobApplication) => void;
  onOpenTailor: (job: JobApplication) => void;
  onOpenOutreach: (job: JobApplication) => void;
  onAddNewJob: () => void;
}

export type PipelineViewMode = 'kanban' | 'table';
export type SortOption = 'score_desc' | 'score_asc' | 'company_asc' | 'date_desc' | 'ghost_risk';

const PIPELINE_COLUMNS: Array<{ id: ApplicationStatus | 'held'; label: string; color: string }> = [
  { id: 'scouted', label: 'Scouted', color: '#64748b' },
  { id: 'evaluated', label: 'Evaluated', color: '#818cf8' },
  { id: 'held', label: 'Referral Hold', color: '#f59e0b' },
  { id: 'applied', label: 'Applied / Queued', color: '#06b6d4' },
  { id: 'interviewing', label: 'Interviewing', color: '#10b981' },
  { id: 'offer', label: 'Offer', color: '#a855f7' },
];

export const PipelineView: React.FC<PipelineViewProps> = ({
  onSelectJob,
  onOpenEvaluator,
  onOpenTailor,
  onOpenOutreach,
  onAddNewJob,
}) => {
  const { applications, activeJobId, setActiveJobId, updateJob, deleteJob, enableDemoMode } =
    useCareerOpsStore();

  const [viewMode, setViewMode] = useState<PipelineViewMode>('kanban');
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | ApplicationStatus | 'held'>('all');
  const [minScoreFilter, setMinScoreFilter] = useState<number>(0);
  const [strategyFilter, setStrategyFilter] = useState<'all' | JobStrategyType>('all');
  const [sortBy, setSortBy] = useState<SortOption>('score_desc');
  const [selectedJobIds, setSelectedJobIds] = useState<Set<string>>(new Set());
  const [activeCursorIndex, setActiveCursorIndex] = useState(0);

  // Quick Preset Filters
  const setQuickFilter = (type: 'high_fit' | 'referral_hold' | 'interviewing' | 'reset') => {
    if (type === 'high_fit') {
      setMinScoreFilter(4.0);
      setStatusFilter('all');
      setStrategyFilter('all');
    } else if (type === 'referral_hold') {
      setStatusFilter('held');
      setMinScoreFilter(0);
      setStrategyFilter('all');
    } else if (type === 'interviewing') {
      setStatusFilter('interviewing');
      setMinScoreFilter(0);
      setStrategyFilter('all');
    } else {
      setMinScoreFilter(0);
      setStatusFilter('all');
      setStrategyFilter('all');
      setSearchQuery('');
    }
  };

  // Shared Query Engine
  const processedJobs = useMemo(() => {
    let result = applications.map((job) => {
      const ghost = detectGhostJobRisk(
        job.jdText,
        job.createdAt,
        job.location,
        job.salaryRange
      );

      const hold = checkStrategyHold({
        createdAt: new Date(job.createdAt || Date.now()).toISOString(),
        strategy: (job.strategy as any) || 'referral_first',
        holdDays: job.holdDays || 4,
        referralState: (job.referralState as any) || 'waiting',
      });

      return { job, ghost, hold };
    });

    // Search query filter
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(
        ({ job }) =>
          job.company.toLowerCase().includes(q) ||
          job.role.toLowerCase().includes(q) ||
          (job.location && job.location.toLowerCase().includes(q))
      );
    }

    // Status filter (special handling for 'held')
    if (statusFilter !== 'all') {
      if (statusFilter === 'held') {
        result = result.filter(({ hold }) => hold.isHeld);
      } else {
        result = result.filter(({ job, hold }) => job.status === statusFilter && !hold.isHeld);
      }
    }

    // Min Score filter
    if (minScoreFilter > 0) {
      result = result.filter(({ job }) => typeof job.score === 'number' && job.score >= minScoreFilter);
    }

    // Strategy filter
    if (strategyFilter !== 'all') {
      result = result.filter(({ job }) => (job.strategy || 'referral_first') === strategyFilter);
    }

    // Sorting
    result.sort((a, b) => {
      if (sortBy === 'score_desc') return (b.job.score || 0) - (a.job.score || 0);
      if (sortBy === 'score_asc') return (a.job.score || 0) - (b.job.score || 0);
      if (sortBy === 'company_asc') return a.job.company.localeCompare(b.job.company);
      if (sortBy === 'date_desc') return (b.job.createdAt || 0) - (a.job.createdAt || 0);
      if (sortBy === 'ghost_risk') return b.ghost.ghostRiskScore - a.ghost.ghostRiskScore;
      return 0;
    });

    return result;
  }, [applications, searchQuery, statusFilter, minScoreFilter, strategyFilter, sortBy]);

  // Keyboard navigation: j/k to move, x to select, v to toggle view
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes((e.target as HTMLElement)?.tagName)) return;

      if (e.key === 'j') {
        e.preventDefault();
        setActiveCursorIndex((prev) => Math.min(processedJobs.length - 1, prev + 1));
      } else if (e.key === 'k') {
        e.preventDefault();
        setActiveCursorIndex((prev) => Math.max(0, prev - 1));
      } else if (e.key === 'x') {
        e.preventDefault();
        const active = processedJobs[activeCursorIndex];
        if (active) toggleSelectJob(active.job.id);
      } else if (e.key === 'v') {
        e.preventDefault();
        setViewMode((prev) => (prev === 'kanban' ? 'table' : 'kanban'));
      } else if (e.key === 'Enter') {
        const active = processedJobs[activeCursorIndex];
        if (active) {
          e.preventDefault();
          onSelectJob(active.job);
          onOpenEvaluator(active.job);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [processedJobs, activeCursorIndex]);

  // Bulk Selection Helpers
  const toggleSelectJob = (id: string) => {
    setSelectedJobIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAllVisible = () => {
    if (selectedJobIds.size === processedJobs.length) {
      setSelectedJobIds(new Set());
    } else {
      setSelectedJobIds(new Set(processedJobs.map((p) => p.job.id)));
    }
  };

  const handleBulkSetStrategy = (strategy: JobStrategyType) => {
    selectedJobIds.forEach((id) => {
      updateJob(id, { strategy });
    });
    setSelectedJobIds(new Set());
  };

  const handleBulkAdvanceStage = (nextStatus: ApplicationStatus) => {
    selectedJobIds.forEach((id) => {
      updateJob(id, { status: nextStatus });
    });
    setSelectedJobIds(new Set());
  };

  const handleBulkDelete = () => {
    selectedJobIds.forEach((id) => {
      deleteJob(id);
    });
    setSelectedJobIds(new Set());
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', width: '100%' }}>
      {/* ── Query & Control Header ── */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: '12px',
          background: 'rgba(15, 23, 42, 0.75)',
          padding: '14px 16px',
          borderRadius: '12px',
          border: '1px solid rgba(255, 255, 255, 0.08)',
        }}
      >
        {/* Top Row: Search + View Mode Switcher + Add Job */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '10px' }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              flex: 1,
              minWidth: '260px',
              background: 'rgba(0, 0, 0, 0.35)',
              padding: '6px 12px',
              borderRadius: '8px',
              border: '1px solid rgba(255, 255, 255, 0.1)',
            }}
          >
            <Search size={14} color="#94a3b8" />
            <input
              type="text"
              placeholder="Search by company, role, location... (Press j/k to navigate)"
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
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                style={{ background: 'transparent', border: 'none', color: '#94a3b8', cursor: 'pointer', padding: 0 }}
              >
                ✕
              </button>
            )}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            {/* View Mode Toggle */}
            <div
              style={{
                display: 'flex',
                background: 'rgba(0, 0, 0, 0.4)',
                borderRadius: '8px',
                padding: '2px',
                border: '1px solid rgba(255, 255, 255, 0.1)',
              }}
            >
              <button
                onClick={() => setViewMode('kanban')}
                title="Kanban Board View (Shortcut: v)"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                  padding: '4px 10px',
                  borderRadius: '6px',
                  fontSize: '11px',
                  fontWeight: 650,
                  cursor: 'pointer',
                  border: 'none',
                  background: viewMode === 'kanban' ? 'rgba(99, 102, 241, 0.35)' : 'transparent',
                  color: viewMode === 'kanban' ? '#ffffff' : '#94a3b8',
                }}
              >
                <LayoutGrid size={13} />
                <span>Kanban</span>
              </button>
              <button
                onClick={() => setViewMode('table')}
                title="Dense Table View (Shortcut: v)"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                  padding: '4px 10px',
                  borderRadius: '6px',
                  fontSize: '11px',
                  fontWeight: 650,
                  cursor: 'pointer',
                  border: 'none',
                  background: viewMode === 'table' ? 'rgba(99, 102, 241, 0.35)' : 'transparent',
                  color: viewMode === 'table' ? '#ffffff' : '#94a3b8',
                }}
              >
                <TableIcon size={13} />
                <span>Table</span>
              </button>
            </div>

            {/* Sort Dropdown */}
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as SortOption)}
              style={{
                background: 'rgba(15, 23, 42, 0.8)',
                color: '#cbd5e1',
                border: '1px solid rgba(255, 255, 255, 0.12)',
                borderRadius: '8px',
                padding: '5px 8px',
                fontSize: '11px',
                fontWeight: 600,
                cursor: 'pointer',
                outline: 'none',
              }}
            >
              <option value="score_desc">★ Score: High to Low</option>
              <option value="score_asc">★ Score: Low to High</option>
              <option value="company_asc">Company: A to Z</option>
              <option value="date_desc">Recent Activity</option>
              <option value="ghost_risk">Ghost Job Risk</option>
            </select>

            <button
              onClick={onAddNewJob}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                padding: '6px 14px',
                borderRadius: '8px',
                background: 'linear-gradient(135deg, #f97316, #ea580c)',
                color: '#ffffff',
                border: 'none',
                fontSize: '11px',
                fontWeight: 750,
                cursor: 'pointer',
                boxShadow: '0 2px 10px rgba(249, 115, 22, 0.3)',
              }}
            >
              <span>+ Add Job</span>
            </button>
          </div>
        </div>

        {/* Second Row: Quick Filter Presets & Strategy Filter */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
            <span style={{ fontSize: '11px', fontWeight: 700, color: '#64748b' }}>Presets:</span>
            <button
              onClick={() => setQuickFilter('high_fit')}
              style={{
                padding: '3px 8px',
                borderRadius: '6px',
                fontSize: '11px',
                fontWeight: 650,
                cursor: 'pointer',
                background: minScoreFilter === 4.0 ? 'rgba(16, 185, 129, 0.25)' : 'rgba(255, 255, 255, 0.05)',
                color: minScoreFilter === 4.0 ? '#34d399' : '#94a3b8',
                border: minScoreFilter === 4.0 ? '1px solid #10b981' : '1px solid transparent',
              }}
            >
              🔥 High Fit (≥4.0)
            </button>

            <button
              onClick={() => setQuickFilter('referral_hold')}
              style={{
                padding: '3px 8px',
                borderRadius: '6px',
                fontSize: '11px',
                fontWeight: 650,
                cursor: 'pointer',
                background: statusFilter === 'held' ? 'rgba(245, 158, 11, 0.25)' : 'rgba(255, 255, 255, 0.05)',
                color: statusFilter === 'held' ? '#fbbf24' : '#94a3b8',
                border: statusFilter === 'held' ? '1px solid #f59e0b' : '1px solid transparent',
              }}
            >
              ⏳ In Referral Hold
            </button>

            <button
              onClick={() => setQuickFilter('interviewing')}
              style={{
                padding: '3px 8px',
                borderRadius: '6px',
                fontSize: '11px',
                fontWeight: 650,
                cursor: 'pointer',
                background: statusFilter === 'interviewing' ? 'rgba(6, 182, 212, 0.25)' : 'rgba(255, 255, 255, 0.05)',
                color: statusFilter === 'interviewing' ? '#22d3ee' : '#94a3b8',
                border: statusFilter === 'interviewing' ? '1px solid #06b6d4' : '1px solid transparent',
              }}
            >
              🎙️ Interviewing
            </button>

            {(statusFilter !== 'all' || minScoreFilter > 0 || strategyFilter !== 'all' || searchQuery) && (
              <button
                onClick={() => setQuickFilter('reset')}
                style={{
                  padding: '3px 8px',
                  borderRadius: '6px',
                  fontSize: '11px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  background: 'transparent',
                  color: '#f87171',
                  border: 'none',
                }}
              >
                Clear Filters
              </button>
            )}
          </div>

          {/* Strategy Filter */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ fontSize: '11px', fontWeight: 700, color: '#64748b' }}>Strategy:</span>
            <select
              value={strategyFilter}
              onChange={(e) => setStrategyFilter(e.target.value as any)}
              style={{
                background: 'rgba(0, 0, 0, 0.35)',
                color: '#cbd5e1',
                border: '1px solid rgba(255, 255, 255, 0.1)',
                borderRadius: '6px',
                padding: '3px 6px',
                fontSize: '11px',
                fontWeight: 600,
                cursor: 'pointer',
                outline: 'none',
              }}
            >
              <option value="all">All Strategies</option>
              <option value="referral_first">Referral First (4d Hold)</option>
              <option value="apply_now">Direct Apply Now</option>
              <option value="both">Both Simultaneously</option>
            </select>
          </div>
        </div>
      </div>

      {/* ── Empty State ── */}
      {processedJobs.length === 0 ? (
        <div
          style={{
            padding: '48px 24px',
            textAlign: 'center',
            background: 'rgba(15, 23, 42, 0.45)',
            borderRadius: '12px',
            border: '1px dashed rgba(255, 255, 255, 0.12)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '12px',
          }}
        >
          <Briefcase size={36} color="#64748b" />
          <h3 style={{ fontSize: '16px', color: '#f8fafc', margin: 0, fontWeight: 700 }}>
            No Matching Applications
          </h3>
          <p style={{ fontSize: '13px', color: '#94a3b8', margin: 0, maxWidth: '420px', lineHeight: 1.5 }}>
            {applications.length === 0
              ? 'Start by evaluating target roles or load rich sample positions.'
              : 'No tracked roles match your current search and filter combination.'}
          </p>
          <div style={{ display: 'flex', gap: '10px', marginTop: '6px' }}>
            {applications.length === 0 ? (
              <>
                <button
                  onClick={onAddNewJob}
                  style={{
                    padding: '8px 16px',
                    borderRadius: '8px',
                    background: 'linear-gradient(135deg, #f97316, #ea580c)',
                    color: '#ffffff',
                    border: 'none',
                    fontSize: '12px',
                    fontWeight: 700,
                    cursor: 'pointer',
                  }}
                >
                  + Add Target Job
                </button>
                <button
                  onClick={enableDemoMode}
                  style={{
                    padding: '8px 16px',
                    borderRadius: '8px',
                    background: 'rgba(255, 255, 255, 0.08)',
                    color: '#cbd5e1',
                    border: '1px solid rgba(255, 255, 255, 0.15)',
                    fontSize: '12px',
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  ⚡ Load Demo Pipeline
                </button>
              </>
            ) : (
              <button
                onClick={() => setQuickFilter('reset')}
                style={{
                  padding: '8px 16px',
                  borderRadius: '8px',
                  background: 'rgba(255, 255, 255, 0.08)',
                  color: '#ffffff',
                  border: '1px solid rgba(255, 255, 255, 0.15)',
                  fontSize: '12px',
                  fontWeight: 650,
                  cursor: 'pointer',
                }}
              >
                Reset Filter Query
              </button>
            )}
          </div>
        </div>
      ) : viewMode === 'kanban' ? (
        /* ── KANBAN DUAL-VIEW ── */
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: `repeat(${PIPELINE_COLUMNS.length}, minmax(220px, 1fr))`,
            gap: '12px',
            overflowX: 'auto',
            paddingBottom: '16px',
          }}
        >
          {PIPELINE_COLUMNS.map((col) => {
            const columnJobs = processedJobs.filter(({ job, hold }) => {
              if (col.id === 'held') return hold.isHeld;
              return job.status === col.id && !hold.isHeld;
            });

            return (
              <div
                key={col.id}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '10px',
                  background: 'rgba(15, 23, 42, 0.45)',
                  borderRadius: '10px',
                  padding: '12px',
                  border: '1px solid rgba(255, 255, 255, 0.06)',
                  minHeight: '400px',
                }}
              >
                {/* Column Header */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingBottom: '6px', borderBottom: '1px solid rgba(255, 255, 255, 0.06)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: col.color }} />
                    <span style={{ fontSize: '12px', fontWeight: 750, color: '#f8fafc' }}>
                      {col.label}
                    </span>
                  </div>
                  <span
                    style={{
                      fontSize: '10px',
                      fontWeight: 700,
                      padding: '1px 6px',
                      borderRadius: '10px',
                      background: 'rgba(255, 255, 255, 0.08)',
                      color: '#cbd5e1',
                    }}
                  >
                    {columnJobs.length}
                  </span>
                </div>

                {/* Cards Container */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', flex: 1 }}>
                  {columnJobs.map(({ job, ghost, hold }, cardIdx) => {
                    const isSelected = selectedJobIds.has(job.id);
                    const isActive = activeJobId === job.id;

                    return (
                      <div
                        key={job.id}
                        onClick={() => {
                          setActiveJobId(job.id);
                          onSelectJob(job);
                        }}
                        style={{
                          padding: '12px',
                          borderRadius: '8px',
                          background: isActive ? 'rgba(30, 41, 59, 0.95)' : 'rgba(15, 23, 42, 0.85)',
                          border: isSelected
                            ? '1.5px solid #6366f1'
                            : isActive
                              ? '1px solid rgba(249, 115, 22, 0.5)'
                              : '1px solid rgba(255, 255, 255, 0.08)',
                          boxShadow: isSelected ? '0 0 12px rgba(99, 102, 241, 0.3)' : '0 2px 8px rgba(0, 0, 0, 0.25)',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: '6px',
                          cursor: 'pointer',
                          transition: 'all 0.15s ease',
                        }}
                      >
                        {/* Card Top: Checkbox + Company & Fit Badge */}
                        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '6px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                toggleSelectJob(job.id);
                              }}
                              style={{ background: 'transparent', border: 'none', color: isSelected ? '#818cf8' : '#64748b', cursor: 'pointer', padding: 0 }}
                            >
                              {isSelected ? <CheckSquare size={13} /> : <Square size={13} />}
                            </button>
                            <span style={{ fontSize: '12px', fontWeight: 800, color: '#f8fafc' }}>
                              {job.company}
                            </span>
                          </div>

                          {typeof job.score === 'number' && (
                            <span
                              style={{
                                fontSize: '10px',
                                fontWeight: 800,
                                padding: '1px 5px',
                                borderRadius: '4px',
                                background: job.score >= 4.0 ? 'rgba(16, 185, 129, 0.2)' : 'rgba(255, 255, 255, 0.08)',
                                color: job.score >= 4.0 ? '#34d399' : '#cbd5e1',
                                border: job.score >= 4.0 ? '1px solid rgba(52, 211, 153, 0.4)' : 'none',
                              }}
                            >
                              ★ {job.score.toFixed(1)}
                            </span>
                          )}
                        </div>

                        {/* Role Title */}
                        <span style={{ fontSize: '12px', fontWeight: 650, color: '#cbd5e1', lineHeight: 1.3 }}>
                          {job.role}
                        </span>

                        {/* Hold Timer or Ghost Badge */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px', flexWrap: 'wrap', marginTop: '2px' }}>
                          {hold.isHeld ? (
                            <span
                              style={{
                                fontSize: '9px',
                                fontWeight: 750,
                                padding: '2px 5px',
                                borderRadius: '4px',
                                background: 'rgba(245, 158, 11, 0.2)',
                                color: '#fbbf24',
                                border: '1px solid rgba(245, 158, 11, 0.4)',
                              }}
                            >
                              ⏳ Hold: {Math.ceil(hold.holdRemainingMs / (1000 * 3600))}h
                            </span>
                          ) : ghost.riskLevel === 'fresh' ? (
                            <span style={{ fontSize: '9px', fontWeight: 750, padding: '1px 4px', borderRadius: '3px', background: 'rgba(16, 185, 129, 0.15)', color: '#6ee7b7' }}>
                              ⚡ Fresh
                            </span>
                          ) : ghost.riskLevel === 'high_ghost_risk' ? (
                            <span style={{ fontSize: '9px', fontWeight: 750, padding: '1px 4px', borderRadius: '3px', background: 'rgba(239, 68, 68, 0.15)', color: '#fca5a5' }}>
                              🚨 Ghost Risk
                            </span>
                          ) : null}

                          <span style={{ fontSize: '9px', color: '#64748b' }}>
                            {job.strategy === 'apply_now' ? 'ATS Now' : job.strategy === 'both' ? 'Both' : 'Ref First'}
                          </span>

                          {job.tailoredResume && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                exportTailoredResumeToPdf(
                                  job.tailoredResume!,
                                  job.role,
                                  job.company,
                                  useCandidateVaultStore.getState().profile,
                                  'modern_sans'
                                );
                              }}
                              style={{
                                marginLeft: 'auto',
                                padding: '1px 5px',
                                borderRadius: '4px',
                                background: 'rgba(37, 99, 235, 0.25)',
                                color: '#60a5fa',
                                border: '1px solid rgba(37, 99, 235, 0.4)',
                                fontSize: '9px',
                                fontWeight: 700,
                                cursor: 'pointer',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '3px',
                              }}
                              title="1-Click Download Tailored Resume PDF"
                            >
                              <Download size={9} />
                              <span>PDF</span>
                            </button>
                          )}

                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setActiveJobId(job.id);
                              onOpenOutreach(job);
                            }}
                            style={{
                              marginLeft: job.tailoredResume ? '4px' : 'auto',
                              padding: '1px 6px',
                              borderRadius: '4px',
                              background: 'rgba(99, 102, 241, 0.2)',
                              color: '#a5b4fc',
                              border: '1px solid rgba(99, 102, 241, 0.35)',
                              fontSize: '9px',
                              fontWeight: 700,
                              cursor: 'pointer',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '3px',
                            }}
                            title={`Open LinkedIn Outreach Studio for ${job.company}`}
                          >
                            <Users size={9} />
                            <span>Outreach</span>
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        /* ── TABLE DUAL-VIEW ── */
        <div
          style={{
            background: 'rgba(15, 23, 42, 0.85)',
            borderRadius: '12px',
            border: '1px solid rgba(255, 255, 255, 0.08)',
            overflowX: 'auto',
          }}
        >
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '12px' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.1)', color: '#94a3b8', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                <th style={{ padding: '12px 14px', width: '32px' }}>
                  <button onClick={selectAllVisible} style={{ background: 'transparent', border: 'none', color: '#94a3b8', cursor: 'pointer', padding: 0 }}>
                    {selectedJobIds.size === processedJobs.length ? <CheckSquare size={13} /> : <Square size={13} />}
                  </button>
                </th>
                <th style={{ padding: '12px 14px' }}>Company & Role</th>
                <th style={{ padding: '12px 14px' }}>Stage</th>
                <th style={{ padding: '12px 14px' }}>Strategy</th>
                <th style={{ padding: '12px 14px' }}>Fit Score</th>
                <th style={{ padding: '12px 14px' }}>Ghost Radar</th>
                <th style={{ padding: '12px 14px' }}>Referral Status</th>
                <th style={{ padding: '12px 14px', textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {processedJobs.map(({ job, ghost, hold }, idx) => {
                const isSelected = selectedJobIds.has(job.id);
                const isActive = activeJobId === job.id;

                return (
                  <tr
                    key={job.id}
                    onClick={() => {
                      setActiveJobId(job.id);
                      onSelectJob(job);
                    }}
                    style={{
                      borderBottom: '1px solid rgba(255, 255, 255, 0.05)',
                      background: isSelected
                        ? 'rgba(99, 102, 241, 0.15)'
                        : isActive
                          ? 'rgba(249, 115, 22, 0.08)'
                          : idx % 2 === 0
                            ? 'rgba(255, 255, 255, 0.015)'
                            : 'transparent',
                      cursor: 'pointer',
                      transition: 'background 0.12s ease',
                    }}
                  >
                    <td style={{ padding: '12px 14px' }} onClick={(e) => e.stopPropagation()}>
                      <button
                        onClick={() => toggleSelectJob(job.id)}
                        style={{ background: 'transparent', border: 'none', color: isSelected ? '#818cf8' : '#64748b', cursor: 'pointer', padding: 0 }}
                      >
                        {isSelected ? <CheckSquare size={13} /> : <Square size={13} />}
                      </button>
                    </td>

                    <td style={{ padding: '12px 14px' }}>
                      <div style={{ display: 'flex', flexDirection: 'column' }}>
                        <span style={{ fontWeight: 750, color: '#f8fafc' }}>{job.company}</span>
                        <span style={{ color: '#94a3b8', fontSize: '11px' }}>{job.role}</span>
                      </div>
                    </td>

                    <td style={{ padding: '12px 14px' }}>
                      <span
                        style={{
                          fontSize: '10px',
                          fontWeight: 750,
                          padding: '2px 6px',
                          borderRadius: '4px',
                          background: 'rgba(255, 255, 255, 0.08)',
                          color: '#cbd5e1',
                          textTransform: 'capitalize',
                        }}
                      >
                        {hold.isHeld ? 'Referral Hold' : job.status}
                      </span>
                    </td>

                    <td style={{ padding: '12px 14px' }}>
                      <span style={{ fontSize: '11px', color: '#cbd5e1', fontWeight: 600 }}>
                        {job.strategy === 'apply_now' ? '⚡ Apply Now' : job.strategy === 'both' ? 'Dual' : '🤝 Referral First'}
                      </span>
                    </td>

                    <td style={{ padding: '12px 14px' }}>
                      {typeof job.score === 'number' ? (
                        <span style={{ fontWeight: 750, color: job.score >= 4.0 ? '#34d399' : '#cbd5e1' }}>
                          ★ {job.score.toFixed(1)}
                        </span>
                      ) : (
                        <span style={{ color: '#64748b' }}>—</span>
                      )}
                    </td>

                    <td style={{ padding: '12px 14px' }}>
                      <span
                        style={{
                          fontSize: '10px',
                          fontWeight: 700,
                          padding: '2px 6px',
                          borderRadius: '4px',
                          background: ghost.riskLevel === 'fresh' ? 'rgba(16, 185, 129, 0.15)' : 'rgba(245, 158, 11, 0.15)',
                          color: ghost.riskLevel === 'fresh' ? '#6ee7b7' : '#fbbf24',
                        }}
                      >
                        {ghost.riskLevel === 'fresh' ? 'Fresh (95%)' : `Risk: ${ghost.ghostRiskScore}`}
                      </span>
                    </td>

                    <td style={{ padding: '12px 14px' }}>
                      {hold.isHeld ? (
                        <span style={{ fontSize: '11px', color: '#fbbf24', fontWeight: 650 }}>
                          ⏳ {Math.ceil(hold.holdRemainingMs / (1000 * 3600))}h left
                        </span>
                      ) : (
                        <span style={{ fontSize: '11px', color: '#94a3b8' }}>Unlocked</span>
                      )}
                    </td>

                    <td style={{ padding: '12px 14px', textAlign: 'right' }} onClick={(e) => e.stopPropagation()}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '6px' }}>
                        <button
                          onClick={() => {
                            setActiveJobId(job.id);
                            onSelectJob(job);
                            onOpenEvaluator(job);
                          }}
                          style={{
                            padding: '3px 8px',
                            borderRadius: '5px',
                            background: 'rgba(99, 102, 241, 0.2)',
                            color: '#c7d2fe',
                            border: '1px solid rgba(99, 102, 241, 0.35)',
                            fontSize: '10px',
                            fontWeight: 700,
                            cursor: 'pointer',
                          }}
                        >
                          Eval
                        </button>
                        {job.tailoredResume && (
                          <button
                            onClick={() => {
                              exportTailoredResumeToPdf(
                                job.tailoredResume!,
                                job.role,
                                job.company,
                                useCandidateVaultStore.getState().profile,
                                'modern_sans'
                              );
                            }}
                            style={{
                              padding: '3px 8px',
                              borderRadius: '5px',
                              background: 'rgba(37, 99, 235, 0.25)',
                              color: '#60a5fa',
                              border: '1px solid rgba(37, 99, 235, 0.4)',
                              fontSize: '10px',
                              fontWeight: 700,
                              cursor: 'pointer',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '3px',
                            }}
                            title="1-Click Download Tailored Resume PDF"
                          >
                            <Download size={10} />
                            <span>PDF</span>
                          </button>
                        )}
                        <button
                          onClick={() => {
                            setActiveJobId(job.id);
                            onSelectJob(job);
                            onOpenTailor(job);
                          }}
                          style={{
                            padding: '3px 8px',
                            borderRadius: '5px',
                            background: 'rgba(255, 255, 255, 0.08)',
                            color: '#cbd5e1',
                            border: '1px solid rgba(255, 255, 255, 0.15)',
                            fontSize: '10px',
                            fontWeight: 600,
                            cursor: 'pointer',
                          }}
                        >
                          Tailor
                        </button>
                        <button
                          onClick={() => {
                            setActiveJobId(job.id);
                            onOpenOutreach(job);
                          }}
                          style={{
                            padding: '3px 8px',
                            borderRadius: '5px',
                            background: 'rgba(99, 102, 241, 0.18)',
                            color: '#a5b4fc',
                            border: '1px solid rgba(99, 102, 241, 0.35)',
                            fontSize: '10px',
                            fontWeight: 600,
                            cursor: 'pointer',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '4px',
                          }}
                          title={`Open LinkedIn Outreach Studio for ${job.company}`}
                        >
                          <Users size={10} />
                          <span>Outreach</span>
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Persistent Floating Bulk Actions Bar ── */}
      {selectedJobIds.size > 0 && (
        <div
          style={{
            position: 'fixed',
            bottom: '24px',
            left: '50%',
            transform: 'translateX(-50%)',
            background: 'linear-gradient(135deg, #1e1b4b, #0f172a)',
            border: '1.5px solid rgba(99, 102, 241, 0.6)',
            borderRadius: '12px',
            padding: '10px 20px',
            boxShadow: '0 12px 32px rgba(0, 0, 0, 0.6), 0 0 20px rgba(99, 102, 241, 0.3)',
            display: 'flex',
            alignItems: 'center',
            gap: '14px',
            zIndex: 100,
            flexWrap: 'wrap',
          }}
        >
          <span style={{ fontSize: '12px', fontWeight: 800, color: '#f8fafc' }}>
            {selectedJobIds.size} Jobs Selected
          </span>

          <div style={{ height: '16px', width: '1px', background: 'rgba(255, 255, 255, 0.2)' }} />

          {/* Bulk Strategy */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ fontSize: '11px', color: '#94a3b8', fontWeight: 650 }}>Set Strategy:</span>
            <button
              onClick={() => handleBulkSetStrategy('referral_first')}
              style={{
                padding: '4px 8px',
                borderRadius: '6px',
                background: 'rgba(255, 255, 255, 0.08)',
                color: '#cbd5e1',
                border: '1px solid rgba(255, 255, 255, 0.15)',
                fontSize: '11px',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              Referral First
            </button>
            <button
              onClick={() => handleBulkSetStrategy('apply_now')}
              style={{
                padding: '4px 8px',
                borderRadius: '6px',
                background: 'rgba(255, 255, 255, 0.08)',
                color: '#cbd5e1',
                border: '1px solid rgba(255, 255, 255, 0.15)',
                fontSize: '11px',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              Apply Now
            </button>
          </div>

          <div style={{ height: '16px', width: '1px', background: 'rgba(255, 255, 255, 0.2)' }} />

          {/* Bulk Stage Advance */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ fontSize: '11px', color: '#94a3b8', fontWeight: 650 }}>Move to:</span>
            <button
              onClick={() => handleBulkAdvanceStage('applied')}
              style={{
                padding: '4px 8px',
                borderRadius: '6px',
                background: 'rgba(6, 182, 212, 0.25)',
                color: '#a5f3fc',
                border: '1px solid rgba(6, 182, 212, 0.45)',
                fontSize: '11px',
                fontWeight: 650,
                cursor: 'pointer',
              }}
            >
              Applied
            </button>
          </div>

          <button
            onClick={handleBulkDelete}
            title="Remove selected jobs"
            style={{
              padding: '4px 8px',
              borderRadius: '6px',
              background: 'rgba(239, 68, 68, 0.2)',
              color: '#fca5a5',
              border: '1px solid rgba(239, 68, 68, 0.4)',
              fontSize: '11px',
              fontWeight: 650,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
            }}
          >
            <Trash2 size={11} />
            <span>Delete</span>
          </button>

          <button
            onClick={() => setSelectedJobIds(new Set())}
            style={{
              background: 'transparent',
              border: 'none',
              color: '#94a3b8',
              fontSize: '11px',
              cursor: 'pointer',
              fontWeight: 600,
            }}
          >
            Cancel
          </button>
        </div>
      )}
    </div>
  );
};
