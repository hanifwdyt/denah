import { Component, type ReactNode } from "react";

interface State {
  error: Error | null;
}

/**
 * Top-level safety net. Any uncaught render error shows a recoverable screen
 * instead of a blank page — with a reload and a "reset local data" escape hatch
 * in case a corrupt autosave is the cause.
 */
export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error) {
    // surfaced to the console for debugging; not shown raw to users
    console.error("[denah] uncaught error:", error);
  }

  private reset = (clearData: boolean) => {
    try {
      if (clearData) localStorage.removeItem("denah:autosave:v1");
    } catch {
      /* ignore */
    }
    location.reload();
  };

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div
        style={{
          position: "fixed",
          inset: 0,
          display: "grid",
          placeItems: "center",
          background: "#0b0d11",
          color: "#eef1f6",
          fontFamily: "'Hanken Grotesk', system-ui, sans-serif",
          padding: 24,
        }}
      >
        <div style={{ maxWidth: 440, textAlign: "center" }}>
          <div
            style={{
              fontFamily: "'Geist Mono', ui-monospace, monospace",
              fontSize: 11,
              letterSpacing: "0.2em",
              color: "#f2a65a",
              marginBottom: 14,
            }}
          >
            SOMETHING BROKE
          </div>
          <h1 style={{ fontSize: 20, fontWeight: 700, margin: "0 0 10px" }}>The editor hit an error</h1>
          <p style={{ color: "#aab2c0", fontSize: 14, lineHeight: 1.6, margin: "0 0 22px" }}>
            Your work is autosaved. Try reloading — if it keeps happening, reset the local
            data (this clears the in-browser autosave only).
          </p>
          <div style={{ display: "flex", gap: 10, justifyContent: "center" }}>
            <button
              onClick={() => this.reset(false)}
              style={{
                padding: "10px 18px",
                borderRadius: 9,
                border: "none",
                background: "linear-gradient(180deg,#ffbe78,#f2a65a)",
                color: "#0b0d11",
                fontWeight: 700,
                fontSize: 13,
                cursor: "pointer",
              }}
            >
              Reload
            </button>
            <button
              onClick={() => this.reset(true)}
              style={{
                padding: "10px 18px",
                borderRadius: 9,
                border: "1px solid #2b313d",
                background: "#16181d",
                color: "#aab2c0",
                fontWeight: 600,
                fontSize: 13,
                cursor: "pointer",
              }}
            >
              Reset local data
            </button>
          </div>
          <pre
            style={{
              marginTop: 22,
              padding: 12,
              background: "#101319",
              border: "1px solid #20262f",
              borderRadius: 8,
              fontSize: 11,
              color: "#6f7886",
              textAlign: "left",
              overflow: "auto",
              maxHeight: 120,
              fontFamily: "'Geist Mono', ui-monospace, monospace",
            }}
          >
            {this.state.error.message}
          </pre>
        </div>
      </div>
    );
  }
}
