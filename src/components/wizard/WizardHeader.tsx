import React from 'react';
import { Sparkles, Download, Upload, FileText, RotateCcw, X, AlertTriangle } from 'lucide-react';

export interface WizardHeaderProps {
  completionPercentage: number;
  saveStatus: 'saved' | 'saving' | 'error';
  saveStatusText: string;
  importErrors: string[] | null;
  isImporting: boolean;
  onExportJson: () => void;
  onImportJsonFile: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onResumeFileUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onShowClearConfirm: () => void;
  onClose: () => void;
}

export const WizardHeader: React.FC<WizardHeaderProps> = React.memo(
  ({
    completionPercentage,
    saveStatus,
    saveStatusText,
    importErrors,
    isImporting,
    onExportJson,
    onImportJsonFile,
    onResumeFileUpload,
    onShowClearConfirm,
    onClose,
  }) => {
    return (
      <>
        {/* Header Bar */}
        <div
          style={{
            padding: '16px 24px',
            borderBottom: '1px solid #292E3A',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: '#171B24',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div
              style={{
                width: '36px',
                height: '36px',
                borderRadius: '8px',
                background: 'rgba(139, 124, 255, 0.15)',
                color: '#8B7CFF',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Sparkles size={20} />
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <h2 id="wizard-title" style={{ fontSize: '15px', fontWeight: 700, color: '#F3F4F8', margin: 0 }}>
                  Candidate Intelligence Wizard
                </h2>
                <span
                  style={{
                    fontSize: '11px',
                    padding: '2px 8px',
                    borderRadius: '12px',
                    background: completionPercentage > 75 ? 'rgba(53, 201, 145, 0.2)' : 'rgba(247, 185, 85, 0.2)',
                    color: completionPercentage > 75 ? '#35C991' : '#F7B955',
                    fontWeight: 700,
                  }}
                >
                  {completionPercentage}% Complete
                </span>
              </div>
              <p style={{ fontSize: '11px', color: '#9299AA', margin: '2px 0 0 0' }}>
                Factual grounding: Declarations require explicit confirmation. Unverified claims are quarantined.
              </p>
            </div>
          </div>

          {/* Quick Actions (Autosave, Export, Import, Close) */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span
              style={{
                fontSize: '11px',
                color: saveStatus === 'error' ? '#f87171' : saveStatus === 'saving' ? '#F7B955' : '#35C991',
                marginRight: '6px',
              }}
            >
              {saveStatusText}
            </span>

            <button
              type="button"
              onClick={onExportJson}
              title="Export Profile JSON"
              style={{
                padding: '5px 10px',
                borderRadius: '6px',
                background: '#1E2330',
                border: '1px solid #292E3A',
                color: '#CBD5E1',
                fontSize: '11px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '5px',
              }}
            >
              <Download size={12} /> Export
            </button>

            <label
              title="Import Profile JSON"
              style={{
                padding: '5px 10px',
                borderRadius: '6px',
                background: '#1E2330',
                border: '1px solid #292E3A',
                color: '#CBD5E1',
                fontSize: '11px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '5px',
              }}
            >
              <Upload size={12} /> Import JSON
              <input type="file" accept=".json" style={{ display: 'none' }} onChange={onImportJsonFile} />
            </label>

            <label
              title="Import Resume (PDF/DOCX/TXT)"
              style={{
                padding: '5px 10px',
                borderRadius: '6px',
                background: '#1E2330',
                border: '1px solid #292E3A',
                color: isImporting ? '#9299AA' : '#8B7CFF',
                fontSize: '11px',
                cursor: isImporting ? 'wait' : 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '5px',
              }}
            >
              <FileText size={12} /> {isImporting ? 'Parsing...' : 'Import Resume'}
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
              title="Reset All Candidate Data"
              style={{
                padding: '5px 8px',
                borderRadius: '6px',
                background: '#1E2330',
                border: '1px solid #292E3A',
                color: '#f87171',
                fontSize: '11px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
              }}
            >
              <RotateCcw size={12} /> Reset
            </button>

            <button
              type="button"
              onClick={onClose}
              title="Close Profile Wizard"
              style={{
                marginLeft: '6px',
                padding: '6px',
                borderRadius: '6px',
                background: 'transparent',
                border: 'none',
                color: '#9299AA',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <X size={16} />
            </button>
          </div>
        </div>

        {/* Import Errors Alert */}
        {importErrors && (
          <div
            role="alert"
            style={{
              padding: '10px 16px',
              background: 'rgba(239, 68, 68, 0.15)',
              borderBottom: '1px solid rgba(239, 68, 68, 0.3)',
              color: '#f87171',
              fontSize: '12px',
              display: 'flex',
              alignItems: 'flex-start',
              gap: '8px',
            }}
          >
            <AlertTriangle size={16} style={{ flexShrink: 0, marginTop: '2px' }} />
            <div>
              <strong>Profile Import Rejected (Schema Invariant Violation):</strong>
              <ul style={{ margin: '4px 0 0 16px', padding: 0 }}>
                {importErrors.slice(0, 4).map((err, i) => (
                  <li key={i}>{err}</li>
                ))}
              </ul>
            </div>
          </div>
        )}
      </>
    );
  }
);

WizardHeader.displayName = 'WizardHeader';
