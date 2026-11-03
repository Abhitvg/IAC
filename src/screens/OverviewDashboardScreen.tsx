import React from 'react';
import {
  Sparkles,
  ArrowRight,
  ShieldCheck,
  Briefcase,
  PlayCircle,
  FileText,
  Clock,
  Layers,
  CheckCircle,
} from 'lucide-react';
import { PageHeader, Card, StatusBadge, EmptyState } from '../design-system/components';
import { CandidateKnowledgeBase } from '../services/candidateIntelligence';
import { useAppStore } from '../store/useAppStore';
import { usePracticeStore } from '../store/usePracticeStore';
import { CanonicalProfileService } from '../services/knowledgeVault';

interface OverviewDashboardScreenProps {
  onNavigate: (view: any) => void;
}

export const OverviewDashboardScreen: React.FC<OverviewDashboardScreenProps> = ({
  onNavigate,
}) => {
  const { resumeText, targetRole, sessionHistory: appSessions, setProfileWizardOpen } = useAppStore();
  const { sessionHistory: practiceSessions, setActiveView } = usePracticeStore();

  const kb = React.useMemo(() => {
    return CandidateKnowledgeBase.getActiveKnowledgeBase(resumeText || '');
  }, [resumeText]);

  const projects = kb.getAllProjects();
  const verifiedProjectsCount = projects.filter(
    (p) => p.verificationStatus && p.verificationStatus !== 'UNKNOWN' && p.verificationStatus !== 'RESUME_REPORTED'
  ).length;

  const totalSessions = (appSessions?.length || 0) + (practiceSessions?.length || 0);

  return (
    <div style={{ padding: '24px 32px', maxWidth: '1200px', margin: '0 auto' }}>
      <PageHeader
        title="Candidate Overview"
        description="Monitor interview preparation readiness, verified evidence coverage, and recent practice sessions."
        badge={
          <span
            style={{
              fontSize: '11px',
              padding: '2px 8px',
              borderRadius: '6px',
              background: 'rgba(139, 124, 255, 0.12)',
              color: '#8B7CFF',
              border: '1px solid rgba(139, 124, 255, 0.3)',
              fontWeight: 600,
            }}
          >
            {targetRole || 'Target Role Pending'}
          </span>
        }
      />

      {/* Metrics Row */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
          gap: '16px',
          marginBottom: '24px',
        }}
      >
        <Card>
          <div style={{ fontSize: '11px', color: '#9299AA', textTransform: 'uppercase', marginBottom: '6px' }}>
            Registered Projects
          </div>
          <div style={{ fontSize: '24px', fontWeight: 700, color: '#F3F4F8' }}>
            {projects.length}
          </div>
          <div style={{ fontSize: '12px', color: '#35C991', marginTop: '4px' }}>
            {verifiedProjectsCount} with inspectable evidence
          </div>
        </Card>

        <Card>
          <div style={{ fontSize: '11px', color: '#9299AA', textTransform: 'uppercase', marginBottom: '6px' }}>
            Evidence Grounding
          </div>
          <div style={{ fontSize: '24px', fontWeight: 700, color: '#8B7CFF' }}>
            {projects.length > 0 ? `${Math.round((verifiedProjectsCount / projects.length) * 100)}%` : '0%'}
          </div>
          <div style={{ fontSize: '12px', color: '#9299AA', marginTop: '4px' }}>
            Zero-Trust verified ratio
          </div>
        </Card>

        <Card>
          <div style={{ fontSize: '11px', color: '#9299AA', textTransform: 'uppercase', marginBottom: '6px' }}>
            Completed Sessions
          </div>
          <div style={{ fontSize: '24px', fontWeight: 700, color: '#F3F4F8' }}>
            {totalSessions}
          </div>
          <div style={{ fontSize: '12px', color: '#9299AA', marginTop: '4px' }}>
            Live & practice mock rounds
          </div>
        </Card>

        <Card>
          <div style={{ fontSize: '11px', color: '#9299AA', textTransform: 'uppercase', marginBottom: '6px' }}>
            Factual Grounding Engine
          </div>
          <div style={{ fontSize: '16px', fontWeight: 700, color: '#35C991', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <ShieldCheck size={18} /> Active (Strict)
          </div>
          <div style={{ fontSize: '12px', color: '#9299AA', marginTop: '4px' }}>
            Zero-tolerance metric leakage
          </div>
        </Card>
      </div>

      {/* Quick Launch Banners */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
          gap: '16px',
          marginBottom: '24px',
        }}
      >
        <Card
          interactive
          onClick={() => onNavigate('teleprompter')}
          style={{
            background: 'linear-gradient(135deg, rgba(139, 124, 255, 0.08), #171B24)',
            border: '1px solid rgba(139, 124, 255, 0.25)',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <h3 style={{ fontSize: '15px', fontWeight: 600, color: '#F3F4F8', margin: '0 0 6px 0' }}>
                Launch Live Interview Workspace
              </h3>
              <p style={{ fontSize: '12px', color: '#9299AA', margin: '0 0 12px 0', lineHeight: 1.4 }}>
                Three-panel real-time interview teleprompter with voice transcription, question detection, and grounding verification.
              </p>
            </div>
            <ArrowRight size={18} style={{ color: '#8B7CFF' }} />
          </div>
          <span style={{ fontSize: '11px', color: '#8B7CFF', fontWeight: 600 }}>
            Open Live Teleprompter →
          </span>
        </Card>

        <Card
          interactive
          onClick={() => onNavigate('mock_gym')}
          style={{
            background: 'linear-gradient(135deg, rgba(53, 201, 145, 0.08), #171B24)',
            border: '1px solid rgba(53, 201, 145, 0.25)',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <h3 style={{ fontSize: '15px', fontWeight: 600, color: '#F3F4F8', margin: '0 0 6px 0' }}>
                Practice Studio Gym
              </h3>
              <p style={{ fontSize: '12px', color: '#9299AA', margin: '0 0 12px 0', lineHeight: 1.4 }}>
                Timed simulations across System Design, STAR Behavioral stories, and Technical Drills.
              </p>
            </div>
            <ArrowRight size={18} style={{ color: '#35C991' }} />
          </div>
          <span style={{ fontSize: '11px', color: '#35C991', fontWeight: 600 }}>
            Start Mock Simulation →
          </span>
        </Card>

        <Card
          interactive
          onClick={() => setProfileWizardOpen(true)}
          style={{
            background: 'linear-gradient(135deg, rgba(247, 185, 85, 0.08), #171B24)',
            border: '1px solid rgba(247, 185, 85, 0.25)',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <h3 style={{ fontSize: '15px', fontWeight: 600, color: '#F3F4F8', margin: '0 0 6px 0' }}>
                Candidate Profile Wizard
              </h3>
              <p style={{ fontSize: '12px', color: '#9299AA', margin: '0 0 12px 0', lineHeight: 1.4 }}>
                Review and edit your 9-part canonical profile, verify employment declarations, and manage fact provenance.
              </p>
            </div>
            <ArrowRight size={18} style={{ color: '#F7B955' }} />
          </div>
          <span style={{ fontSize: '11px', color: '#F7B955', fontWeight: 600 }}>
            Open Profile Wizard →
          </span>
        </Card>
      </div>

      {/* Recent Projects Summary */}
      <h2 style={{ fontSize: '15px', fontWeight: 600, color: '#F3F4F8', marginBottom: '12px' }}>
        Tracked Projects & Evidence
      </h2>

      {projects.length === 0 ? (
        <EmptyState
          icon={<FileText size={32} />}
          title="No Candidate Projects Loaded"
          description="Drop your resume or sync with repository inspection to track project claims and evidence."
          action={
            <button
              type="button"
              onClick={() => onNavigate('resume_docs')}
              style={{
                padding: '8px 16px',
                borderRadius: '6px',
                background: '#8B7CFF',
                color: '#F3F4F8',
                fontWeight: 600,
                fontSize: '12px',
                border: 'none',
                cursor: 'pointer',
              }}
            >
              Upload Resume
            </button>
          }
        />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {projects.slice(0, 4).map((p) => (
            <Card
              key={p.id}
              interactive
              onClick={() => onNavigate('projects')}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '12px 16px',
              }}
            >
              <div>
                <strong style={{ color: '#F3F4F8', fontSize: '13px' }}>{p.name}</strong>
                <span style={{ color: '#9299AA', fontSize: '12px', marginLeft: '12px' }}>
                  {(p.technologyStack || []).slice(0, 3).join(', ')}
                </span>
              </div>
              <StatusBadge status={p.verificationStatus || 'UNKNOWN'} size="sm" />
            </Card>
          ))}
        </div>
      )}
    </div>
  );
};

