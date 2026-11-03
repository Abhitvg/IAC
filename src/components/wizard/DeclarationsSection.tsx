import React, { useState, useEffect, useRef, useCallback } from 'react';
import { ShieldAlert } from 'lucide-react';
import { CandidateDeclarations } from './types';

export interface DeclarationsSectionProps {
  declarations: CandidateDeclarations;
  onUpdateDeclarations: (updatedDeclarations: CandidateDeclarations, immediate?: boolean) => void;
  registerFlushHandler: (flushFn: () => void) => () => void;
}

interface LocalDeclarations extends CandidateDeclarations {
  _jurisdictionsRaw?: string;
}

export const DeclarationsSection: React.FC<DeclarationsSectionProps> = React.memo(
  ({ declarations, onUpdateDeclarations, registerFlushHandler }) => {
    const [draft, setDraft] = useState<LocalDeclarations>(() => ({
      ...declarations,
      _jurisdictionsRaw: declarations.workAuthorization.jurisdictions.join(', '),
    }));
    const draftRef = useRef<LocalDeclarations>(draft);
    draftRef.current = draft;

    const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const lastSyncedRef = useRef<CandidateDeclarations>(declarations);

    useEffect(() => {
      if (declarations !== lastSyncedRef.current) {
        lastSyncedRef.current = declarations;
        setDraft({
          ...declarations,
          _jurisdictionsRaw: declarations.workAuthorization.jurisdictions.join(', '),
        });
        draftRef.current = {
          ...declarations,
          _jurisdictionsRaw: declarations.workAuthorization.jurisdictions.join(', '),
        };
      }
    }, [declarations]);

    const sanitizeDraftForExport = (item: LocalDeclarations): CandidateDeclarations => {
      const { _jurisdictionsRaw, ...rest } = item;
      return {
        ...rest,
        workAuthorization: {
          ...rest.workAuthorization,
          jurisdictions:
            _jurisdictionsRaw !== undefined
              ? _jurisdictionsRaw.split(',').map((s) => s.trim()).filter(Boolean)
              : rest.workAuthorization.jurisdictions,
        },
      };
    };

    const flushDraft = useCallback(() => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
        debounceTimerRef.current = null;
      }
      onUpdateDeclarations(sanitizeDraftForExport(draftRef.current), true);
    }, [onUpdateDeclarations]);

    useEffect(() => {
      const unregister = registerFlushHandler(flushDraft);
      return () => {
        flushDraft();
        unregister();
      };
    }, [registerFlushHandler, flushDraft]);

    const notifyChange = (next: LocalDeclarations, immediate = false) => {
      setDraft(next);
      draftRef.current = next;

      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }

      if (immediate) {
        onUpdateDeclarations(sanitizeDraftForExport(next), true);
      } else {
        debounceTimerRef.current = setTimeout(() => {
          onUpdateDeclarations(sanitizeDraftForExport(draftRef.current), false);
        }, 350);
      }
    };

    return (
      <div data-testid="wizard-section-declarations">
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
          <ShieldAlert size={20} color="#F7B955" />
          <h3 style={{ fontSize: '15px', fontWeight: 600, color: '#F3F4F8', margin: 0 }}>
            I. Employment Declarations (Candidate Confirmation Required)
          </h3>
        </div>
        <div
          style={{
            padding: '12px 14px',
            borderRadius: '8px',
            background: 'rgba(247, 185, 85, 0.1)',
            border: '1px solid rgba(247, 185, 85, 0.3)',
            color: '#FDE047',
            fontSize: '12px',
            marginBottom: '16px',
            lineHeight: '1.4',
          }}
        >
          <strong>Zero-Inference Invariant:</strong> These declarations are strictly optional. Unconfirmed declarations remain unstated and will prompt for clarification rather than being fabricated.
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          {/* Work Authorization */}
          <div style={{ padding: '14px', background: '#171B24', border: '1px solid #292E3A', borderRadius: '8px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
              <span style={{ fontSize: '13px', fontWeight: 600, color: '#F3F4F8' }}>
                1. Work Authorization Status
              </span>
              <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', color: '#35C991' }}>
                <input
                  type="checkbox"
                  checked={draft.workAuthorization.confirmed}
                  onChange={(e) => {
                    const next: LocalDeclarations = {
                      ...draftRef.current,
                      workAuthorization: {
                        ...draftRef.current.workAuthorization,
                        confirmed: e.target.checked,
                        confirmedAt: e.target.checked ? Date.now() : undefined,
                      },
                    };
                    notifyChange(next, true);
                  }}
                />
                <span>Confirm this declaration</span>
              </label>
            </div>

            <div style={{ display: 'flex', gap: '12px', marginBottom: '8px' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: '#CBD5E1' }}>
                <input
                  type="radio"
                  name="workAuth"
                  checked={draft.workAuthorization.authorized === true}
                  onChange={() => {
                    const next: LocalDeclarations = {
                      ...draftRef.current,
                      workAuthorization: {
                        ...draftRef.current.workAuthorization,
                        authorized: true,
                        confirmed: true,
                        confirmedAt: Date.now(),
                      },
                    };
                    notifyChange(next, true);
                  }}
                />
                <span>Legally authorized to work</span>
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: '#CBD5E1' }}>
                <input
                  type="radio"
                  name="workAuth"
                  checked={draft.workAuthorization.authorized === false}
                  onChange={() => {
                    const next: LocalDeclarations = {
                      ...draftRef.current,
                      workAuthorization: {
                        ...draftRef.current.workAuthorization,
                        authorized: false,
                        confirmed: true,
                        confirmedAt: Date.now(),
                      },
                    };
                    notifyChange(next, true);
                  }}
                />
                <span>Not authorized without permit</span>
              </label>
            </div>

            <input
              type="text"
              placeholder="Authorized jurisdictions (e.g. United States, European Union, Canada)"
              value={draft._jurisdictionsRaw ?? ''}
              onChange={(e) => {
                const next: LocalDeclarations = {
                  ...draftRef.current,
                  _jurisdictionsRaw: e.target.value,
                };
                notifyChange(next, false);
              }}
              onBlur={flushDraft}
              style={{
                width: '100%',
                padding: '6px 10px',
                background: '#0F1218',
                border: '1px solid #292E3A',
                borderRadius: '4px',
                color: '#F3F4F8',
                fontSize: '12px',
              }}
            />
          </div>

          {/* Visa Sponsorship */}
          <div style={{ padding: '14px', background: '#171B24', border: '1px solid #292E3A', borderRadius: '8px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
              <span style={{ fontSize: '13px', fontWeight: 600, color: '#F3F4F8' }}>
                2. Visa Sponsorship Requirements
              </span>
              <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', color: '#35C991' }}>
                <input
                  type="checkbox"
                  checked={draft.sponsorshipRequired.confirmed}
                  onChange={(e) => {
                    const next: LocalDeclarations = {
                      ...draftRef.current,
                      sponsorshipRequired: {
                        ...draftRef.current.sponsorshipRequired,
                        confirmed: e.target.checked,
                        confirmedAt: e.target.checked ? Date.now() : undefined,
                      },
                    };
                    notifyChange(next, true);
                  }}
                />
                <span>Confirm this declaration</span>
              </label>
            </div>

            <div style={{ display: 'flex', gap: '12px' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: '#CBD5E1' }}>
                <input
                  type="radio"
                  name="sponsorship"
                  checked={draft.sponsorshipRequired.required === false}
                  onChange={() => {
                    const next: LocalDeclarations = {
                      ...draftRef.current,
                      sponsorshipRequired: {
                        ...draftRef.current.sponsorshipRequired,
                        required: false,
                        confirmed: true,
                        confirmedAt: Date.now(),
                      },
                    };
                    notifyChange(next, true);
                  }}
                />
                <span>Will NOT require sponsorship</span>
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: '#CBD5E1' }}>
                <input
                  type="radio"
                  name="sponsorship"
                  checked={draft.sponsorshipRequired.required === true}
                  onChange={() => {
                    const next: LocalDeclarations = {
                      ...draftRef.current,
                      sponsorshipRequired: {
                        ...draftRef.current.sponsorshipRequired,
                        required: true,
                        confirmed: true,
                        confirmedAt: Date.now(),
                      },
                    };
                    notifyChange(next, true);
                  }}
                />
                <span>WILL require visa sponsorship</span>
              </label>
            </div>
          </div>
        </div>
      </div>
    );
  }
);

DeclarationsSection.displayName = 'DeclarationsSection';
