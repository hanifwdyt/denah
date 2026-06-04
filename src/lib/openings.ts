// ─────────────────────────────────────────────────────────────────────────────
// Openings catalog — REAL door & window types with realistic default sizes.
//
// World units are CENTIMETERS. Openings are BACKWARD-COMPATIBLE: an Opening
// without `subtype` is treated as a "single" door or "casement" window. These
// catalogs give the door/window tools + inspector sensible per-type defaults.
// ─────────────────────────────────────────────────────────────────────────────

import type { DoorSubtype, WindowSubtype, OpeningSubtype, OpeningKind } from "./types";

/**
 * 2D symbol hint so the canvas agent can pick the right glyph without a giant
 * switch. Renderers may fall back to "swing" (doors) / "casement" (windows).
 */
export type DoorSymbol = "swing" | "double_swing" | "slide" | "slide_double" | "fold" | "pocket" | "garage";
export type WindowSymbol = "casement" | "fixed" | "slide" | "double_hung" | "awning" | "bay" | "louvre";

export interface DoorTypeSpec {
  subtype: DoorSubtype;
  label: string;
  /** default opening width (cm) */
  width: number;
  /** default opening height (cm) */
  height: number;
  /** number of leaves/panels */
  leafCount: number;
  /** 2D symbol hint */
  symbol: DoorSymbol;
  /** does the leaf swing (true) or slide/roll (false)? render hint */
  swings: boolean;
  /** short helper text for the palette */
  hint?: string;
}

export interface WindowTypeSpec {
  subtype: WindowSubtype;
  label: string;
  /** default opening width (cm) */
  width: number;
  /** default opening height (cm) */
  height: number;
  /** default sill height from floor (cm) */
  sill: number;
  /** number of sashes/panels */
  leafCount: number;
  /** 2D symbol hint */
  symbol: WindowSymbol;
  hint?: string;
}

// ── Door catalog ─────────────────────────────────────────────────────────────
export const DOOR_TYPES: Record<DoorSubtype, DoorTypeSpec> = {
  single: { subtype: "single", label: "Single", width: 90, height: 210, leafCount: 1, symbol: "swing", swings: true, hint: "One hinged leaf" },
  double: { subtype: "double", label: "Double / French", width: 150, height: 210, leafCount: 2, symbol: "double_swing", swings: true, hint: "Two hinged leaves (left + right)" },
  sliding: { subtype: "sliding", label: "Sliding", width: 160, height: 210, leafCount: 1, symbol: "slide", swings: false, hint: "Single sliding panel" },
  sliding_double: { subtype: "sliding_double", label: "Sliding (2-panel)", width: 240, height: 210, leafCount: 2, symbol: "slide_double", swings: false, hint: "Centre-opening sliding panels" },
  folding: { subtype: "folding", label: "Bi-fold", width: 180, height: 210, leafCount: 4, symbol: "fold", swings: false, hint: "Folding / concertina panels" },
  pocket: { subtype: "pocket", label: "Pocket", width: 90, height: 210, leafCount: 1, symbol: "pocket", swings: false, hint: "Slides into wall cavity" },
  garage: { subtype: "garage", label: "Garage", width: 250, height: 220, leafCount: 1, symbol: "garage", swings: false, hint: "Roller / sectional garage door" },
};

export const DOOR_TYPE_ORDER: DoorSubtype[] = [
  "single",
  "double",
  "sliding",
  "sliding_double",
  "folding",
  "pocket",
  "garage",
];

// ── Window catalog ───────────────────────────────────────────────────────────
export const WINDOW_TYPES: Record<WindowSubtype, WindowTypeSpec> = {
  casement: { subtype: "casement", label: "Casement", width: 120, height: 120, sill: 90, leafCount: 1, symbol: "casement", hint: "Side-hinged, swings out" },
  fixed: { subtype: "fixed", label: "Fixed / Picture", width: 150, height: 120, sill: 90, leafCount: 1, symbol: "fixed", hint: "Non-opening glazing" },
  sliding: { subtype: "sliding", label: "Sliding", width: 180, height: 120, sill: 90, leafCount: 2, symbol: "slide", hint: "Horizontal sliding sashes" },
  double_hung: { subtype: "double_hung", label: "Double-hung", width: 90, height: 150, sill: 90, leafCount: 2, symbol: "double_hung", hint: "Two vertically sliding sashes" },
  awning: { subtype: "awning", label: "Awning", width: 100, height: 60, sill: 150, leafCount: 1, symbol: "awning", hint: "Top-hinged, swings out" },
  bay: { subtype: "bay", label: "Bay", width: 240, height: 140, sill: 45, leafCount: 3, symbol: "bay", hint: "Projecting 3-pane bay" },
  louvre: { subtype: "louvre", label: "Louvre / Jalousie", width: 90, height: 120, sill: 90, leafCount: 1, symbol: "louvre", hint: "Angled glass slats" },
};

export const WINDOW_TYPE_ORDER: WindowSubtype[] = [
  "casement",
  "fixed",
  "sliding",
  "double_hung",
  "awning",
  "bay",
  "louvre",
];

// ── Size presets ─────────────────────────────────────────────────────────────

/** Common door leaf/opening widths (cm). */
export const DOOR_WIDTH_PRESETS: number[] = [70, 80, 90, 100, 120, 150, 240];
/** Common door heights (cm). */
export const DOOR_HEIGHT_PRESETS: number[] = [200, 210, 240];

/** Common window sizes (w × h in cm). */
export const WINDOW_SIZE_PRESETS: { label: string; width: number; height: number }[] = [
  { label: "60 × 60", width: 60, height: 60 },
  { label: "90 × 120", width: 90, height: 120 },
  { label: "120 × 120", width: 120, height: 120 },
  { label: "150 × 120", width: 150, height: 120 },
  { label: "180 × 120", width: 180, height: 120 },
  { label: "240 × 140", width: 240, height: 140 },
];

/** Common window sill heights from floor (cm). */
export const WINDOW_SILL_PRESETS: number[] = [0, 45, 75, 90, 110, 150];

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Is this subtype a door subtype? (vs a window subtype) */
export const isDoorSubtype = (s: OpeningSubtype): s is DoorSubtype => s in DOOR_TYPES;

/** Default subtype for a freshly-created opening of the given kind. */
export const defaultSubtype = (kind: OpeningKind): OpeningSubtype =>
  kind === "door" ? "single" : "casement";

/**
 * Defaults (width/height/sill/leafCount) for an opening of the given subtype.
 * Sill is 0 for doors. Use when creating an opening or when changing its type.
 */
export const openingDefaults = (
  subtype: OpeningSubtype
): { kind: OpeningKind; width: number; height: number; sill: number; leafCount: number } => {
  if (isDoorSubtype(subtype)) {
    const d = DOOR_TYPES[subtype];
    return { kind: "door", width: d.width, height: d.height, sill: 0, leafCount: d.leafCount };
  }
  const w = WINDOW_TYPES[subtype as WindowSubtype];
  return { kind: "window", width: w.width, height: w.height, sill: w.sill, leafCount: w.leafCount };
};
