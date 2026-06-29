import { Component, type ReactNode } from "react";

type Props = { children: ReactNode };
type State = { error: Error | null };

/** Catches render/effect errors so one bad component degrades gracefully
 *  instead of blanking the whole page. */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error) {
    console.error("UI error boundary caught:", error);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="flex flex-col items-center justify-center text-center px-6" style={{ minHeight: "100vh", background: "var(--app-bg)" }}>
        <div className="font-display" style={{ fontSize: 22, fontWeight: 700, color: "var(--text)" }}>Something hiccuped</div>
        <p className="mt-2 max-w-sm" style={{ fontSize: 14, lineHeight: 1.6, color: "var(--text-3)" }}>
          A component ran into an error. Your funds and the pool are untouched. Try reloading the page.
        </p>
        <pre className="mt-4 max-w-lg overflow-auto text-left" style={{ fontSize: 11, color: "var(--faint)", background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: 10, padding: 12 }}>
          {this.state.error.message}
        </pre>
        <button
          onClick={() => location.reload()}
          className="mt-5 font-bold"
          style={{ color: "#fff", background: "var(--lav)", borderRadius: 14, padding: "11px 22px", fontSize: 14 }}
        >
          Reload
        </button>
      </div>
    );
  }
}
