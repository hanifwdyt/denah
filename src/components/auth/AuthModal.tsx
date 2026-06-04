// ─────────────────────────────────────────────────────────────────────────────
// AuthModal — Sign Up / Log In with email+password+name and Google OAuth.
//
// Default export. Props: { open, onClose }.
// In guest mode (Supabase not configured) it shows a friendly note and a
// "Continue as guest" button that simply closes.
// ─────────────────────────────────────────────────────────────────────────────
import { useEffect, useRef, useState } from "react";
import { useAuth } from "../../store/useAuth";
import "./auth.css";

interface Props {
  open: boolean;
  onClose: () => void;
}

type Tab = "signin" | "signup";

export default function AuthModal({ open, onClose }: Props) {
  const configured = useAuth((s) => s.configured);
  const loading = useAuth((s) => s.loading);
  const signInEmail = useAuth((s) => s.signInEmail);
  const signUpEmail = useAuth((s) => s.signUpEmail);
  const signInGoogle = useAuth((s) => s.signInGoogle);
  const user = useAuth((s) => s.user);

  const [tab, setTab] = useState<Tab>("signin");
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const firstRef = useRef<HTMLInputElement>(null);

  // ESC to close, focus first field on open.
  useEffect(() => {
    if (!open) return;
    setError(null);
    setInfo(null);
    const t = setTimeout(() => firstRef.current?.focus(), 40);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      clearTimeout(t);
      window.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);

  // Auto-close once signed in.
  useEffect(() => {
    if (open && user) onClose();
  }, [user, open, onClose]);

  if (!open) return null;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setInfo(null);
    if (!email.trim() || !pw) {
      setError("Email and password are required.");
      return;
    }
    if (tab === "signup") {
      const { error } = await signUpEmail(email.trim(), pw, name.trim() || undefined);
      if (error) setError(error);
      else if (!useAuth.getState().user) {
        setInfo("Check your email to confirm your account, then log in.");
        setTab("signin");
      }
    } else {
      const { error } = await signInEmail(email.trim(), pw);
      if (error) setError(error);
    }
  };

  const google = async () => {
    setError(null);
    const { error } = await signInGoogle();
    if (error) setError(error);
  };

  return (
    <div className="auth-overlay" role="presentation" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="auth-modal" role="dialog" aria-modal="true" aria-label="Account">
        <div className="auth-head">
          <div className="auth-title">
            <span className="dot" />
            <b>Account</b>
            <span className="auth-sub">Denah Cloud</span>
          </div>
          <button className="auth-x" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>

        {!configured ? (
          <div className="auth-body">
            <div className="auth-note">
              Cloud accounts aren't set up for this build. You can keep working — your plan is saved locally in this
              browser. To enable sign-in &amp; cloud plans, set <code>VITE_SUPABASE_URL</code> and{" "}
              <code>VITE_SUPABASE_ANON_KEY</code> (see <code>supabase/SETUP.md</code>).
            </div>
            <button className="auth-btn primary" onClick={onClose}>
              Continue as guest
            </button>
          </div>
        ) : (
          <>
            <div className="auth-tabs" role="tablist">
              <button
                role="tab"
                aria-selected={tab === "signin"}
                className={`auth-tab ${tab === "signin" ? "on" : ""}`}
                onClick={() => {
                  setTab("signin");
                  setError(null);
                }}
              >
                Log In
              </button>
              <button
                role="tab"
                aria-selected={tab === "signup"}
                className={`auth-tab ${tab === "signup" ? "on" : ""}`}
                onClick={() => {
                  setTab("signup");
                  setError(null);
                }}
              >
                Sign Up
              </button>
            </div>

            <form className="auth-body" onSubmit={submit}>
              {tab === "signup" && (
                <div className="auth-field">
                  <label htmlFor="auth-name">Name</label>
                  <input
                    id="auth-name"
                    ref={firstRef}
                    className="auth-input"
                    type="text"
                    autoComplete="name"
                    placeholder="Your name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                  />
                </div>
              )}
              <div className="auth-field">
                <label htmlFor="auth-email">Email</label>
                <input
                  id="auth-email"
                  ref={tab === "signin" ? firstRef : undefined}
                  className="auth-input"
                  type="email"
                  autoComplete="email"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
              <div className="auth-field">
                <label htmlFor="auth-pw">Password</label>
                <input
                  id="auth-pw"
                  className="auth-input"
                  type="password"
                  autoComplete={tab === "signup" ? "new-password" : "current-password"}
                  placeholder="••••••••"
                  value={pw}
                  onChange={(e) => setPw(e.target.value)}
                />
              </div>

              {error && (
                <div className="auth-err" role="alert">
                  {error}
                </div>
              )}
              {info && <div className="auth-note">{info}</div>}

              <button className="auth-btn primary" type="submit" disabled={loading}>
                {loading && <span className="auth-spin" />}
                {tab === "signup" ? "Create account" : "Log in"}
              </button>

              <div className="auth-divider">or</div>

              <button className="auth-btn ghost" type="button" onClick={google} disabled={loading}>
                <GoogleMark />
                Continue with Google
              </button>

              <div className="auth-foot">
                {tab === "signin" ? "New here? " : "Already have an account? "}
                <button
                  type="button"
                  className="link-inline"
                  style={{ color: "var(--amber-bright)", fontWeight: 600 }}
                  onClick={() => {
                    setTab(tab === "signin" ? "signup" : "signin");
                    setError(null);
                  }}
                >
                  {tab === "signin" ? "Create an account" : "Log in"}
                </button>
              </div>
            </form>
          </>
        )}
      </div>
    </div>
  );
}

function GoogleMark() {
  return (
    <svg width="16" height="16" viewBox="0 0 48 48" aria-hidden="true">
      <path
        fill="#FFC107"
        d="M43.6 20.5H42V20H24v8h11.3C33.7 32.4 29.3 35.5 24 35.5 17.6 35.5 12.5 30.4 12.5 24S17.6 12.5 24 12.5c3 0 5.7 1.1 7.8 3l5.7-5.7C33.9 6.5 29.2 4.5 24 4.5 13.2 4.5 4.5 13.2 4.5 24S13.2 43.5 24 43.5c10 0 19-7.3 19-19.5 0-1.3-.1-2.3-.4-3.5z"
      />
      <path
        fill="#FF3D00"
        d="M6.3 14.7l6.6 4.8C14.7 16 19 12.5 24 12.5c3 0 5.7 1.1 7.8 3l5.7-5.7C33.9 6.5 29.2 4.5 24 4.5 16.3 4.5 9.7 8.9 6.3 14.7z"
      />
      <path
        fill="#4CAF50"
        d="M24 43.5c5.2 0 9.9-2 13.4-5.2l-6.2-5.2c-2 1.5-4.6 2.4-7.2 2.4-5.3 0-9.7-3.1-11.3-7.5l-6.5 5C9.6 39 16.2 43.5 24 43.5z"
      />
      <path
        fill="#1976D2"
        d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.1-4.1 5.6l6.2 5.2c-.4.4 6.6-4.8 6.6-14.8 0-1.3-.1-2.3-.4-3.5z"
      />
    </svg>
  );
}
