import React, { useState, useEffect, useRef, useCallback } from 'react';
import { CandidateAnswerPreferences } from './types';

export interface PreferencesSectionProps {
  preferences: CandidateAnswerPreferences;
  onUpdatePreferences: (updatedPreferences: CandidateAnswerPreferences, immediate?: boolean) => void;
  registerFlushHandler: (flushFn: () => void) => () => void;
}

export const PreferencesSection: React.FC<PreferencesSectionProps> = React.memo(
  ({ preferences, onUpdatePreferences, registerFlushHandler }) => {
    const [draft, setDraft] = useState<CandidateAnswerPreferences>(preferences);
    const draftRef = useRef<CandidateAnswerPreferences>(draft);
    draftRef.current = draft;

    const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const lastSyncedRef = useRef<CandidateAnswerPreferences>(preferences);

    useEffect(() => {
      if (preferences !== lastSyncedRef.current) {
        lastSyncedRef.current = preferences;
        setDraft(preferences);
        draftRef.current = preferences;
      }
    }, [preferences]);

    const flushDraft = useCallback(() => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
        debounceTimerRef.current = null;
      }
      onUpdatePreferences(draftRef.current, true);
    }, [onUpdatePreferences]);

    useEffect(() => {
      const unregister = registerFlushHandler(flushDraft);
      return () => {
        flushDraft();
        unregister();
      };
    }, [registerFlushHandler, flushDraft]);

    const notifyChange = (next: CandidateAnswerPreferences, immediate = false) => {
      setDraft(next);
      draftRef.current = next;

      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }

      if (immediate) {
        onUpdatePreferences(next, true);
      } else {
        debounceTimerRef.current = setTimeout(() => {
          onUpdatePreferences(draftRef.current, false);
        }, 350);
      }
    };

    const handleFieldChange = (field: keyof CandidateAnswerPreferences, val: any) => {
      const next: CandidateAnswerPreferences = {
        ...draftRef.current,
        [field]: val,
      };
      notifyChange(next, false);
    };

    return (
      <div data-testid="wizard-section-preferences">
        <h3 style={{ fontSize: '15px', fontWeight: 600, color: '#F3F4F8', marginBottom: '4px' }}>
          H. Teleprompter &amp; Answer Preferences
        </h3>
        <p style={{ fontSize: '12px', color: '#9299AA', marginBottom: '16px' }}>
          Tune how answers are structured and paced during live interviews.
        </p>

        <div className="wizard-grid-2col">
          <div>
            <label style={{ display: 'block', fontSize: '12px', color: '#CBD5E1', marginBottom: '4px' }}>
              Answer Length
            </label>
            <select
              value={draft.answerLength}
              onChange={(e) => {
                handleFieldChange('answerLength', e.target.value as any);
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
              <option value="concise">Concise (Under 60 seconds speaking time)</option>
              <option value="balanced">Balanced (90-120 seconds)</option>
              <option value="detailed">Detailed (Comprehensive walkthrough)</option>
            </select>
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '12px', color: '#CBD5E1', marginBottom: '4px' }}>
              Speaking Perspective
            </label>
            <select
              value={draft.responsePerspective}
              onChange={(e) => {
                handleFieldChange('responsePerspective', e.target.value as any);
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
              <option value="first_person">First-Person (&quot;I designed...&quot; when verified)</option>
              <option value="neutral">Neutral 3rd-Person (Objective technical guidance)</option>
            </select>
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '12px', color: '#CBD5E1', marginBottom: '4px' }}>
              Technical Depth
            </label>
            <select
              value={draft.technicalDepth}
              onChange={(e) => {
                handleFieldChange('technicalDepth', e.target.value as any);
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
              <option value="conceptual">High-Level Conceptual &amp; Trade-offs</option>
              <option value="balanced">Balanced Architecture &amp; Decisions</option>
              <option value="deep_code_and_architecture">Deep Implementation &amp; Concurrency</option>
            </select>
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '12px', color: '#CBD5E1', marginBottom: '4px' }}>
              Preferred Coding Language
            </label>
            <input
              type="text"
              value={draft.preferredCodingLanguage}
              onChange={(e) => handleFieldChange('preferredCodingLanguage', e.target.value)}
              onBlur={flushDraft}
              placeholder="e.g. TypeScript, Python, Go, Java"
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

PreferencesSection.displayName = 'PreferencesSection';
