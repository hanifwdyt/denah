import type { Scene, Room, ID, Vec2, ZoneType } from "./types";
import { pointInPolygon, dist } from "./geometry";

// ─────────────────────────────────────────────────────────────────────────────
// Room detection = enumerate the bounded faces of the planar graph.
//
// Half-edge face traversal: at each vertex we pick the "next" outgoing edge by
// turning as clockwise as possible relative to the incoming edge. Each closed
// traversal is a face; the single unbounded (outer) face is discarded by its
// winding sign.
// ─────────────────────────────────────────────────────────────────────────────

const key = (a: ID, b: ID) => `${a}>${b}`;

/** signed area via shoelace (world cm², y-down screen space) */
function signedArea(poly: Vec2[]): number {
  let s = 0;
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i];
    const q = poly[(i + 1) % poly.length];
    s += p.x * q.y - q.x * p.y;
  }
  return s / 2;
}

function centroidOf(poly: Vec2[]): Vec2 {
  let cx = 0;
  let cy = 0;
  let a = 0;
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i];
    const q = poly[(i + 1) % poly.length];
    const cross = p.x * q.y - q.x * p.y;
    cx += (p.x + q.x) * cross;
    cy += (p.y + q.y) * cross;
    a += cross;
  }
  a = a / 2;
  if (Math.abs(a) < 1e-6) {
    // fallback: average of points
    const avg = poly.reduce((acc, p) => ({ x: acc.x + p.x, y: acc.y + p.y }), { x: 0, y: 0 });
    return { x: avg.x / poly.length, y: avg.y / poly.length };
  }
  return { x: cx / (6 * a), y: cy / (6 * a) };
}

/**
 * Planarize: split every edge at any node that lies on its interior (T-junctions),
 * so adjacent rectangles that only partially share a wall still close cleanly.
 * Returns a de-duplicated list of node-id pairs.
 */
const ON_TOL = 1.5; // cm — node-on-span tolerance

function planarEdges(scene: Scene): [ID, ID][] {
  // Sort nodes by x once so each edge only scans the slice of nodes whose x
  // falls within the edge's x-extent (± tolerance), instead of all N nodes.
  // This turns the inner loop from O(N) into roughly O(nodes-near-this-edge).
  const nodeList = Object.values(scene.nodes).sort((a, b) => a.x - b.x);
  const xs = nodeList.map((n) => n.x);

  // binary search: first index with xs[i] >= target
  const lowerBound = (target: number): number => {
    let lo = 0;
    let hi = xs.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (xs[mid] < target) lo = mid + 1;
      else hi = mid;
    }
    return lo;
  };

  const out: [ID, ID][] = [];
  const seen = new Set<string>();
  const push = (a: ID, b: ID) => {
    if (a === b) return;
    const key = a < b ? `${a}|${b}` : `${b}|${a}`;
    if (seen.has(key)) return;
    seen.add(key);
    out.push([a, b]);
  };

  for (const e of Object.values(scene.edges)) {
    const A = scene.nodes[e.a];
    const B = scene.nodes[e.b];
    if (!A || !B) continue;
    const abx = B.x - A.x;
    const aby = B.y - A.y;
    const l2 = abx * abx + aby * aby || 1;

    // x-range of this edge's bounding box, padded by tolerance
    const minX = Math.min(A.x, B.x) - ON_TOL;
    const maxX = Math.max(A.x, B.x) + ON_TOL;
    const minY = Math.min(A.y, B.y) - ON_TOL;
    const maxY = Math.max(A.y, B.y) + ON_TOL;

    const on: { id: ID; t: number }[] = [];
    for (let i = lowerBound(minX); i < nodeList.length; i++) {
      const n = nodeList[i];
      if (n.x > maxX) break; // sorted by x — past the box, done
      if (n.y < minY || n.y > maxY) continue; // outside the box's y-extent
      if (n.id === e.a || n.id === e.b) continue;
      const t = ((n.x - A.x) * abx + (n.y - A.y) * aby) / l2;
      if (t <= 1e-4 || t >= 1 - 1e-4) continue;
      const proj = { x: A.x + abx * t, y: A.y + aby * t };
      if (dist(n, proj) < ON_TOL) on.push({ id: n.id, t }); // within tol of the line
    }
    on.sort((p, q) => p.t - q.t);
    let prev = e.a;
    for (const o of on) {
      push(prev, o.id);
      prev = o.id;
    }
    push(prev, e.b);
  }
  return out;
}

export function detectRooms(scene: Scene): Room[] {
  // adjacency over the planarized graph (handles T-junctions)
  const pedges = planarEdges(scene);
  const adj = new Map<ID, ID[]>();
  for (const n of Object.keys(scene.nodes)) adj.set(n, []);
  for (const [a, b] of pedges) {
    adj.get(a)?.push(b);
    adj.get(b)?.push(a);
  }

  const angleAt = (from: ID, to: ID): number => {
    const a = scene.nodes[from];
    const b = scene.nodes[to];
    return Math.atan2(b.y - a.y, b.x - a.x);
  };

  // For traversal we need, given we arrived at `v` from `u`, the next neighbor:
  // the edge immediately clockwise from the reverse direction (v -> u).
  const nextEdge = (u: ID, v: ID): ID | null => {
    const neighbors = adj.get(v);
    if (!neighbors || neighbors.length === 0) return null;
    const back = angleAt(v, u); // direction from v back to u
    let bestW: ID | null = null;
    let bestDelta = Infinity;
    for (const w of neighbors) {
      const aw = angleAt(v, w);
      // clockwise angular distance from `back` to `aw` in (0, 2π]
      let delta = back - aw;
      while (delta <= 1e-9) delta += Math.PI * 2;
      if (delta < bestDelta) {
        bestDelta = delta;
        bestW = w;
      }
    }
    return bestW;
  };

  const visited = new Set<string>();
  const rooms: Room[] = [];

  for (const [a, b] of pedges) {
    for (const [u0, v0] of [
      [a, b],
      [b, a],
    ] as [ID, ID][]) {
      if (visited.has(key(u0, v0))) continue;
      // trace a face
      const loop: ID[] = [];
      let u = u0;
      let v = v0;
      let guard = 0;
      let ok = true;
      while (guard++ < 10000) {
        visited.add(key(u, v));
        loop.push(u);
        const w = nextEdge(u, v);
        if (w == null) {
          ok = false;
          break;
        }
        u = v;
        v = w;
        if (u === u0 && v === v0) break;
      }
      if (!ok || loop.length < 3) continue;

      const poly = loop.map((id) => ({ x: scene.nodes[id].x, y: scene.nodes[id].y }));
      const area = signedArea(poly);
      // In y-down space with the clockwise-turn rule, bounded interior faces wind
      // POSITIVE; the single unbounded outer face winds negative — drop it.
      if (area <= 1) continue;

      const areaM2 = Math.abs(area) / 10000; // cm² → m²
      if (areaM2 < 0.05) continue;

      const sorted = [...loop].sort();
      rooms.push({
        id: sorted.join("-"),
        nodeIds: loop,
        polygon: poly,
        area: areaM2,
        centroid: centroidOf(poly),
      });
    }
  }

  // de-dup faces that share the same node set
  const seen = new Set<string>();
  return rooms.filter((r) => {
    if (seen.has(r.id)) return false;
    seen.add(r.id);
    return true;
  });
}

/** the zone type of a room = the type of the zone marker inside it (else "room") */
export function roomZoneType(polygon: Vec2[], scene: Scene): ZoneType {
  for (const z of Object.values(scene.zones || {})) {
    if (pointInPolygon({ x: z.x, y: z.y }, polygon)) return z.type;
  }
  return "room";
}
