/**
 * Design System Tokens
 *
 * Theme: Premium dark mode with charcoal surfaces and restrained violet accents.
 * Strict semantic design tokens mapping directly to CSS variables.
 */

export const colors = {
  bg: '#0D0F14',
  sidebar: '#11141B',
  surface: '#171B24',
  elevated: '#1E2330',
  accentPrimary: '#8B7CFF',
  accentSecondary: '#A99DFF',
  success: '#35C991',
  warning: '#F4B84A',
  danger: '#F16F78',
  textPrimary: '#F3F4F8',
  textSecondary: '#9299AA',
  border: '#292E3A',
} as const;

export const typography = {
  fontSans: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
  fontMono: "'JetBrains Mono', 'Fira Code', 'Courier New', monospace",
  sizes: {
    display: '28px',
    pageHeading: '20px',
    sectionHeading: '15px',
    body: '13px',
    secondary: '12px',
    metadata: '11px',
    code: '12px',
  },
  weights: {
    regular: 400,
    medium: 500,
    semibold: 600,
    bold: 700,
  },
} as const;

export const spacing = {
  xs: '4px',
  sm: '8px',
  md: '12px',
  lg: '16px',
  xl: '24px',
  xxl: '32px',
} as const;

export const radii = {
  sm: '6px',
  md: '8px',
  lg: '10px',
  xl: '12px',
  full: '9999px',
} as const;
