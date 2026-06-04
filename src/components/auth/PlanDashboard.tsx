// ─────────────────────────────────────────────────────────────────────────────
// PlanDashboard — lists the signed-in user's cloud plans with open / rename /
// delete and "Save current as…". Default export. Props: { open, onClose }.
// ─────────────────────────────────────────────────────────────────────────────
import { useCallback, useEffect, useState } from "react";
import {
  listPlans,
  loadPlan,
  savePlan,
  deletePlan,
  renamePlan,
  applyDoc,
  currentDoc,
  type CloudPlanMeta,
} from "../../lib/cloud";
import "./auth.css";

interface Props {
  open: boolean;
  onClose: () => void;
}

export default function PlanDashboard({ open, onClose }: Props) {
  const [plans, setPlans] = useState<CloudPlanMeta[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [renameId, setRenameId] = useState<string | null>(null);
  const [renameVal, setRenameVal] = useState("");

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setPlans(await listPlans());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load plans.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    refresh();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !renameId) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, refresh, onClose, renameId]);

  if (!open) return null;

  const saveCurrent = async () => {
    const name = window.prompt("Save current plan as:", "My floor plan");
    if (name == null) return;
    setError(null);
    setBusyId("__new__");
    try {
      await savePlan(currentDoc(), null, name);
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed.");
    } finally {
      setBusyId(null);
    }
  };

  const openPlan = async (id: string) => {
    setBusyId(id);
    setError(null);
    try {
      const plan = await loadPlan(id);
      applyDoc(plan.doc);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Open failed.");
    } finally {
      setBusyId(null);
    }
  };

  const remove = async (id: string, name: string) => {
    if (!window.confirm(`Delete "${name}"? This can't be undone.`)) return;
    setBusyId(id);
    setError(null);
    try {
      await deletePlan(id);
      setPlans((p) => p.filter((x) => x.id !== id));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Delete failed.");
    } finally {
      setBusyId(null);
    }
  };

  const commitRename = async (id: string) => {
    const val = renameVal.trim();
    setRenameId(null);
    if (!val) return;
    setBusyId(id);
    try {
      await renamePlan(id, val);
      setPlans((p) => p.map((x) => (x.id === id ? { ...x, name: val } : x)));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Rename failed.");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="auth-overlay" role="presentation" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="auth-modal wide" role="dialog" aria-modal="true" aria-label="My plans">
        <div className="auth-head">
          <div className="auth-title">
            <span className="dot" />
            <b>My Plans</b>
            <span className="auth-sub">Cloud storage</span>
          </div>
          <button className="auth-x" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>

        <div className="plan-toolbar">
          <span className="grow auth-foot" style={{ textAlign: "left" }}>
            {loading ? "Loading…" : `${plans.length} plan${plans.length === 1 ? "" : "s"}`}
          </span>
          <button className="auth-btn ghost" onClick={refresh} disabled={loading}>
            Refresh
          </button>
          <button className="auth-btn primary" onClick={saveCurrent} disabled={busyId === "__new__"}>
            {busyId === "__new__" && <span className="auth-spin" />}
            Save current as…
          </button>
        </div>

        {error && (
          <div style={{ padding: "0 18px" }}>
            <div className="auth-err" role="alert">
              {error}
            </div>
          </div>
        )}

        <div className="plan-list">
          {!loading && plans.length === 0 && (
            <div className="plan-empty">
              No saved plans yet.
              <br />
              Use <b>Save current as…</b> to store your first plan in the cloud.
            </div>
          )}

          {plans.map((p) => (
            <div className="plan-card" key={p.id}>
              <button
                className="plan-thumb"
                onClick={() => openPlan(p.id)}
                disabled={busyId === p.id}
                aria-label={`Open ${p.name}`}
                style={{ all: "unset", cursor: busyId === p.id ? "default" : "pointer" }}
              >
                <Thumb levels={p.levelCount} furniture={p.furnitureCount} edges={p.edgeCount} />
              </button>
              <div className="plan-meta">
                {renameId === p.id ? (
                  <input
                    className="plan-rename-input"
                    autoFocus
                    value={renameVal}
                    onChange={(e) => setRenameVal(e.target.value)}
                    onBlur={() => commitRename(p.id)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") commitRename(p.id);
                      if (e.key === "Escape") setRenameId(null);
                    }}
                    aria-label="Plan name"
                  />
                ) : (
                  <div className="pn" title={p.name}>
                    {p.name}
                  </div>
                )}
                <div className="pd">
                  <span>{relTime(p.updated_at)}</span>
                  <span>· {p.levelCount} lvl</span>
                </div>
              </div>
              <div className="plan-actions">
                <button onClick={() => openPlan(p.id)} disabled={busyId === p.id}>
                  Open
                </button>
                <button
                  onClick={() => {
                    setRenameId(p.id);
                    setRenameVal(p.name);
                  }}
                  disabled={busyId === p.id}
                >
                  Rename
                </button>
                <button className="del" onClick={() => remove(p.id, p.name)} disabled={busyId === p.id}>
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/** Tiny abstract thumbnail derived from plan size (no scene fetch needed). */
function Thumb({ levels, furniture, edges }: { levels: number; furniture: number; edges: number }) {
  const cells = Math.max(1, Math.min(9, Math.round(Math.sqrt(edges + furniture)) || 1));
  const rects = Array.from({ length: cells }, (_, i) => {
    const cols = Math.ceil(Math.sqrt(cells));
    const cx = (i % cols) * (100 / cols);
    const cy = Math.floor(i / cols) * (100 / cols);
    const s = 100 / cols;
    return { x: cx + s * 0.12, y: cy + s * 0.12, w: s * 0.76, h: s * 0.76 };
  });
  return (
    <svg viewBox="0 0 100 64" preserveAspectRatio="xMidYMid meet" aria-hidden="true">
      <g transform="translate(8 6)">
        {rects.map((r, i) => (
          <rect
            key={i}
            x={r.x * 0.84}
            y={r.y * 0.52}
            width={r.w * 0.84}
            height={r.h * 0.52}
            rx={2}
            fill="none"
            stroke="var(--amber)"
            strokeOpacity={0.55}
            strokeWidth={1.4}
          />
        ))}
      </g>
      <text x="50" y="60" textAnchor="middle" fontSize="7" fill="var(--ink-3)" fontFamily="var(--mono)">
        {levels} lvl · {furniture} items
      </text>
    </svg>
  );
}

function relTime(iso: string): string {
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return "—";
  const diff = Date.now() - t;
  const min = Math.round(diff / 60000);
  if (min < 1) return "just now";
  if (min < 60) return `${min}m ago`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const d = Math.round(hr / 24);
  if (d < 30) return `${d}d ago`;
  return new Date(iso).toLocaleDateString();
}
