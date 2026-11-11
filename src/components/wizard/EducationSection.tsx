import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { CandidateEducation } from '../../services/knowledgeVault';

export interface EducationSectionProps {
  education: CandidateEducation[];
  onUpdateEducation: (updatedEducation: CandidateEducation[], immediate?: boolean) => void;
  registerFlushHandler: (flushFn: () => void) => () => void;
}

export const EducationSection: React.FC<EducationSectionProps> = React.memo(
  ({ education, onUpdateEducation, registerFlushHandler }) => {
    const [draft, setDraft] = useState<CandidateEducation[]>(education);
    const draftRef = useRef<CandidateEducation[]>(draft);
    draftRef.current = draft;

    const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const lastSyncedRef = useRef<CandidateEducation[]>(education);

    useEffect(() => {
      if (education !== lastSyncedRef.current) {
        lastSyncedRef.current = education;
        setDraft(education);
        draftRef.current = education;
      }
    }, [education]);

    const flushDraft = useCallback(() => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
        debounceTimerRef.current = null;
      }
      if (JSON.stringify(draftRef.current) !== JSON.stringify(lastSyncedRef.current)) {
        lastSyncedRef.current = draftRef.current;
        onUpdateEducation(draftRef.current, true);
      }
    }, [onUpdateEducation]);

    useEffect(() => {
      const unregister = registerFlushHandler(flushDraft);
      return () => {
        flushDraft();
        unregister();
      };
    }, [registerFlushHandler, flushDraft]);

    const notifyChange = (next: CandidateEducation[], immediate = false) => {
      setDraft(next);
      draftRef.current = next;

      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }

      if (immediate) {
        onUpdateEducation(next, true);
      } else {
        debounceTimerRef.current = setTimeout(() => {
          onUpdateEducation(draftRef.current, false);
        }, 350);
      }
    };

    const handleAddDegree = () => {
      const newEdu: CandidateEducation = {
        id: `edu_${Date.now()}`,
        institution: '',
        degree: '',
        fieldOfStudy: '',
        startDate: '',
        endDate: '',
        grade: '',
        status: 'CANDIDATE_CONFIRMED',
        candidateConfirmed: true,
      };
      notifyChange([...draftRef.current, newEdu], true);
    };

    const handleRemoveDegree = (idx: number) => {
      const next = draftRef.current.filter((_, i) => i !== idx);
      notifyChange(next, true);
    };

    const handleItemChange = (idx: number, field: keyof CandidateEducation, val: string) => {
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

    return (
      <div data-testid="wizard-section-education">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <div>
            <h3 style={{ fontSize: '15px', fontWeight: 600, color: '#F3F4F8', margin: 0 }}>
              B. Education &amp; Certifications (Optional)
            </h3>
            <p style={{ fontSize: '12px', color: '#9299AA', margin: '2px 0 0 0' }}>
              Academic degrees and graduation timelines.
            </p>
          </div>
          <button
            type="button"
            onClick={handleAddDegree}
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
            <Plus size={14} /> Add Degree
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
            No education records added yet. Click &quot;Add Degree&quot; or skip to the next section.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {draft.map((edu, idx) => (
              <div
                key={edu.id}
                style={{
                  padding: '16px',
                  background: '#171B24',
                  border: '1px solid #292E3A',
                  borderRadius: '8px',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '10px' }}>
                  <span style={{ fontSize: '12px', fontWeight: 600, color: '#8B7CFF' }}>
                    Degree #{idx + 1}
                  </span>
                  <button
                    type="button"
                    onClick={() => handleRemoveDegree(idx)}
                    style={{ background: 'transparent', border: 'none', color: '#f87171', cursor: 'pointer' }}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
                <div className="wizard-grid-2col">
                  <input
                    type="text"
                    placeholder="Institution (e.g. Stanford University)"
                    value={edu.institution}
                    onChange={(e) => handleItemChange(idx, 'institution', e.target.value)}
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
                    placeholder="Degree &amp; Major (e.g. B.S. in Computer Science)"
                    value={edu.degree}
                    onChange={(e) => handleItemChange(idx, 'degree', e.target.value)}
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
                    placeholder="Graduation Year / Dates (e.g. 2018 - 2022)"
                    value={edu.endDate || ''}
                    onChange={(e) => handleItemChange(idx, 'endDate', e.target.value)}
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
                    placeholder="Grade / CGPA (Optional)"
                    value={edu.grade || ''}
                    onChange={(e) => handleItemChange(idx, 'grade', e.target.value)}
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
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }
);

EducationSection.displayName = 'EducationSection';
