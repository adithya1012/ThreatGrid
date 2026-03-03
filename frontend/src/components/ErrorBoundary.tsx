import { Component, type ErrorInfo, type ReactNode } from "react";

// ---------------------------------------------------------------------------
// Props / State
// ---------------------------------------------------------------------------
interface Props {
  children: ReactNode;
  /** Optional custom fallback UI; receives a reset function. */
  fallback?: (reset: () => void) => ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

// ---------------------------------------------------------------------------
// ErrorBoundary
// ---------------------------------------------------------------------------
export default class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error("[ErrorBoundary] Uncaught render error:", error, info);
  }

  handleReset = (): void => {
    this.setState({ hasError: false, error: null });
  };

  render(): ReactNode {
    if (!this.state.hasError) {
      return this.props.children;
    }

    if (this.props.fallback) {
      return this.props.fallback(this.handleReset);
    }

    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center px-4">
        <div className="bg-gray-900 border border-gray-700/60 rounded-2xl p-10 max-w-md w-full text-center shadow-2xl">
          {/* Icon */}
          <div className="flex justify-center mb-5">
            <span className="text-5xl select-none">⚠️</span>
          </div>

          {/* Heading */}
          <h1 className="text-xl font-bold text-white mb-2">
            Something went wrong
          </h1>
          <p className="text-sm text-gray-400 mb-6 leading-relaxed">
            An unexpected error occurred while rendering this page. If the
            problem persists, please refresh or contact support.
          </p>

          {/* Error detail (collapsed) */}
          {this.state.error && (
            <details className="mb-6 text-left">
              <summary className="text-xs text-gray-500 cursor-pointer hover:text-gray-300 transition-colors">
                Show technical details
              </summary>
              <pre className="mt-2 text-xs text-red-400 bg-gray-800/60 rounded-lg p-3 overflow-auto whitespace-pre-wrap break-all">
                {this.state.error.message}
                {"\n"}
                {this.state.error.stack}
              </pre>
            </details>
          )}

          {/* Actions */}
          <div className="flex gap-3 justify-center">
            <button
              onClick={this.handleReset}
              className="px-5 py-2 rounded-xl text-sm font-semibold bg-blue-600 hover:bg-blue-500 text-white transition-colors"
            >
              Try Again
            </button>
            <button
              onClick={() => window.location.assign("/")}
              className="px-5 py-2 rounded-xl text-sm font-semibold bg-gray-700 hover:bg-gray-600 text-gray-200 transition-colors"
            >
              Go Home
            </button>
          </div>
        </div>
      </div>
    );
  }
}
