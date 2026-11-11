import React, { useState, useEffect, useRef, useCallback } from 'react';
import { CandidateCareerOverview } from './types';

export interface CareerSectionProps {
  career: CandidateCareerOverview;
  onUpdateCareer: (updatedCareer: CandidateCareerOverview, immediate?: boolean) => void;
  registerFlushHandler: (flushFn: () => void) => () => void;
}

export const CareerSection: React.FC<CareerSectionProps> = React.memo(
  ({ career, onUpdateCareer, registerFlushHandler }) => {
    const [draft, setDraft] = useState<CandidateCareerOverview>(career);
    const draftRef = useRef<CandidateCareerOverview>(draft);
    draftRef.current = draft;

    const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const lastSyncedRef = useRef<CandidateCareerOverview>(career);

    useEffect(() => {
      if (career !== lastSyncedRef.current) {
        lastSyncedRef.current = career;
        setDraft(career);
        draftRef.current = career;
      }
    }, [career]);

    const flushDraft = useCallback(() => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
        debounceTimerRef.current = null;
      }
      if (JSON.stringify(draftRef.current) !== JSON.stringify(lastSyncedRef.current)) {
        lastSyncedRef.current = draftRef.current;
        onUpdateCareer(draftRef.current, true);
      }
    }, [onUpdateCareer]);

    useEffect(() => {
      const unregister = registerFlushHandler(flushDraft);
      return () => {
        flushDraft();
        unregister();
      };
    }, [registerFlushHandler, flushDraft]);

    const notifyChange = (next: CandidateCareerOverview, immediate = false) => {
      setDraft(next);
      draftRef.current = next;

      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }

      if (immediate) {
        onUpdateCareer(next, true);
      } else {
        debounceTimerRef.current = setTimeout(() => {
          onUpdateCareer(draftRef.current, false);
        }, 350);
      }
    };

    const handleFieldChange = (field: keyof CandidateCareerOverview, val: any) => {
      const next: CandidateCareerOverview = {
        ...draftRef.current,
        [field]: val,
        candidateConfirmed: true,
      };
      notifyChange(next, false);
    };

    return (
      <div data-testid="wizard-section-career">
        <h3 style={{ fontSize: '15px', fontWeight: 600, color: '#F3F4F8', marginBottom: '4px' }}>
          C. Career &amp; Target Roles
        </h3>
        <p style={{ fontSize: '12px', color: '#9299AA', marginBottom: '16px' }}>
          Zero invented defaults: target seniority defaults to UNKNOWN until you specify it.
        </p>

        <div className="wizard-grid-2col">
          <div>
            <label
              style={{ display: 'block', fontSize: '12px', color: '#CBD5E1', marginBottom: '4px' }}
            >
              Current Role / Title
            </label>
            <input
              type="text"
              value={draft.currentRole}
              onChange={(e) => handleFieldChange('currentRole', e.target.value)}
              onBlur={flushDraft}
              placeholder="e.g. Senior Backend Engineer"
              style={{
                width: '100%',
                padding: '8px 12px',
                background: '#171B24',
                border: '1px solid #292E3A',
                borderRadius: '6px',
                color: '#F3F4F8',
                fontSize: '13px',
              }}
            />
          </div>

          <div>
            <label
              style={{ display: 'block', fontSize: '12px', color: '#CBD5E1', marginBottom: '4px' }}
            >
              Total Experience (Years)
            </label>
            <input
              type="number"
              min={0}
              value={draft.totalExperienceYears !== undefined ? draft.totalExperienceYears : ''}
              onChange={(e) => {
                const val = e.target.value.trim() === '' ? undefined : Number(e.target.value);
                handleFieldChange('totalExperienceYears', val);
              }}
              onBlur={flushDraft}
              placeholder="Leave blank if unstated"
              style={{
                width: '100%',
                padding: '8px 12px',
                background: '#171B24',
                border: '1px solid #292E3A',
                borderRadius: '6px',
                color: '#F3F4F8',
                fontSize: '13px',
              }}
            />
          </div>

          <div>
            <label
              style={{ display: 'block', fontSize: '12px', color: '#CBD5E1', marginBottom: '4px' }}
            >
              Target Seniority Level
            </label>
            <select
              value={draft.targetSeniority || 'UNKNOWN'}
              onChange={(e) => {
                handleFieldChange('targetSeniority', e.target.value as any);
                flushDraft();
              }}
              style={{
                width: '100%',
                padding: '8px 12px',
                background: '#171B24',
                border: '1px solid #292E3A',
                borderRadius: '6px',
                color: '#F3F4F8',
                fontSize: '13px',
              }}
            >
              <option value="UNKNOWN">Unspecified / Unknown</option>
              <option value="junior">Junior Engineer</option>
              <option value="mid">Mid-Level Engineer</option>
              <option value="senior">Senior Engineer</option>
              <option value="staff">Staff / Lead Engineer</option>
              <option value="principal">Principal Engineer</option>
              <option value="executive">Engineering Manager / Director</option>
            </select>
          </div>

          <div>
            <label
              style={{ display: 'block', fontSize: '12px', color: '#CBD5E1', marginBottom: '4px' }}
            >
              Notice Period
            </label>
            <input
              type="text"
              value={draft.noticePeriod}
              onChange={(e) => handleFieldChange('noticePeriod', e.target.value)}
              onBlur={flushDraft}
              placeholder="e.g. Immediate / 2 Weeks / 30 Days"
              style={{
                width: '100%',
                padding: '8px 12px',
                background: '#171B24',
                border: '1px solid #292E3A',
                borderRadius: '6px',
                color: '#F3F4F8',
                fontSize: '13px',
              }}
            />
          </div>
        </div>
      </div>
    );
  }
);

CareerSection.displayName = 'CareerSection';
