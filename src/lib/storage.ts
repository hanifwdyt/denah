import type { Scene, Level, ID } from "./types";
import { emptyScene } from "./types";

const VERSION = 2;
const LS_KEY = "denah:autosave:v1";

export type Units = "metric" | "imperial";

/** The persisted document: full multi-level state. */
export interface DenahDoc {
  levels: Level[];
  activeLevelId: ID;
  units: Units;
}

interface FileShapeV2 {
  app: "denah";
  version: number;
  levels: Level[];
  activeLevelId: ID;
  units: Units;
}

/** guarantee every scene collection exists (old saves / bridge may omit some). */
function normScene(s: Partial<Scene> | null | undefined): Scene {
  return {
    nodes: s?.nodes ?? {},
    edges: s?.edges ?? {},
    openings: s?.openings ?? {},
    furniture: s?.furniture ?? {},
    zones: s?.zones ?? {},
    roomNames: s?.roomNames ?? {},
    labels: s?.labels ?? {},
    dims: s?.dims ?? {},
  };
}

/** wrap a single scene into a one-level "Ground" document. */
export function docFromScene(scene: Scene): DenahDoc {
  return { levels: [{ id: "lvl_ground", name: "Ground", elevation: 0, scene: normScene(scene) }], activeLevelId: "lvl_ground", units: "metric" };
}

export function serialize(doc: DenahDoc): string {
  const payload: FileShapeV2 = {
    app: "denah",
    version: VERSION,
    levels: doc.levels.map((l) => ({ ...l, scene: normScene(l.scene) })),
    activeLevelId: doc.activeLevelId,
    units: doc.units ?? "metric",
  };
  return JSON.stringify(payload, null, 2);
}

/**
 * Parse a saved document. Back-compat:
 *  - v2: { levels, activeLevelId, units }
 *  - v1 / legacy: { scene } or a bare scene → wrapped into one "Ground" level.
 * Returns null if unusable.
 */
export function parseDoc(json: string): DenahDoc | null {
  try {
    const data = JSON.parse(json);
    if (!data || typeof data !== "object") return null;

    // v2 multi-level
    if (Array.isArray(data.levels) && data.levels.length > 0) {
      const levels: Level[] = data.levels.map((l: Partial<Level>, i: number) => ({
        id: l.id ?? `lvl_${i}`,
        name: l.name ?? `Level ${i + 1}`,
        elevation: typeof l.elevation === "number" ? l.elevation : 0,
        scene: normScene(l.scene),
      }));
      const activeLevelId =
        typeof data.activeLevelId === "string" && levels.some((l) => l.id === data.activeLevelId)
          ? data.activeLevelId
          : levels[0].id;
      const units: Units = data.units === "imperial" ? "imperial" : "metric";
      return { levels, activeLevelId, units };
    }

    // legacy single scene
    const scene: unknown = data.scene ?? data;
    if (!scene || typeof scene !== "object") return null;
    const s = scene as Partial<Scene>;
    if (!s.nodes || !s.edges) return null;
    const doc = docFromScene(normScene(s));
    if (data.units === "imperial") doc.units = "imperial";
    return doc;
  } catch {
    return null;
  }
}

/** parse just the active scene — kept for back-compat with single-scene callers. */
export function parse(json: string): Scene | null {
  const doc = parseDoc(json);
  if (!doc) return null;
  return (doc.levels.find((l) => l.id === doc.activeLevelId) ?? doc.levels[0]).scene;
}

export function downloadDoc(doc: DenahDoc, filename = "floor-plan") {
  const blob = new Blob([serialize(doc)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${filename}.denah.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** back-compat: download a single scene as a one-level doc. */
export function downloadScene(scene: Scene, filename = "floor-plan") {
  downloadDoc(docFromScene(scene), filename);
}

export function openDocFile(): Promise<DenahDoc | null> {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".json,application/json";
    input.onchange = () => {
      const file = input.files?.[0];
      if (!file) return resolve(null);
      const reader = new FileReader();
      reader.onload = () => resolve(parseDoc(String(reader.result)));
      reader.onerror = () => resolve(null);
      reader.readAsText(file);
    };
    input.click();
  });
}

/** back-compat: open a file and return just the active scene. */
export function openSceneFile(): Promise<Scene | null> {
  return openDocFile().then((doc) =>
    doc ? (doc.levels.find((l) => l.id === doc.activeLevelId) ?? doc.levels[0]).scene : null
  );
}

// ── localStorage autosave ────────────────────────────────────────────────────
export function loadAutosaveDoc(): DenahDoc | null {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return null;
    const doc = parseDoc(raw);
    if (!doc) return null;
    // ignore fully-empty saves
    const nonEmpty = doc.levels.some(
      (l) => Object.keys(l.scene.edges).length > 0 || Object.keys(l.scene.furniture).length > 0
    );
    return nonEmpty ? doc : null;
  } catch {
    return null;
  }
}

/** back-compat: load just the active scene from autosave. */
export function loadAutosave(): Scene | null {
  const doc = loadAutosaveDoc();
  if (!doc) return null;
  return (doc.levels.find((l) => l.id === doc.activeLevelId) ?? doc.levels[0]).scene;
}

export function saveAutosaveDoc(doc: DenahDoc) {
  try {
    localStorage.setItem(LS_KEY, serialize(doc));
  } catch {
    /* quota / private mode — ignore */
  }
}

/** back-compat: save a single scene. */
export function saveAutosave(scene: Scene) {
  saveAutosaveDoc(docFromScene(scene));
}

export function clearAutosave() {
  try {
    localStorage.removeItem(LS_KEY);
  } catch {
    /* ignore */
  }
}

export { emptyScene };
