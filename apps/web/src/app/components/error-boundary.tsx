import { Component, type ErrorInfo, type ReactNode } from 'react';
import { ProblemError } from '@/lib/http/problem-error';

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

/**
 * Catches 5xx errors thrown by TanStack Query (`throwOnError`, see
 * lib/query/client.ts) so components don't need ad hoc try/catch. Shows the
 * traceId so a user can hand it to support (doc 02 section 3.2).
 */
export class ErrorBoundary extends Component<Props, State> {
  override state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('Unhandled render error', error, info);
  }

  private reset = () => this.setState({ error: null });

  override render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    const traceId = error instanceof ProblemError ? error.traceId : undefined;

    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 p-8 text-center">
        <h1 className="text-xl font-semibold">Something went wrong</h1>
        <p className="text-muted-foreground max-w-md text-sm">
          {error instanceof ProblemError ? error.problem.detail : error.message}
        </p>
        {traceId && (
          <p className="text-muted-foreground font-mono text-xs">
            Reference: <span className="select-all">{traceId}</span>
          </p>
        )}
        <button
          type="button"
          onClick={this.reset}
          className="rounded-md border px-4 py-2 text-sm hover:bg-accent"
        >
          Try again
        </button>
      </div>
    );
  }
}
