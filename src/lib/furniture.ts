import type { FurnitureKind, FurnitureCategory } from "./types";

/**
 * 2D top-down primitive used as a CATEGORY FALLBACK when a kind has no bespoke
 * glyph. The canvas agent can switch on `render2d` (bespoke) and otherwise draw
 * the `shape` primitive.
 */
export type Shape2D = "rect" | "round" | "soft" | "dashed";

export interface FurnitureSpec {
  kind: FurnitureKind;
  label: string;
  category: FurnitureCategory;
  w: number; // cm (along local x)
  d: number; // cm (along local y / depth)
  height: number; // cm (for 3D extrusion)
  /** 2D top-down render primitive (category fallback). */
  shape: Shape2D;
  color: string; // 3D material color
  /**
   * Optional BESPOKE 2D render hint. If a renderer has art for this id it uses
   * it; otherwise it falls back to `shape`. Free-form string — renderers may
   * ignore unknown values.
   */
  render2d?: string;
  /**
   * Optional BESPOKE 3D render hint (mesh recipe key / GLB name). Falls back to
   * a category box if unknown.
   */
  render3d?: string;
}

// Helper to keep entries terse & consistent.
const F = (
  kind: FurnitureKind,
  label: string,
  category: FurnitureCategory,
  w: number,
  d: number,
  height: number,
  shape: Shape2D,
  color: string,
  hints?: { render2d?: string; render3d?: string }
): FurnitureSpec => ({ kind, label, category, w, d, height, shape, color, ...hints });

// Category palette (kept close to the existing graphite tones).
const C = {
  seating: "#8d7f73",
  tables: "#9a8467",
  beds: "#7c8597",
  storage: "#8a7c6d",
  kitchen: "#7a7d85",
  bathroom: "#aeb6c2",
  appliances: "#6f7178",
  decor: "#5f7d5a",
} as const;

export const FURNITURE: Record<FurnitureKind, FurnitureSpec> = {
  // ── legacy kinds (unchanged sizes; now categorized) ────────────────────────
  sofa: F("sofa", "Sofa", "seating", 220, 90, 80, "soft", C.seating, { render2d: "sofa3", render3d: "sofa3" }),
  bed: F("bed", "Bed", "beds", 160, 200, 50, "soft", C.beds, { render2d: "bed", render3d: "bed" }),
  table: F("table", "Table", "tables", 120, 80, 75, "rect", C.tables),
  chair: F("chair", "Chair", "seating", 50, 50, 90, "soft", C.seating, { render2d: "chair", render3d: "chair" }),
  desk: F("desk", "Desk", "tables", 140, 70, 75, "rect", C.tables, { render2d: "desk", render3d: "desk" }),
  plant: F("plant", "Plant", "decor", 50, 50, 130, "round", C.decor, { render2d: "plant", render3d: "plant" }),
  rug: F("rug", "Rug", "decor", 280, 180, 1, "dashed", "#6b5f78", { render2d: "rug", render3d: "rug" }),
  toilet: F("toilet", "Toilet", "bathroom", 40, 70, 40, "round", C.bathroom, { render2d: "toilet", render3d: "toilet" }),
  sink: F("sink", "Sink", "bathroom", 60, 50, 85, "round", C.bathroom, { render2d: "sink", render3d: "sink" }),
  stove: F("stove", "Stove", "kitchen", 60, 60, 90, "rect", C.kitchen, { render2d: "stove", render3d: "stove" }),

  // ── seating ────────────────────────────────────────────────────────────────
  armchair: F("armchair", "Armchair", "seating", 80, 85, 80, "soft", C.seating, { render2d: "armchair", render3d: "armchair" }),
  sofa1: F("sofa1", "Loveseat", "seating", 150, 90, 80, "soft", C.seating, { render2d: "sofa", render3d: "sofa" }),
  sofa2: F("sofa2", "Sofa (2-seat)", "seating", 180, 90, 80, "soft", C.seating, { render2d: "sofa", render3d: "sofa" }),
  sofa3: F("sofa3", "Sofa (3-seat)", "seating", 220, 90, 80, "soft", C.seating, { render2d: "sofa", render3d: "sofa" }),
  sofaL: F("sofaL", "Sectional (L)", "seating", 260, 200, 80, "soft", C.seating, { render2d: "sofaL", render3d: "sofaL" }),
  recliner: F("recliner", "Recliner", "seating", 90, 95, 105, "soft", C.seating, { render2d: "armchair", render3d: "armchair" }),
  bench: F("bench", "Bench", "seating", 120, 40, 45, "rect", C.seating),
  dining_chair: F("dining_chair", "Dining Chair", "seating", 45, 50, 90, "soft", C.seating, { render2d: "chair", render3d: "chair" }),
  office_chair: F("office_chair", "Office Chair", "seating", 60, 60, 110, "round", C.seating, { render2d: "office_chair", render3d: "office_chair" }),
  bar_stool: F("bar_stool", "Bar Stool", "seating", 40, 40, 105, "round", C.seating, { render2d: "stool", render3d: "stool" }),
  stool: F("stool", "Stool", "seating", 40, 40, 45, "round", C.seating, { render2d: "stool", render3d: "stool" }),

  // ── tables ─────────────────────────────────────────────────────────────────
  dining4: F("dining4", "Dining (4)", "tables", 120, 80, 75, "rect", C.tables, { render2d: "dining", render3d: "dining" }),
  dining6: F("dining6", "Dining (6)", "tables", 180, 90, 75, "rect", C.tables, { render2d: "dining", render3d: "dining" }),
  dining8: F("dining8", "Dining (8)", "tables", 240, 100, 75, "rect", C.tables, { render2d: "dining", render3d: "dining" }),
  coffee_table: F("coffee_table", "Coffee Table", "tables", 110, 60, 40, "rect", C.tables, { render2d: "coffee_table", render3d: "coffee_table" }),
  side_table: F("side_table", "Side Table", "tables", 45, 45, 55, "round", C.tables),
  console: F("console", "Console", "tables", 120, 35, 80, "rect", C.tables),
  nightstand: F("nightstand", "Nightstand", "tables", 45, 40, 55, "rect", C.tables),

  // ── beds ─────────────────────────────────────────────────────────────────
  bed_single: F("bed_single", "Single Bed", "beds", 90, 200, 50, "soft", C.beds, { render2d: "bed", render3d: "bed" }),
  bed_double: F("bed_double", "Double Bed", "beds", 140, 200, 50, "soft", C.beds, { render2d: "bed", render3d: "bed" }),
  bed_queen: F("bed_queen", "Queen Bed", "beds", 160, 200, 50, "soft", C.beds, { render2d: "bed", render3d: "bed" }),
  bed_king: F("bed_king", "King Bed", "beds", 180, 200, 50, "soft", C.beds, { render2d: "bed", render3d: "bed" }),
  crib: F("crib", "Crib", "beds", 70, 130, 90, "soft", C.beds, { render2d: "bed", render3d: "bed" }),

  // ── storage ─────────────────────────────────────────────────────────────────
  wardrobe: F("wardrobe", "Wardrobe", "storage", 150, 60, 220, "rect", C.storage, { render2d: "wardrobe", render3d: "wardrobe" }),
  cabinet: F("cabinet", "Cabinet", "storage", 90, 45, 90, "rect", C.storage),
  bookshelf: F("bookshelf", "Bookshelf", "storage", 90, 30, 200, "rect", C.storage, { render2d: "bookshelf", render3d: "bookshelf" }),
  dresser: F("dresser", "Dresser", "storage", 120, 50, 80, "rect", C.storage),
  tv_unit: F("tv_unit", "TV Unit", "storage", 180, 45, 50, "rect", C.storage, { render2d: "tv_unit", render3d: "tv_unit" }),
  shoe_rack: F("shoe_rack", "Shoe Rack", "storage", 80, 30, 100, "rect", C.storage),
  pantry: F("pantry", "Pantry", "storage", 90, 60, 220, "rect", C.storage, { render2d: "wardrobe", render3d: "wardrobe" }),

  // ── kitchen ─────────────────────────────────────────────────────────────────
  kitchen_counter: F("kitchen_counter", "Counter", "kitchen", 60, 60, 90, "rect", C.kitchen, { render2d: "counter", render3d: "counter" }),
  kitchen_island: F("kitchen_island", "Island", "kitchen", 180, 90, 90, "rect", C.kitchen, { render2d: "counter", render3d: "counter" }),
  fridge: F("fridge", "Fridge", "kitchen", 70, 70, 180, "rect", C.kitchen, { render2d: "fridge", render3d: "fridge" }),
  oven: F("oven", "Oven", "kitchen", 60, 60, 90, "rect", C.kitchen, { render2d: "oven", render3d: "oven" }),
  kitchen_sink: F("kitchen_sink", "Kitchen Sink", "kitchen", 80, 60, 90, "round", C.kitchen, { render2d: "sink", render3d: "sink" }),
  dishwasher: F("dishwasher", "Dishwasher", "kitchen", 60, 60, 85, "rect", C.kitchen),
  range_hood: F("range_hood", "Range Hood", "kitchen", 90, 50, 40, "rect", C.kitchen),
  microwave: F("microwave", "Microwave", "kitchen", 50, 35, 30, "rect", C.kitchen),

  // ── bathroom ────────────────────────────────────────────────────────────────
  vanity_sink: F("vanity_sink", "Vanity Sink", "bathroom", 80, 50, 85, "round", C.bathroom, { render2d: "sink", render3d: "sink" }),
  bathtub: F("bathtub", "Bathtub", "bathroom", 170, 75, 55, "soft", C.bathroom, { render2d: "bathtub", render3d: "bathtub" }),
  shower: F("shower", "Shower", "bathroom", 90, 90, 200, "rect", C.bathroom, { render2d: "shower", render3d: "shower" }),
  bidet: F("bidet", "Bidet", "bathroom", 40, 60, 40, "round", C.bathroom, { render2d: "toilet", render3d: "toilet" }),
  washing_machine: F("washing_machine", "Washing Machine", "bathroom", 60, 60, 85, "rect", C.bathroom, { render2d: "washing_machine", render3d: "washing_machine" }),

  // ── appliances / decor ──────────────────────────────────────────────────────
  tv: F("tv", "TV", "appliances", 120, 10, 70, "rect", "#22252b", { render2d: "tv", render3d: "tv" }),
  piano: F("piano", "Piano", "decor", 150, 60, 120, "soft", "#2c2a2e", { render2d: "piano", render3d: "piano" }),
};

/** Ordered category list with display labels (palette order). */
export const FURNITURE_CATEGORIES: { id: FurnitureCategory; label: string }[] = [
  { id: "seating", label: "Seating" },
  { id: "tables", label: "Tables" },
  { id: "beds", label: "Beds" },
  { id: "storage", label: "Storage" },
  { id: "kitchen", label: "Kitchen" },
  { id: "bathroom", label: "Bathroom" },
  { id: "appliances", label: "Appliances" },
  { id: "decor", label: "Decor" },
];

/** Per-category default display order of kinds. */
export const FURNITURE_BY_CATEGORY: Record<FurnitureCategory, FurnitureKind[]> = {
  seating: ["armchair", "sofa1", "sofa2", "sofa3", "sofaL", "recliner", "bench", "dining_chair", "office_chair", "bar_stool", "stool"],
  tables: ["dining4", "dining6", "dining8", "coffee_table", "table", "side_table", "console", "desk", "nightstand"],
  beds: ["bed_single", "bed_double", "bed_queen", "bed_king", "bed", "crib"],
  storage: ["wardrobe", "cabinet", "bookshelf", "dresser", "tv_unit", "shoe_rack", "pantry"],
  kitchen: ["kitchen_counter", "kitchen_island", "fridge", "stove", "oven", "kitchen_sink", "dishwasher", "range_hood", "microwave"],
  bathroom: ["toilet", "sink", "vanity_sink", "bathtub", "shower", "bidet", "washing_machine"],
  appliances: ["tv"],
  decor: ["plant", "rug", "piano"],
};

/** Flat order across all categories (palette + back-compat for old consumers). */
export const FURNITURE_ORDER: FurnitureKind[] = FURNITURE_CATEGORIES.flatMap(
  (c) => FURNITURE_BY_CATEGORY[c.id]
);
