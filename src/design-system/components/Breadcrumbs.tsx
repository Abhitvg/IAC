import React from 'react';

export interface BreadcrumbItem {
  label: string;
  onClick?: () => void;
  active?: boolean;
}

interface BreadcrumbsProps {
  items: BreadcrumbItem[];
}

export const Breadcrumbs: React.FC<BreadcrumbsProps> = ({ items }) => {
  return (
    <nav
      aria-label="Breadcrumb"
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '6px',
        fontSize: '12px',
        color: '#9299AA',
        marginBottom: '12px',
      }}
    >
      {items.map((item, idx) => {
        const isLast = idx === items.length - 1;
        return (
          <React.Fragment key={idx}>
            {item.onClick && !isLast ? (
              <button
                type="button"
                onClick={item.onClick}
                style={{
                  background: 'none',
                  border: 'none',
                  padding: 0,
                  color: '#9299AA',
                  cursor: 'pointer',
                  fontSize: '12px',
                  textDecoration: 'none',
                }}
                className="hover:text-[#F3F4F8]"
              >
                {item.label}
              </button>
            ) : (
              <span
                style={{
                  color: isLast ? '#F3F4F8' : '#9299AA',
                  fontWeight: isLast ? 600 : 400,
                }}
              >
                {item.label}
              </span>
            )}
            {!isLast && <span style={{ opacity: 0.4 }}>/</span>}
          </React.Fragment>
        );
      })}
    </nav>
  );
};

