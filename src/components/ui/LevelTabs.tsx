import { useState, useRef, useEffect } from "react";
import { useStore } from "../../store/useStore";
import { fmtLen } from "../../lib/geometry";
import { ILayers, IPlus, ITrash } from "./Icons";

/**
 * Floor / level switcher. Sits bottom-left of the stage. Switch, add, rename
 * and remove storeys via the foundation levels API. Double-click a tab name to
 * rename inline; the elevation chip is editable when a level is active.
 */
export function LevelTabs() {
  const levels = useStore((s) => s.levels);
  const activeId = useStore((s) => s.activeLevelId);
  const units = useStore((s) => s.settings.units);
  const setActiveLevel = useStore((s) => s.setActiveLevel);
  const addLevel = useStore((s) => s.addLevel);
  const removeLevel = useStore((s) => s.removeLevel);
  const renameLevel = useStore((s) => s.renameLevel);
  const setLevelElevation = useStore((s) => s.setLevelElevation);

  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [elevOpen, setElevOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) inputRef.current?.select();
  }, [editing]);

  // levels sorted ground → up (lowest elevation first)
  const ordered = [...levels].sort((a, b) => a.elevation - b.elevation);
  const active = levels.find((l) => l.id === activeId) ?? levels[0];

  const commitRename = () => {
    if (editing) renameLevel(editing, draft);
    setEditing(null);
  };

  return (
    <div className="leveltabs" role="group" aria-label="Floor levels">
      <span className="leveltabs-icon" aria-hidden>
        <ILayers width={15} height={15} />
      </span>

      <div className="leveltabs-row">
        {ordered.map((l) => {
          const on = l.id === activeId;
          if (editing === l.id) {
            return (
              <input
                key={l.id}
                ref={inputRef}
                className="leveltab-input"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onBlur={commitRename}
                onKeyDown={(e) => {
                  if (e.key === "Enter") commitRename();
                  if (e.key === "Escape") setEditing(null);
                }}
                aria-label="Level name"
              />
            );
          }
          return (
            <button
              key={l.id}
              className={`leveltab ${on ? "on" : ""}`}
              onClick={() => setActiveLevel(l.id)}
              onDoubleClick={() => {
                setEditing(l.id);
                setDraft(l.name);
              }}
              aria-pressed={on}
              aria-label={`Level ${l.name}${on ? " (active)" : ""}`}
              title={`${l.name} · ${fmtLen(l.elevation, units)} · double-click to rename`}
            >
              {l.name}
            </button>
          );
        })}
      </div>

      <button
        className="leveltab-add"
        onClick={() => addLevel()}
        aria-label="Add floor level above"
        title="Add floor"
      >
        <IPlus width={14} height={14} />
      </button>

      {/* active-level elevation popover */}
      <div className="leveltabs-elev">
        <button
          className={`leveltab-elevbtn ${elevOpen ? "on" : ""}`}
          onClick={() => setElevOpen((o) => !o)}
          aria-label="Edit active level elevation"
          title="Floor elevation"
        >
          {fmtLen(active.elevation, units)}
        </button>
        {elevOpen && (
          <>
            <div className="menu-scrim" onClick={() => setElevOpen(false)} />
            <div className="leveltabs-elevpop">
              <div className="menu-kicker">{active.name} · elevation</div>
              <input
                className="leveltab-elevinput mono"
                type="number"
                value={Math.round(active.elevation)}
                step={10}
                onChange={(e) => setLevelElevation(active.id, Number(e.target.value))}
                aria-label="Elevation in centimetres"
              />
              <span className="leveltab-elevhint mono">cm above ground</span>
              {levels.length > 1 && (
                <button
                  className="btn-ghost btn-danger leveltab-del"
                  onClick={() => {
                    removeLevel(active.id);
                    setElevOpen(false);
                  }}
                >
                  <ITrash width={14} height={14} /> Delete this level
                </button>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
