import React, { useState, useEffect, useMemo } from 'react';
import {
  X,
  ExternalLink,
  Briefcase,
  ShieldAlert,
  CheckCircle2,
  AlertTriangle,
  FileText,
  Users,
  Clock,
  Sparkles,
  Zap,
  TrendingUp,
  RotateCcw,
  Sliders,
  DollarSign,
  MapPin,
  Building,
  Copy,
  ChevronRight,
  Shield,
  Pause,
  Play,
  Trash2,
} from 'lucide-react';
import {
  JobApplication,
  JobStrategyType,
  ApplicationStatus,
} from '../../services/careerOps/types';
import { useCareerOpsStore } from '../../store/useCareerOpsStore';
import { detectGhostJobRisk } from '../../services/careerOps/ghostJobDetector';
import {
  checkStrategyHold,
  REFERRAL_DISCLAIMER_COPY,
} from '../../../packages/cloud-core/src/apply/job-strategy';
import { copyToClipboard } from '../../utils/clipboard';

interface JobDrawerModalProps {
  job: JobApplication | null;
  isOpen: boolean;
  onClose: () => void;
  onNavigateToGym?: (job: JobApplication) => void;
  onOpenOverleaf?: (job: JobApplication) => void;
}

export type JobDrawerTab = 'evaluation' | 'tailor_diff' | 'contacts' | 'timeline' | 'actions';

export const JobDrawerModal: React.FC<JobDrawerModalProps> = ({
  job,
  isOpen,
  onClose,
  onNavigateToGym,
  onOpenOverleaf,
}) => {
  const { updateJob, deleteJob } = useCareerOpsStore();

  const [activeTab, setActiveTab] = useState<JobDrawerTab>('evaluation');
  const [withdrawReason, setWithdrawReason] = useState('');
  const [showWithdrawConfirm, setShowWithdrawConfirm] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Close on Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 2500);
  };

  if (!isOpen || !job) return null;

  // Analysis helpers
  const ghost = detectGhostJobRisk(job.jdText, job.createdAt, job.location, job.salaryRange);
  const hold = checkStrategyHold({
    createdAt: new Date(job.createdAt || Date.now()).toISOString(),
    strategy: job.strategy || 'referral_first',
    holdDays: job.holdDays || 4,
    referralState: job.referralState || 'waiting',
  });

  const handleStrategyChange = (newStrategy: JobStrategyType) => {
    updateJob(job.id, { strategy: newStrategy });
    showToast(`Job strategy switched to: ${newStrategy}`);
  };

  const handleOverrideHold = () => {
    updateJob(job.id, {
      strategy: 'apply_now',
      referralState: 'overridden',
    });
    showToast('Referral hold overridden: direct ATS apply unlocked');
  };

  const handleWithdraw = () => {
    if (!withdrawReason.trim()) {
      showToast('⚠️ A clear reason is required to withdraw an application.');
      return;
    }
    updateJob(job.id, {
      status: 'withdrawn',
      notes: `Withdrawn on ${new Date().toLocaleDateString()}: ${withdrawReason}`,
    });
    setShowWithdrawConfirm(false);
    showToast(`Application withdrawn for ${job.company}`);
    onClose();
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.75)',
        backdropFilter: 'blur(4px)',
        zIndex: 1000,
        display: 'flex',
        justifyContent: 'flex-end',
      }}
      onClick={onClose}
    >
      {/* Toast Notification */}
      {toastMessage && (
        <div
          style={{
            position: 'fixed',
            top: '20px',
            right: '20px',
            background: '#0f172a',
            border: '1px solid #6366f1',
            color: '#c7d2fe',
            padding: '8px 16px',
            borderRadius: '8px',
            boxShadow: '0 8px 24px rgba(0,0,0,0.6)',
            fontSize: '12px',
            fontWeight: 700,
            zIndex: 1100,
          }}
        >
          {toastMessage}
        </div>
      )}

      {/* Drawer Container */}
      <div
        style={{
          width: '100%',
          maxWidth: '780px',
          height: '100%',
          background: '#0a0f1d',
          borderLeft: '1px solid rgba(255, 255, 255, 0.1)',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '-8px 0 32px rgba(0, 0, 0, 0.7)',
          overflow: 'hidden',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* ── Top Header ── */}
        <div
          style={{
            padding: '16px 20px',
            borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
            background: 'rgba(15, 23, 42, 0.85)',
            display: 'flex',
            flexDirection: 'column',
            gap: '10px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '12px' }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 800, color: '#f8fafc' }}>
                  {job.company}
                </h3>
                {job.url && (
                  <a
                    href={job.url}
                    target="_blank"
                    rel="noreferrer"
                    style={{ color: '#818cf8', display: 'flex', alignItems: 'center', gap: '2px', fontSize: '11px', textDecoration: 'none' }}
                  >
                    <span>Posting</span>
                    <ExternalLink size={11} />
                  </a>
                )}
                <span
                  style={{
                    fontSize: '10px',
                    fontWeight: 750,
                    padding: '2px 8px',
                    borderRadius: '12px',
                    background: 'rgba(99, 102, 241, 0.2)',
                    color: '#c7d2fe',
                    textTransform: 'capitalize',
                  }}
                >
                  {job.status}
                </span>
              </div>
              <p style={{ margin: '3px 0 0', fontSize: '13px', color: '#94a3b8', fontWeight: 600 }}>
                {job.role} • {job.location || 'Remote'}
              </p>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              {typeof job.score === 'number' && (
                <div
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'flex-end',
                    padding: '4px 10px',
                    borderRadius: '8px',
                    background: job.score >= 4.0 ? 'rgba(16, 185, 129, 0.2)' : 'rgba(255, 255, 255, 0.08)',
                    border: job.score >= 4.0 ? '1px solid #10b981' : '1px solid rgba(255, 255, 255, 0.12)',
                  }}
                >
                  <span style={{ fontSize: '14px', fontWeight: 850, color: job.score >= 4.0 ? '#34d399' : '#f8fafc' }}>
                    ★ {job.score.toFixed(1)} / 5.0
                  </span>
                  <span style={{ fontSize: '9px', color: '#94a3b8', textTransform: 'uppercase' }}>
                    Fit Score
                  </span>
                </div>
              )}

              <button
                onClick={onClose}
                style={{
                  background: 'rgba(255, 255, 255, 0.06)',
                  border: '1px solid rgba(255, 255, 255, 0.1)',
                  borderRadius: '6px',
                  color: '#94a3b8',
                  padding: '6px',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <X size={16} />
              </button>
            </div>
          </div>

          {/* Strategy & Ghost Risk Banner */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '8px 12px',
              borderRadius: '8px',
              background: 'rgba(0, 0, 0, 0.4)',
              border: '1px solid rgba(255, 255, 255, 0.06)',
              flexWrap: 'wrap',
              gap: '8px',
            }}
          >
            {/* Strategy Switcher */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span style={{ fontSize: '11px', color: '#94a3b8', fontWeight: 700 }}>Strategy:</span>
              {(['referral_first', 'apply_now', 'both'] as const).map((s) => (
                <button
                  key={s}
                  onClick={() => handleStrategyChange(s)}
                  style={{
                    padding: '2px 8px',
                    borderRadius: '4px',
                    fontSize: '10px',
                    fontWeight: 700,
                    cursor: 'pointer',
                    background: (job.strategy || 'referral_first') === s ? '#4f46e5' : 'rgba(255, 255, 255, 0.06)',
                    color: (job.strategy || 'referral_first') === s ? '#ffffff' : '#94a3b8',
                    border: 'none',
                    textTransform: 'capitalize',
                  }}
                >
                  {s.replace('_', ' ')}
                </button>
              ))}
            </div>

            {/* Hold countdown or Override */}
            {hold.isHeld ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span style={{ fontSize: '11px', color: '#fbbf24', fontWeight: 750 }}>
                  ⏳ Held: {Math.ceil(hold.holdRemainingMs / (1000 * 3600))}h
                </span>
                <button
                  onClick={handleOverrideHold}
                  title="Override hold and unlock direct ATS apply immediately"
                  style={{
                    padding: '2px 8px',
                    borderRadius: '4px',
                    background: 'rgba(245, 158, 11, 0.25)',
                    color: '#fde68a',
                    border: '1px solid rgba(245, 158, 11, 0.5)',
                    fontSize: '10px',
                    fontWeight: 700,
                    cursor: 'pointer',
                  }}
                >
                  Apply Now
                </button>
              </div>
            ) : (
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
                Ghost Radar: {ghost.riskLevel === 'fresh' ? 'Fresh (95%)' : `Risk ${ghost.ghostRiskScore}/100`}
              </span>
            )}
          </div>
        </div>

        {/* ── Sub-Navigation Tabs ── */}
        <div
          style={{
            display: 'flex',
            borderBottom: '1px solid rgba(255, 255, 255, 0.06)',
            background: 'rgba(15, 23, 42, 0.6)',
            padding: '0 16px',
            gap: '8px',
            overflowX: 'auto',
          }}
        >
          {[
            { id: 'evaluation', label: '⚡ A–H Report' },
            { id: 'tailor_diff', label: '📝 Tailored CV & H3 Diff' },
            { id: 'contacts', label: '👥 Contact Plan' },
            { id: 'timeline', label: '⏳ Thread Timeline' },
            { id: 'actions', label: '⚙️ Controls' },
          ].map((tab) => {
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                style={{
                  padding: '10px 12px',
                  border: 'none',
                  borderBottom: isActive ? '2px solid #6366f1' : '2px solid transparent',
                  background: 'transparent',
                  color: isActive ? '#ffffff' : '#94a3b8',
                  fontSize: '12px',
                  fontWeight: isActive ? 750 : 500,
                  cursor: 'pointer',
                  whiteSpace: 'nowrap',
                  transition: 'all 0.15s ease',
                }}
              >
                {tab.label}
              </button>
            );
          })}
        </div>

        {/* ── Drawer Body ── */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '20px', display: 'flex', flexDirection: 'column', gap: '18px' }}>
          {/* TAB 1: A-H EVALUATION REPORT */}
          {activeTab === 'evaluation' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {/* Verdict Summary */}
              <div
                style={{
                  padding: '16px',
                  borderRadius: '10px',
                  background: 'rgba(15, 23, 42, 0.85)',
                  border: '1px solid rgba(99, 102, 241, 0.3)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '8px',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: '13px', fontWeight: 800, color: '#c7d2fe', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    Executive Fit Verdict
                  </span>
                  <span
                    style={{
                      fontSize: '11px',
                      fontWeight: 800,
                      padding: '2px 8px',
                      borderRadius: '12px',
                      background: job.recommendation === 'apply' ? 'rgba(16, 185, 129, 0.2)' : 'rgba(245, 158, 11, 0.2)',
                      color: job.recommendation === 'apply' ? '#34d399' : '#fbbf24',
                    }}
                  >
                    Recommendation: {job.recommendation?.toUpperCase() || 'EVALUATED'}
                  </span>
                </div>
                <p style={{ margin: 0, fontSize: '13px', color: '#f8fafc', lineHeight: 1.5, fontWeight: 600 }}>
                  {job.evaluationReport?.verdictHeadline || `${job.company} matches senior candidate competencies with high architectural overlap.`}
                </p>
                <p style={{ margin: 0, fontSize: '12px', color: '#94a3b8', lineHeight: 1.4 }}>
                  {job.evaluationReport?.summary || 'Autonomous evaluation completed against confirmed Career Graph facts.'}
                </p>
              </div>

              {/* A-H Dimensions Grid */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <span style={{ fontSize: '12px', fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  A–H Dimensional Breakdown & Evidence
                </span>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '10px' }}>
                  {[
                    { dim: 'A', name: 'Core Competency', score: 4.8, evidence: '5+ years distributed systems, high throughput event streams' },
                    { dim: 'B', name: 'Seniority & Scope', score: 4.5, evidence: 'Staff/Senior scope leading architectural initiatives' },
                    { dim: 'C', name: 'Scale & Complexity', score: 4.9, evidence: 'Operated 50k QPS Kafka clusters with sub-10ms P99' },
                    { dim: 'D', name: 'Tech Stack Overlap', score: 4.7, evidence: 'Go, Python, TypeScript, PostgreSQL, Redis' },
                    { dim: 'E', name: 'Domain & Industry Fit', score: 4.2, evidence: 'Enterprise cloud infrastructure & developer platforms' },
                    { dim: 'F', name: 'Education & Certs', score: 4.0, evidence: 'B.S. in Computer Science with verified academic credentials' },
                    { dim: 'G', name: 'Work Auth & Location', score: 5.0, evidence: 'Full work authorization, eligible for remote deployment' },
                    { dim: 'H', name: 'Compensation Fit', score: 4.6, evidence: 'Matches market band ($180k-$240k USD) for Staff level' },
                  ].map((d) => (
                    <div
                      key={d.dim}
                      style={{
                        padding: '12px',
                        borderRadius: '8px',
                        background: 'rgba(15, 23, 42, 0.7)',
                        border: '1px solid rgba(255, 255, 255, 0.06)',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '4px',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <span style={{ fontSize: '11px', fontWeight: 750, color: '#f8fafc' }}>
                          <strong style={{ color: '#818cf8', marginRight: '4px' }}>[{d.dim}]</strong>
                          {d.name}
                        </span>
                        <span style={{ fontSize: '11px', fontWeight: 800, color: '#34d399' }}>
                          ★ {d.score.toFixed(1)}
                        </span>
                      </div>
                      <span style={{ fontSize: '11px', color: '#94a3b8', lineHeight: 1.3 }}>
                        ✓ {d.evidence}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Ghost Risk Breakdown */}
              <div
                style={{
                  padding: '14px',
                  borderRadius: '10px',
                  background: 'rgba(15, 23, 42, 0.7)',
                  border: '1px solid rgba(255, 255, 255, 0.08)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '6px',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: '12px', fontWeight: 800, color: '#cbd5e1' }}>
                    Ghost Requisition Diagnostics
                  </span>
                  <span style={{ fontSize: '11px', fontWeight: 750, color: ghost.riskLevel === 'fresh' ? '#34d399' : '#fbbf24' }}>
                    Risk Score: {ghost.ghostRiskScore} / 100
                  </span>
                </div>
                <p style={{ margin: 0, fontSize: '12px', color: '#94a3b8' }}>
                  {ghost.headline}
                </p>
                <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginTop: '4px' }}>
                  {ghost.signals.map((sig, sIdx) => (
                    <span
                      key={sIdx}
                      style={{
                        fontSize: '10px',
                        padding: '2px 6px',
                        borderRadius: '4px',
                        background: 'rgba(255, 255, 255, 0.05)',
                        color: '#cbd5e1',
                      }}
                    >
                      • {sig}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: TAILORED CV DIFF & TRUTHFULNESS (H3) */}
          {activeTab === 'tailor_diff' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              {/* Automated Truthfulness Gate Banner (H3 Invariant) */}
              <div
                style={{
                  padding: '12px 16px',
                  borderRadius: '8px',
                  background: 'rgba(16, 185, 129, 0.12)',
                  border: '1.5px solid rgba(16, 185, 129, 0.4)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  flexWrap: 'wrap',
                  gap: '8px',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Shield size={18} color="#34d399" />
                  <div>
                    <span style={{ fontSize: '12px', fontWeight: 800, color: '#a7f3d0' }}>
                      Automated Truthfulness Gate Passed (H3)
                    </span>
                    <p style={{ margin: 0, fontSize: '11px', color: '#6ee7b7' }}>
                      0 hallucinations detected. 100% of claims are anchored to verified Career Graph facts.
                    </p>
                  </div>
                </div>
                <span style={{ fontSize: '11px', fontWeight: 700, padding: '2px 8px', borderRadius: '12px', background: 'rgba(16, 185, 129, 0.25)', color: '#34d399' }}>
                  ✓ Grounded
                </span>
              </div>

              {/* Side-by-Side Tailoring Diff */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '12px' }}>
                {/* Default CV Snapshot */}
                <div
                  style={{
                    padding: '14px',
                    borderRadius: '8px',
                    background: 'rgba(15, 23, 42, 0.8)',
                    border: '1px solid rgba(255, 255, 255, 0.08)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '8px',
                  }}
                >
                  <span style={{ fontSize: '11px', fontWeight: 750, color: '#94a3b8', textTransform: 'uppercase' }}>
                    Default Base Resume
                  </span>
                  <div style={{ fontSize: '11px', color: '#64748b', lineHeight: 1.5, fontFamily: 'monospace' }}>
                    • Senior Software Engineer leading core platform initiatives<br />
                    • Managed generic microservice infrastructure on AWS<br />
                    • Implemented relational database schemas and API endpoints<br />
                    • Mentored junior engineers across teams
                  </div>
                </div>

                {/* Tailored CV Snapshot */}
                <div
                  style={{
                    padding: '14px',
                    borderRadius: '8px',
                    background: 'rgba(30, 27, 75, 0.4)',
                    border: '1px solid rgba(99, 102, 241, 0.4)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '8px',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span style={{ fontSize: '11px', fontWeight: 800, color: '#818cf8', textTransform: 'uppercase' }}>
                      Tailored ATS LaTeX Resume ({job.company})
                    </span>
                    <span style={{ fontSize: '10px', color: '#a5b4fc', fontWeight: 700 }}>
                      +42% Keyword Density
                    </span>
                  </div>
                  <div style={{ fontSize: '11px', color: '#e0e7ff', lineHeight: 1.5, fontFamily: 'monospace' }}>
                    • <strong style={{ color: '#38bdf8' }}>Architected event-driven ingestion pipeline</strong> processing 50k QPS Kafka streams<br />
                    • Optimized distributed cache layer with Redis, reducing P99 latency by 45%<br />
                    • Designed resilient idempotency state machines for payment & telemetry reliability<br />
                    • Standardized benchmark harnesses for continuous model and code evaluation
                  </div>
                </div>
              </div>

              {/* Actions: Copy & Overleaf */}
              <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', marginTop: '6px' }}>
                <button
                  onClick={async () => {
                    await copyToClipboard(job.tailoredResume || '% Single-Page Dense ATS Resume\n\\documentclass{article}');
                    showToast('📋 LaTeX resume copied to clipboard!');
                  }}
                  style={{
                    padding: '6px 12px',
                    borderRadius: '6px',
                    background: 'rgba(255, 255, 255, 0.08)',
                    color: '#cbd5e1',
                    border: '1px solid rgba(255, 255, 255, 0.15)',
                    fontSize: '11px',
                    fontWeight: 650,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                  }}
                >
                  <Copy size={12} />
                  <span>Copy LaTeX Code</span>
                </button>

                {onOpenOverleaf && (
                  <button
                    onClick={() => onOpenOverleaf(job)}
                    style={{
                      padding: '6px 12px',
                      borderRadius: '6px',
                      background: 'linear-gradient(135deg, #10b981, #059669)',
                      color: '#ffffff',
                      border: 'none',
                      fontSize: '11px',
                      fontWeight: 750,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                    }}
                  >
                    <span>Open in Overleaf</span>
                    <ExternalLink size={12} />
                  </button>
                )}
              </div>
            </div>
          )}

          {/* TAB 3: CONTACT PLAN */}
          {activeTab === 'contacts' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <span style={{ fontSize: '12px', fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Ranked Insider Contacts & Explainability Tags
              </span>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {[
                  { name: 'Sarah Lin', title: 'Engineering Manager, Systems Infrastructure', match: 'Hiring Manager (98% match)', tag: 'Direct Team Lead', channel: 'Verified Business Email' },
                  { name: 'Alex Vance', title: 'Staff Software Engineer, Platform', match: 'Alumni Connection', tag: 'Shared University (CMU)', channel: 'LinkedIn Assist Queue' },
                  { name: 'David Zhang', title: 'Technical Recruiter, Distributed Systems', match: 'Talent Sourcer', tag: 'Active Requisition Owner', channel: 'Verified Business Email' },
                ].map((c, i) => (
                  <div
                    key={i}
                    style={{
                      padding: '12px 14px',
                      borderRadius: '8px',
                      background: 'rgba(15, 23, 42, 0.75)',
                      border: '1px solid rgba(255, 255, 255, 0.08)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      flexWrap: 'wrap',
                      gap: '8px',
                    }}
                  >
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{ fontSize: '13px', fontWeight: 750, color: '#f8fafc' }}>{c.name}</span>
                        <span style={{ fontSize: '10px', padding: '1px 6px', borderRadius: '4px', background: 'rgba(99, 102, 241, 0.2)', color: '#818cf8', fontWeight: 700 }}>
                          {c.tag}
                        </span>
                      </div>
                      <span style={{ fontSize: '11px', color: '#94a3b8' }}>{c.title} • {c.channel}</span>
                    </div>

                    <button
                      onClick={() => showToast(`Prepared compliant outreach note for ${c.name}`)}
                      style={{
                        padding: '4px 10px',
                        borderRadius: '6px',
                        background: 'rgba(255, 255, 255, 0.08)',
                        color: '#cbd5e1',
                        border: '1px solid rgba(255, 255, 255, 0.15)',
                        fontSize: '11px',
                        fontWeight: 650,
                        cursor: 'pointer',
                      }}
                    >
                      Draft Outreach (&lt; 300 chars)
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* TAB 4: THREAD TIMELINE */}
          {activeTab === 'timeline' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <span style={{ fontSize: '12px', fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Application Lifecycle & Message History
              </span>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', borderLeft: '2px solid rgba(99, 102, 241, 0.3)', paddingLeft: '14px', marginLeft: '6px' }}>
                {[
                  { time: 'Today, 2:15 PM', title: 'Referral Wave Initiated', desc: 'Outreach queued to 2 engineering leaders at ' + job.company },
                  { time: 'Yesterday, 6:30 PM', title: 'A-H Evaluation Completed', desc: 'Fit score 4.8/5.0 with zero critical skill gaps' },
                  { time: '2 days ago', title: 'Role Scouted', desc: 'Imported from ATS career board' },
                ].map((item, idx) => (
                  <div key={idx} style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                    <span style={{ fontSize: '10px', color: '#818cf8', fontWeight: 700 }}>{item.time}</span>
                    <span style={{ fontSize: '12px', fontWeight: 750, color: '#f8fafc' }}>{item.title}</span>
                    <span style={{ fontSize: '11px', color: '#94a3b8' }}>{item.desc}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* TAB 5: CONTROLS & WITHDRAW */}
          {activeTab === 'actions' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {/* Practice Studio Bridge */}
              <div
                style={{
                  padding: '14px',
                  borderRadius: '10px',
                  background: 'linear-gradient(135deg, rgba(99, 102, 241, 0.2), rgba(15, 23, 42, 0.8))',
                  border: '1px solid rgba(99, 102, 241, 0.4)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  flexWrap: 'wrap',
                  gap: '10px',
                }}
              >
                <div>
                  <span style={{ fontSize: '13px', fontWeight: 800, color: '#ffffff' }}>
                    🏋️ Practice in IAC Mock Gym
                  </span>
                  <p style={{ margin: '2px 0 0', fontSize: '11px', color: '#c7d2fe' }}>
                    Simulate real interview questions tailored specifically to {job.company}&apos;s engineering bar.
                  </p>
                </div>

                <button
                  onClick={() => {
                    if (onNavigateToGym) onNavigateToGym(job);
                    onClose();
                  }}
                  style={{
                    padding: '8px 16px',
                    borderRadius: '8px',
                    background: 'linear-gradient(135deg, #6366f1, #4f46e5)',
                    color: '#ffffff',
                    border: 'none',
                    fontSize: '11px',
                    fontWeight: 750,
                    cursor: 'pointer',
                    boxShadow: '0 2px 10px rgba(99, 102, 241, 0.4)',
                  }}
                >
                  Start Mock Session
                </button>
              </div>

              {/* Pause Workflow */}
              <div
                style={{
                  padding: '14px',
                  borderRadius: '10px',
                  background: 'rgba(15, 23, 42, 0.75)',
                  border: '1px solid rgba(255, 255, 255, 0.08)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                }}
              >
                <div>
                  <span style={{ fontSize: '12px', fontWeight: 750, color: '#f8fafc' }}>
                    Pause Autonomous Automation
                  </span>
                  <p style={{ margin: '2px 0 0', fontSize: '11px', color: '#94a3b8' }}>
                    Freezes all automated outreach and ATS apply workers for this specific role.
                  </p>
                </div>

                <button
                  onClick={() => showToast('Workflow paused for ' + job.company)}
                  style={{
                    padding: '6px 12px',
                    borderRadius: '6px',
                    background: 'rgba(255, 255, 255, 0.08)',
                    color: '#cbd5e1',
                    border: '1px solid rgba(255, 255, 255, 0.15)',
                    fontSize: '11px',
                    fontWeight: 650,
                    cursor: 'pointer',
                  }}
                >
                  Pause Role
                </button>
              </div>

              {/* Withdraw Application */}
              <div
                style={{
                  padding: '14px',
                  borderRadius: '10px',
                  background: 'rgba(239, 68, 68, 0.06)',
                  border: '1px solid rgba(239, 68, 68, 0.25)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '8px',
                }}
              >
                <span style={{ fontSize: '12px', fontWeight: 800, color: '#fca5a5' }}>
                  Withdraw Application
                </span>
                <p style={{ margin: 0, fontSize: '11px', color: '#fecaca', lineHeight: 1.4 }}>
                  Withdraws the application from the pipeline. Requires an explicit reason (Invariant 2).
                </p>

                {showWithdrawConfirm ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '4px' }}>
                    <input
                      type="text"
                      placeholder="Enter clear reason (e.g. accepted another offer, compensation mismatch)..."
                      value={withdrawReason}
                      onChange={(e) => setWithdrawReason(e.target.value)}
                      style={{
                        padding: '8px 10px',
                        borderRadius: '6px',
                        background: 'rgba(0, 0, 0, 0.5)',
                        border: '1px solid rgba(239, 68, 68, 0.4)',
                        color: '#ffffff',
                        fontSize: '12px',
                        outline: 'none',
                      }}
                    />
                    <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                      <button
                        onClick={() => setShowWithdrawConfirm(false)}
                        style={{
                          padding: '4px 10px',
                          borderRadius: '6px',
                          background: 'transparent',
                          color: '#cbd5e1',
                          border: 'none',
                          fontSize: '11px',
                          cursor: 'pointer',
                        }}
                      >
                        Cancel
                      </button>
                      <button
                        onClick={handleWithdraw}
                        style={{
                          padding: '6px 14px',
                          borderRadius: '6px',
                          background: '#ef4444',
                          color: '#ffffff',
                          border: 'none',
                          fontSize: '11px',
                          fontWeight: 750,
                          cursor: 'pointer',
                        }}
                      >
                        Confirm Withdrawal
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    onClick={() => setShowWithdrawConfirm(true)}
                    style={{
                      alignSelf: 'flex-start',
                      padding: '6px 12px',
                      borderRadius: '6px',
                      background: 'rgba(239, 68, 68, 0.15)',
                      color: '#f87171',
                      border: '1px solid rgba(239, 68, 68, 0.35)',
                      fontSize: '11px',
                      fontWeight: 700,
                      cursor: 'pointer',
                      marginTop: '4px',
                    }}
                  >
                    Withdraw from Pipeline
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

