import { Component, type ErrorInfo, type ReactNode } from 'react';
import { reportEvent } from '../lib/telemetry';

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

/**
 * Last line of defence. A render error anywhere in the tree should never leave
 * the reader with a blank page — it gets a readable message and a reload that
 * clears the failed subtree.
 */
export class ErrorBoundary extends Component<Props, State> {
  override state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    // The console is still the first report channel for whoever is watching, and
    // telemetry is the one for everybody else. `redact()` inside `reportEvent`
    // strips emails, long digit runs, ids and tokens from both strings before
    // they leave the browser, so a component stack cannot carry a phone number.
    console.error('[utsavair] render error', error, info.componentStack);
    reportEvent('ui_render_error', {
      detail: `${error.name}: ${error.message}`,
      stack: info.componentStack ?? '',
    });
  }

  override render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    return (
      <div className="grid min-h-dvh place-items-center bg-page px-4">
        <div className="flex w-full max-w-md flex-col gap-4 rounded-card border border-ember-line bg-surface p-6 shadow-lift">
          <span className="micro text-ember-deep">Unexpected error</span>
          <h1 className="display text-[26px] leading-tight text-ink">
            The desk hit something it could not render
          </h1>
          <p className="text-[13px] leading-relaxed text-ink-muted">
            Nothing was charged and no pledge was lost — corridor state lives in Postgres, not in this
            tab. Reloading rebuilds the view from the ledger.
          </p>
          <pre className="max-h-32 overflow-auto rounded-card border border-rule bg-raised p-3 font-mono text-[11px] leading-relaxed text-ink-faint">
            {error.message}
          </pre>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => this.setState({ error: null })}
              className="h-10 flex-1 rounded-pill border border-rule-strong px-4 text-[13px] text-ink-soft transition-colors duration-200 hover:text-ink"
            >
              Try again
            </button>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="h-10 flex-1 rounded-pill bg-accent px-4 text-[13px] font-medium text-on-accent transition-colors duration-200 hover:bg-accent-bright"
            >
              Reload the desk
            </button>
          </div>
        </div>
      </div>
    );
  }
}
