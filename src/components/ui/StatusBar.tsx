import { useStore } from "../../store/useStore";

const HINTS: Record<string, string> = {
  select: "Click to select · drag corners to move · ⌫ to delete",
  wall: "Click to drop corners · ⏎/Esc to finish · hold ⇧ for ortho",
  door: "Click on a wall to place a door",
  window: "Click on a wall to place a window",
  furniture: "Pick an item below · click to place · R to rotate",
  zone: "Pick a floor type below · click inside a room to tag it",
  label: "Click anywhere to drop a text label",
  dimension: "Click two points to measure · snaps to corners · Esc to cancel",
  pan: "Drag to pan · scroll to zoom",
};

export function StatusBar() {
  const tool = useStore((s) => s.tool);
  const zoom = useStore((s) => s.viewport.zoom);
  const mode = useStore((s) => s.mode);
  const cursor = useStore((s) => s.cursor);

  return (
    <footer className="statusbar">
      <span className="sb-dot" />
      <span>
        {mode === "2d" ? "PLAN" : "MODEL"} · <span style={{ textTransform: "capitalize" }}>{tool}</span>
      </span>
      <span className="mono">
        X {cursor ? Math.round(cursor.x).toString().padStart(4, " ") : "————"} · Y{" "}
        {cursor ? Math.round(cursor.y).toString().padStart(4, " ") : "————"}{" "}
        <span style={{ color: "var(--ink-3)" }}>cm</span>
      </span>
      <span className="mono">{Math.round(zoom * 100)}%</span>
      {/* MCP live-bridge indicator — feature on hold */}
      <span className="sb-hint">{HINTS[tool]}</span>
    </footer>
  );
}
