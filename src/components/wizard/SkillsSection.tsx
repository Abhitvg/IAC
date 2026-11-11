import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Plus, Trash2, CheckCircle2 } from 'lucide-react';
import { CandidateSkill } from '../../services/knowledgeVault';

export interface SkillsSectionProps {
  skills: CandidateSkill[];
  onUpdateSkills: (updatedSkills: CandidateSkill[], immediate?: boolean) => void;
  onDeleteSkillFact?: (skillName: string) => void;
  registerFlushHandler: (flushFn: () => void) => () => void;
}

export const SkillsSection: React.FC<SkillsSectionProps> = React.memo(
  ({ skills, onUpdateSkills, onDeleteSkillFact, registerFlushHandler }) => {
    const [draft, setDraft] = useState<CandidateSkill[]>(skills);
    const draftRef = useRef<CandidateSkill[]>(draft);
    draftRef.current = draft;

    const [skillFilterCategory, setSkillFilterCategory] = useState<string>('all');
    const [skillSearchQuery, setSkillSearchQuery] = useState<string>('');

    const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const lastSyncedRef = useRef<CandidateSkill[]>(skills);

    useEffect(() => {
      if (skills !== lastSyncedRef.current) {
        lastSyncedRef.current = skills;
        setDraft(skills);
        draftRef.current = skills;
      }
    }, [skills]);

    const flushDraft = useCallback(() => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
        debounceTimerRef.current = null;
      }
      if (JSON.stringify(draftRef.current) !== JSON.stringify(lastSyncedRef.current)) {
        lastSyncedRef.current = draftRef.current;
        onUpdateSkills(draftRef.current, true);
      }
    }, [onUpdateSkills]);

    useEffect(() => {
      const unregister = registerFlushHandler(flushDraft);
      return () => {
        flushDraft();
        unregister();
      };
    }, [registerFlushHandler, flushDraft]);

    const notifyChange = (next: CandidateSkill[], immediate = false) => {
      setDraft(next);
      draftRef.current = next;

      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }

      if (immediate) {
        onUpdateSkills(next, true);
      } else {
        debounceTimerRef.current = setTimeout(() => {
          onUpdateSkills(draftRef.current, false);
        }, 350);
      }
    };

    const handleConfirmAll = () => {
      const next = draftRef.current.map((s) => ({
        ...s,
        candidateConfirmed: true,
        status: 'CANDIDATE_CONFIRMED' as const,
      }));
      notifyChange(next, true);
    };

    const handleAddSkill = () => {
      const newSkill: CandidateSkill = {
        id: `skill_${Date.now()}`,
        name: '',
        category: 'other',
        proficiency: 'UNSPECIFIED',
        experienceType: 'theoretical',
        yearsUsed: undefined,
        projectReferences: [],
        evidenceSource: 'Candidate Manual Entry',
        status: 'CANDIDATE_CONFIRMED',
        candidateConfirmed: true,
      };
      notifyChange([...draftRef.current, newSkill], true);
    };

    const handleRemoveSkill = (skillId: string) => {
      const skillToRemove = draftRef.current.find((s) => s.id === skillId);
      if (skillToRemove?.name && onDeleteSkillFact) {
        onDeleteSkillFact(skillToRemove.name);
      }
      const next = draftRef.current.filter((s) => s.id !== skillId);
      notifyChange(next, true);
    };

    const handleSkillFieldChange = (skillId: string, field: keyof CandidateSkill, val: any) => {
      const next = draftRef.current.map((s) => {
        if (s.id !== skillId) return s;
        return {
          ...s,
          [field]: val,
          candidateConfirmed: true,
        };
      });
      notifyChange(next, false);
    };

    return (
      <div data-testid="wizard-section-skills">
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '16px',
          }}
        >
          <div>
            <h3 style={{ fontSize: '15px', fontWeight: 600, color: '#F3F4F8', margin: 0 }}>
              D. Skills &amp; Rigorous Experience Bounds
            </h3>
            <p style={{ fontSize: '12px', color: '#9299AA', margin: '2px 0 0 0' }}>
              Practical production skills must resolve against registered projects demonstrating
              actual implementation.
            </p>
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              type="button"
              onClick={handleConfirmAll}
              style={{
                padding: '6px 12px',
                borderRadius: '6px',
                background: '#1E2330',
                border: '1px solid #292E3A',
                color: '#35C991',
                fontSize: '12px',
                fontWeight: 600,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
              }}
            >
              <CheckCircle2 size={14} /> Confirm All
            </button>
            <button
              type="button"
              onClick={handleAddSkill}
              style={{
                padding: '6px 12px',
                borderRadius: '6px',
                background: '#8B7CFF',
                border: 'none',
                color: '#fff',
                fontSize: '12px',
                fontWeight: 600,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
              }}
            >
              <Plus size={14} /> Add Skill
            </button>
          </div>
        </div>

        {/* Local Filter and Search Bar */}
        <div style={{ display: 'flex', gap: '10px', marginBottom: '14px' }}>
          <input
            type="text"
            placeholder="Search skills by name or category..."
            value={skillSearchQuery}
            onChange={(e) => setSkillSearchQuery(e.target.value)}
            style={{
              flex: 1,
              padding: '6px 10px',
              background: '#171B24',
              border: '1px solid #292E3A',
              borderRadius: '6px',
              color: '#F3F4F8',
              fontSize: '12px',
            }}
          />
          <select
            value={skillFilterCategory}
            onChange={(e) => setSkillFilterCategory(e.target.value)}
            style={{
              padding: '6px 10px',
              background: '#171B24',
              border: '1px solid #292E3A',
              borderRadius: '6px',
              color: '#8B7CFF',
              fontSize: '12px',
              fontWeight: 600,
            }}
          >
            <option value="all">All 14 Categories ({draft.length})</option>
            <option value="languages">Languages</option>
            <option value="frontend">Frontend</option>
            <option value="backend">Backend</option>
            <option value="databases">Databases</option>
            <option value="cloud">Cloud</option>
            <option value="devops">DevOps</option>
            <option value="aiMl">AI &amp; Machine Learning</option>
            <option value="testing">Testing</option>
            <option value="security">Security</option>
            <option value="tools">Tools</option>
            <option value="design">Design</option>
            <option value="softSkills">Soft Skills</option>
            <option value="domainKnowledge">Domain Knowledge</option>
            <option value="other">Other</option>
          </select>
        </div>

        {draft.length === 0 ? (
          <div
            style={{
              padding: '32px',
              textAlign: 'center',
              background: '#171B24',
              borderRadius: '8px',
              border: '1px dashed #292E3A',
              color: '#9299AA',
              fontSize: '13px',
            }}
          >
            No skills added yet. Add a skill or skip.
          </div>
        ) : (
          <div className="wizard-grid-2col">
            {draft
              .filter((s) => {
                if (skillFilterCategory !== 'all' && s.category !== skillFilterCategory)
                  return false;
                if (skillSearchQuery.trim()) {
                  const q = skillSearchQuery.toLowerCase();
                  return (
                    s.name.toLowerCase().includes(q) || (s.category || '').toLowerCase().includes(q)
                  );
                }
                return true;
              })
              .map((skill) => (
                <div
                  key={skill.id}
                  style={{
                    padding: '12px',
                    background: '#171B24',
                    border: '1px solid #292E3A',
                    borderRadius: '8px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '8px',
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      gap: '8px',
                    }}
                  >
                    <input
                      type="text"
                      placeholder="Skill Name (e.g. Go, Kafka)"
                      value={skill.name}
                      onChange={(e) => handleSkillFieldChange(skill.id, 'name', e.target.value)}
                      onBlur={flushDraft}
                      style={{
                        flex: 1,
                        padding: '4px 8px',
                        background: '#0F1218',
                        border: '1px solid #292E3A',
                        borderRadius: '4px',
                        color: '#F3F4F8',
                        fontSize: '13px',
                        fontWeight: 600,
                      }}
                    />
                    <select
                      value={skill.category || 'other'}
                      onChange={(e) => {
                        handleSkillFieldChange(skill.id, 'category', e.target.value);
                        flushDraft();
                      }}
                      style={{
                        padding: '4px 6px',
                        background: '#0F1218',
                        border: '1px solid #292E3A',
                        borderRadius: '4px',
                        color: '#8B7CFF',
                        fontSize: '11px',
                        fontWeight: 600,
                      }}
                    >
                      <option value="languages">Languages</option>
                      <option value="frontend">Frontend</option>
                      <option value="backend">Backend</option>
                      <option value="databases">Databases</option>
                      <option value="cloud">Cloud</option>
                      <option value="devops">DevOps</option>
                      <option value="aiMl">AI &amp; ML</option>
                      <option value="testing">Testing</option>
                      <option value="security">Security</option>
                      <option value="tools">Tools</option>
                      <option value="design">Design</option>
                      <option value="softSkills">Soft Skills</option>
                      <option value="domainKnowledge">Domain</option>
                      <option value="other">Other</option>
                    </select>
                    <button
                      type="button"
                      onClick={() => handleRemoveSkill(skill.id)}
                      style={{
                        background: 'transparent',
                        border: 'none',
                        color: '#f87171',
                        cursor: 'pointer',
                      }}
                      title="Delete skill (writes tombstone to ledger)"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>

                  <div style={{ display: 'flex', gap: '8px' }}>
                    <select
                      value={skill.experienceType}
                      onChange={(e) => {
                        handleSkillFieldChange(skill.id, 'experienceType', e.target.value as any);
                        flushDraft();
                      }}
                      style={{
                        flex: 1,
                        padding: '4px 6px',
                        background: '#0F1218',
                        border: '1px solid #292E3A',
                        borderRadius: '4px',
                        color: skill.experienceType === 'practical' ? '#35C991' : '#F7B955',
                        fontSize: '11px',
                      }}
                    >
                      <option value="theoretical">Theoretical Only</option>
                      <option value="practical">Practical / Production</option>
                    </select>

                    <select
                      value={skill.proficiency || 'UNSPECIFIED'}
                      onChange={(e) => {
                        handleSkillFieldChange(skill.id, 'proficiency', e.target.value as any);
                        flushDraft();
                      }}
                      style={{
                        flex: 1,
                        padding: '4px 6px',
                        background: '#0F1218',
                        border: '1px solid #292E3A',
                        borderRadius: '4px',
                        color: '#CBD5E1',
                        fontSize: '11px',
                      }}
                    >
                      <option value="UNSPECIFIED">Proficiency Unspecified</option>
                      <option value="beginner">Beginner</option>
                      <option value="intermediate">Intermediate</option>
                      <option value="advanced">Advanced</option>
                      <option value="expert">Expert</option>
                    </select>
                  </div>

                  {skill.experienceType === 'practical' && (
                    <div>
                      <label
                        style={{
                          display: 'block',
                          fontSize: '10px',
                          color: '#35C991',
                          marginBottom: '2px',
                        }}
                      >
                        Referenced Projects (Required for Practical Claims):
                      </label>
                      <input
                        type="text"
                        placeholder="Comma-separated project names (e.g. TelemetryPipeline)"
                        value={skill.projectReferences.join(', ')}
                        onChange={(e) => {
                          const refs = e.target.value
                            .split(',')
                            .map((s) => s.trim())
                            .filter(Boolean);
                          handleSkillFieldChange(skill.id, 'projectReferences', refs);
                        }}
                        onBlur={flushDraft}
                        style={{
                          width: '100%',
                          padding: '4px 8px',
                          background: '#0F1218',
                          border: '1px solid #292E3A',
                          borderRadius: '4px',
                          color: '#F3F4F8',
                          fontSize: '11px',
                        }}
                      />
                    </div>
                  )}
                </div>
              ))}
          </div>
        )}
      </div>
    );
  }
);

SkillsSection.displayName = 'SkillsSection';
