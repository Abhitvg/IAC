import React from 'react';
import {
  Sparkles,
  Briefcase,
  Target,
  CheckCircle2,
  AlertTriangle,
  FolderGit2,
  Code2,
  ChevronRight,
  ListTodo,
} from 'lucide-react';
import { PageHeader, Card, StatusBadge, EmptyState } from '../design-system/components';
import { useAppStore } from '../store/useAppStore';
import { CandidateKnowledgeBase } from '../services/candidateIntelligence';

interface InterviewPreparationScreenProps {
  onLaunchLive: () => void;
}

export const InterviewPreparationScreen: React.FC<InterviewPreparationScreenProps> = ({
  onLaunchLive,
}) => {
  const { resumeText, jobDescriptionText, targetRole, setResumeModalOpen } = useAppStore();

  const kb = React.useMemo(() => {
    return CandidateKnowledgeBase.getActiveKnowledgeBase(resumeText || '');
  }, [resumeText]);

  const projects = kb.getAllProjects();

  // Extraction of relevant technical & behavioral topics from JD / Candidate Profile
  const relevantSkills = React.useMemo(() => {
    const skills = new Set<string>();
    projects.forEach((p) => {
      (p.technologyStack || []).forEach((t) => skills.add(t));
    });
    return Array.from(skills);
  }, [projects]);

  const checklistItems = [
    { label: 'Candidate Resume Loaded', done: !!resumeText },
    { label: 'Target Job Description Provided', done: !!jobDescriptionText },
    { label: 'Verified Project Evidence Linked', done: projects.some((p) => p.verificationStatus && p.verificationStatus !== 'UNKNOWN' && p.verificationStatus !== 'RESUME_REPORTED') },
    { label: 'System Design Architecture Grounded', done: projects.some((p) => p.architecture && p.architecture !== 'UNKNOWN') },
  ];

  return (
    <div style={{ padding: '24px 32px', maxWidth: '1200px', margin: '0 auto' }}>
      <PageHeader
        title="Interview Preparation Workspace"
        description="Map job description requirements to verified candidate projects, technical topics, and practice questions."
        actions={
          <button
            type="button"
            onClick={onLaunchLive}
            style={{
              padding: '6px 14px',
              borderRadius: '6px',
              background: '#8B7CFF',
              color: '#F3F4F8',
              fontWeight: 600,
              fontSize: '12px',
              border: 'none',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
            }}
            className="hover:bg-[#A99DFF]"
          >
            Launch Live Workspace →
          </button>
        }
      />

      <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '20px', marginBottom: '24px' }}>
        {/* Left Column: Requirements & Relevant Projects */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <Card>
            <h3 style={{ fontSize: '15px', fontWeight: 600, color: '#F3F4F8', margin: '0 0 12px 0' }}>
              Target Role & Requirements
            </h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '13px' }}>
              <div>
                <span style={{ color: '#9299AA' }}>Position: </span>
                <strong style={{ color: '#F3F4F8' }}>{targetRole || 'Software Engineer'}</strong>
              </div>
              <div>
                <span style={{ color: '#9299AA' }}>Grounding Strategy: </span>
                <span style={{ color: '#35C991', fontWeight: 600 }}>Zero-Tolerance Metric Fabrication</span>
              </div>
            </div>
          </Card>

          <Card>
            <h3 style={{ fontSize: '15px', fontWeight: 600, color: '#F3F4F8', margin: '0 0 12px 0' }}>
              Matching Candidate Projects
            </h3>
            {projects.length === 0 ? (
              <EmptyState
                title="No Candidate Projects"
                description="Upload resume or documents to map projects to this interview."
              />
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {projects.map((p) => (
                  <div
                    key={p.id}
                    style={{
                      background: '#11141B',
                      padding: '12px',
                      borderRadius: '6px',
                      border: '1px solid #292E3A',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                    }}
                  >
                    <div>
                      <strong style={{ color: '#F3F4F8', fontSize: '13px' }}>{p.name}</strong>
                      <div style={{ fontSize: '11px', color: '#9299AA', marginTop: '2px' }}>
                        Role: {p.ownership || 'contributor'} • Tech: {(p.technologyStack || []).slice(0, 3).join(', ')}
                      </div>
                    </div>
                    <StatusBadge status={p.verificationStatus || 'UNKNOWN'} size="sm" />
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>

        {/* Right Column: Readiness Checklist & Skills */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <Card>
            <h3 style={{ fontSize: '15px', fontWeight: 600, color: '#F3F4F8', margin: '0 0 12px 0' }}>
              Preparation Checklist
            </h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {checklistItems.map((item, idx) => (
                <div
                  key={idx}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '10px',
                    fontSize: '12px',
                    color: item.done ? '#F3F4F8' : '#9299AA',
                  }}
                >
                  {item.done ? (
                    <CheckCircle2 size={16} style={{ color: '#35C991' }} />
                  ) : (
                    <div style={{ width: '16px', height: '16px', borderRadius: '50%', border: '1px dashed #9299AA' }} />
                  )}
                  <span>{item.label}</span>
                </div>
              ))}
            </div>
          </Card>

          <Card>
            <h3 style={{ fontSize: '15px', fontWeight: 600, color: '#F3F4F8', margin: '0 0 12px 0' }}>
              Covered Technology Skills
            </h3>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
              {relevantSkills.length === 0 ? (
                <span style={{ fontSize: '12px', color: '#9299AA' }}>No skills extracted yet.</span>
              ) : (
                relevantSkills.map((s) => (
                  <span
                    key={s}
                    style={{
                      fontSize: '11px',
                      background: '#1E2330',
                      border: '1px solid #292E3A',
                      borderRadius: '4px',
                      padding: '3px 8px',
                      color: '#A99DFF',
                    }}
                  >
                    {s}
                  </span>
                ))
              )}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
};
