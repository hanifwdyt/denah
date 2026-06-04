import { useStore } from "../../store/useStore";
import {
  DOOR_TYPES,
  DOOR_TYPE_ORDER,
  WINDOW_TYPES,
  WINDOW_TYPE_ORDER,
} from "../../lib/openings";

/**
 * Floating picker shown while the Door or Window tool is active. Selecting a
 * type sets the store's active door/window subtype (which also re-asserts the
 * tool). New openings then inherit that subtype's catalog defaults.
 */
export function OpeningPalette() {
  const tool = useStore((s) => s.tool);
  const activeDoor = useStore((s) => s.activeDoorType);
  const activeWindow = useStore((s) => s.activeWindowType);
  const setDoor = useStore((s) => s.setActiveDoorType);
  const setWindow = useStore((s) => s.setActiveWindowType);
  const inspectorOpen = useStore((s) => s.inspectorOpen);

  if (tool !== "door" && tool !== "window") return null;

  const isDoor = tool === "door";

  return (
    <div className={`palette palette-opening ${inspectorOpen ? "inset" : ""}`}>
      <span className="palette-label">{isDoor ? "DOOR" : "WINDOW"}</span>
      <div className="palette-row" role="listbox" aria-label={isDoor ? "Door types" : "Window types"}>
        {isDoor
          ? DOOR_TYPE_ORDER.map((s) => {
              const spec = DOOR_TYPES[s];
              const on = activeDoor === s;
              return (
                <button
                  key={s}
                  role="option"
                  aria-selected={on}
                  className={`palette-item ${on ? "on" : ""}`}
                  onClick={() => setDoor(s)}
                  title={`${spec.label} · ${spec.width}×${spec.height} cm${spec.hint ? ` — ${spec.hint}` : ""}`}
                >
                  <span className="palette-name">{spec.label}</span>
                  <span className="palette-size mono">
                    {spec.width}×{spec.height}
                  </span>
                </button>
              );
            })
          : WINDOW_TYPE_ORDER.map((s) => {
              const spec = WINDOW_TYPES[s];
              const on = activeWindow === s;
              return (
                <button
                  key={s}
                  role="option"
                  aria-selected={on}
                  className={`palette-item ${on ? "on" : ""}`}
                  onClick={() => setWindow(s)}
                  title={`${spec.label} · ${spec.width}×${spec.height} cm${spec.hint ? ` — ${spec.hint}` : ""}`}
                >
                  <span className="palette-name">{spec.label}</span>
                  <span className="palette-size mono">
                    {spec.width}×{spec.height}
                  </span>
                </button>
              );
            })}
      </div>
    </div>
  );
}
