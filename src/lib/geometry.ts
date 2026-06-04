import type { Vec2, Scene, Node, ID } from "./types";

// ── vector math ─────────────────────────────────────────────────────────────
export const v = (x: number, y: number): Vec2 => ({ x, y });
export const add = (a: Vec2, b: Vec2): Vec2 => ({ x: a.x + b.x, y: a.y + b.y });
export const sub = (a: Vec2, b: Vec2): Vec2 => ({ x: a.x - b.x, y: a.y - b.y });
export const scale = (a: Vec2, s: number): Vec2 => ({ x: a.x * s, y: a.y * s });
export const dot = (a: Vec2, b: Vec2): number => a.x * b.x + a.y * b.y;
export const len = (a: Vec2): number => Math.hypot(a.x, a.y);
export const dist = (a: Vec2, b: Vec2): number => Math.hypot(a.x - b.x, a.y - b.y);
export const norm = (a: Vec2): Vec2 => {
  const l = len(a) || 1;
  return { x: a.x / l, y: a.y / l };
};
/** unit perpendicular (rotate +90°) */
export const perp = (a: Vec2): Vec2 => ({ x: -a.y, y: a.x });
export const angle = (a: Vec2, b: Vec2): number => Math.atan2(b.y - a.y, b.x - a.x);
export const lerp = (a: Vec2, b: Vec2, t: number): Vec2 => ({
  x: a.x + (b.x - a.x) * t,
  y: a.y + (b.y - a.y) * t,
});

// ── viewport transform ──────────────────────────────────────────────────────
// stage stores pan (offset in screen px) + zoom. Konva applies these to the
// stage, but we need the same math for snapping in world space.
export interface Viewport {
  panX: number;
  panY: number;
  zoom: number;
}

export const screenToWorld = (p: Vec2, vp: Viewport): Vec2 => ({
  x: (p.x - vp.panX) / vp.zoom,
  y: (p.y - vp.panY) / vp.zoom,
});

export const worldToScreen = (p: Vec2, vp: Viewport): Vec2 => ({
  x: p.x * vp.zoom + vp.panX,
  y: p.y * vp.zoom + vp.panY,
});

// ── snapping ────────────────────────────────────────────────────────────────
export interface SnapResult {
  point: Vec2;
  snappedNodeId?: ID;
  kind: "node" | "ortho" | "grid" | "free";
}

const snapToGrid = (p: Vec2, grid: number): Vec2 => ({
  x: Math.round(p.x / grid) * grid,
  y: Math.round(p.y / grid) * grid,
});

/** lock a point to ortho/45° relative to an anchor */
const snapOrtho = (anchor: Vec2, p: Vec2): Vec2 => {
  const d = sub(p, anchor);
  const a = Math.atan2(d.y, d.x);
  const step = Math.PI / 4; // 45°
  const snapped = Math.round(a / step) * step;
  const l = len(d);
  return { x: anchor.x + Math.cos(snapped) * l, y: anchor.y + Math.sin(snapped) * l };
};

/**
 * Resolve the cursor world position into a meaningful point.
 * Priority: existing node (within screen radius) > ortho (if anchored + shift) > grid.
 */
export function snap(
  world: Vec2,
  scene: Scene,
  opts: {
    grid: number;
    zoom: number;
    nodeRadiusPx?: number;
    anchor?: Vec2 | null;
    ortho?: boolean;
    excludeNodeId?: ID | null;
  }
): SnapResult {
  const radiusWorld = (opts.nodeRadiusPx ?? 12) / opts.zoom;

  // 1. node snap
  let best: { node: Node; d: number } | null = null;
  for (const n of Object.values(scene.nodes)) {
    if (n.id === opts.excludeNodeId) continue;
    const d = dist(world, n);
    if (d <= radiusWorld && (!best || d < best.d)) best = { node: n, d };
  }
  if (best) {
    return { point: { x: best.node.x, y: best.node.y }, snappedNodeId: best.node.id, kind: "node" };
  }

  // 2. ortho relative to anchor
  if (opts.anchor && opts.ortho) {
    const o = snapOrtho(opts.anchor, world);
    return { point: snapToGrid(o, opts.grid), kind: "ortho" };
  }

  // 3. grid
  return { point: snapToGrid(world, opts.grid), kind: "grid" };
}

// ── point-to-segment (for opening placement + hit testing) ──────────────────
export interface ProjectResult {
  point: Vec2;
  t: number; // 0..1 along segment
  distance: number;
}

export function projectOnSegment(p: Vec2, a: Vec2, b: Vec2): ProjectResult {
  const ab = sub(b, a);
  const l2 = dot(ab, ab) || 1;
  let t = dot(sub(p, a), ab) / l2;
  t = Math.max(0, Math.min(1, t));
  const point = { x: a.x + ab.x * t, y: a.y + ab.y * t };
  return { point, t, distance: dist(p, point) };
}

/** find the closest edge to a world point, within a screen-pixel threshold */
export function pickEdge(
  world: Vec2,
  scene: Scene,
  zoom: number,
  thresholdPx = 10
): { edgeId: ID; t: number; point: Vec2 } | null {
  const thr = thresholdPx / zoom;
  let best: { edgeId: ID; t: number; point: Vec2; d: number } | null = null;
  for (const e of Object.values(scene.edges)) {
    const a = scene.nodes[e.a];
    const b = scene.nodes[e.b];
    if (!a || !b) continue;
    const half = (e.thickness / 2) / 1; // include wall thickness in tolerance
    const pr = projectOnSegment(world, a, b);
    if (pr.distance <= thr + half && (!best || pr.distance < best.d)) {
      best = { edgeId: e.id, t: pr.t, point: pr.point, d: pr.distance };
    }
  }
  return best ? { edgeId: best.edgeId, t: best.t, point: best.point } : null;
}

/** ray-casting point-in-polygon test */
export function pointInPolygon(p: Vec2, poly: Vec2[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i];
    const b = poly[j];
    const intersect = a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x;
    if (intersect) inside = !inside;
  }
  return inside;
}

// ── formatting ──────────────────────────────────────────────────────────────
export type Units = "metric" | "imperial";

const CM_PER_IN = 2.54;
const CM_PER_FT = 30.48;
const SQFT_PER_SQM = 10.7639;

/**
 * cm → human readable length. Defaults to metric so existing 1-arg calls work.
 * imperial: feet'inches" (e.g. `8' 6"`); under a foot shows just inches.
 */
export const fmtLen = (cm: number, units: Units = "metric"): string => {
  if (units === "imperial") {
    const totalIn = cm / CM_PER_IN;
    const ft = Math.floor(totalIn / 12);
    const inch = Math.round(totalIn - ft * 12);
    // handle rounding 12" up to next foot
    const ft2 = inch === 12 ? ft + 1 : ft;
    const inch2 = inch === 12 ? 0 : inch;
    if (ft2 === 0) return `${inch2}"`;
    return inch2 === 0 ? `${ft2}'` : `${ft2}' ${inch2}"`;
  }
  if (cm < 100) return `${Math.round(cm)} cm`;
  return `${(cm / 100).toFixed(2)} m`;
};

/** m² → human readable area. Defaults to metric. imperial = sq ft. */
export const fmtArea = (m2: number, units: Units = "metric"): string => {
  if (units === "imperial") return `${(m2 * SQFT_PER_SQM).toFixed(1)} ft²`;
  return `${m2.toFixed(1)} m²`;
};

// ── curved walls (arc geometry) ──────────────────────────────────────────────
// `bulge` is the signed sagitta ratio: sagitta s = |bulge| * chord/2, on the
// side given by bulge's sign. bulge === 0 (or undefined) is a straight segment.

interface ArcGeom {
  center: Vec2;
  radius: number;
  a0: number; // start angle
  a1: number; // end angle (sweep from a0 toward a1)
  cw: boolean;
}

/** Resolve the circle for an arc through a→b with the given bulge. null if straight. */
function arcGeom(a: Vec2, b: Vec2, bulge: number): ArcGeom | null {
  if (!bulge) return null;
  const chord = dist(a, b);
  if (chord < 1e-6) return null;
  const sagitta = Math.abs(bulge) * (chord / 2);
  if (sagitta < 1e-6) return null;
  // radius from sagitta + half-chord
  const h = chord / 2;
  const radius = (h * h + sagitta * sagitta) / (2 * sagitta);
  const mid = lerp(a, b, 0.5);
  // perpendicular direction (sign of bulge chooses side)
  const dir = norm(sub(b, a));
  const n = { x: -dir.y, y: dir.x };
  const sign = Math.sign(bulge);
  // distance from midpoint to center along -n*sign
  const d = radius - sagitta;
  const center = { x: mid.x - n.x * sign * d, y: mid.y - n.y * sign * d };
  const a0 = Math.atan2(a.y - center.y, a.x - center.x);
  const a1 = Math.atan2(b.y - center.y, b.x - center.x);
  return { center, radius, a0, a1, cw: sign < 0 };
}

function normalizeSweep(a0: number, a1: number, cw: boolean): number {
  let d = a1 - a0;
  if (cw) {
    while (d > 0) d -= Math.PI * 2;
    while (d <= -Math.PI * 2) d += Math.PI * 2;
  } else {
    while (d < 0) d += Math.PI * 2;
    while (d >= Math.PI * 2) d -= Math.PI * 2;
  }
  return d;
}

/**
 * Sample points along the edge a→b. Straight (bulge 0/undefined) returns [a, b].
 * `segments` controls tessellation density for curves (default 24).
 */
export function arcPoints(a: Vec2, b: Vec2, bulge?: number, segments = 24): Vec2[] {
  const g = arcGeom(a, b, bulge ?? 0);
  if (!g) return [a, b];
  const sweep = normalizeSweep(g.a0, g.a1, g.cw);
  const pts: Vec2[] = [];
  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    const ang = g.a0 + sweep * t;
    pts.push({ x: g.center.x + Math.cos(ang) * g.radius, y: g.center.y + Math.sin(ang) * g.radius });
  }
  return pts;
}

/** Arc length of edge a→b. Straight returns the chord length. */
export function arcLength(a: Vec2, b: Vec2, bulge?: number): number {
  const g = arcGeom(a, b, bulge ?? 0);
  if (!g) return dist(a, b);
  return Math.abs(normalizeSweep(g.a0, g.a1, g.cw)) * g.radius;
}

/**
 * Project point p onto edge a→b. Returns the closest point, parametric t (0..1
 * along the arc/chord from a to b), and distance. Straight falls back to the
 * segment projection.
 */
export function projectOnArc(
  p: Vec2,
  a: Vec2,
  b: Vec2,
  bulge?: number
): { point: Vec2; t: number; distance: number } {
  const g = arcGeom(a, b, bulge ?? 0);
  if (!g) {
    const r = projectOnSegment(p, a, b);
    return { point: r.point, t: r.t, distance: r.distance };
  }
  const sweep = normalizeSweep(g.a0, g.a1, g.cw);
  let ang = Math.atan2(p.y - g.center.y, p.x - g.center.x);
  // bring ang into [a0, a0+sweep] domain via fractional t along sweep
  let t = sweep === 0 ? 0 : (ang - g.a0) / sweep;
  // wrap t into 0..1 by trying nearest period
  if (t < 0 || t > 1) {
    // adjust ang by ±2π to land in range when possible
    const cand = [ang, ang + Math.PI * 2, ang - Math.PI * 2];
    let bestT = Math.max(0, Math.min(1, t));
    for (const c of cand) {
      const tc = sweep === 0 ? 0 : (c - g.a0) / sweep;
      if (tc >= 0 && tc <= 1) {
        bestT = tc;
        break;
      }
    }
    t = bestT;
  }
  t = Math.max(0, Math.min(1, t));
  ang = g.a0 + sweep * t;
  const point = { x: g.center.x + Math.cos(ang) * g.radius, y: g.center.y + Math.sin(ang) * g.radius };
  return { point, t, distance: dist(p, point) };
}
