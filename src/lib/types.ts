// ─────────────────────────────────────────────────────────────────────────────
// Core data model.
//
// World units are CENTIMETERS. The plan is a planar graph: shared `Node`s joined
// by `Edge`s (walls). Rooms are derived (cycles in the graph), never stored.
// ─────────────────────────────────────────────────────────────────────────────

export type ID = string;

export interface Vec2 {
  x: number;
  y: number;
}

/** A shared corner point. Multiple walls reference the same node so joints/rooms work. */
export interface Node {
  id: ID;
  x: number;
  y: number;
}

export type OpeningKind = "door" | "window";

/**
 * Real-world door types. `single` is the back-compat default for any door
 * opening that has no explicit subtype.
 * - `single`        one hinged leaf
 * - `double`        two hinged leaves (French / double-leaf doors)
 * - `sliding`       one panel slides along the wall
 * - `sliding_double` two panels slide apart (centre-opening)
 * - `folding`       bi-fold (concertina) panels
 * - `pocket`        slides into a wall cavity
 * - `garage`        roller / sectional garage door
 */
export type DoorSubtype =
  | "single"
  | "double"
  | "sliding"
  | "sliding_double"
  | "folding"
  | "pocket"
  | "garage";

/**
 * Real-world window types. `casement` is the back-compat default for any
 * window opening that has no explicit subtype.
 */
export type WindowSubtype =
  | "casement"
  | "fixed"
  | "sliding"
  | "double_hung"
  | "awning"
  | "bay"
  | "louvre";

/** Union of all opening subtypes (door + window). */
export type OpeningSubtype = DoorSubtype | WindowSubtype;

/**
 * Which side of the opening the hinge sits on (hinged doors/casement windows).
 * Accepts several spellings the 2D/3D renderers already use:
 * - "left"/"right"  (preferred — relative to looking through the opening)
 * - "start"/"end"   (relative to the wall's a→b direction)
 * - "a"/"b"         (legacy node-relative)
 */
export type HingeSide = "left" | "right" | "start" | "end" | "a" | "b";

/**
 * Which way a hinged door swings. Accepts the renderers' existing spellings:
 * - "in"/"out"      (preferred)
 * - "left"/"right"  (lateral)
 * - number          (legacy sign: >=0 / <0)
 */
export type SwingDir = "in" | "out" | "left" | "right" | number;

/** Which way a sliding/pocket panel travels along the wall. */
export type SlideDir = "left" | "right";

/** A door or window mounted on a wall, positioned by normalized distance `t` (0..1). */
export interface Opening {
  id: ID;
  edgeId: ID;
  kind: OpeningKind;
  /**
   * Specific real-world type. Optional & BACKWARD-COMPATIBLE: when absent a
   * door is treated as `single` and a window as `casement`. Use
   * `openingSubtype(o)` to read the effective value with the right default.
   */
  subtype?: OpeningSubtype;
  /** center position along the wall, 0..1 */
  t: number;
  /** opening width in cm */
  width: number;
  /** sill height from floor (windows) in cm */
  sill: number;
  /** opening height in cm */
  height: number;
  /**
   * Number of leaves/panels. Optional. Defaults derive from the subtype
   * (single=1, double/sliding_double=2, folding=2+). Used by 2D/3D renderers.
   */
  leafCount?: number;
  /** Hinge side for hinged doors / casement windows. Default "left". */
  hingeSide?: HingeSide;
  /** Swing direction for hinged doors. */
  swingDir?: SwingDir;
  /** Slide direction for sliding/pocket panels. Default "left". */
  slideDir?: SlideDir;
}

/**
 * Effective subtype with back-compat defaults applied:
 * door → "single", window → "casement".
 */
export const openingSubtype = (o: Pick<Opening, "kind" | "subtype">): OpeningSubtype =>
  o.subtype ?? (o.kind === "door" ? "single" : "casement");

/**
 * What a boundary segment physically is:
 * - `wall`    full-height wall (default)
 * - `low`     low wall / parapet (waist height)
 * - `railing` posts + handrail (balcony / terrace edge)
 * - `open`    no physical structure — just defines where a room/zone ends
 */
export type EdgeKind = "wall" | "low" | "railing" | "open";

/** A boundary segment between two nodes. */
export interface Edge {
  id: ID;
  a: ID; // node id
  b: ID; // node id
  thickness: number; // cm
  height: number; // cm
  kind?: EdgeKind; // default "wall"
  /**
   * Curved wall: signed sagitta ratio (bulge). 0 / undefined = straight.
   * Sign picks which side the arc bows toward (relative to a→b direction).
   * Use geometry.arcPoints / arcLength / projectOnArc for rendering & hit-tests.
   */
  bulge?: number;
}

/** Ordered furniture category groups used by the palette. */
export type FurnitureCategory =
  | "seating"
  | "tables"
  | "beds"
  | "storage"
  | "kitchen"
  | "bathroom"
  | "appliances"
  | "decor";

export type FurnitureKind =
  // ── legacy kinds (kept working, back-compat) ──────────────────────────────
  | "sofa"
  | "bed"
  | "table"
  | "chair"
  | "desk"
  | "plant"
  | "rug"
  | "toilet"
  | "sink"
  | "stove"
  // ── seating ───────────────────────────────────────────────────────────────
  | "armchair"
  | "sofa1"
  | "sofa2"
  | "sofa3"
  | "sofaL"
  | "recliner"
  | "bench"
  | "dining_chair"
  | "office_chair"
  | "bar_stool"
  | "stool"
  // ── tables ─────────────────────────────────────────────────────────────────
  | "dining4"
  | "dining6"
  | "dining8"
  | "coffee_table"
  | "side_table"
  | "console"
  | "nightstand"
  // ── beds ─────────────────────────────────────────────────────────────────
  | "bed_single"
  | "bed_double"
  | "bed_queen"
  | "bed_king"
  | "crib"
  // ── storage ─────────────────────────────────────────────────────────────────
  | "wardrobe"
  | "cabinet"
  | "bookshelf"
  | "dresser"
  | "tv_unit"
  | "shoe_rack"
  | "pantry"
  // ── kitchen ─────────────────────────────────────────────────────────────────
  | "kitchen_counter"
  | "kitchen_island"
  | "fridge"
  | "oven"
  | "kitchen_sink"
  | "dishwasher"
  | "range_hood"
  | "microwave"
  // ── bathroom ────────────────────────────────────────────────────────────────
  | "vanity_sink"
  | "bathtub"
  | "shower"
  | "bidet"
  | "washing_machine"
  // ── appliances / decor ──────────────────────────────────────────────────────
  | "tv"
  | "piano";

export interface Furniture {
  id: ID;
  kind: FurnitureKind;
  x: number;
  y: number;
  w: number;
  d: number;
  rotation: number; // radians
}

/**
 * A floor/area type marker. Dropped inside a room; the room it sits in adopts
 * its type (floor material + 2D tint). Without a marker a room is interior.
 */
export type ZoneType =
  | "room"
  | "terrace"
  | "garden"
  | "bathroom"
  | "kitchen"
  | "garage"
  | "water";

export interface Zone {
  id: ID;
  x: number;
  y: number;
  type: ZoneType;
}

/** A free-floating text annotation placed anywhere in world space (cm). */
export interface Label {
  id: ID;
  x: number;
  y: number;
  text: string;
}

/**
 * A manual dimension annotation between two world points (cm). The dimension
 * line is drawn parallel to a→b, shifted `offset` cm along the +perpendicular
 * (sign flips the side). The measured length is always dist(a,b).
 */
export interface Dim {
  id: ID;
  ax: number;
  ay: number;
  bx: number;
  by: number;
  offset: number;
}

export interface Scene {
  nodes: Record<ID, Node>;
  edges: Record<ID, Edge>;
  openings: Record<ID, Opening>;
  furniture: Record<ID, Furniture>;
  zones: Record<ID, Zone>;
  /**
   * Custom names for derived rooms, keyed by the room SIGNATURE
   * (= `[...nodeIds].sort().join("-")`, identical to `Room.id`).
   * Rooms are derived, never stored, so we persist names by signature.
   */
  roomNames: Record<string, string>;
  /** Free text annotations keyed by id. */
  labels: Record<ID, Label>;
  /** Manual dimension annotations keyed by id. */
  dims: Record<ID, Dim>;
}

export const emptyScene = (): Scene => ({
  nodes: {},
  edges: {},
  openings: {},
  furniture: {},
  zones: {},
  roomNames: {},
  labels: {},
  dims: {},
});

/**
 * Signature key for a derived room — sorted node ids joined by "-".
 * MUST match `Room.id` produced by detectRooms() so names line up.
 */
export const roomSignature = (nodeIds: ID[]): string => [...nodeIds].sort().join("-");

// Selection ------------------------------------------------------------------

export type SelectionKind = "node" | "edge" | "opening" | "furniture" | "zone" | "label" | "dim";
export interface Selection {
  kind: SelectionKind;
  id: ID;
}

/**
 * Helper: does a selection array contain this kind+id?
 * (multi-select lives as `Selection[]` in the store; single-select = length 1.)
 */
export const selectionHas = (sel: Selection[], kind: SelectionKind, id: ID): boolean =>
  sel.some((s) => s.kind === kind && s.id === id);

export const sameSelection = (a: Selection, b: Selection): boolean => a.kind === b.kind && a.id === b.id;

// Tools ----------------------------------------------------------------------

export type Tool = "select" | "wall" | "door" | "window" | "furniture" | "zone" | "label" | "dimension" | "pan";

// Levels / multi-floor -------------------------------------------------------

/** One floor/storey. Its `scene` is the full plan for that level. */
export interface Level {
  id: ID;
  name: string;
  elevation: number; // cm — floor height of this level above ground
  scene: Scene;
}

// Derived room (computed, not persisted) -------------------------------------

export interface Room {
  id: string; // stable-ish key from sorted node ids
  nodeIds: ID[];
  polygon: Vec2[]; // ordered loop of node positions (centerline)
  area: number; // m²
  centroid: Vec2;
}

// Defaults -------------------------------------------------------------------

export const DEFAULTS = {
  wallThickness: 15, // cm
  wallHeight: 270, // cm
  doorWidth: 90, // cm
  doorHeight: 210, // cm
  windowWidth: 120, // cm
  windowHeight: 120, // cm
  windowSill: 90, // cm
  gridMinor: 10, // cm
  gridMajor: 100, // cm (1 m)
  lowHeight: 110, // cm — low wall / parapet
  railHeight: 100, // cm — handrail height
} as const;
