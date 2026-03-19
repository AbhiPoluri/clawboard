import { Component, type ErrorInfo, type ReactNode } from "react";

interface Props {
  children: ReactNode;
  label?: string;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(`[ErrorBoundary${this.props.label ? ` (${this.props.label})` : ""}]`, error, info);
  }

  reset = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex flex-col items-center justify-center h-40 gap-3 p-4 text-center">
          <span className="text-2xl">⚠️</span>
          <p className="text-xs text-red-400 font-semibold">
            {this.props.label ? `${this.props.label} failed to render` : "Something went wrong"}
          </p>
          {this.state.error && (
            <p className="text-xs text-zinc-500 max-w-xs truncate">{this.state.error.message}</p>
          )}
          <button
            onClick={this.reset}
            className="px-3 py-1.5 rounded text-xs bg-zinc-800 text-zinc-300 hover:bg-zinc-700 border border-zinc-700"
          >
            Try again
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
