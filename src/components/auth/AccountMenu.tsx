// ─────────────────────────────────────────────────────────────────────────────
// AccountMenu — signed-in user dropdown (name/email, "My plans", Sign out).
//
// Default export. Self-contained: renders its own trigger button + PlanDashboard.
// The UI agent just drops <AccountMenu /> into the top bar when useAuth().user
// is truthy. Renders nothing when there is no user.
// ─────────────────────────────────────────────────────────────────────────────
import { useEffect, useRef, useState } from "react";
import { useAuth } from "../../store/useAuth";
import PlanDashboard from "./PlanDashboard";
import "./auth.css";

export default function AccountMenu() {
  const user = useAuth((s) => s.user);
  const signOut = useAuth((s) => s.signOut);
  const [open, setOpen] = useState(false);
  const [dash, setDash] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as globalThis.Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  if (!user) return null;

  const display = user.name || user.email || "Account";
  const initial = (user.name || user.email || "?").trim().charAt(0).toUpperCase();

  return (
    <>
      <div className="acct-wrap" ref={wrapRef}>
        <button
          className="acct-trigger"
          onClick={() => setOpen((v) => !v)}
          aria-haspopup="menu"
          aria-expanded={open}
          aria-label="Account menu"
        >
          <span className="acct-avatar">{initial}</span>
          <span className="acct-name">{display}</span>
        </button>

        {open && (
          <div className="acct-menu" role="menu">
            <div className="acct-id">
              <div className="n">{user.name || "Signed in"}</div>
              {user.email && <div className="e">{user.email}</div>}
            </div>
            <button
              className="acct-item"
              role="menuitem"
              onClick={() => {
                setOpen(false);
                setDash(true);
              }}
            >
              <FolderIcon /> My plans
            </button>
            <button
              className="acct-item danger"
              role="menuitem"
              onClick={() => {
                setOpen(false);
                signOut();
              }}
            >
              <OutIcon /> Sign out
            </button>
          </div>
        )}
      </div>

      <PlanDashboard open={dash} onClose={() => setDash(false)} />
    </>
  );
}

function FolderIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true">
      <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7Z" />
    </svg>
  );
}
function OutIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true">
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <path d="M16 17l5-5-5-5M21 12H9" />
    </svg>
  );
}
