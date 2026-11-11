import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { CandidateAchievement } from '../../services/knowledgeVault';

export interface AchievementsSectionProps {
  achievements: CandidateAchievement[];
  onUpdateAchievements: (updatedAchievements: CandidateAchievement[], immediate?: boolean) => void;
  registerFlushHandler: (flushFn: () => void) => () => void;
}

export const AchievementsSection: React.FC<AchievementsSectionProps> = React.memo(
  ({ achievements, onUpdateAchievements, registerFlushHandler }) => {
    const [draft, setDraft] = useState<CandidateAchievement[]>(achievements);
    const draftRef = useRef<CandidateAchievement[]>(draft);
    draftRef.current = draft;

    const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const lastSyncedRef = useRef<CandidateAchievement[]>(achievements);

    useEffect(() => {
      if (achievements !== lastSyncedRef.current) {
        lastSyncedRef.current = achievements;
        setDraft(achievements);
        draftRef.current = achievements;
      }
    }, [achievements]);

    const flushDraft = useCallback(() => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
        debounceTimerRef.current = null;
      }
      if (JSON.stringify(draftRef.current) !== JSON.stringify(lastSyncedRef.current)) {
        lastSyncedRef.current = draftRef.current;
        onUpdateAchievements(draftRef.current, true);
      }
    }, [onUpdateAchievements]);

    useEffect(() => {
      const unregister = registerFlushHandler(flushDraft);
      return () => {
        flushDraft();
        unregister();
      };
    }, [registerFlushHandler, flushDraft]);

    const notifyChange = (next: CandidateAchievement[], immediate = false) => {
      setDraft(next);
      draftRef.current = next;

      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }

      if (immediate) {
        onUpdateAchievements(next, true);
      } else {
        debounceTimerRef.current = setTimeout(() => {
          onUpdateAchievements(draftRef.current, false);
        }, 350);
      }
    };

    const handleAddAchievement = () => {
      const newAch: CandidateAchievement = {
        id: `ach_${Date.now()}`,
        title: '',
        category: 'award',
        status: 'CANDIDATE_CONFIRMED',
        candidateConfirmed: true,
      };
      notifyChange([...draftRef.current, newAch], true);
    };

    const handleRemoveAchievement = (idx: number) => {
      const next = draftRef.current.filter((_, i) => i !== idx);
      notifyChange(next, true);
    };

    const handleFieldChange = (idx: number, field: keyof CandidateAchievement, val: any) => {
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
      <div data-testid="wizard-section-achievements">
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
              G. Achievements &amp; Publications (Optional)
            </h3>
            <p style={{ fontSize: '12px', color: '#9299AA', margin: '2px 0 0 0' }}>
              Awards, research papers, patents, and measurable recognitions.
            </p>
          </div>
          <button
            type="button"
            onClick={handleAddAchievement}
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
            <Plus size={14} /> Add Achievement
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
            No achievements added.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {draft.map((ach, idx) => (
              <div
                key={ach.id}
                style={{
                  padding: '12px',
                  background: '#171B24',
                  border: '1px solid #292E3A',
                  borderRadius: '6px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '12px',
                }}
              >
                <select
                  value={ach.category}
                  onChange={(e) => {
                    handleFieldChange(idx, 'category', e.target.value as any);
                    flushDraft();
                  }}
                  style={{
                    padding: '6px 8px',
                    background: '#0F1218',
                    border: '1px solid #292E3A',
                    borderRadius: '4px',
                    color: '#8B7CFF',
                    fontSize: '12px',
                  }}
                >
                  <option value="award">Award</option>
                  <option value="publication">Publication</option>
                  <option value="certification">Certification</option>
                  <option value="recommendation">Recommendation</option>
                  <option value="outcome">Measurable Outcome</option>
                </select>
                <input
                  type="text"
                  placeholder="Title or description..."
                  value={ach.title}
                  onChange={(e) => handleFieldChange(idx, 'title', e.target.value)}
                  onBlur={flushDraft}
                  style={{
                    flex: 1,
                    padding: '6px 10px',
                    background: '#0F1218',
                    border: '1px solid #292E3A',
                    borderRadius: '4px',
                    color: '#F3F4F8',
                    fontSize: '12px',
                  }}
                />
                <button
                  type="button"
                  onClick={() => handleRemoveAchievement(idx)}
                  style={{
                    background: 'transparent',
                    border: 'none',
                    color: '#f87171',
                    cursor: 'pointer',
                  }}
                >
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }
);

AchievementsSection.displayName = 'AchievementsSection';
