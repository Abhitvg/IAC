import React from 'react';

export type StatusVariant =
  | 'repository_supported'
  | 'document_supported'
  | 'candidate_confirmed'
  | 'resume_reported'
  | 'unknown'
  | 'validated'
  | 'flagged'
  | 'failed'
  | 'pending'
  | 'aborted'
  | 'neutral';

interface StatusBadgeProps {
  status: StatusVariant | string;
  label?: string;
  size?: 'sm' | 'md';
  className?: string;
}

export const StatusBadge: React.FC<StatusBadgeProps> = ({
  status,
  label,
  size = 'md',
  className = '',
}) => {
  const norm = status.toLowerCase();

  let text = label;
  let bg = 'rgba(146, 153, 170, 0.12)';
  let border = '#292E3A';
  let color = '#9299AA';
  let icon = '•';

  if (norm.includes('repository') || norm === 'repository_supported') {
    text = text || 'Repository Verified';
    bg = 'rgba(53, 201, 145, 0.12)';
    border = 'rgba(53, 201, 145, 0.35)';
    color = '#35C991';
    icon = '📦';
  } else if (norm.includes('document') || norm === 'document_supported') {
    text = text || 'Document Verified';
    bg = 'rgba(53, 201, 145, 0.12)';
    border = 'rgba(53, 201, 145, 0.35)';
    color = '#35C991';
    icon = '📄';
  } else if (norm.includes('independent') || norm === 'independently_verified') {
    text = text || 'Audit Verified';
    bg = 'rgba(139, 124, 255, 0.15)';
    border = 'rgba(139, 124, 255, 0.4)';
    color = '#8B7CFF';
    icon = '🛡️';
  } else if (norm.includes('confirmed') || norm === 'candidate_confirmed') {
    text = text || 'Candidate Confirmed';
    bg = 'rgba(244, 184, 74, 0.12)';
    border = 'rgba(244, 184, 74, 0.35)';
    color = '#F4B84A';
    icon = '✍️';
  } else if (norm.includes('resume') || norm === 'resume_reported') {
    text = text || 'Resume Reported';
    bg = 'rgba(146, 153, 170, 0.12)';
    border = '#292E3A';
    color = '#9299AA';
    icon = '📋';
  } else if (norm === 'validated' || norm === 'true') {
    text = text || '100% Grounded';
    bg = 'rgba(53, 201, 145, 0.12)';
    border = 'rgba(53, 201, 145, 0.35)';
    color = '#35C991';
    icon = '✓';
  } else if (norm === 'flagged' || norm === 'quarantined') {
    text = text || 'Flagged (Ungrounded Claims)';
    bg = 'rgba(244, 184, 74, 0.15)';
    border = 'rgba(244, 184, 74, 0.4)';
    color = '#F4B84A';
    icon = '⚠️';
  } else if (norm === 'failed') {
    text = text || 'Validation Failed';
    bg = 'rgba(241, 111, 120, 0.15)';
    border = 'rgba(241, 111, 120, 0.4)';
    color = '#F16F78';
    icon = '✕';
  } else if (norm === 'aborted') {
    text = text || 'Aborted';
    bg = 'rgba(146, 153, 170, 0.12)';
    border = '#292E3A';
    color = '#9299AA';
    icon = '⏹';
  } else if (norm === 'pending') {
    text = text || 'Grounding Check...';
    bg = 'rgba(139, 124, 255, 0.1)';
    border = 'rgba(139, 124, 255, 0.25)';
    color = '#A99DFF';
    icon = '⏳';
  } else if (norm === 'unknown' || norm === 'unverified') {
    text = text || 'UNKNOWN';
    bg = 'rgba(146, 153, 170, 0.1)';
    border = 'rgba(146, 153, 170, 0.25)';
    color = '#9299AA';
    icon = '?';
  }

  const isSmall = size === 'sm';

  return (
    <span
      className={`inline-flex items-center gap-1.5 font-medium tracking-wide rounded-md transition-colors ${className}`}
      style={{
        padding: isSmall ? '2px 6px' : '3px 8px',
        fontSize: isSmall ? '10px' : '11px',
        background: bg,
        border: `1px solid ${border}`,
        color: color,
        whiteSpace: 'nowrap',
      }}
    >
      <span style={{ fontSize: isSmall ? '9px' : '10px' }}>{icon}</span>
      <span>{text}</span>
    </span>
  );
};
