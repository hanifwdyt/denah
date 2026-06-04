import { useEffect, lazy, Suspense } from "react";
import { AnimatePresence, motion } from "motion/react";
import { useStore } from "./store/useStore";
import { Canvas2D } from "./components/Canvas2D/Canvas2D";
import { TopBar } from "./components/ui/TopBar";
import { Toolbar } from "./components/ui/Toolbar";
import { ViewToggle } from "./components/ui/ViewToggle";
import { Inspector } from "./components/ui/Inspector";
import { StatusBar } from "./components/ui/StatusBar";
import { FurniturePalette } from "./components/ui/FurniturePalette";
import { OpeningPalette } from "./components/ui/OpeningPalette";
import { ZonePalette } from "./components/ui/ZonePalette";
import { LevelTabs } from "./components/ui/LevelTabs";
import { Legend } from "./components/ui/Legend";
import type { Tool } from "./lib/types";

const Scene3D = lazy(() => import("./components/Scene3D/Scene3D").then((m) => ({ default: m.Scene3D })));

function Scene3DFallback() {
  return (
    <div
      className="stage-wrap"
      style={{ display: "grid", placeItems: "center", color: "var(--ink-2)" }}
    >
      <span className="mono" style={{ fontSize: 12, letterSpacing: "0.1em" }}>
        building model…
      </span>
    </div>
  );
}

const KEY_TOOL: Record<string, Tool> = {
  v: "select",
  w: "wall",
  d: "door",
  f: "window",
  b: "furniture",
  z: "zone",
  l: "label",
  h: "pan",
};

export default function App() {
  const mode = useStore((s) => s.mode);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tgt = e.target as HTMLElement;
      if (tgt && (tgt.tagName === "INPUT" || tgt.tagName === "TEXTAREA")) return;
      const s = useStore.getState();
      const meta = e.metaKey || e.ctrlKey;

      if (meta && e.key.toLowerCase() === "z") {
        e.preventDefault();
        if (e.shiftKey) s.redo();
        else s.undo();
        return;
      }
      if (e.key === "Escape" || e.key === "Enter") {
        s.finishWall();
        s.clearSelection();
        return;
      }
      if (e.key === "Delete" || e.key === "Backspace") {
        e.preventDefault();
        s.deleteSelected();
        return;
      }
      if (e.key.toLowerCase() === "r" && s.selection.some((sel) => sel.kind === "furniture")) {
        s.rotateSelected((Math.PI / 12) * (e.shiftKey ? -1 : 1));
        return;
      }
      const t = KEY_TOOL[e.key.toLowerCase()];
      if (t && !meta) s.setTool(t);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div className="shell">
      <div className="grain" />
      <TopBar />

      <div style={{ position: "relative", overflow: "hidden" }}>
        <AnimatePresence mode="wait">
          <motion.div
            key={mode}
            initial={{ opacity: 0, scale: 0.985 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 1.01 }}
            transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
            style={{ position: "absolute", inset: 0 }}
          >
            {mode === "2d" ? (
              <Canvas2D />
            ) : (
              <Suspense fallback={<Scene3DFallback />}>
                <Scene3D />
              </Suspense>
            )}
          </motion.div>
        </AnimatePresence>

        {mode === "2d" && <Toolbar />}
        {mode === "2d" && <Legend />}
        {mode === "2d" && <FurniturePalette />}
        {mode === "2d" && <OpeningPalette />}
        {mode === "2d" && <ZonePalette />}
        <LevelTabs />
        <ViewToggle />
        <Inspector />
      </div>

      <StatusBar />
    </div>
  );
}
