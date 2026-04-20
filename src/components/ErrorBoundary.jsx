import React from 'react';

/**
 * ErrorBoundary — last line of defense so a child throw doesn't blank the app.
 *
 * Catches render/lifecycle errors below it, shows a themed "Portal com falha"
 * fallback with a reload button, and best-effort reports to Supabase
 * error_events via the same dynamic-import pattern used in main.jsx.
 *
 * Async errors (setTimeout, promises, event handlers) still bubble to the
 * window 'error' / 'unhandledrejection' listeners in main.jsx. This boundary
 * only handles what React gives us: render, commit, and lifecycle throws.
 */
export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, info) {
    console.error('[XPortl] ErrorBoundary caught:', error, info);
    import('../services/supabase')
      .then(({ supabase }) =>
        supabase.from('error_events').insert({
          source: 'client',
          error_name: 'REACT_BOUNDARY',
          error_message: error?.message || String(error),
          error_stack: error?.stack || null,
          url: typeof window !== 'undefined' ? window.location.href : null,
          user_agent: typeof navigator !== 'undefined' ? navigator.userAgent : null,
          severity: 'error',
          metadata: { componentStack: info?.componentStack || null },
        })
      )
      .catch(() => { /* supabase unavailable — swallow */ });
  }

  handleReload = () => {
    try { window.location.reload(); } catch { /* noop */ }
  };

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <div style={styles.root} role="alert" aria-live="assertive">
        <div style={styles.portal} aria-hidden="true">
          <span style={styles.sweep} />
        </div>
        <div style={styles.brand}>
          xportl<span style={styles.dot}>.</span>
        </div>
        <div style={styles.title}>Portal com falha</div>
        <div style={styles.sub}>
          Algo inesperado aconteceu. Recarregue para reabrir o portal.
        </div>
        <button style={styles.btn} onClick={this.handleReload}>
          Recarregar
        </button>
      </div>
    );
  }
}

const styles = {
  root: {
    position: 'fixed',
    inset: 0,
    zIndex: 100000,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '20px',
    padding: '24px',
    textAlign: 'center',
    background:
      'radial-gradient(circle at 50% 38%, rgba(111, 247, 255, 0.10), transparent 55%),' +
      'radial-gradient(circle at 50% 82%, rgba(167, 123, 255, 0.08), transparent 60%),' +
      '#07040F',
    color: '#F4EFE6',
    fontFamily: 'ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif',
  },
  portal: {
    position: 'relative',
    width: 120,
    height: 120,
    borderRadius: '50%',
    border: '1px solid rgba(111, 247, 255, 0.35)',
    boxShadow:
      '0 0 80px rgba(111, 247, 255, 0.22), inset 0 0 50px rgba(111, 247, 255, 0.12)',
    marginBottom: 12,
  },
  sweep: {
    position: 'absolute',
    top: '50%',
    left: '50%',
    width: '100%',
    height: 1,
    background:
      'linear-gradient(to right, transparent, rgba(111, 247, 255, 0.9), transparent)',
    transformOrigin: '0 50%',
    opacity: 0.7,
  },
  brand: {
    fontFamily: 'Fraunces, Georgia, serif',
    fontSize: '1.5rem',
    letterSpacing: '-0.015em',
    fontWeight: 400,
    fontStyle: 'italic',
  },
  dot: { color: '#FF8A5C', fontStyle: 'normal' },
  title: {
    fontFamily: 'Fraunces, Georgia, serif',
    fontSize: '1.25rem',
    fontWeight: 500,
    color: '#00f0ff',
    letterSpacing: '-0.01em',
  },
  sub: {
    fontSize: '0.9rem',
    color: 'rgba(244, 239, 230, 0.65)',
    maxWidth: 320,
    lineHeight: 1.45,
  },
  btn: {
    marginTop: 8,
    padding: '12px 28px',
    borderRadius: 999,
    background: 'rgba(0, 240, 255, 0.12)',
    border: '1px solid rgba(0, 240, 255, 0.35)',
    color: '#00f0ff',
    fontSize: '0.78rem',
    fontWeight: 700,
    letterSpacing: '0.08em',
    textTransform: 'uppercase',
    cursor: 'pointer',
    fontFamily: 'inherit',
  },
};
