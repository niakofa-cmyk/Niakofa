import { Component, type ErrorInfo, type ReactNode } from "react";

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

/**
 * Top-level error boundary — catches render errors so the entire app
 * doesn't go blank with no user-facing message if a component throws.
 *
 * Without this, a Mapbox token issue, a network failure, or any unhandled
 * render exception shows users an empty white screen with no recovery path.
 */
export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  override componentDidCatch(error: Error, info: ErrorInfo) {
    // Log to console in development. In production you could send this
    // to a monitoring service (Sentry, Datadog, etc.)
    console.error("ErrorBoundary caught:", error, info.componentStack);
  }

  handleReload() {
    window.location.reload();
  }

  override render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;

      return (
        <div className="min-h-screen bg-background flex flex-col items-center justify-center px-6 py-12 text-center">
          <div className="w-16 h-16 rounded-2xl bg-destructive/10 border border-destructive/20 flex items-center justify-center mb-4">
            <span className="text-3xl">⚠️</span>
          </div>
          <h2 className="text-xl font-black mb-2">Something went wrong</h2>
          <p className="text-sm text-muted-foreground max-w-xs mb-6 leading-relaxed">
            An unexpected error occurred. Reload the app to try again. If the
            problem persists, contact{" "}
            <a href="mailto:help@niakofa.community" className="text-primary hover:underline">
              help@niakofa.community
            </a>
            .
          </p>
          {this.state.error && (
            <details className="mb-6 text-left bg-card border border-border rounded-xl p-4 max-w-xs w-full">
              <summary className="text-xs font-bold text-muted-foreground cursor-pointer">
                Technical details
              </summary>
              <pre className="mt-2 text-[10px] text-destructive whitespace-pre-wrap break-all leading-relaxed">
                {this.state.error.message.replace(/\/api\/[^\s"']+/g, "[endpoint]").replace(/Bearer\s+[A-Za-z0-9._-]+/gi, "[token]")}
              </pre>
            </details>
          )}
          <button
            onClick={this.handleReload}
            className="bg-primary text-primary-foreground font-black rounded-xl px-8 py-3 text-sm hover:opacity-90 transition-opacity"
          >
            Reload app
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
