import { create } from "zustand";
import {
  type Scene,
  type Selection,
  type Tool,
  type ID,
  type OpeningKind,
  type OpeningSubtype,
  type DoorSubtype,
  type WindowSubtype,
  type Vec2,
  type Edge,
  type Opening,
  type Furniture,
  type FurnitureKind,
  type FurnitureCategory,
  type Zone,
  type ZoneType,
  type Level,
  type Label,
  type Dim,
  emptyScene,
  sameSelection,
  DEFAULTS,
} from "../lib/types";
import { FURNITURE } from "../lib/furniture";
import { openingDefaults, defaultSubtype } from "../lib/openings";

let _seq = 0;
const uid = (p: string): ID => `${p}_${(_seq++).toString(36)}_${Math.floor(performance.now() % 1e6).toString(36)}`;

export type ViewMode = "2d" | "3d";

interface Viewport {
  panX: number;
  panY: number;
  zoom: number;
}

interface DraftState {
  /** node the next wall segment will extend from (chained drawing) */
  anchorNodeId: ID | null;
}

export type Units = "metric" | "imperial";

interface Settings {
  grid: number;
  snapGrid: boolean;
  snapOrtho: boolean;
  showDimensions: boolean;
  showRooms: boolean;
  /** display units for lengths/areas (default metric). */
  units: Units;
}

/**
 * History snapshot. We snapshot the WHOLE level set (+ which is active) so that
 * undo/redo also covers level add/remove/rename/elevation edits.
 */
export interface HistorySnap {
  levels: Level[];
  activeLevelId: ID;
}

interface StoreState {
  /** ALWAYS mirrors levels[active].scene — existing consumers read this unchanged. */
  scene: Scene;
  /**
   * Multi-selection. Single-select = array of length 1. Empty = nothing selected.
   * Read the first item via `firstSelection(state)` if you only care about one.
   */
  selection: Selection[];
  tool: Tool;
  viewport: Viewport;
  mode: ViewMode;
  draft: DraftState;
  settings: Settings;
  cursor: Vec2 | null;
  furnitureKind: FurnitureKind;
  /** active palette category (for the furniture palette UI). */
  furnitureCategory: FurnitureCategory;
  /** active door type for the door tool. */
  activeDoorType: DoorSubtype;
  /** active window type for the window tool. */
  activeWindowType: WindowSubtype;
  zoneType: ZoneType;
  inspectorOpen: boolean;
  mcpConnected: boolean;
  fitNonce: number;

  // multi-floor ---------------------------------------------------------
  levels: Level[];
  activeLevelId: ID;

  past: HistorySnap[];
  future: HistorySnap[];

  // view ----------------------------------------------------------------
  setCursor: (c: Vec2 | null) => void;
  setTool: (t: Tool) => void;
  setViewport: (vp: Partial<Viewport>) => void;
  setMode: (m: ViewMode) => void;
  toggleMode: () => void;

  // selection -----------------------------------------------------------
  /** Back-compat single-select: pass a Selection (sets array to [s]) or null (clears). */
  select: (s: Selection | null) => void;
  setSelection: (sel: Selection[]) => void;
  addToSelection: (s: Selection) => void;
  toggleSelection: (s: Selection) => void;
  clearSelection: () => void;

  // gesture coalescing --------------------------------------------------
  /** Begin a drag/slider gesture: the first mutation pushes ONE history entry. */
  beginGesture: () => void;
  /** End the active gesture (subsequent mutations push history normally again). */
  endGesture: () => void;

  // wall drafting -------------------------------------------------------
  startWall: (point: Vec2, snappedNodeId?: ID | null) => void;
  extendWall: (point: Vec2, snappedNodeId?: ID | null) => void;
  finishWall: () => void;

  // mutations -----------------------------------------------------------
  /**
   * Add a door/window. `subtype` optional — defaults to the active door/window
   * type for that kind (or single/casement). Sizes default from the catalog.
   */
  addOpening: (edgeId: ID, t: number, kind: OpeningKind, subtype?: OpeningSubtype) => void;
  /** Change an opening's subtype AND reset its sizes to that type's defaults. */
  setOpeningSubtype: (id: ID, subtype: OpeningSubtype) => void;
  moveNode: (id: ID, x: number, y: number) => void;
  updateEdge: (id: ID, patch: Partial<Edge>) => void;
  updateOpening: (id: ID, patch: Partial<Opening>) => void;
  addFurniture: (f: Omit<Furniture, "id">) => void;
  placeFurniture: (kind: FurnitureKind, x: number, y: number) => void;
  moveFurniture: (id: ID, x: number, y: number) => void;
  updateFurniture: (id: ID, patch: Partial<Furniture>) => void;
  rotateSelected: (deltaRad: number) => void;
  setFurnitureKind: (k: FurnitureKind) => void;
  setFurnitureCategory: (c: FurnitureCategory) => void;
  setActiveDoorType: (s: DoorSubtype) => void;
  setActiveWindowType: (s: WindowSubtype) => void;
  placeZone: (type: ZoneType, x: number, y: number) => void;
  updateZone: (id: ID, patch: Partial<Zone>) => void;
  setZoneType: (t: ZoneType) => void;
  deleteSelected: () => void;

  // rooms + labels ------------------------------------------------------
  setRoomName: (signature: string, name: string) => void;
  addLabel: (x: number, y: number, text: string) => void;
  updateLabel: (id: ID, patch: Partial<Omit<Label, "id">>) => void;

  // dimensions ----------------------------------------------------------
  addDim: (a: Vec2, b: Vec2, offset?: number) => void;
  updateDim: (id: ID, patch: Partial<Omit<Dim, "id">>) => void;

  // levels --------------------------------------------------------------
  addLevel: (name?: string) => void;
  removeLevel: (id: ID) => void;
  renameLevel: (id: ID, name: string) => void;
  setActiveLevel: (id: ID) => void;
  setLevelElevation: (id: ID, cm: number) => void;

  // history / io --------------------------------------------------------
  undo: () => void;
  redo: () => void;
  reset: () => void;
  loadDemo: () => void;
  loadScene: (scene: Scene) => void;
  /** load a full multi-level document (from storage). */
  loadLevels: (levels: Level[], activeLevelId?: ID) => void;
  applyRemote: (scene: Scene) => void;
  setSettings: (s: Partial<Settings>) => void;
  setInspectorOpen: (open: boolean) => void;
  setMcpConnected: (c: boolean) => void;
  requestFit: () => void;
}

const clone = (s: Scene): Scene => structuredClone(s);
const cloneLevels = (ls: Level[]): Level[] => ls.map((l) => ({ ...l, scene: clone(l.scene) }));

/** convenience getter — first selected item (or null). */
export const firstSelection = (s: { selection: Selection[] }): Selection | null => s.selection[0] ?? null;

/** guarantee every collection exists — scenes from old saves / the bridge may omit some */
export const normScene = (s: Partial<Scene> | null | undefined): Scene => ({
  nodes: s?.nodes ?? {},
  edges: s?.edges ?? {},
  openings: s?.openings ?? {},
  furniture: s?.furniture ?? {},
  zones: s?.zones ?? {},
  roomNames: s?.roomNames ?? {},
  labels: s?.labels ?? {},
  dims: s?.dims ?? {},
});

/** snapshot the current level set for history */
const snapOf = (s: { levels: Level[]; activeLevelId: ID }): HistorySnap => ({
  levels: cloneLevels(s.levels),
  activeLevelId: s.activeLevelId,
});

export const useStore = create<StoreState>((set, get) => {
  // gesture coalescing state (module-private to this store instance)
  let gestureActive = false;
  let gestureSnapped = false; // did the current gesture already push history?

  /**
   * Mutate the ACTIVE level's scene. Pushes one history entry per call, EXCEPT
   * during a gesture where only the first mutation pushes (the rest mutate in
   * place). Keeps `scene` === levels[active].scene at all times.
   */
  const commit = (mutator: (draft: Scene) => void) => {
    const st = get();
    const idx = st.levels.findIndex((l) => l.id === st.activeLevelId);
    if (idx < 0) return;

    const pushHistory = !gestureActive || !gestureSnapped;
    const prevSnap = pushHistory ? snapOf(st) : null;
    if (gestureActive) gestureSnapped = true;

    const nextScene = clone(st.levels[idx].scene);
    mutator(nextScene);
    const nextLevels = st.levels.slice();
    nextLevels[idx] = { ...nextLevels[idx], scene: nextScene };

    set({
      levels: nextLevels,
      scene: nextScene,
      ...(prevSnap ? { past: [...st.past, prevSnap].slice(-100), future: [] } : {}),
    });
  };

  /**
   * Mutate the level metadata array (add/remove/rename/elevation). Always one
   * history entry (these aren't gesture-driven). Keeps scene in sync with active.
   */
  const commitLevels = (
    producer: (levels: Level[], activeLevelId: ID) => { levels: Level[]; activeLevelId: ID }
  ) => {
    const st = get();
    const prevSnap = snapOf(st);
    const { levels, activeLevelId } = producer(cloneLevels(st.levels), st.activeLevelId);
    const active = levels.find((l) => l.id === activeLevelId) ?? levels[0];
    set({
      levels,
      activeLevelId: active.id,
      scene: active.scene,
      past: [...st.past, prevSnap].slice(-100),
      future: [],
    });
  };

  /** ensure a node exists at point (reuse snapped node if given), return its id */
  const ensureNode = (draft: Scene, point: Vec2, snappedNodeId?: ID | null): ID => {
    if (snappedNodeId && draft.nodes[snappedNodeId]) return snappedNodeId;
    const id = uid("n");
    draft.nodes[id] = { id, x: point.x, y: point.y };
    return id;
  };

  const initialScene = emptyScene();
  const groundId = uid("lvl");

  return {
    scene: initialScene,
    selection: [],
    tool: "wall",
    viewport: { panX: 0, panY: 0, zoom: 1 },
    mode: "2d",
    draft: { anchorNodeId: null },
    cursor: null,
    furnitureKind: "sofa",
    furnitureCategory: "seating",
    activeDoorType: "single",
    activeWindowType: "casement",
    zoneType: "terrace",
    inspectorOpen: typeof window !== "undefined" ? window.innerWidth > 820 : true,
    mcpConnected: false,
    fitNonce: 0,
    levels: [{ id: groundId, name: "Ground", elevation: 0, scene: initialScene }],
    activeLevelId: groundId,
    settings: {
      grid: DEFAULTS.gridMinor,
      snapGrid: true,
      snapOrtho: true,
      showDimensions: true,
      showRooms: true,
      units: "metric",
    },
    past: [],
    future: [],

    setCursor: (c) => set({ cursor: c }),
    setTool: (t) => set({ tool: t, draft: { anchorNodeId: null } }),
    setViewport: (vp) => set({ viewport: { ...get().viewport, ...vp } }),
    setMode: (m) => set({ mode: m }),
    toggleMode: () => set({ mode: get().mode === "2d" ? "3d" : "2d" }),

    select: (s) => set({ selection: s ? [s] : [] }),
    setSelection: (sel) => set({ selection: sel }),
    addToSelection: (s) => {
      const cur = get().selection;
      if (cur.some((x) => sameSelection(x, s))) return;
      set({ selection: [...cur, s] });
    },
    toggleSelection: (s) => {
      const cur = get().selection;
      set(
        cur.some((x) => sameSelection(x, s))
          ? { selection: cur.filter((x) => !sameSelection(x, s)) }
          : { selection: [...cur, s] }
      );
    },
    clearSelection: () => set({ selection: [] }),

    beginGesture: () => {
      gestureActive = true;
      gestureSnapped = false;
    },
    endGesture: () => {
      gestureActive = false;
      gestureSnapped = false;
    },

    startWall: (point, snappedNodeId) => {
      let anchorId: ID = "";
      commit((draft) => {
        anchorId = ensureNode(draft, point, snappedNodeId);
      });
      set({ draft: { anchorNodeId: anchorId } });
    },

    extendWall: (point, snappedNodeId) => {
      const anchor = get().draft.anchorNodeId;
      if (!anchor) {
        get().startWall(point, snappedNodeId);
        return;
      }
      let newAnchor: ID = anchor;
      commit((draft) => {
        const targetId = ensureNode(draft, point, snappedNodeId);
        if (targetId === anchor) return;
        // avoid duplicate edge
        const exists = Object.values(draft.edges).some(
          (e) => (e.a === anchor && e.b === targetId) || (e.a === targetId && e.b === anchor)
        );
        if (!exists) {
          const id = uid("e");
          draft.edges[id] = {
            id,
            a: anchor,
            b: targetId,
            thickness: DEFAULTS.wallThickness,
            height: DEFAULTS.wallHeight,
          };
        }
        newAnchor = targetId;
      });
      set({ draft: { anchorNodeId: newAnchor } });
    },

    finishWall: () => set({ draft: { anchorNodeId: null } }),

    addOpening: (edgeId, t, kind, subtype) => {
      // pick the subtype: explicit arg → active tool type for that kind → default
      const st = get();
      const sub: OpeningSubtype =
        subtype ?? (kind === "door" ? st.activeDoorType : st.activeWindowType) ?? defaultSubtype(kind);
      const def = openingDefaults(sub);
      let newId = "";
      commit((draft) => {
        const id = uid("o");
        newId = id;
        draft.openings[id] = {
          id,
          edgeId,
          kind: def.kind,
          subtype: sub,
          t: Math.max(0.05, Math.min(0.95, t)),
          width: def.width,
          sill: def.sill,
          height: def.height,
          leafCount: def.leafCount,
          hingeSide: "left",
          slideDir: "left",
        };
      });
      set({ selection: [{ kind: "opening", id: newId }] });
    },

    setOpeningSubtype: (id, subtype) => {
      const def = openingDefaults(subtype);
      commit((draft) => {
        const o = draft.openings[id];
        if (!o) return;
        o.kind = def.kind;
        o.subtype = subtype;
        o.width = def.width;
        o.height = def.height;
        o.sill = def.sill;
        o.leafCount = def.leafCount;
      });
    },

    moveNode: (id, x, y) =>
      commit((draft) => {
        const n = draft.nodes[id];
        if (n) {
          n.x = x;
          n.y = y;
        }
      }),

    updateEdge: (id, patch) =>
      commit((draft) => {
        const e = draft.edges[id];
        if (e) Object.assign(e, patch);
      }),

    updateOpening: (id, patch) =>
      commit((draft) => {
        const o = draft.openings[id];
        if (o) Object.assign(o, patch);
      }),

    addFurniture: (f) => {
      let newId = "";
      commit((draft) => {
        const id = uid("f");
        newId = id;
        draft.furniture[id] = { ...f, id };
      });
      set({ selection: [{ kind: "furniture", id: newId }] });
    },

    placeFurniture: (kind, x, y) => {
      const spec = FURNITURE[kind];
      get().addFurniture({ kind, x, y, w: spec.w, d: spec.d, rotation: 0 });
    },

    moveFurniture: (id, x, y) =>
      commit((draft) => {
        const f = draft.furniture[id];
        if (f) {
          f.x = x;
          f.y = y;
        }
      }),

    updateFurniture: (id, patch) =>
      commit((draft) => {
        const f = draft.furniture[id];
        if (f) Object.assign(f, patch);
      }),

    rotateSelected: (deltaRad) => {
      const furns = get().selection.filter((s) => s.kind === "furniture");
      if (furns.length === 0) return;
      commit((draft) => {
        for (const s of furns) {
          const f = draft.furniture[s.id];
          if (f) f.rotation += deltaRad;
        }
      });
    },

    setFurnitureKind: (k) => set({ furnitureKind: k, tool: "furniture" }),
    setFurnitureCategory: (c) => set({ furnitureCategory: c }),
    setActiveDoorType: (s) => set({ activeDoorType: s, tool: "door" }),
    setActiveWindowType: (s) => set({ activeWindowType: s, tool: "window" }),

    placeZone: (type, x, y) => {
      let newId = "";
      commit((draft) => {
        const id = uid("z");
        newId = id;
        draft.zones[id] = { id, type, x: Math.round(x), y: Math.round(y) };
      });
      set({ selection: [{ kind: "zone", id: newId }] });
    },

    updateZone: (id, patch) =>
      commit((draft) => {
        const z = draft.zones[id];
        if (z) Object.assign(z, patch);
      }),

    setZoneType: (t) => set({ zoneType: t, tool: "zone" }),

    deleteSelected: () => {
      const sels = get().selection;
      if (sels.length === 0) return;
      commit((draft) => {
        for (const sel of sels) {
          if (sel.kind === "node") {
            delete draft.nodes[sel.id];
            for (const e of Object.values(draft.edges)) {
              if (e.a === sel.id || e.b === sel.id) {
                for (const o of Object.values(draft.openings))
                  if (o.edgeId === e.id) delete draft.openings[o.id];
                delete draft.edges[e.id];
              }
            }
          } else if (sel.kind === "edge") {
            for (const o of Object.values(draft.openings))
              if (o.edgeId === sel.id) delete draft.openings[o.id];
            delete draft.edges[sel.id];
          } else if (sel.kind === "opening") {
            delete draft.openings[sel.id];
          } else if (sel.kind === "furniture") {
            delete draft.furniture[sel.id];
          } else if (sel.kind === "zone") {
            delete draft.zones[sel.id];
          } else if (sel.kind === "label") {
            delete draft.labels[sel.id];
          } else if (sel.kind === "dim") {
            delete draft.dims[sel.id];
          }
        }
      });
      set({ selection: [] });
    },

    // rooms + labels ----------------------------------------------------
    setRoomName: (signature, name) =>
      commit((draft) => {
        const trimmed = name.trim();
        if (trimmed) draft.roomNames[signature] = trimmed;
        else delete draft.roomNames[signature];
      }),

    addLabel: (x, y, text) => {
      let newId = "";
      commit((draft) => {
        const id = uid("lbl");
        newId = id;
        draft.labels[id] = { id, x: Math.round(x), y: Math.round(y), text };
      });
      set({ selection: [{ kind: "label", id: newId }] });
    },

    updateLabel: (id, patch) =>
      commit((draft) => {
        const l = draft.labels[id];
        if (l) Object.assign(l, patch);
      }),

    // dimensions ----------------------------------------------------------
    addDim: (a, b, offset = 40) => {
      let newId = "";
      commit((draft) => {
        const id = uid("dim");
        newId = id;
        draft.dims[id] = {
          id,
          ax: Math.round(a.x),
          ay: Math.round(a.y),
          bx: Math.round(b.x),
          by: Math.round(b.y),
          offset,
        };
      });
      set({ selection: [{ kind: "dim", id: newId }] });
    },

    updateDim: (id, patch) =>
      commit((draft) => {
        const d = draft.dims[id];
        if (d) Object.assign(d, patch);
      }),

    // levels ------------------------------------------------------------
    addLevel: (name) =>
      commitLevels((levels) => {
        const id = uid("lvl");
        const maxEl = levels.reduce((m, l) => Math.max(m, l.elevation), 0);
        const nextEl = maxEl + DEFAULTS.wallHeight;
        const level: Level = {
          id,
          name: name?.trim() || `Level ${levels.length + 1}`,
          elevation: nextEl,
          scene: emptyScene(),
        };
        return { levels: [...levels, level], activeLevelId: id };
      }),

    removeLevel: (id) => {
      if (get().levels.length <= 1) return; // always keep at least one level
      set({ selection: [] });
      commitLevels((levels, activeLevelId) => {
        const next = levels.filter((l) => l.id !== id);
        const active = activeLevelId === id ? next[0].id : activeLevelId;
        return { levels: next, activeLevelId: active };
      });
    },

    renameLevel: (id, name) =>
      commitLevels((levels, activeLevelId) => ({
        levels: levels.map((l) => (l.id === id ? { ...l, name: name.trim() || l.name } : l)),
        activeLevelId,
      })),

    setActiveLevel: (id) => {
      const st = get();
      const lvl = st.levels.find((l) => l.id === id);
      if (!lvl || id === st.activeLevelId) return;
      // switching levels is not an undoable mutation — just remap scene
      set({
        activeLevelId: id,
        scene: lvl.scene,
        selection: [],
        draft: { anchorNodeId: null },
        fitNonce: st.fitNonce + 1,
      });
    },

    setLevelElevation: (id, cm) =>
      commitLevels((levels, activeLevelId) => ({
        levels: levels.map((l) => (l.id === id ? { ...l, elevation: cm } : l)),
        activeLevelId,
      })),

    undo: () => {
      const st = get();
      if (st.past.length === 0) return;
      const prev = st.past[st.past.length - 1];
      const active = prev.levels.find((l) => l.id === prev.activeLevelId) ?? prev.levels[0];
      set({
        levels: prev.levels,
        activeLevelId: active.id,
        scene: active.scene,
        past: st.past.slice(0, -1),
        future: [snapOf(st), ...st.future].slice(0, 100),
        selection: [],
        draft: { anchorNodeId: null },
      });
    },

    redo: () => {
      const st = get();
      if (st.future.length === 0) return;
      const next = st.future[0];
      const active = next.levels.find((l) => l.id === next.activeLevelId) ?? next.levels[0];
      set({
        levels: next.levels,
        activeLevelId: active.id,
        scene: active.scene,
        past: [...st.past, snapOf(st)],
        future: st.future.slice(1),
        selection: [],
      });
    },

    reset: () => {
      const s = emptyScene();
      const id = uid("lvl");
      set({
        levels: [{ id, name: "Ground", elevation: 0, scene: s }],
        activeLevelId: id,
        scene: s,
        past: [],
        future: [],
        selection: [],
        draft: { anchorNodeId: null },
      });
    },

    /** replace the ACTIVE level's scene with the demo (undoable). */
    loadDemo: () => {
      commitLevels((levels, activeLevelId) => ({
        levels: levels.map((l) => (l.id === activeLevelId ? { ...l, scene: buildDemo() } : l)),
        activeLevelId,
      }));
      set({ selection: [], draft: { anchorNodeId: null } });
    },

    /** replace the ACTIVE level's scene with a loaded one (undoable). */
    loadScene: (scene) => {
      const norm = normScene(scene);
      commitLevels((levels, activeLevelId) => ({
        levels: levels.map((l) => (l.id === activeLevelId ? { ...l, scene: norm } : l)),
        activeLevelId,
      }));
      set({ selection: [], draft: { anchorNodeId: null }, fitNonce: get().fitNonce + 1 });
    },

    /** load a full multi-level document (undoable). */
    loadLevels: (levels, activeLevelId) => {
      const norm = levels.map((l) => ({ ...l, scene: normScene(l.scene) }));
      const safe = norm.length ? norm : [{ id: uid("lvl"), name: "Ground", elevation: 0, scene: emptyScene() }];
      const active = safe.find((l) => l.id === activeLevelId) ?? safe[0];
      const st = get();
      set({
        levels: safe,
        activeLevelId: active.id,
        scene: active.scene,
        past: [...st.past, snapOf(st)].slice(-100),
        future: [],
        selection: [],
        draft: { anchorNodeId: null },
        fitNonce: st.fitNonce + 1,
      });
    },

    // applied from the MCP bridge — keep undoable + auto-fit the view
    applyRemote: (scene) => {
      const norm = normScene(scene);
      const st = get();
      const idx = st.levels.findIndex((l) => l.id === st.activeLevelId);
      if (idx < 0) return;
      const nextLevels = st.levels.slice();
      nextLevels[idx] = { ...nextLevels[idx], scene: norm };
      set({
        levels: nextLevels,
        scene: norm,
        past: [...st.past, snapOf(st)].slice(-100),
        future: [],
        selection: [],
        draft: { anchorNodeId: null },
        fitNonce: st.fitNonce + 1,
      });
    },

    setSettings: (s) => set({ settings: { ...get().settings, ...s } }),
    setInspectorOpen: (open) => set({ inspectorOpen: open }),
    setMcpConnected: (c) => set({ mcpConnected: c }),
    requestFit: () => set({ fitNonce: get().fitNonce + 1 }),
  };
});

// ── a tasteful starter layout so the canvas is never empty ──────────────────
function buildDemo(): Scene {
  const s = emptyScene();
  const N = (x: number, y: number): ID => {
    const id = uid("n");
    s.nodes[id] = { id, x, y };
    return id;
  };
  const E = (a: ID, b: ID, kind?: "low" | "railing" | "open") => {
    const id = uid("e");
    s.edges[id] = { id, a, b, thickness: DEFAULTS.wallThickness, height: DEFAULTS.wallHeight, kind: kind ?? "wall" };
    return id;
  };
  // outer shell (8m x 6m) + one interior partition
  const p1 = N(0, 0);
  const p2 = N(800, 0);
  const p3 = N(800, 600);
  const p4 = N(0, 600);
  const m1 = N(480, 0);
  const m2 = N(480, 600);
  E(p1, m1);
  E(m1, p2);
  E(p2, p3);
  E(p3, m2);
  E(m2, p4);
  E(p4, p1);
  const partition = E(m1, m2);

  // a terrace to the right, sharing the house's right wall, railing on 3 sides
  const t1 = N(1150, 0);
  const t2 = N(1150, 600);
  E(p2, t1, "railing");
  E(t1, t2, "railing");
  E(t2, p3, "railing");
  const zid = uid("z");
  s.zones[zid] = { id: zid, type: "terrace", x: 975, y: 300 };

  // a door in the partition + a window on the long wall
  const oid = uid("o");
  s.openings[oid] = { id: oid, edgeId: partition, kind: "door", t: 0.5, width: 90, sill: 0, height: 210 };
  const top = Object.values(s.edges).find((e) => e.a === p1 && e.b === m1)!;
  const wid = uid("o");
  s.openings[wid] = { id: wid, edgeId: top.id, kind: "window", t: 0.5, width: 140, sill: 90, height: 120 };

  // furniture
  const F = (f: Omit<Furniture, "id">) => {
    const id = uid("f");
    s.furniture[id] = { ...f, id };
  };
  F({ kind: "rug", x: 230, y: 320, w: 280, d: 180, rotation: 0 });
  F({ kind: "sofa", x: 230, y: 470, w: 220, d: 90, rotation: 0 });
  F({ kind: "table", x: 230, y: 200, w: 120, d: 80, rotation: 0 });
  F({ kind: "bed", x: 640, y: 160, w: 200, d: 160, rotation: 0 });
  F({ kind: "plant", x: 720, y: 520, w: 50, d: 50, rotation: 0 });
  return s;
}
