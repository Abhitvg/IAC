import React from 'react';
import { ChevronLeft, ChevronRight, SkipForward } from 'lucide-react';
import { WizardSection, WIZARD_STEPS } from './types';

export interface WizardFooterProps {
  currentStepIdx: number;
  isSkippable: boolean;
  onPrev: () => void;
  onNext: () => void;
  onSkip: () => void;
}

export const WizardFooter: React.FC<WizardFooterProps> = React.memo(
  ({ currentStepIdx, isSkippable, onPrev, onNext, onSkip }) => {
    const isFirst = currentStepIdx === 0;
    const isLast = currentStepIdx === WIZARD_STEPS.length - 1;

    return (
      <div
        style={{
          padding: '12px 20px',
          borderTop: '1px solid #292E3A',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          background: '#171B24',
        }}
      >
        <button
          type="button"
          onClick={onPrev}
          disabled={isFirst}
          style={{
            padding: '6px 14px',
            borderRadius: '6px',
            background: '#0F1218',
            border: '1px solid #292E3A',
            color: isFirst ? '#475569' : '#CBD5E1',
            fontSize: '12px',
            cursor: isFirst ? 'not-allowed' : 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
          }}
        >
          <ChevronLeft size={14} /> Previous
        </button>

        <span style={{ fontSize: '11px', color: '#9299AA' }}>
          Step {currentStepIdx + 1} of {WIZARD_STEPS.length}: {WIZARD_STEPS[currentStepIdx].label}
        </span>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {isSkippable && !isLast && (
            <button
              type="button"
              onClick={onSkip}
              style={{
                padding: '6px 12px',
                borderRadius: '6px',
                background: 'transparent',
                border: '1px solid #334155',
                color: '#94a3b8',
                fontSize: '12px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
              }}
            >
              <span>Skip</span>
              <SkipForward size={13} />
            </button>
          )}

          <button
            type="button"
            onClick={onNext}
            disabled={isLast}
            style={{
              padding: '6px 14px',
              borderRadius: '6px',
              background: isLast ? '#0F1218' : '#8B7CFF',
              border: 'none',
              color: isLast ? '#475569' : '#fff',
              fontSize: '12px',
              fontWeight: 600,
              cursor: isLast ? 'not-allowed' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
            }}
          >
            Next <ChevronRight size={14} />
          </button>
        </div>
      </div>
    );
  }
);

WizardFooter.displayName = 'WizardFooter';
