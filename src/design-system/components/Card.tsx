import React from 'react';

interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  elevated?: boolean;
  interactive?: boolean;
  padding?: 'none' | 'sm' | 'md' | 'lg';
  children: React.ReactNode;
}

export const Card: React.FC<CardProps> = ({
  elevated = false,
  interactive = false,
  padding = 'md',
  style,
  className = '',
  children,
  ...props
}) => {
  const paddingMap = {
    none: '0',
    sm: '12px',
    md: '16px',
    lg: '24px',
  };

  return (
    <div
      className={`transition-all duration-150 ${interactive ? 'hover:border-[#8B7CFF]/40 cursor-pointer' : ''} ${className}`}
      style={{
        background: elevated ? '#1E2330' : '#171B24',
        border: '1px solid #292E3A',
        borderRadius: '10px',
        padding: paddingMap[padding],
        color: '#F3F4F8',
        boxShadow: elevated ? '0 4px 20px rgba(0, 0, 0, 0.35)' : 'none',
        ...style,
      }}
      {...props}
    >
      {children}
    </div>
  );
};

