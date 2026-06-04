import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { useStore } from "./store/useStore";
import { loadAutosaveDoc, saveAutosaveDoc } from "./lib/storage";
// MCP live-bridge feature is on hold — re-enable by uncommenting the import + call below.
// import { initMcpSync } from "./lib/mcpSync";
import "./design/global.css";
import "./components/ui/ui.css";

// restore last session (full multi-level doc + units)
const restored = loadAutosaveDoc();
if (restored) {
  const active = restored.levels.find((l) => l.id === restored.activeLevelId) ?? restored.levels[0];
  useStore.setState((s) => ({
    levels: restored.levels,
    activeLevelId: active.id,
    scene: active.scene,
    settings: { ...s.settings, units: restored.units },
  }));
}

// debounced autosave on level/units changes
let lastLevels = useStore.getState().levels;
let lastUnits = useStore.getState().settings.units;
let timer: ReturnType<typeof setTimeout> | undefined;
useStore.subscribe((state) => {
  if (state.levels === lastLevels && state.settings.units === lastUnits) return;
  lastLevels = state.levels;
  lastUnits = state.settings.units;
  clearTimeout(timer);
  timer = setTimeout(
    () =>
      saveAutosaveDoc({
        levels: useStore.getState().levels,
        activeLevelId: useStore.getState().activeLevelId,
        units: useStore.getState().settings.units,
      }),
    500
  );
});

// MCP live bridge — feature on hold.
// initMcpSync();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>
);
