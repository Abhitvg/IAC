import React, { useMemo } from 'react';
import { CheckCircle2 } from 'lucide-react';
import { CanonicalCandidateProfile } from '../../services/knowledgeVault';

export interface ReviewSectionProps {
  profile: CanonicalCandidateProfile;
  onCompleteAndLock: () => void;
}

export const ReviewSection: React.FC<ReviewSectionProps> = React.memo(
  ({ profile, onCompleteAndLock }) => {
    const { totalItems, confirmedItems, pct } = useMemo(() => {
      const total =
        (profile.identity.fullName ? 1 : 0) +
        (profile.declarations.workAuthorization.confirmed ? 1 : 0) +
        profile.skills.length +
        profile.projects.length +
        profile.experience.length;

      const confirmed =
        (profile.identity.candidateConfirmed ? 1 : 0) +
        (profile.declarations.workAuthorization.confirmed ? 1 : 0) +
        profile.skills.filter((s) => s.candidateConfirmed).length +
        profile.projects.filter((p) => p.candidateConfirmed).length +
        profile.experience.filter((e) => e.candidateConfirmed).length;

      const percentage = total > 0 ? Math.round((confirmed / total) * 100) : 0;
      return { totalItems: total, confirmedItems: confirmed, pct: percentage };
    }, [profile]);

    return (
      <div data-testid="wizard-section-review">
        <h3 style={{ fontSize: '15px', fontWeight: 600, color: '#F3F4F8', marginBottom: '4px' }}>
          Review Candidate Intelligence &amp; Provenance Ledger
        </h3>
        <p style={{ fontSize: '12px', color: '#9299AA', marginBottom: '16px' }}>
          Verify that all claims accurately reflect your verified background before closing.
        </p>

        {/* Completeness & Grounding Progress Metrics */}
        <div style={{ padding: '14px', background: '#171B24', borderRadius: '8px', border: '1px solid #292E3A', marginBottom: '16px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
            <span style={{ fontSize: '12px', fontWeight: 600, color: '#F3F4F8' }}>
              Candidate Grounding &amp; Confirmation Progress
            </span>
            <span style={{ fontSize: '12px', fontWeight: 700, color: pct >= 80 ? '#35C991' : '#F7B955' }}>
              {confirmedItems} / {totalItems} confirmed ({pct}%)
            </span>
          </div>
          <div style={{ height: '6px', background: '#0F1218', borderRadius: '3px', overflow: 'hidden' }}>
            <div
              style={{
                height: '100%',
                width: `${pct}%`,
                background: pct >= 80 ? '#35C991' : '#8B7CFF',
                transition: 'width 0.3s ease',
              }}
            />
          </div>
        </div>

        <div className="wizard-grid-2col" style={{ marginBottom: '16px' }}>
          <div style={{ padding: '14px', background: '#171B24', borderRadius: '8px', border: '1px solid #292E3A' }}>
            <h4 style={{ fontSize: '12px', textTransform: 'uppercase', color: '#8B7CFF', margin: '0 0 8px 0' }}>
              Identity &amp; Career
            </h4>
            <div style={{ fontSize: '12px', color: '#F3F4F8', lineHeight: '1.6' }}>
              <div><strong>Name:</strong> {profile.identity.fullName || 'Not provided'}</div>
              <div><strong>Email:</strong> {profile.identity.email || 'Not provided'}</div>
              <div><strong>Location:</strong> {profile.identity.location || 'Not provided'}</div>
              <div><strong>Current Role:</strong> {profile.career.currentRole || 'Not specified'}</div>
              <div><strong>Seniority:</strong> {profile.career.targetSeniority || 'UNKNOWN'}</div>
            </div>
          </div>

          <div style={{ padding: '14px', background: '#171B24', borderRadius: '8px', border: '1px solid #292E3A' }}>
            <h4 style={{ fontSize: '12px', textTransform: 'uppercase', color: '#35C991', margin: '0 0 8px 0' }}>
              Grounding &amp; Declarations
            </h4>
            <div style={{ fontSize: '12px', color: '#F3F4F8', lineHeight: '1.6' }}>
              <div>
                <strong>Work Authorization:</strong>{' '}
                {profile.declarations.workAuthorization.confirmed
                  ? profile.declarations.workAuthorization.authorized ? 'Authorized' : 'Not Authorized'
                  : 'Unconfirmed'}
              </div>
              <div>
                <strong>Sponsorship:</strong>{' '}
                {profile.declarations.sponsorshipRequired.confirmed
                  ? profile.declarations.sponsorshipRequired.required ? 'Required' : 'Not Required'
                  : 'Unconfirmed'}
              </div>
              <div><strong>Registered Skills:</strong> {profile.skills.length} skills ({profile.skills.filter(s => s.candidateConfirmed).length} confirmed)</div>
              <div><strong>Verified Projects:</strong> {profile.projects.length} projects ({profile.projects.filter(p => p.candidateConfirmed).length} confirmed)</div>
              <div><strong>Employment Roles:</strong> {profile.experience.length} roles ({profile.experience.filter(e => e.candidateConfirmed).length} confirmed)</div>
            </div>
          </div>
        </div>

        <div style={{ textAlign: 'center', marginTop: '20px' }}>
          <button
            type="button"
            onClick={onCompleteAndLock}
            style={{
              padding: '10px 24px',
              borderRadius: '8px',
              background: '#8B7CFF',
              border: 'none',
              color: '#fff',
              fontSize: '13px',
              fontWeight: 700,
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '8px',
              boxShadow: '0 4px 12px rgba(139, 124, 255, 0.3)',
            }}
          >
            <CheckCircle2 size={16} /> Complete &amp; Lock Profile
          </button>
        </div>
      </div>
    );
  }
);

ReviewSection.displayName = 'ReviewSection';
