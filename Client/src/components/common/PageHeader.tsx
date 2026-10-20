import React from 'react';

export interface PageHeaderProps {
  title: string;
  description?: string;
  action?: React.ReactNode;
  breadcrumbs?: Array<{ label: string; href?: string }>;
}

export const PageHeader: React.FC<PageHeaderProps> = ({
  title,
  description,
  action,
  breadcrumbs,
}) => {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '0.5rem',
        marginBottom: '1.75rem',
      }}
    >
      {breadcrumbs && breadcrumbs.length > 0 && (
        <nav
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            fontSize: '0.8125rem',
            color: 'var(--color-text-subtle)',
          }}
          aria-label="Breadcrumb"
        >
          {breadcrumbs.map((crumb, idx) => (
            <React.Fragment key={crumb.label}>
              {idx > 0 && <span>/</span>}
              {crumb.href ? (
                <a href={crumb.href} style={{ color: 'var(--color-text-muted)' }}>
                  {crumb.label}
                </a>
              ) : (
                <span style={{ color: 'var(--color-text-main)', fontWeight: 600 }}>
                  {crumb.label}
                </span>
              )}
            </React.Fragment>
          ))}
        </nav>
      )}

      <div
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '1rem',
        }}
      >
        <div>
          <h1 style={{ fontSize: '1.75rem', fontWeight: 700, color: 'var(--color-text-main)' }}>
            {title}
          </h1>
          {description && (
            <p style={{ marginTop: '0.25rem', fontSize: '0.9375rem', color: 'var(--color-text-muted)' }}>
              {description}
            </p>
          )}
        </div>

        {action && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>{action}</div>
        )}
      </div>
    </div>
  );
};
