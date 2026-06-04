// ─────────────────────────────────────────────────────────────────────────────
// Pure scene validation. Fast, no allocations beyond the result list.
// validateScene(scene) => Issue[]  (warnings + errors with optional location).
// ─────────────────────────────────────────────────────────────────────────────

import type { Scene, Vec2 } from "./types";
import { dist, projectOnSegment } from "./geometry";
import { detectRooms } from "./rooms";

export type Severity = "warn" | "error";

export interface ValidationIssue {
  id: string;
  severity: Severity;
  message: string;
  /** world-space anchor for an on-canvas marker (optional). */
  at?: { x: number; y: number };
}

const MIN_WALL_CM = 5; // shorter than this is almost certainly a mistake
const SHORT_WALL_CM = 30; // warn under 30 cm
const MIN_ROOM_M2 = 0.25; // near-zero area
const TOUCH_CM = 1.5; // node touching a non-incident edge

const mid = (a: Vec2, b: Vec2): Vec2 => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });

/** Validate a scene, returning a flat list of issues. Keep this cheap. */
export function validateScene(scene: Scene): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const nodes = scene.nodes;
  const edges = Object.values(scene.edges);

  // ── walls: zero / short length, dangling endpoints ──────────────────────
  const degree: Record<string, number> = {};
  const seenPairs = new Map<string, string>(); // "a|b" sorted -> edgeId

  for (const e of edges) {
    const a = nodes[e.a];
    const b = nodes[e.b];
    if (!a || !b) {
      issues.push({ id: `edge-orphan-${e.id}`, severity: "error", message: "Wall references a missing node." });
      continue;
    }
    degree[e.a] = (degree[e.a] ?? 0) + 1;
    degree[e.b] = (degree[e.b] ?? 0) + 1;

    const L = dist(a, b);
    if (L < MIN_WALL_CM) {
      issues.push({
        id: `edge-zero-${e.id}`,
        severity: "error",
        message: `Wall is effectively zero-length (${L.toFixed(1)} cm).`,
        at: mid(a, b),
      });
    } else if (L < SHORT_WALL_CM) {
      issues.push({
        id: `edge-short-${e.id}`,
        severity: "warn",
        message: `Very short wall (${Math.round(L)} cm).`,
        at: mid(a, b),
      });
    }

    // duplicate / overlapping edge between same node pair
    const key = e.a < e.b ? `${e.a}|${e.b}` : `${e.b}|${e.a}`;
    if (seenPairs.has(key)) {
      issues.push({
        id: `edge-dup-${e.id}`,
        severity: "warn",
        message: "Duplicate wall between the same two corners.",
        at: mid(a, b),
      });
    } else {
      seenPairs.set(key, e.id);
    }
  }

  // ── dangling nodes (referenced by 0 or 1 edges) ─────────────────────────
  for (const n of Object.values(nodes)) {
    const d = degree[n.id] ?? 0;
    if (d === 0) {
      issues.push({
        id: `node-isolated-${n.id}`,
        severity: "warn",
        message: "Corner is not connected to any wall.",
        at: { x: n.x, y: n.y },
      });
    } else if (d === 1) {
      issues.push({
        id: `node-dangling-${n.id}`,
        severity: "warn",
        message: "Dangling wall end (corner used by only one wall).",
        at: { x: n.x, y: n.y },
      });
    }
  }

  // ── self-touching: a node sitting on an edge it isn't an endpoint of ────
  for (const e of edges) {
    const a = nodes[e.a];
    const b = nodes[e.b];
    if (!a || !b) continue;
    if (dist(a, b) < MIN_WALL_CM) continue;
    for (const n of Object.values(nodes)) {
      if (n.id === e.a || n.id === e.b) continue;
      const pr = projectOnSegment(n, a, b);
      if (pr.t > 0.001 && pr.t < 0.999 && pr.distance < TOUCH_CM) {
        issues.push({
          id: `touch-${e.id}-${n.id}`,
          severity: "warn",
          message: "Corner touches a wall mid-span (consider splitting the wall).",
          at: { x: n.x, y: n.y },
        });
      }
    }
  }

  // ── near-zero-area rooms ────────────────────────────────────────────────
  try {
    for (const r of detectRooms(scene)) {
      if (r.area < MIN_ROOM_M2) {
        issues.push({
          id: `room-tiny-${r.id}`,
          severity: "warn",
          message: `Room has a near-zero area (${r.area.toFixed(2)} m²).`,
          at: r.centroid,
        });
      }
    }
  } catch {
    /* room detection is best-effort here */
  }

  return issues;
}
