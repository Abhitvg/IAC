import React, { useState, useEffect, useRef, useCallback } from 'react';
import { EMAIL_REGEX, CandidateIdentity } from './types';

export interface IdentitySectionProps {
  identity: CandidateIdentity;
  onUpdateIdentity: (updatedIdentity: CandidateIdentity, immediate?: boolean) => void;
  registerFlushHandler: (flushFn: () => void) => () => void;
}

export const IdentitySection: React.FC<IdentitySectionProps> = React.memo(
  ({ identity, onUpdateIdentity, registerFlushHandler }) => {
    // Local draft state for immediate typing response with 0ms character delay
    const [draft, setDraft] = useState<CandidateIdentity>(identity);
    const draftRef = useRef<CandidateIdentity>(draft);
    draftRef.current = draft;

    const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const lastSyncedIdentityRef = useRef<CandidateIdentity>(identity);

    // Sync external prop changes (e.g. from resume upload or JSON import)
    useEffect(() => {
      if (identity !== lastSyncedIdentityRef.current) {
        lastSyncedIdentityRef.current = identity;
        setDraft(identity);
        draftRef.current = identity;
      }
    }, [identity]);

    // Flush any pending debounced change to canonical profile
    const flushDraft = useCallback(() => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
        debounceTimerRef.current = null;
      }
      onUpdateIdentity(draftRef.current, true);
    }, [onUpdateIdentity]);

    // Register flush handler with parent wizard so step transitions flush draft first
    useEffect(() => {
      const unregister = registerFlushHandler(flushDraft);
      return () => {
        flushDraft();
        unregister();
      };
    }, [registerFlushHandler, flushDraft]);

    const handleFieldChange = (field: keyof CandidateIdentity, value: string) => {
      const isCandidateConfirmed = field === 'fullName' || field === 'email' ? true : draftRef.current.candidateConfirmed;
      const nextDraft: CandidateIdentity = {
        ...draftRef.current,
        [field]: value,
        candidateConfirmed: isCandidateConfirmed,
      };
      setDraft(nextDraft);
      draftRef.current = nextDraft;

      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
      debounceTimerRef.current = setTimeout(() => {
        onUpdateIdentity(draftRef.current, false);
      }, 350);
    };

    const handleLinkChange = (linkField: 'github' | 'linkedin', value: string) => {
      const nextDraft: CandidateIdentity = {
        ...draftRef.current,
        links: {
          ...draftRef.current.links,
          [linkField]: value,
        },
      };
      setDraft(nextDraft);
      draftRef.current = nextDraft;

      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
      debounceTimerRef.current = setTimeout(() => {
        onUpdateIdentity(draftRef.current, false);
      }, 350);
    };

    const handleBlur = () => {
      flushDraft();
    };

    // Fast local field validation
    const isFullNameValid = draft.fullName.trim().length >= 2;
    const isEmailValid = EMAIL_REGEX.test(draft.email.trim());

    return (
      <div data-testid="wizard-section-identity">
        <h3 style={{ fontSize: '15px', fontWeight: 600, color: '#F3F4F8', marginBottom: '4px' }}>
          A. Personal Identity
        </h3>
        <p style={{ fontSize: '12px', color: '#9299AA', marginBottom: '16px' }}>
          Required core identity for grounding candidate answers and application assistance.
        </p>

        <div className="wizard-grid-2col">
          <div>
            <label style={{ display: 'block', fontSize: '12px', color: '#CBD5E1', marginBottom: '4px' }}>
              Full Legal Name <span style={{ color: '#F7B955' }}>*</span>
            </label>
            <input
              type="text"
              data-testid="wizard-input-fullname"
              aria-required="true"
              aria-invalid={!isFullNameValid && draft.fullName.length > 0}
              value={draft.fullName}
              onChange={(e) => handleFieldChange('fullName', e.target.value)}
              onBlur={handleBlur}
              placeholder="e.g. Jane Doe"
              style={{
                width: '100%',
                padding: '8px 12px',
                background: '#171B24',
                border: !isFullNameValid && draft.fullName.length > 0 ? '1px solid #f87171' : '1px solid #292E3A',
                borderRadius: '6px',
                color: '#F3F4F8',
                fontSize: '13px',
              }}
            />
            {!isFullNameValid && draft.fullName.length > 0 && (
              <span style={{ fontSize: '10px', color: '#f87171', marginTop: '2px', display: 'block' }}>
                Please enter your full name (at least 2 characters)
              </span>
            )}
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '12px', color: '#CBD5E1', marginBottom: '4px' }}>
              Preferred Name
            </label>
            <input
              type="text"
              data-testid="wizard-input-preferredname"
              value={draft.preferredName || ''}
              onChange={(e) => handleFieldChange('preferredName', e.target.value)}
              onBlur={handleBlur}
              placeholder="e.g. JD"
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
            <label style={{ display: 'block', fontSize: '12px', color: '#CBD5E1', marginBottom: '4px' }}>
              Email Address <span style={{ color: '#F7B955' }}>*</span>
            </label>
            <input
              type="email"
              data-testid="wizard-input-email"
              aria-required="true"
              aria-invalid={!isEmailValid && draft.email.length > 0}
              value={draft.email}
              onChange={(e) => handleFieldChange('email', e.target.value)}
              onBlur={handleBlur}
              placeholder="jane.doe@example.com"
              style={{
                width: '100%',
                padding: '8px 12px',
                background: '#171B24',
                border: !isEmailValid && draft.email.length > 0 ? '1px solid #f87171' : '1px solid #292E3A',
                borderRadius: '6px',
                color: '#F3F4F8',
                fontSize: '13px',
              }}
            />
            {!isEmailValid && draft.email.length > 0 && (
              <span style={{ fontSize: '10px', color: '#f87171', marginTop: '2px', display: 'block' }}>
                Please enter a valid email address
              </span>
            )}
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '12px', color: '#CBD5E1', marginBottom: '4px' }}>
              Phone (Optional)
            </label>
            <input
              type="tel"
              data-testid="wizard-input-phone"
              value={draft.phone || ''}
              onChange={(e) => handleFieldChange('phone', e.target.value)}
              onBlur={handleBlur}
              placeholder="+1 (555) 000-0000"
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
            <label style={{ display: 'block', fontSize: '12px', color: '#CBD5E1', marginBottom: '4px' }}>
              Current Location
            </label>
            <input
              type="text"
              data-testid="wizard-input-location"
              value={draft.location}
              onChange={(e) => handleFieldChange('location', e.target.value)}
              onBlur={handleBlur}
              placeholder="e.g. San Francisco, CA"
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
            <label style={{ display: 'block', fontSize: '12px', color: '#CBD5E1', marginBottom: '4px' }}>
              Time Zone
            </label>
            <input
              type="text"
              data-testid="wizard-input-timezone"
              value={draft.timeZone || ''}
              onChange={(e) => handleFieldChange('timeZone', e.target.value)}
              onBlur={handleBlur}
              placeholder="e.g. America/Los_Angeles"
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

        <div style={{ marginTop: '16px' }}>
          <label style={{ display: 'block', fontSize: '12px', color: '#CBD5E1', marginBottom: '4px' }}>
            Links &amp; Profiles
          </label>
          <div className="wizard-grid-2col">
            <input
              type="text"
              data-testid="wizard-input-github"
              placeholder="GitHub URL (https://github.com/...)"
              value={draft.links.github || ''}
              onChange={(e) => handleLinkChange('github', e.target.value)}
              onBlur={handleBlur}
              style={{
                padding: '8px 12px',
                background: '#171B24',
                border: '1px solid #292E3A',
                borderRadius: '6px',
                color: '#F3F4F8',
                fontSize: '13px',
              }}
            />
            <input
              type="text"
              data-testid="wizard-input-linkedin"
              placeholder="LinkedIn URL (https://linkedin.com/in/...)"
              value={draft.links.linkedin || ''}
              onChange={(e) => handleLinkChange('linkedin', e.target.value)}
              onBlur={handleBlur}
              style={{
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

IdentitySection.displayName = 'IdentitySection';
