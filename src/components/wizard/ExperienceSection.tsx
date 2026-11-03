import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { CandidateWorkExperience } from '../../services/knowledgeVault';

export interface ExperienceSectionProps {
  experience: CandidateWorkExperience[];
  onUpdateExperience: (updatedExperience: CandidateWorkExperience[], immediate?: boolean) => void;
  registerFlushHandler: (flushFn: () => void) => () => void;
}

interface LocalExpItem extends CandidateWorkExperience {
  _personallyImplementedRaw?: string;
}

export const ExperienceSection: React.FC<ExperienceSectionProps> = React.memo(
  ({ experience, onUpdateExperience, registerFlushHandler }) => {
    // Keep raw string for multiline textareas to prevent cursor jumping
    const [draft, setDraft] = useState<LocalExpItem[]>(() =>
      experience.map((e) => ({
        ...e,
        _personallyImplementedRaw: e.personallyImplemented.join('\n'),
      }))
    );
    const draftRef = useRef<LocalExpItem[]>(draft);
    draftRef.current = draft;

    const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const lastSyncedRef = useRef<CandidateWorkExperience[]>(experience);

    useEffect(() => {
      if (experience !== lastSyncedRef.current) {
        lastSyncedRef.current = experience;
        setDraft(
          experience.map((e) => ({
            ...e,
            _personallyImplementedRaw: e.personallyImplemented.join('\n'),
          }))
        );
        draftRef.current = experience.map((e) => ({
          ...e,
          _personallyImplementedRaw: e.personallyImplemented.join('\n'),
        }));
      }
    }, [experience]);

    const sanitizeDraftForExport = (items: LocalExpItem[]): CandidateWorkExperience[] => {
      return items.map(({ _personallyImplementedRaw, ...rest }) => ({
        ...rest,
        personallyImplemented:
          _personallyImplementedRaw !== undefined
            ? _personallyImplementedRaw.split('\n').filter(Boolean)
            : rest.personallyImplemented,
      }));
    };

    const flushDraft = useCallback(() => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
        debounceTimerRef.current = null;
      }
      onUpdateExperience(sanitizeDraftForExport(draftRef.current), true);
    }, [onUpdateExperience]);

    useEffect(() => {
      const unregister = registerFlushHandler(flushDraft);
      return () => {
        flushDraft();
        unregister();
      };
    }, [registerFlushHandler, flushDraft]);

    const notifyChange = (next: LocalExpItem[], immediate = false) => {
      setDraft(next);
      draftRef.current = next;

      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }

      if (immediate) {
        onUpdateExperience(sanitizeDraftForExport(next), true);
      } else {
        debounceTimerRef.current = setTimeout(() => {
          onUpdateExperience(sanitizeDraftForExport(draftRef.current), false);
        }, 350);
      }
    };

    const handleAddRole = () => {
      const newExp: LocalExpItem = {
        id: `exp_${Date.now()}`,
        employer: '',
        title: '',
        startDate: '',
        endDate: '',
        isCurrent: false,
        responsibilities: [],
        personallyImplemented: [],
        _personallyImplementedRaw: '',
        teamContributions: [],
        leadershipResponsibilities: [],
        outcomesAndMetrics: [],
        technologiesUsed: [],
        missingOrUncertainFacts: [],
        status: 'CANDIDATE_CONFIRMED',
        candidateConfirmed: true,
      };
      notifyChange([...draftRef.current, newExp], true);
    };

    const handleRemoveRole = (idx: number) => {
      const next = draftRef.current.filter((_, i) => i !== idx);
      notifyChange(next, true);
    };

    const handleItemFieldChange = (idx: number, field: keyof CandidateWorkExperience, val: any) => {
      const next = draftRef.current.map((item, i) => {
        if (i !== idx) return item;
        return {
          ...item,
          [field]: val,
          candidateConfirmed: true,
        };
      });
      notifyChange(next, false);
    };

    const handleTextareaChange = (idx: number, rawVal: string) => {
      const next = draftRef.current.map((item, i) => {
        if (i !== idx) return item;
        return {
          ...item,
          _personallyImplementedRaw: rawVal,
          candidateConfirmed: true,
        };
      });
      notifyChange(next, false);
    };

    return (
      <div data-testid="wizard-section-experience">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <div>
            <h3 style={{ fontSize: '15px', fontWeight: 600, color: '#F3F4F8', margin: 0 }}>
              E. Work Experience &amp; Authorship
            </h3>
            <p style={{ fontSize: '12px', color: '#9299AA', margin: '2px 0 0 0' }}>
              Distinguish what you personally built from collective team duties.
            </p>
          </div>
          <button
            type="button"
            onClick={handleAddRole}
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
            <Plus size={14} /> Add Role
          </button>
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
            No employment history entered yet.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {draft.map((exp, idx) => (
              <div
                key={exp.id}
                style={{
                  padding: '16px',
                  background: '#171B24',
                  border: '1px solid #292E3A',
                  borderRadius: '8px',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '12px' }}>
                  <span style={{ fontSize: '13px', fontWeight: 700, color: '#F3F4F8' }}>
                    Role #{idx + 1}: {exp.title || 'Untitled'} {exp.employer ? `@ ${exp.employer}` : ''}
                  </span>
                  <button
                    type="button"
                    onClick={() => handleRemoveRole(idx)}
                    style={{ background: 'transparent', border: 'none', color: '#f87171', cursor: 'pointer' }}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>

                <div className="wizard-grid-2col" style={{ marginBottom: '10px' }}>
                  <input
                    type="text"
                    placeholder="Employer / Company"
                    value={exp.employer}
                    onChange={(e) => handleItemFieldChange(idx, 'employer', e.target.value)}
                    onBlur={flushDraft}
                    style={{
                      padding: '6px 10px',
                      background: '#0F1218',
                      border: '1px solid #292E3A',
                      borderRadius: '4px',
                      color: '#F3F4F8',
                      fontSize: '12px',
                    }}
                  />
                  <input
                    type="text"
                    placeholder="Title / Position"
                    value={exp.title}
                    onChange={(e) => handleItemFieldChange(idx, 'title', e.target.value)}
                    onBlur={flushDraft}
                    style={{
                      padding: '6px 10px',
                      background: '#0F1218',
                      border: '1px solid #292E3A',
                      borderRadius: '4px',
                      color: '#F3F4F8',
                      fontSize: '12px',
                    }}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '11px', color: '#35C991', fontWeight: 600, marginBottom: '4px' }}>
                    Personally Implemented Work (Strictly Your Own Code / Architecture)
                  </label>
                  <textarea
                    rows={3}
                    placeholder="Detail exactly what services, algorithms, or modules you personally implemented..."
                    value={exp._personallyImplementedRaw ?? ''}
                    onChange={(e) => handleTextareaChange(idx, e.target.value)}
                    onBlur={flushDraft}
                    style={{
                      width: '100%',
                      padding: '8px',
                      background: '#0F1218',
                      border: '1px solid #292E3A',
                      borderRadius: '4px',
                      color: '#F3F4F8',
                      fontSize: '12px',
                      lineHeight: '1.4',
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }
);

ExperienceSection.displayName = 'ExperienceSection';
