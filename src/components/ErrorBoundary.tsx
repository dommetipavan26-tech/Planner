import { Component, type ErrorInfo, type ReactNode } from 'react';

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
    // No telemetry in a prototype; the console is the report channel.
    console.error('[utsavair] render error', error, info.componentStack);
  }

  override render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    return (
      <div className="grid min-h-dvh place-items-center bg-night px-4">
        <div className="flex w-full max-w-md flex-col gap-4 rounded-card border border-[#3d211c] bg-night-900 p-6 shadow-lift">
          <span className="micro text-ember">Unexpected error</span>
          <h1 className="display text-[26px] leading-tight text-ivory">
            The desk hit something it could not render
          </h1>
          <p className="text-[13px] leading-relaxed text-mist-dim">
            Nothing was charged and no pledge was lost — corridor state lives in Postgres, not in this
            tab. Reloading rebuilds the view from the ledger.
          </p>
          <pre className="max-h-32 overflow-auto rounded-card border border-line bg-night-850 p-3 font-mono text-[11px] leading-relaxed text-mist-faint">
            {error.message}
          </pre>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => this.setState({ error: null })}
              className="h-10 flex-1 rounded-pill border border-line-bright px-4 text-[13px] text-mist transition-colors duration-200 hover:text-ivory"
            >
              Try again
            </button>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="h-10 flex-1 rounded-pill bg-marigold px-4 text-[13px] font-medium text-night-900 transition-colors duration-200 hover:bg-[#f0b25a]"
            >
              Reload the desk
            </button>
          </div>
        </div>
      </div>
    );
  }
}
