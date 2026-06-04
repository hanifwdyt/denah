import { useState } from "react";
import { useStore } from "../../store/useStore";
import {
  IUndo,
  IRedo,
  IGrid,
  IMagnet,
  IRuler,
  ISpark,
  ITrash,
  ISave,
  IOpen,
  IExport,
  IPanel,
  IVector,
  IUser,
} from "./Icons";
import { HelpGuide } from "./Legend";
import { downloadDoc, openDocFile } from "../../lib/storage";
import { exportPNG, exportPDF, exportSVG, exportScaledPDF } from "../../lib/exporter";
import AuthModal from "../auth/AuthModal";
import AccountMenu from "../auth/AccountMenu";
import { useAuth } from "../../store/useAuth";

export function TopBar() {
  const undo = useStore((s) => s.undo);
  const redo = useStore((s) => s.redo);
  const canUndo = useStore((s) => s.past.length > 0);
  const canRedo = useStore((s) => s.future.length > 0);
  const settings = useStore((s) => s.settings);
  const setSettings = useStore((s) => s.setSettings);
  const loadDemo = useStore((s) => s.loadDemo);
  const reset = useStore((s) => s.reset);
  const mode = useStore((s) => s.mode);
  const inspectorOpen = useStore((s) => s.inspectorOpen);
  const setInspectorOpen = useStore((s) => s.setInspectorOpen);

  const [menu, setMenu] = useState(false);

  const onSave = () => {
    const st = useStore.getState();
    downloadDoc({ levels: st.levels, activeLevelId: st.activeLevelId, units: st.settings.units });
  };
  const onOpen = async () => {
    const doc = await openDocFile();
    if (doc) {
      useStore.getState().loadLevels(doc.levels, doc.activeLevelId);
      if (doc.units) useStore.getState().setSettings({ units: doc.units });
    }
  };
  const doExport = (fn: () => void) => {
    setMenu(false);
    fn();
  };

  const units = settings.units;

  return (
    <header className="topbar">
      <div className="wordmark">
        <b>DENAH</b>
        <span className="dot" />
        <span>drafting instrument</span>
      </div>

      <div className="topbar-spacer" />

      <HelpGuide />

      <div className="tgroup">
        <button className="iconbtn has-tip" disabled={!canUndo} onClick={undo} aria-label="Undo">
          <IUndo />
          <span className="tip bottom">
            Undo<span className="k">⌘Z</span>
          </span>
        </button>
        <button className="iconbtn has-tip" disabled={!canRedo} onClick={redo} aria-label="Redo">
          <IRedo />
          <span className="tip bottom">
            Redo<span className="k">⌘⇧Z</span>
          </span>
        </button>
      </div>

      <div className="tgroup">
        <button
          className={`iconbtn has-tip ${settings.snapGrid ? "on" : ""}`}
          onClick={() => setSettings({ snapGrid: !settings.snapGrid })}
          aria-label="Toggle grid snap"
          aria-pressed={settings.snapGrid}
        >
          <IGrid />
          <span className="tip bottom">Grid snap</span>
        </button>
        <button
          className={`iconbtn has-tip ${settings.snapOrtho ? "on" : ""}`}
          onClick={() => setSettings({ snapOrtho: !settings.snapOrtho })}
          aria-label="Toggle ortho snap"
          aria-pressed={settings.snapOrtho}
        >
          <IMagnet />
          <span className="tip bottom">
            Ortho snap<span className="k">⇧</span>
          </span>
        </button>
        <button
          className={`iconbtn has-tip ${settings.showDimensions ? "on" : ""}`}
          onClick={() => setSettings({ showDimensions: !settings.showDimensions })}
          aria-label="Toggle dimensions"
          aria-pressed={settings.showDimensions}
        >
          <IRuler />
          <span className="tip bottom">Dimensions</span>
        </button>
      </div>

      {/* units toggle (metric / imperial) */}
      <div className="units-toggle" role="group" aria-label="Display units">
        <button
          className={units === "metric" ? "on" : ""}
          onClick={() => setSettings({ units: "metric" })}
          aria-pressed={units === "metric"}
        >
          cm
        </button>
        <button
          className={units === "imperial" ? "on" : ""}
          onClick={() => setSettings({ units: "imperial" })}
          aria-pressed={units === "imperial"}
        >
          ft
        </button>
      </div>

      <div className="tgroup">
        <button className="iconbtn has-tip" onClick={onOpen} aria-label="Open project file">
          <IOpen />
          <span className="tip bottom">Open file</span>
        </button>
        <button className="iconbtn has-tip" onClick={onSave} aria-label="Save project as JSON">
          <ISave />
          <span className="tip bottom">Save .json</span>
        </button>
        <div style={{ position: "relative" }}>
          <button
            className={`iconbtn has-tip ${menu ? "on" : ""}`}
            onClick={() => setMenu((m) => !m)}
            aria-label="Export menu"
            aria-haspopup="menu"
            aria-expanded={menu}
          >
            <IExport />
            <span className="tip bottom">Export</span>
          </button>
          {menu && (
            <>
              <div className="menu-scrim" onClick={() => setMenu(false)} />
              <div className="menu" role="menu">
                <div className="menu-kicker">Export {mode === "2d" ? "plan" : "model"}</div>
                <button className="menu-item" role="menuitem" onClick={() => doExport(() => exportPNG(mode))}>
                  PNG image <span className="menu-hint">·{mode}</span>
                </button>
                <button className="menu-item" role="menuitem" onClick={() => doExport(() => exportPDF(mode))}>
                  PDF document <span className="menu-hint">·{mode}</span>
                </button>
                {mode === "2d" && (
                  <>
                    <button className="menu-item" role="menuitem" onClick={() => doExport(() => exportSVG(mode))}>
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 7 }}>
                        <IVector width={14} height={14} /> SVG vector
                      </span>
                      <span className="menu-hint">.svg</span>
                    </button>
                    <button
                      className="menu-item"
                      role="menuitem"
                      onClick={() => doExport(() => exportScaledPDF(mode))}
                    >
                      Scaled PDF <span className="menu-hint">title block</span>
                    </button>
                  </>
                )}
                <div className="menu-sep" />
                <button className="menu-item" role="menuitem" onClick={() => doExport(onSave)}>
                  Project file <span className="menu-hint">.json</span>
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      <div className="tgroup">
        <button className="iconbtn has-tip" onClick={loadDemo} aria-label="Load sample plan">
          <ISpark />
          <span className="tip bottom">Load sample plan</span>
        </button>
        <button className="iconbtn has-tip" onClick={reset} aria-label="Clear canvas">
          <ITrash />
          <span className="tip bottom">Clear canvas</span>
        </button>
      </div>

      <button
        className={`iconbtn has-tip ${inspectorOpen ? "on" : ""}`}
        onClick={() => setInspectorOpen(!inspectorOpen)}
        aria-label="Toggle inspector panel"
        aria-pressed={inspectorOpen}
      >
        <IPanel />
        <span className="tip bottom">Panel</span>
      </button>

      <AccountControl />
    </header>
  );
}

// ── account ──────────────────────────────────────────────────────────────────
// Consumes the auth agent's store/components. Guest-safe by design: useAuth's
// `user` stays null until a real session exists. When signed in, AccountMenu is
// self-contained (own trigger button + dropdown + plans dashboard), so we just
// render it. When signed out we show our own button that opens AuthModal.
function AccountControl() {
  const [authOpen, setAuthOpen] = useState(false);
  const user = useAuth((s) => s.user);

  return (
    <div className="tgroup account-group">
      {user ? (
        <>
          <span className="cloud-state" title="Saved to your cloud account" aria-label="Cloud synced">
            <span className="cloud-dot" /> Cloud
          </span>
          <AccountMenu />
        </>
      ) : (
        <button
          className="iconbtn account-btn has-tip"
          onClick={() => setAuthOpen(true)}
          aria-label="Sign in"
          aria-haspopup="dialog"
          aria-expanded={authOpen}
        >
          <IUser />
          <span className="tip bottom">Sign in</span>
        </button>
      )}

      <AuthModal open={authOpen && !user} onClose={() => setAuthOpen(false)} />
    </div>
  );
}
