import React, { useState, useMemo } from 'react';
import { useAppStore } from '../store/useAppStore';
import { 
  DEFAULT_RESUME, 
  DEFAULT_JOB_DESCRIPTION, 
  DEFAULT_TARGET_ROLE, 
  analyzeAlignment 
} from '../services/candidatePersona';
import { 
  X, 
  Upload, 
  FileText, 
  Briefcase, 
  CheckCircle2, 
  Sparkles, 
  RefreshCw, 
  Target, 
  TrendingUp,
  AlertCircle
} from 'lucide-react';

export default function ResumeAndJobModal() {
  const {
    resumeText,
    jobDescriptionText,
    targetRole,
    setResumeText,
    setJobDescriptionText,
    setTargetRole,
    setResumeModalOpen,
    setToast
  } = useAppStore();

  const [activeTab, setActiveTab] = useState<'resume' | 'jd' | 'alignment'>('resume');
  const [localRole, setLocalRole] = useState(targetRole || DEFAULT_TARGET_ROLE);
  const [localResume, setLocalResume] = useState(resumeText || DEFAULT_RESUME);
  const [localJD, setLocalJD] = useState(jobDescriptionText || DEFAULT_JOB_DESCRIPTION);

  const alignment = useMemo(() => {
    return analyzeAlignment(localResume, localJD);
  }, [localResume, localJD]);

  const resumeWordCount = useMemo(() => {
    return localResume.trim().split(/\s+/).filter(Boolean).length;
  }, [localResume]);

  const jdWordCount = useMemo(() => {
    return localJD.trim().split(/\s+/).filter(Boolean).length;
  }, [localJD]);

  const handleSave = () => {
    setTargetRole(localRole.trim() || DEFAULT_TARGET_ROLE);
    setResumeText(localResume.trim() || DEFAULT_RESUME);
    setJobDescriptionText(localJD.trim() || DEFAULT_JOB_DESCRIPTION);
    setToast('Target Role & Resume Applied to Teleprompter!');
    setResumeModalOpen(false);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      if (text) {
        setLocalResume(text);
        setToast(`Loaded ${file.name} successfully!`);
      }
    };
    reader.readAsText(file);
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'rgba(0, 0, 0, 0.75)',
        backdropFilter: 'blur(8px)',
        WebkitBackdropFilter: 'blur(8px)',
        padding: '20px'
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: '820px',
          maxHeight: '90vh',
          display: 'flex',
          flexDirection: 'column',
          backgroundColor: '#0f0f18',
          border: '1px solid rgba(124, 92, 252, 0.3)',
          borderRadius: '14px',
          boxShadow: '0 25px 60px rgba(0, 0, 0, 0.9), 0 0 30px rgba(124, 92, 252, 0.15)',
          overflow: 'hidden',
          color: '#e8e6f0'
        }}
      >
        {/* Modal Header */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '16px 22px',
            borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
            backgroundColor: 'rgba(20, 20, 32, 0.8)'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div
              style={{
                width: '32px',
                height: '32px',
                borderRadius: '8px',
                background: 'linear-gradient(135deg, #6366f1, #a855f7)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#fff'
              }}
            >
              <Target size={18} />
            </div>
            <div>
              <h2 style={{ fontSize: '15px', fontWeight: 600, margin: 0, color: '#f8fafc' }}>
                Candidate Persona: Resume & Job Description
              </h2>
              <p style={{ fontSize: '11px', color: '#94a3b8', margin: '2px 0 0' }}>
                Answers will automatically speak in the 1st-person, citing your actual projects and matching the target JD.
              </p>
            </div>
          </div>

          <button
            onClick={() => setResumeModalOpen(false)}
            style={{
              background: 'transparent',
              border: 'none',
              color: '#94a3b8',
              cursor: 'pointer',
              padding: '6px',
              borderRadius: '6px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}
          >
            <X size={18} />
          </button>
        </div>

        {/* Target Role Input Bar */}
        <div
          style={{
            padding: '12px 22px',
            backgroundColor: 'rgba(15, 15, 25, 0.9)',
            borderBottom: '1px solid rgba(255, 255, 255, 0.06)',
            display: 'flex',
            alignItems: 'center',
            gap: '12px'
          }}
        >
          <span style={{ fontSize: '12px', fontWeight: 600, color: '#c7d2fe', whiteSpace: 'nowrap' }}>
            🎯 Target Role Title:
          </span>
          <input
            type="text"
            value={localRole}
            onChange={(e) => setLocalRole(e.target.value)}
            placeholder="e.g. Senior Cloud & DevOps Engineer / Staff Full Stack Developer"
            style={{
              flex: 1,
              background: 'rgba(255, 255, 255, 0.06)',
              border: '1px solid rgba(255, 255, 255, 0.12)',
              borderRadius: '6px',
              padding: '6px 12px',
              color: '#ffffff',
              fontSize: '12px',
              outline: 'none'
            }}
          />
        </div>

        {/* Tab Navigation */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '4px',
            padding: '8px 22px 0',
            backgroundColor: 'rgba(15, 15, 25, 0.6)',
            borderBottom: '1px solid rgba(255, 255, 255, 0.06)'
          }}
        >
          <button
            onClick={() => setActiveTab('resume')}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '8px 14px',
              fontSize: '12px',
              fontWeight: activeTab === 'resume' ? 600 : 400,
              color: activeTab === 'resume' ? '#a5b4fc' : '#94a3b8',
              background: activeTab === 'resume' ? 'rgba(99, 102, 241, 0.15)' : 'transparent',
              border: 'none',
              borderBottom: activeTab === 'resume' ? '2px solid #6366f1' : '2px solid transparent',
              cursor: 'pointer'
            }}
          >
            <FileText size={14} />
            <span>Candidate Resume ({resumeWordCount} words)</span>
          </button>

          <button
            onClick={() => setActiveTab('jd')}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '8px 14px',
              fontSize: '12px',
              fontWeight: activeTab === 'jd' ? 600 : 400,
              color: activeTab === 'jd' ? '#a5b4fc' : '#94a3b8',
              background: activeTab === 'jd' ? 'rgba(99, 102, 241, 0.15)' : 'transparent',
              border: 'none',
              borderBottom: activeTab === 'jd' ? '2px solid #6366f1' : '2px solid transparent',
              cursor: 'pointer'
            }}
          >
            <Briefcase size={14} />
            <span>Job Description ({jdWordCount} words)</span>
          </button>

          <button
            onClick={() => setActiveTab('alignment')}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '8px 14px',
              fontSize: '12px',
              fontWeight: activeTab === 'alignment' ? 600 : 400,
              color: activeTab === 'alignment' ? '#34d399' : '#94a3b8',
              background: activeTab === 'alignment' ? 'rgba(52, 211, 153, 0.15)' : 'transparent',
              border: 'none',
              borderBottom: activeTab === 'alignment' ? '2px solid #34d399' : '2px solid transparent',
              cursor: 'pointer'
            }}
          >
            <TrendingUp size={14} />
            <span>Alignment & Match ({alignment.score}%)</span>
          </button>
        </div>

        {/* Modal Body / Tab Content */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '16px 22px' }}>
          {activeTab === 'resume' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontSize: '12px', color: '#94a3b8' }}>
                  Paste your resume text below or upload a plain text / markdown file:
                </span>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <label
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '4px',
                      background: 'rgba(255, 255, 255, 0.08)',
                      border: '1px solid rgba(255, 255, 255, 0.15)',
                      borderRadius: '6px',
                      padding: '4px 10px',
                      fontSize: '11px',
                      color: '#cbd5e1',
                      cursor: 'pointer'
                    }}
                  >
                    <Upload size={12} />
                    <span>Upload File</span>
                    <input
                      type="file"
                      accept=".txt,.md,.json"
                      onChange={handleFileUpload}
                      style={{ display: 'none' }}
                    />
                  </label>

                  <button
                    onClick={() => setLocalResume(DEFAULT_RESUME)}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '4px',
                      background: 'rgba(99, 102, 241, 0.15)',
                      border: '1px solid rgba(99, 102, 241, 0.3)',
                      borderRadius: '6px',
                      padding: '4px 10px',
                      fontSize: '11px',
                      color: '#c7d2fe',
                      cursor: 'pointer'
                    }}
                  >
                    <RefreshCw size={11} /> Load DevOps Sample
                  </button>

                  <button
                    onClick={() => setLocalResume('')}
                    style={{
                      background: 'transparent',
                      border: '1px solid rgba(255, 255, 255, 0.1)',
                      borderRadius: '6px',
                      padding: '4px 8px',
                      fontSize: '11px',
                      color: '#94a3b8',
                      cursor: 'pointer'
                    }}
                  >
                    Clear
                  </button>
                </div>
              </div>

              <textarea
                value={localResume}
                onChange={(e) => setLocalResume(e.target.value)}
                placeholder="Paste your full resume here (Summary, Work History, Projects, Tech Stack, Education)..."
                rows={14}
                style={{
                  width: '100%',
                  background: 'rgba(0, 0, 0, 0.35)',
                  border: '1px solid rgba(255, 255, 255, 0.1)',
                  borderRadius: '8px',
                  padding: '12px',
                  color: '#f8fafc',
                  fontSize: '12px',
                  lineHeight: '1.6',
                  fontFamily: 'monospace',
                  resize: 'vertical',
                  outline: 'none'
                }}
              />
            </div>
          )}

          {activeTab === 'jd' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontSize: '12px', color: '#94a3b8' }}>
                  Paste the job posting description from LinkedIn, Indeed, Greenhouse, or email:
                </span>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button
                    onClick={() => setLocalJD(DEFAULT_JOB_DESCRIPTION)}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '4px',
                      background: 'rgba(99, 102, 241, 0.15)',
                      border: '1px solid rgba(99, 102, 241, 0.3)',
                      borderRadius: '6px',
                      padding: '4px 10px',
                      fontSize: '11px',
                      color: '#c7d2fe',
                      cursor: 'pointer'
                    }}
                  >
                    <RefreshCw size={11} /> Load Sample JD
                  </button>

                  <button
                    onClick={() => setLocalJD('')}
                    style={{
                      background: 'transparent',
                      border: '1px solid rgba(255, 255, 255, 0.1)',
                      borderRadius: '6px',
                      padding: '4px 8px',
                      fontSize: '11px',
                      color: '#94a3b8',
                      cursor: 'pointer'
                    }}
                  >
                    Clear
                  </button>
                </div>
              </div>

              <textarea
                value={localJD}
                onChange={(e) => setLocalJD(e.target.value)}
                placeholder="Paste target Job Description here (Role summary, responsibilities, required qualifications)..."
                rows={14}
                style={{
                  width: '100%',
                  background: 'rgba(0, 0, 0, 0.35)',
                  border: '1px solid rgba(255, 255, 255, 0.1)',
                  borderRadius: '8px',
                  padding: '12px',
                  color: '#f8fafc',
                  fontSize: '12px',
                  lineHeight: '1.6',
                  fontFamily: 'monospace',
                  resize: 'vertical',
                  outline: 'none'
                }}
              />
            </div>
          )}

          {activeTab === 'alignment' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {/* Match Score Banner */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '14px 20px',
                  background: 'linear-gradient(135deg, rgba(16, 185, 129, 0.15), rgba(99, 102, 241, 0.15))',
                  border: '1px solid rgba(52, 211, 153, 0.3)',
                  borderRadius: '10px'
                }}
              >
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <Sparkles size={18} style={{ color: '#34d399' }} />
                    <span style={{ fontSize: '15px', fontWeight: 700, color: '#f8fafc' }}>
                      Profile Match Score: {alignment.score}%
                    </span>
                  </div>
                  <p style={{ fontSize: '11px', color: '#94a3b8', margin: '4px 0 0' }}>
                    Calculated by analyzing technical skill overlap between your resume and the target role description.
                  </p>
                </div>

                <div
                  style={{
                    fontSize: '24px',
                    fontWeight: 800,
                    color: alignment.score >= 70 ? '#34d399' : '#fbbf24',
                    fontFamily: 'monospace'
                  }}
                >
                  {alignment.score}%
                </div>
              </div>

              {/* Matched Skills */}
              <div>
                <h4 style={{ fontSize: '12px', fontWeight: 600, color: '#34d399', margin: '0 0 8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <CheckCircle2 size={13} /> Matched Core Skills ({alignment.matchedSkills.length})
                </h4>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                  {alignment.matchedSkills.map(skill => (
                    <span
                      key={skill}
                      style={{
                        background: 'rgba(52, 211, 153, 0.12)',
                        border: '1px solid rgba(52, 211, 153, 0.35)',
                        color: '#6ee7b7',
                        borderRadius: '6px',
                        padding: '3px 8px',
                        fontSize: '11px',
                        fontWeight: 500
                      }}
                    >
                      ✓ {skill}
                    </span>
                  ))}
                  {alignment.matchedSkills.length === 0 && (
                    <span style={{ fontSize: '11px', color: '#64748b' }}>No direct skill matches detected yet.</span>
                  )}
                </div>
              </div>

              {/* Missing or Target Emphasis Skills */}
              {alignment.missingSkills.length > 0 && (
                <div>
                  <h4 style={{ fontSize: '12px', fontWeight: 600, color: '#fbbf24', margin: '0 0 8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <AlertCircle size={13} /> JD Keywords to Emphasize ({alignment.missingSkills.length})
                  </h4>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                    {alignment.missingSkills.map(skill => (
                      <span
                        key={skill}
                        style={{
                          background: 'rgba(251, 191, 36, 0.12)',
                          border: '1px solid rgba(251, 191, 36, 0.35)',
                          color: '#fcd34d',
                          borderRadius: '6px',
                          padding: '3px 8px',
                          fontSize: '11px',
                          fontWeight: 500
                        }}
                      >
                        + {skill}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Candidate Prompt Live Preview */}
              <div
                style={{
                  background: 'rgba(20, 20, 32, 0.6)',
                  border: '1px solid rgba(255, 255, 255, 0.08)',
                  borderRadius: '8px',
                  padding: '12px',
                  fontSize: '11px',
                  color: '#cbd5e1',
                  lineHeight: '1.6'
                }}
              >
                <div style={{ fontWeight: 600, color: '#a5b4fc', marginBottom: '4px' }}>
                  💡 Teleprompter Behavior Guarantee:
                </div>
                The AI co-pilot will speak exclusively as you, referencing your past work at {localResume.includes('CloudScale') ? 'CloudScale Systems' : 'your previous companies'}, highlighting your metrics, and positioning your answers directly for the {localRole} opening.
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '12px 22px',
            borderTop: '1px solid rgba(255, 255, 255, 0.08)',
            backgroundColor: 'rgba(20, 20, 32, 0.9)'
          }}
        >
          <span style={{ fontSize: '11px', color: '#94a3b8' }}>
            Changes are saved to local persistent storage.
          </span>

          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <button
              onClick={() => setResumeModalOpen(false)}
              style={{
                background: 'rgba(255, 255, 255, 0.06)',
                border: '1px solid rgba(255, 255, 255, 0.12)',
                color: '#cbd5e1',
                borderRadius: '6px',
                padding: '6px 14px',
                fontSize: '12px',
                cursor: 'pointer'
              }}
            >
              Cancel
            </button>

            <button
              onClick={handleSave}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                background: '#4f46e5',
                border: 'none',
                color: '#ffffff',
                borderRadius: '6px',
                padding: '6px 18px',
                fontSize: '12px',
                fontWeight: 600,
                cursor: 'pointer',
                boxShadow: '0 4px 12px rgba(79, 70, 229, 0.4)'
              }}
            >
              <Sparkles size={13} />
              <span>Save & Apply to Teleprompter</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
