import React from 'react';

interface EmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  description: string;
  action?: React.ReactNode;
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  icon,
  title,
  description,
  action,
}) => {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '48px 24px',
        textAlign: 'center',
        background: '#171B24',
        border: '1px dashed #292E3A',
        borderRadius: '12px',
      }}
    >
      {icon && (
        <div
          style={{
            fontSize: '32px',
            marginBottom: '12px',
            color: '#8B7CFF',
          }}
        >
          {icon}
        </div>
      )}
      <h3
        style={{
          fontSize: '15px',
          fontWeight: 600,
          color: '#F3F4F8',
          margin: '0 0 6px 0',
        }}
      >
        {title}
      </h3>
      <p
        style={{
          fontSize: '13px',
          color: '#9299AA',
          margin: '0 0 16px 0',
          maxWidth: '380px',
          lineHeight: 1.4,
        }}
      >
        {description}
      </p>
      {action}
    </div>
  );
};

