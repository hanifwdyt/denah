// ─────────────────────────────────────────────────────────────────────────────
// CAD-quality vector export geometry.
//
// Shared model used by BOTH the SVG exporter and the scaled-PDF exporter.
// Everything here is in WORLD CENTIMETERS, y-down (matching the editor). We
// derive primitive draw lists (filled wall polygons, opening symbols, room
// labels, dimension strings) purely from the scene graph — never a screenshot.
// ─────────────────────────────────────────────────────────────────────────────

import type { Scene, Vec2, Opening } from "./types";
import { detectRooms, roomZoneType } from "./rooms";
import {
  arcPoints,
  arcLength,
  norm,
  perp,
  sub,
  lerp,
  fmtLen,
  fmtArea,
  type Units,
} from "./geometry";
import { ZONES } from "./zones";
import { roomSignature } from "./types";

// ── colour tokens (light "blueprint on paper" palette for print) ─────────────
export const INK = {
  wall: "#1d2430",
  wallLow: "#5a6472",
  rail: "#3a424f",
  open: "#9aa3b0",
  door: "#9a6a2c",
  window: "#3f6f86",
  dim: "#6a7280",
  room: "#1d2430",
  area: "#5a6472",
  zone: "#8a6a3c",
  sheet: "#ffffff",
  hairline: "#c8ccd4",
} as const;

// ── primitive draw lists ─────────────────────────────────────────────────────
export interface Poly {
  pts: Vec2[];
  fill?: string;
  stroke?: string;
  width?: number; // cm (world units)
  dash?: number[]; // cm
  closed?: boolean;
  cap?: "butt" | "round";
}
export interface TextItem {
  x: number;
  y: number;
  text: string;
  size: number; // cm
  fill: string;
  anchor?: "start" | "middle" | "end";
  weight?: number;
  mono?: boolean;
}
export interface Disc {
  x: number;
  y: number;
  r: number; // cm
  fill: string;
}

export interface PlanGeometry {
  /** world-space bounds of all drawn content */
  bounds: { minX: number; minY: number; maxX: number; maxY: number };
  fills: Poly[]; // room floor tints (drawn first)
  walls: Poly[]; // thick wall strokes / rails / open boundaries
  joints: Disc[]; // corner fill discs
  symbols: Poly[]; // opening jambs, door leaf/swing, window glazing
  dims: Poly[]; // dimension lines + ticks
  texts: TextItem[]; // room names, areas, dimension numbers, zone labels
}

const EMPTY_BOUNDS = { minX: 0, minY: 0, maxX: 0, maxY: 0 };

function unionBounds(scene: Scene): PlanGeometry["bounds"] {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  const acc = (x: number, y: number) => {
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
  };
  for (const n of Object.values(scene.nodes)) acc(n.x, n.y);
  for (const f of Object.values(scene.furniture)) {
    acc(f.x - f.w / 2, f.y - f.d / 2);
    acc(f.x + f.w / 2, f.y + f.d / 2);
  }
  for (const l of Object.values(scene.labels ?? {})) acc(l.x, l.y);
  if (!isFinite(minX)) return { ...EMPTY_BOUNDS };
  return { minX, minY, maxX, maxY };
}

const solidKind = (kind?: string) => (kind ?? "wall") === "wall" || kind === "low";

/**
 * Build the full vector primitive set for the 2D plan from a scene.
 * Pure: no DOM, no store access — caller supplies scene + units.
 */
export function buildPlanGeometry(scene: Scene, units: Units, roomNames: Record<string, string>): PlanGeometry {
  const fills: Poly[] = [];
  const walls: Poly[] = [];
  const joints: Disc[] = [];
  const symbols: Poly[] = [];
  const dims: Poly[] = [];
  const texts: TextItem[] = [];

  const rooms = detectRooms(scene);

  // 1. room floor tints + labels ----------------------------------------------
  for (const r of rooms) {
    const zt = roomZoneType(r.polygon, scene);
    const zspec = ZONES[zt];
    fills.push({ pts: r.polygon, closed: true, fill: zspec.fill2d });

    // room name = custom (by signature) else zone label (non-room only)
    const custom = roomNames[roomSignature(r.nodeIds)] || roomNames[r.id];
    const name = custom || (zt !== "room" ? zspec.label : "");
    if (name) {
      texts.push({
        x: r.centroid.x,
        y: r.centroid.y - 4,
        text: name.toUpperCase(),
        size: 11,
        fill: INK.room,
        anchor: "middle",
        weight: 600,
      });
    }
    texts.push({
      x: r.centroid.x,
      y: r.centroid.y + (name ? 16 : 6),
      text: fmtArea(r.area, units),
      size: 10,
      fill: INK.area,
      anchor: "middle",
      mono: true,
    });
  }

  // 2. joint discs (corner fill for solid walls) ------------------------------
  for (const n of Object.values(scene.nodes)) {
    const degEdges = Object.values(scene.edges).filter(
      (e) => (e.a === n.id || e.b === n.id) && solidKind(e.kind)
    );
    if (degEdges.length === 0) continue;
    const maxT = Math.max(
      ...degEdges.map((e) => ((e.kind ?? "wall") === "low" ? e.thickness * 0.7 : e.thickness))
    );
    joints.push({ x: n.x, y: n.y, r: maxT / 2, fill: INK.wall });
  }

  // 3. walls + openings -------------------------------------------------------
  for (const e of Object.values(scene.edges)) {
    const A = scene.nodes[e.a];
    const B = scene.nodes[e.b];
    if (!A || !B) continue;
    const L = arcLength(A, B, e.bulge);
    if (L < 1) continue;
    const ekind = e.kind ?? "wall";
    const curved = !!e.bulge;

    if (ekind === "open") {
      walls.push({
        pts: arcPoints(A, B, e.bulge),
        stroke: INK.open,
        width: 1.6,
        dash: [6, 10],
      });
      continue;
    }

    if (ekind === "railing") {
      const pts = arcPoints(A, B, e.bulge);
      walls.push({ pts, stroke: INK.rail, width: 3 });
      const count = Math.max(2, Math.round(L / 45) + 1);
      const dir0 = norm(sub(B, A));
      const nrm0 = perp(dir0);
      for (let p = 0; p < count; p++) {
        const t = p / (count - 1);
        const pt = lerp(A, B, t);
        symbols.push({
          pts: [
            { x: pt.x + nrm0.x * 5, y: pt.y + nrm0.y * 5 },
            { x: pt.x - nrm0.x * 5, y: pt.y - nrm0.y * 5 },
          ],
          stroke: INK.rail,
          width: 2,
        });
      }
      continue;
    }

    const isLow = ekind === "low";
    const drawThick = isLow ? e.thickness * 0.7 : e.thickness;
    const col = isLow ? INK.wallLow : INK.wall;

    // opening gaps along the wall (0..1 parametric)
    const ops = Object.values(scene.openings)
      .filter((o) => o.edgeId === e.id)
      .map((o) => ({ ...o, half: o.width / 2 / L }))
      .sort((a, b) => a.t - b.t);

    let cursor = 0;
    const solids: [number, number][] = [];
    for (const o of ops) {
      const s = Math.max(0, o.t - o.half);
      const en = Math.min(1, o.t + o.half);
      if (s > cursor) solids.push([cursor, s]);
      cursor = Math.max(cursor, en);
    }
    if (cursor < 1) solids.push([cursor, 1]);

    for (const [s, en] of solids) {
      const pts = curved ? arcPointsSub(A, B, e.bulge, s, en) : [paramPoint(A, B, s, curved, e.bulge), paramPoint(A, B, en, curved, e.bulge)];
      walls.push({ pts, stroke: col, width: drawThick, cap: "butt" });
    }

    // opening symbols (straight-wall accurate; curved approximated at chord)
    const dir = norm(sub(B, A));
    const nrm = perp(dir);
    for (const o of ops) {
      pushOpeningSymbol(symbols, o, A, B, e.thickness, dir, nrm, curved, e.bulge);
    }
  }

  // 4. dimension strings on solid walls ---------------------------------------
  for (const e of Object.values(scene.edges)) {
    if (!solidKind(e.kind)) continue;
    const A = scene.nodes[e.a];
    const B = scene.nodes[e.b];
    if (!A || !B) continue;
    const L = arcLength(A, B, e.bulge);
    if (L < 30) continue; // skip tiny stubs
    const dir = norm(sub(B, A));
    const nrm = perp(dir);
    const off = e.thickness / 2 + 16;
    const o = { x: nrm.x * off, y: nrm.y * off };
    const a2 = { x: A.x + o.x, y: A.y + o.y };
    const b2 = { x: B.x + o.x, y: B.y + o.y };
    // extension ticks
    dims.push({ pts: [{ x: A.x, y: A.y }, a2], stroke: INK.dim, width: 0.8 });
    dims.push({ pts: [{ x: B.x, y: B.y }, b2], stroke: INK.dim, width: 0.8 });
    // dimension line
    dims.push({ pts: [a2, b2], stroke: INK.dim, width: 0.8 });
    const mid = lerp(a2, b2, 0.5);
    let ang = (Math.atan2(b2.y - a2.y, b2.x - a2.x) * 180) / Math.PI;
    if (ang > 90 || ang < -90) ang += 180; // keep text upright
    texts.push({
      x: mid.x - nrm.x * 6,
      y: mid.y - nrm.y * 6,
      text: fmtLen(L, units),
      size: 8,
      fill: INK.dim,
      anchor: "middle",
      mono: true,
    });
  }

  // 5. free-text labels --------------------------------------------------------
  for (const l of Object.values(scene.labels ?? {})) {
    texts.push({ x: l.x, y: l.y, text: l.text, size: 12, fill: INK.room, anchor: "start", weight: 500 });
  }

  return { bounds: unionBounds(scene), fills, walls, joints, symbols, dims, texts };
}

// sub-sample a curved edge between two parametric positions
function arcPointsSub(a: Vec2, b: Vec2, bulge: number | undefined, s: number, e: number): Vec2[] {
  const full = arcPoints(a, b, bulge, 48);
  const out: Vec2[] = [];
  const n = full.length - 1;
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    if (t < s - 1e-6 || t > e + 1e-6) continue;
    out.push(full[i]);
  }
  // ensure endpoints land exactly
  out.unshift(paramPoint(a, b, s, true, bulge));
  out.push(paramPoint(a, b, e, true, bulge));
  return out;
}

function paramPoint(a: Vec2, b: Vec2, t: number, curved: boolean, bulge?: number): Vec2 {
  if (!curved) return lerp(a, b, t);
  const pts = arcPoints(a, b, bulge, 48);
  const idx = Math.max(0, Math.min(pts.length - 1, Math.round(t * (pts.length - 1))));
  return pts[idx];
}

function pushOpeningSymbol(
  out: Poly[],
  o: Opening,
  A: Vec2,
  B: Vec2,
  thickness: number,
  dir: Vec2,
  nrm: Vec2,
  curved: boolean,
  bulge?: number
) {
  const center = paramPoint(A, B, o.t, curved, bulge);
  const half = o.width / 2;
  const p1 = { x: center.x - dir.x * half, y: center.y - dir.y * half };
  const p2 = { x: center.x + dir.x * half, y: center.y + dir.y * half };
  const ht = thickness / 2;

  if (o.kind === "door") {
    // jambs
    out.push({ pts: [{ x: p1.x + nrm.x * ht, y: p1.y + nrm.y * ht }, { x: p1.x - nrm.x * ht, y: p1.y - nrm.y * ht }], stroke: INK.door, width: 1.4 });
    out.push({ pts: [{ x: p2.x + nrm.x * ht, y: p2.y + nrm.y * ht }, { x: p2.x - nrm.x * ht, y: p2.y - nrm.y * ht }], stroke: INK.door, width: 1.4 });
    // leaf
    const swing = { x: p1.x + nrm.x * o.width, y: p1.y + nrm.y * o.width };
    out.push({ pts: [p1, swing], stroke: INK.door, width: 1.6 });
    // quarter swing arc (p2 -> swing), tessellated
    const a0 = Math.atan2(p2.y - p1.y, p2.x - p1.x);
    const a1 = Math.atan2(swing.y - p1.y, swing.x - p1.x);
    let d = a1 - a0;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    const arc: Vec2[] = [];
    const segs = 12;
    for (let i = 0; i <= segs; i++) {
      const ang = a0 + d * (i / segs);
      arc.push({ x: p1.x + Math.cos(ang) * o.width, y: p1.y + Math.sin(ang) * o.width });
    }
    out.push({ pts: arc, stroke: INK.door, width: 1 });
  } else {
    // window: two glazing lines spanning the gap, offset to wall faces
    out.push({ pts: [{ x: p1.x + nrm.x * ht * 0.5, y: p1.y + nrm.y * ht * 0.5 }, { x: p2.x + nrm.x * ht * 0.5, y: p2.y + nrm.y * ht * 0.5 }], stroke: INK.window, width: 1.2 });
    out.push({ pts: [{ x: p1.x - nrm.x * ht * 0.5, y: p1.y - nrm.y * ht * 0.5 }, { x: p2.x - nrm.x * ht * 0.5, y: p2.y - nrm.y * ht * 0.5 }], stroke: INK.window, width: 1.2 });
    // jambs
    out.push({ pts: [{ x: p1.x + nrm.x * ht, y: p1.y + nrm.y * ht }, { x: p1.x - nrm.x * ht, y: p1.y - nrm.y * ht }], stroke: INK.window, width: 1.2 });
    out.push({ pts: [{ x: p2.x + nrm.x * ht, y: p2.y + nrm.y * ht }, { x: p2.x - nrm.x * ht, y: p2.y - nrm.y * ht }], stroke: INK.window, width: 1.2 });
  }
}

// ── SVG string builder ───────────────────────────────────────────────────────

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const fnum = (n: number) => (Math.abs(n) < 1e-4 ? "0" : n.toFixed(2));

function polyToSvg(p: Poly): string {
  const d = p.pts.map((pt, i) => `${i === 0 ? "M" : "L"}${fnum(pt.x)} ${fnum(pt.y)}`).join(" ") + (p.closed ? " Z" : "");
  const attrs: string[] = [`d="${d}"`];
  attrs.push(`fill="${p.fill ?? "none"}"`);
  if (p.stroke) {
    attrs.push(`stroke="${p.stroke}"`);
    attrs.push(`stroke-width="${fnum(p.width ?? 1)}"`);
    attrs.push(`stroke-linecap="${p.cap ?? "round"}"`);
    attrs.push(`stroke-linejoin="round"`);
    if (p.dash) attrs.push(`stroke-dasharray="${p.dash.map(fnum).join(",")}"`);
  }
  return `<path ${attrs.join(" ")}/>`;
}

function textToSvg(t: TextItem): string {
  const family = t.mono ? "Geist Mono, monospace" : "Hanken Grotesk, sans-serif";
  return (
    `<text x="${fnum(t.x)}" y="${fnum(t.y)}" font-size="${fnum(t.size)}" fill="${t.fill}" ` +
    `font-family="${family}" font-weight="${t.weight ?? 400}" ` +
    `text-anchor="${t.anchor ?? "start"}">${esc(t.text)}</text>`
  );
}

/** Render a full standalone SVG document string for the plan. */
export function planToSvgString(geo: PlanGeometry): string {
  const pad = 60; // cm margin
  const b = geo.bounds;
  const w = Math.max(1, b.maxX - b.minX) + pad * 2;
  const h = Math.max(1, b.maxY - b.minY) + pad * 2;
  const vbX = b.minX - pad;
  const vbY = b.minY - pad;

  const parts: string[] = [];
  parts.push(`<svg xmlns="http://www.w3.org/2000/svg" width="${fnum(w)}mm" height="${fnum(h)}mm" viewBox="${fnum(vbX)} ${fnum(vbY)} ${fnum(w)} ${fnum(h)}">`);
  parts.push(`<rect x="${fnum(vbX)}" y="${fnum(vbY)}" width="${fnum(w)}" height="${fnum(h)}" fill="${INK.sheet}"/>`);

  // draw order: fills → dims → walls → joints → symbols → texts
  for (const f of geo.fills) parts.push(polyToSvg(f));
  for (const d of geo.dims) parts.push(polyToSvg(d));
  for (const w2 of geo.walls) parts.push(polyToSvg(w2));
  for (const j of geo.joints) parts.push(`<circle cx="${fnum(j.x)}" cy="${fnum(j.y)}" r="${fnum(j.r)}" fill="${j.fill}"/>`);
  for (const s of geo.symbols) parts.push(polyToSvg(s));
  for (const t of geo.texts) parts.push(textToSvg(t));

  parts.push(`</svg>`);
  return parts.join("\n");
}
