// ─────────────────────────────────────────────────────────────────────────────
// Reusable snap + alignment-guide math for the 2D canvas.
//
// World units are CENTIMETERS. These helpers are pure so they're easy to test
// and cheap to call on every pointer move.
// ─────────────────────────────────────────────────────────────────────────────

import type { Scene, Vec2, ID } from "./types";

/** A single alignment guide line (full extent drawn by the canvas). */
export interface AlignGuide {
  /** "v" = vertical guide (constant x); "h" = horizontal guide (constant y). */
  axis: "v" | "h";
  /** the world coordinate the guide sits on (x for "v", y for "h"). */
  coord: number;
  /** the reference world point that produced the guide (for drawing a tick). */
  ref: Vec2;
}

export interface AlignResult {
  /** point possibly snapped onto one/both guide axes. */
  point: Vec2;
  guides: AlignGuide[];
}

/**
 * Try to align `world.x` / `world.y` to an existing node coordinate within a
 * screen-pixel threshold. Returns the (possibly) snapped point + the guides to
 * draw. `excludeNodeId` skips a node being dragged. Cheap: linear over nodes.
 */
export function alignToNodes(
  world: Vec2,
  scene: Scene,
  opts: { zoom: number; thresholdPx?: number; excludeNodeId?: ID | null }
): AlignResult {
  const thr = (opts.thresholdPx ?? 8) / opts.zoom;
  let bestX: { coord: number; ref: Vec2; d: number } | null = null;
  let bestY: { coord: number; ref: Vec2; d: number } | null = null;

  for (const n of Object.values(scene.nodes)) {
    if (n.id === opts.excludeNodeId) continue;
    const dx = Math.abs(n.x - world.x);
    if (dx <= thr && (!bestX || dx < bestX.d)) bestX = { coord: n.x, ref: { x: n.x, y: n.y }, d: dx };
    const dy = Math.abs(n.y - world.y);
    if (dy <= thr && (!bestY || dy < bestY.d)) bestY = { coord: n.y, ref: { x: n.x, y: n.y }, d: dy };
  }

  const point = { ...world };
  const guides: AlignGuide[] = [];
  if (bestX) {
    point.x = bestX.coord;
    guides.push({ axis: "v", coord: bestX.coord, ref: bestX.ref });
  }
  if (bestY) {
    point.y = bestY.coord;
    guides.push({ axis: "h", coord: bestY.coord, ref: bestY.ref });
  }
  return { point, guides };
}

// ── precision wall input ──────────────────────────────────────────────────────

/**
 * Given an anchor + a current cursor direction, build the endpoint for a wall of
 * exact `length` (cm). If `angleDeg` is provided it overrides the cursor
 * direction (measured CCW-from-east in screen space, i.e. atan2(dy,dx) degrees).
 */
export function endpointFromLength(
  anchor: Vec2,
  cursor: Vec2,
  length: number,
  angleDeg?: number | null
): Vec2 {
  let ang: number;
  if (angleDeg != null && Number.isFinite(angleDeg)) {
    ang = (angleDeg * Math.PI) / 180;
  } else {
    const dx = cursor.x - anchor.x;
    const dy = cursor.y - anchor.y;
    if (Math.hypot(dx, dy) < 1e-6) {
      ang = 0; // degenerate: default east
    } else {
      ang = Math.atan2(dy, dx);
    }
  }
  return { x: anchor.x + Math.cos(ang) * length, y: anchor.y + Math.sin(ang) * length };
}

// ── marquee (rubber-band) hit tests ───────────────────────────────────────────

export interface Box {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

/** Normalize two world corners into an axis-aligned box. */
export function boxFrom(a: Vec2, b: Vec2): Box {
  return {
    minX: Math.min(a.x, b.x),
    minY: Math.min(a.y, b.y),
    maxX: Math.max(a.x, b.x),
    maxY: Math.max(a.y, b.y),
  };
}

export const pointInBox = (p: Vec2, box: Box): boolean =>
  p.x >= box.minX && p.x <= box.maxX && p.y >= box.minY && p.y <= box.maxY;

/** segment fully inside the box (both endpoints contained). */
export const segInBox = (a: Vec2, b: Vec2, box: Box): boolean => pointInBox(a, box) && pointInBox(b, box);
