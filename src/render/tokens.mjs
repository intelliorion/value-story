export const TOKENS = Object.freeze({
  '--vs-bg': '#0A0B0D',
  '--vs-surface': '#14161A',
  '--vs-surface-raised': '#1B1E24',
  '--vs-ink': '#F4F5F7',
  '--vs-ink-dim': '#8B929C',
  '--vs-ink-faint': '#5A616B',
  '--vs-rule': '#23272E',
  '--vs-accent': '#F5B942',
  '--vs-accent-soft': 'rgba(245,185,66,0.14)',
  '--vs-positive': '#4ADE80',
  '--vs-negative': '#FF6B5A',
  '--vs-font-display': "-apple-system, 'SF Pro Display', Inter, system-ui, sans-serif",
  '--vs-font-text': "ui-serif, 'Iowan Old Style', Palatino, Georgia, serif",
  '--vs-font-mono': "ui-monospace, 'SF Mono', Menlo, monospace",
  '--vs-hero': 'clamp(4rem, 12vw, 9rem)',
  '--vs-h1': 'clamp(2rem, 4vw, 3rem)',
  '--vs-h2': '1.5rem',
  '--vs-body': '1.0625rem',
  '--vs-micro': '0.75rem',
  '--vs-unit': '8px',
  '--vs-gutter': 'clamp(1.5rem, 5vw, 5rem)',
  '--vs-chapter': 'clamp(4rem, 10vh, 8rem)',
  '--vs-radius': '10px',
  '--vs-duration': '820ms',
  '--vs-ease': 'cubic-bezier(0.16, 1, 0.3, 1)',
});

export function tokensToCss(tokens = TOKENS) {
  const body = Object.entries(tokens).map(([k, v]) => `${k}:${v}`).join(';');
  return `:root{${body}}`;
}
