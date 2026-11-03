import React from 'react';
import { Upload, FileText, RotateCcw } from 'lucide-react';
import { WizardSection, WIZARD_STEPS } from './types';

export interface WizardSidebarProps {
  activeStep: WizardSection;
  isImporting: boolean;
  onSelectStep: (stepId: WizardSection) => void;
  onImportJsonFile: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onResumeFileUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onShowClearConfirm: () => void;
}

export const WizardSidebar: React.FC<WizardSidebarProps> = React.memo(
  ({
    activeStep,
    isImporting,
    onSelectStep,
    onImportJsonFile,
    onResumeFileUpload,
    onShowClearConfirm,
  }) => {
    return (
      <div className="wizard-sidebar">
        <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
          {WIZARD_STEPS.map((step) => {
            const isActive = step.id === activeStep;
            return (
              <button
                key={step.id}
                type="button"
                onClick={() => onSelectStep(step.id)}
                style={{
                  width: '100%',
                  textAlign: 'left',
                  padding: '8px 10px',
                  borderRadius: '8px',
                  background: isActive ? 'rgba(139, 124, 255, 0.15)' : 'transparent',
                  color: isActive ? '#8B7CFF' : '#9299AA',
                  border: isActive ? '1px solid rgba(139, 124, 255, 0.3)' : '1px solid transparent',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  fontSize: '12px',
                  fontWeight: isActive ? 600 : 500,
                }}
              >
                <span style={{ color: isActive ? '#8B7CFF' : '#687082' }}>{step.icon}</span>
                <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {step.shortLabel}
                </span>
                {step.required && <span style={{ fontSize: '9px', color: '#F7B955' }}>*</span>}
              </button>
            );
          })}
        </div>

        {/* Ingestion & Reset Utilities */}
        <div style={{ paddingTop: '10px', borderTop: '1px solid #1E2330', display: 'flex', flexDirection: 'column', gap: '6px' }}>
          <label
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '5px 8px',
              borderRadius: '6px',
              background: '#171B24',
              border: '1px solid #292E3A',
              color: '#9299AA',
              fontSize: '11px',
              cursor: isImporting ? 'wait' : 'pointer',
              justifyContent: 'center',
            }}
          >
            <Upload size={12} />
            <span>Upload JSON</span>
            <input type="file" accept=".json" style={{ display: 'none' }} onChange={onImportJsonFile} />
          </label>

          <label
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '5px 8px',
              borderRadius: '6px',
              background: '#171B24',
              border: '1px solid #292E3A',
              color: isImporting ? '#9299AA' : '#8B7CFF',
              fontSize: '11px',
              cursor: isImporting ? 'wait' : 'pointer',
              justifyContent: 'center',
            }}
          >
            <FileText size={12} />
            <span>{isImporting ? 'Ingesting...' : 'Ingest Resume'}</span>
            <input
              type="file"
              accept=".pdf,.docx,.txt"
              disabled={isImporting}
              style={{ display: 'none' }}
              onChange={onResumeFileUpload}
            />
          </label>

          <button
            type="button"
            onClick={onShowClearConfirm}
            style={{
              padding: '5px 8px',
              borderRadius: '6px',
              background: 'transparent',
              border: '1px solid #292E3A',
              color: '#f87171',
              fontSize: '11px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              justifyContent: 'center',
            }}
          >
            <RotateCcw size={12} />
            <span>Clear Profile</span>
          </button>
        </div>
      </div>
    );
  }
);

WizardSidebar.displayName = 'WizardSidebar';
