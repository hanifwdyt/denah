#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────────
// denah-mcp — a Model Context Protocol bridge for the DENAH floor-plan editor.
//
//   Claude Code  ──stdio──>  this server  ──WebSocket(5181)──>  browser app
//
// Tools mutate an in-memory scene (cm units, same shape as the app) and the
// change is broadcast live to any connected browser. The browser can also push
// its own edits back so `get_plan` stays in sync.
//
// IMPORTANT: stdout is reserved for the MCP protocol. All logs go to stderr.
// ─────────────────────────────────────────────────────────────────────────────
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { WebSocketServer } from "ws";
import { z } from "zod";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const WS_PORT = Number(process.env.DENAH_WS_PORT || 5181);
const log = (...a) => console.error("[denah-mcp]", ...a);

// ── persistence ──────────────────────────────────────────────────────────────
// The in-memory scene is mirrored to a JSON file on disk on every change and
// loaded on boot, so Claude's work survives server restarts. Override the path
// with DENAH_STATE_FILE.
const __dirname = dirname(fileURLToPath(import.meta.url));
const STATE_FILE = process.env.DENAH_STATE_FILE || join(__dirname, ".denah-state.json");

// ── scene state ──────────────────────────────────────────────────────────────
const emptyScene = () => ({ nodes: {}, edges: {}, openings: {}, furniture: {}, zones: {}, roomNames: {}, labels: {} });
const ZONE_TYPES = ["room", "terrace", "garden", "bathroom", "kitchen", "garage", "water"];
const EDGE_KINDS = ["wall", "low", "railing", "open"];
const OPENING_KINDS = ["door", "window"];
let scene = emptyScene();
let seq = 0;
const uid = (p) => `${p}_${(seq++).toString(36)}`;

// ── undo history (in-memory snapshots of the scene) ──────────────────────────
const UNDO_LIMIT = 50;
let undoStack = [];
function snapshot() {
  undoStack.push(JSON.stringify(scene));
  if (undoStack.length > UNDO_LIMIT) undoStack.shift();
}

// Persist to disk. Cheap JSON dump; called after every mutation.
function persist() {
  try {
    writeFileSync(STATE_FILE, JSON.stringify({ scene, seq }), "utf8");
  } catch (e) {
    log(`could not persist state to ${STATE_FILE}: ${e.message}`);
  }
}

// Load persisted scene on boot.
function loadPersisted() {
  try {
    const raw = readFileSync(STATE_FILE, "utf8");
    const data = JSON.parse(raw);
    if (data && data.scene && data.scene.nodes) {
      scene = normalizeScene(data.scene);
      if (typeof data.seq === "number") seq = data.seq;
      log(`loaded persisted scene from ${STATE_FILE} (seq=${seq})`);
      return true;
    }
  } catch (e) {
    if (e.code !== "ENOENT") log(`could not load persisted state: ${e.message}`);
  }
  return false;
}

// Wrap a mutation: snapshot for undo → run → persist → broadcast.
function commit() {
  persist();
  broadcast();
}

// Mirror of src/lib/furniture.ts — realistic cm sizes (w×d×height). Kept in
// sync with the FurnitureKind union from the contract so Claude can place the
// full expanded catalog. Arbitrary per-instance w/d/height overrides allowed.
const FURNITURE = {
  // ── legacy kinds ──
  sofa: { w: 220, d: 90, height: 80 },
  bed: { w: 160, d: 200, height: 50 },
  table: { w: 120, d: 80, height: 75 },
  chair: { w: 50, d: 50, height: 90 },
  desk: { w: 140, d: 70, height: 75 },
  plant: { w: 50, d: 50, height: 130 },
  rug: { w: 280, d: 180, height: 1 },
  toilet: { w: 40, d: 70, height: 40 },
  sink: { w: 60, d: 50, height: 85 },
  stove: { w: 60, d: 60, height: 90 },
  // ── seating ──
  armchair: { w: 80, d: 85, height: 80 },
  sofa1: { w: 150, d: 90, height: 80 },
  sofa2: { w: 180, d: 90, height: 80 },
  sofa3: { w: 220, d: 90, height: 80 },
  sofaL: { w: 260, d: 200, height: 80 },
  recliner: { w: 90, d: 95, height: 105 },
  bench: { w: 120, d: 40, height: 45 },
  dining_chair: { w: 45, d: 50, height: 90 },
  office_chair: { w: 60, d: 60, height: 110 },
  bar_stool: { w: 40, d: 40, height: 105 },
  stool: { w: 40, d: 40, height: 45 },
  // ── tables ──
  dining4: { w: 120, d: 80, height: 75 },
  dining6: { w: 180, d: 90, height: 75 },
  dining8: { w: 240, d: 100, height: 75 },
  coffee_table: { w: 110, d: 60, height: 40 },
  side_table: { w: 45, d: 45, height: 55 },
  console: { w: 120, d: 35, height: 80 },
  nightstand: { w: 45, d: 40, height: 55 },
  // ── beds ──
  bed_single: { w: 90, d: 200, height: 50 },
  bed_double: { w: 140, d: 200, height: 50 },
  bed_queen: { w: 160, d: 200, height: 50 },
  bed_king: { w: 180, d: 200, height: 50 },
  crib: { w: 70, d: 130, height: 90 },
  // ── storage ──
  wardrobe: { w: 150, d: 60, height: 220 },
  cabinet: { w: 90, d: 45, height: 90 },
  bookshelf: { w: 90, d: 30, height: 200 },
  dresser: { w: 120, d: 50, height: 80 },
  tv_unit: { w: 180, d: 45, height: 50 },
  shoe_rack: { w: 80, d: 30, height: 100 },
  pantry: { w: 90, d: 60, height: 220 },
  // ── kitchen ──
  kitchen_counter: { w: 60, d: 60, height: 90 },
  kitchen_island: { w: 180, d: 90, height: 90 },
  fridge: { w: 70, d: 70, height: 180 },
  oven: { w: 60, d: 60, height: 90 },
  kitchen_sink: { w: 80, d: 60, height: 90 },
  dishwasher: { w: 60, d: 60, height: 85 },
  range_hood: { w: 90, d: 50, height: 40 },
  microwave: { w: 50, d: 35, height: 30 },
  // ── bathroom ──
  vanity_sink: { w: 80, d: 50, height: 85 },
  bathtub: { w: 170, d: 75, height: 55 },
  shower: { w: 90, d: 90, height: 200 },
  bidet: { w: 40, d: 60, height: 40 },
  washing_machine: { w: 60, d: 60, height: 85 },
  // ── appliances / decor ──
  tv: { w: 120, d: 10, height: 70 },
  piano: { w: 150, d: 60, height: 120 },
};
const KINDS = Object.keys(FURNITURE);

// Mirror of src/lib/openings.ts door/window catalogs (cm). Used to set sensible
// default sizes + opening.subtype when Claude places a typed door/window.
const DOOR_TYPES = {
  single: { width: 90, height: 210, leafCount: 1 },
  double: { width: 150, height: 210, leafCount: 2 },
  sliding: { width: 160, height: 210, leafCount: 1 },
  sliding_double: { width: 240, height: 210, leafCount: 2 },
  folding: { width: 180, height: 210, leafCount: 4 },
  pocket: { width: 90, height: 210, leafCount: 1 },
  garage: { width: 250, height: 220, leafCount: 1 },
};
const DOOR_SUBTYPES = Object.keys(DOOR_TYPES);
const WINDOW_TYPES = {
  casement: { width: 120, height: 120, sill: 90, leafCount: 1 },
  fixed: { width: 150, height: 120, sill: 90, leafCount: 1 },
  sliding: { width: 180, height: 120, sill: 90, leafCount: 2 },
  double_hung: { width: 90, height: 150, sill: 90, leafCount: 2 },
  awning: { width: 100, height: 60, sill: 150, leafCount: 1 },
  bay: { width: 240, height: 140, sill: 45, leafCount: 3 },
  louvre: { width: 90, height: 120, sill: 90, leafCount: 1 },
};
const WINDOW_SUBTYPES = Object.keys(WINDOW_TYPES);

const DEF = { thickness: 15, height: 270, door: 90, doorH: 210, win: 120, winH: 120, sill: 90 };

// ── geometry helpers ─────────────────────────────────────────────────────────
const round = (n) => Math.round(n);
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

function ensureNode(x, y) {
  x = round(x);
  y = round(y);
  for (const n of Object.values(scene.nodes)) {
    if (Math.abs(n.x - x) < 2 && Math.abs(n.y - y) < 2) return n.id;
  }
  const id = uid("n");
  scene.nodes[id] = { id, x, y };
  return id;
}

function ensureEdge(aId, bId, kind = "wall") {
  if (aId === bId) return null;
  for (const e of Object.values(scene.edges)) {
    if ((e.a === aId && e.b === bId) || (e.a === bId && e.b === aId)) {
      if (kind && kind !== "wall") e.kind = kind;
      return e.id;
    }
  }
  const id = uid("e");
  scene.edges[id] = { id, a: aId, b: bId, thickness: DEF.thickness, height: DEF.height, kind };
  return id;
}

function projectOnSegment(p, a, b) {
  const abx = b.x - a.x;
  const aby = b.y - a.y;
  const l2 = abx * abx + aby * aby || 1;
  let t = ((p.x - a.x) * abx + (p.y - a.y) * aby) / l2;
  t = Math.max(0, Math.min(1, t));
  const point = { x: a.x + abx * t, y: a.y + aby * t };
  return { t, point, distance: dist(p, point) };
}

function nearestEdge(p, thresholdCm = 80) {
  let best = null;
  for (const e of Object.values(scene.edges)) {
    const a = scene.nodes[e.a];
    const b = scene.nodes[e.b];
    if (!a || !b) continue;
    const pr = projectOnSegment(p, a, b);
    if (pr.distance <= thresholdCm + e.thickness / 2 && (!best || pr.distance < best.distance)) {
      best = { edgeId: e.id, t: pr.t, distance: pr.distance };
    }
  }
  return best;
}

// split edges at interior nodes (T-junctions) → de-duped node-id pairs
function planarEdges() {
  const nodeList = Object.values(scene.nodes);
  const out = [];
  const seen = new Set();
  const push = (a, b) => {
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
    const abx = B.x - A.x, aby = B.y - A.y;
    const l2 = abx * abx + aby * aby || 1;
    const on = [];
    for (const n of nodeList) {
      if (n.id === e.a || n.id === e.b) continue;
      const t = ((n.x - A.x) * abx + (n.y - A.y) * aby) / l2;
      if (t <= 1e-4 || t >= 1 - 1e-4) continue;
      const proj = { x: A.x + abx * t, y: A.y + aby * t };
      if (dist(n, proj) < 1.5) on.push({ id: n.id, t });
    }
    on.sort((p, q) => p.t - q.t);
    let prev = e.a;
    for (const o of on) { push(prev, o.id); prev = o.id; }
    push(prev, e.b);
  }
  return out;
}

// ── room detection (planar-graph faces, ported from the app) ─────────────────
function detectRooms() {
  const pedges = planarEdges();
  const adj = new Map();
  for (const n of Object.keys(scene.nodes)) adj.set(n, []);
  for (const [a, b] of pedges) {
    adj.get(a).push(b);
    adj.get(b).push(a);
  }
  const ang = (from, to) => {
    const a = scene.nodes[from];
    const b = scene.nodes[to];
    return Math.atan2(b.y - a.y, b.x - a.x);
  };
  const nextEdge = (u, v) => {
    const ns = adj.get(v);
    if (!ns || !ns.length) return null;
    const back = ang(v, u);
    let bestW = null;
    let bestDelta = Infinity;
    for (const w of ns) {
      let delta = back - ang(v, w);
      while (delta <= 1e-9) delta += Math.PI * 2;
      if (delta < bestDelta) {
        bestDelta = delta;
        bestW = w;
      }
    }
    return bestW;
  };
  const signedArea = (poly) => {
    let s = 0;
    for (let i = 0; i < poly.length; i++) {
      const p = poly[i];
      const q = poly[(i + 1) % poly.length];
      s += p.x * q.y - q.x * p.y;
    }
    return s / 2;
  };
  const visited = new Set();
  const rooms = [];
  const seen = new Set();
  for (const [a, b] of pedges) {
    for (const [u0, v0] of [
      [a, b],
      [b, a],
    ]) {
      if (visited.has(`${u0}>${v0}`)) continue;
      const loop = [];
      let u = u0;
      let v = v0;
      let guard = 0;
      let ok = true;
      while (guard++ < 10000) {
        visited.add(`${u}>${v}`);
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
      if (area <= 1) continue;
      const m2 = Math.abs(area) / 10000;
      if (m2 < 0.05) continue;
      const key = [...loop].sort().join("-");
      if (seen.has(key)) continue;
      seen.add(key);
      // centroid for addressing
      let cx = 0, cy = 0;
      for (const p of poly) { cx += p.x; cy += p.y; }
      cx = round(cx / poly.length);
      cy = round(cy / poly.length);
      rooms.push({ id: key, area: m2, nodeIds: [...loop], center: { x: cx, y: cy } });
    }
  }
  return rooms;
}

function bounds() {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  const t = (x, y) => {
    minX = Math.min(minX, x); minY = Math.min(minY, y);
    maxX = Math.max(maxX, x); maxY = Math.max(maxY, y);
  };
  for (const n of Object.values(scene.nodes)) t(n.x, n.y);
  for (const f of Object.values(scene.furniture)) t(f.x, f.y);
  if (!isFinite(minX)) return null;
  return { minX, minY, maxX, maxY, w: maxX - minX, h: maxY - minY };
}

function planSummary() {
  const rooms = detectRooms();
  const b = bounds();
  const total = rooms.reduce((a, r) => a + r.area, 0);
  const lines = [];
  lines.push(`Walls: ${Object.keys(scene.edges).length}, Rooms: ${rooms.length}, Openings: ${Object.keys(scene.openings).length}, Furniture: ${Object.keys(scene.furniture).length}, Zones: ${Object.keys(scene.zones).length}`);
  const zoneList = Object.values(scene.zones);
  if (zoneList.length) lines.push(`Floor zones: ${zoneList.map((z) => z.type).join(", ")}`);
  // breakdown of opening subtypes + furniture kinds so Claude sees what's placed
  const tally = (arr, key) => {
    const m = {};
    for (const it of arr) {
      const k = it[key] || (key === "subtype" ? it.kind : "?");
      m[k] = (m[k] || 0) + 1;
    }
    return Object.entries(m).map(([k, n]) => (n > 1 ? `${k}×${n}` : k)).join(", ");
  };
  const openingList = Object.values(scene.openings);
  if (openingList.length) lines.push(`Openings: ${tally(openingList, "subtype")}`);
  const furnList = Object.values(scene.furniture);
  if (furnList.length) lines.push(`Furniture: ${tally(furnList, "kind")}`);
  if (b) lines.push(`Extent: ${(b.w / 100).toFixed(2)} m × ${(b.h / 100).toFixed(2)} m (x ${b.minX}…${b.maxX}, y ${b.minY}…${b.maxY} cm)`);
  if (rooms.length) lines.push(`Rooms: ${rooms.map((r, i) => `#${i + 1} ${r.area.toFixed(1)} m²`).join(", ")} — total ${total.toFixed(1)} m²`);
  lines.push(`Live viewers connected: ${clients.size}${clients.size === 0 ? " (open http://localhost:5180 to see it)" : ""}`);
  lines.push(`(call get_plan with verbose:true for ids + coordinates so you can edit specific elements)`);
  return lines.join("\n");
}

// Detailed, addressable dump — every element with its id + coordinates, so
// Claude can target individual nodes/edges/openings/furniture/zones for editing.
function planDetail() {
  const rooms = detectRooms();
  const b = bounds();
  const lines = [];
  lines.push(planSummary());
  lines.push("");

  const nodes = Object.values(scene.nodes);
  if (nodes.length) {
    lines.push(`NODES (${nodes.length}) — corners; move with move_item:`);
    for (const n of nodes) lines.push(`  ${n.id}: (${n.x}, ${n.y})`);
  }

  const edges = Object.values(scene.edges);
  if (edges.length) {
    lines.push(`EDGES (${edges.length}) — walls; edit with set_edge, delete with delete_item:`);
    for (const e of edges) {
      const a = scene.nodes[e.a], b2 = scene.nodes[e.b];
      const ac = a ? `(${a.x},${a.y})` : "?";
      const bc = b2 ? `(${b2.x},${b2.y})` : "?";
      const len = a && b2 ? Math.round(dist(a, b2)) : 0;
      lines.push(
        `  ${e.id}: ${e.a}${ac}→${e.b}${bc} ${e.kind || "wall"} thick=${e.thickness} h=${e.height}${e.bulge ? ` bulge=${e.bulge}` : ""} len=${len}cm`
      );
    }
  }

  const openings = Object.values(scene.openings);
  if (openings.length) {
    lines.push(`OPENINGS (${openings.length}) — doors/windows; edit with set_opening:`);
    for (const o of openings) {
      const sub = o.subtype ? ` (${o.subtype})` : "";
      const leaf = o.leafCount && o.leafCount > 1 ? ` leaves=${o.leafCount}` : "";
      lines.push(
        `  ${o.id}: ${o.kind}${sub} on edge ${o.edgeId} t=${o.t.toFixed(2)} width=${o.width} sill=${o.sill} h=${o.height}${leaf}`
      );
    }
  }

  const furniture = Object.values(scene.furniture);
  if (furniture.length) {
    lines.push(`FURNITURE (${furniture.length}) — edit with set_furniture, move with move_item:`);
    for (const f of furniture) {
      const deg = Math.round(((f.rotation || 0) * 180) / Math.PI);
      lines.push(`  ${f.id}: ${f.kind} at (${f.x},${f.y}) w=${f.w} d=${f.d} rot=${deg}°`);
    }
  }

  const zones = Object.values(scene.zones);
  if (zones.length) {
    lines.push(`ZONES (${zones.length}) — floor markers; move with move_item, delete with delete_item:`);
    for (const z of zones) lines.push(`  ${z.id}: ${z.type} at (${z.x},${z.y})`);
  }

  if (rooms.length) {
    lines.push(`ROOMS (${rooms.length}) — derived faces (not directly addressable; edit their walls):`);
    for (const r of rooms) {
      lines.push(`  ${r.id}: ${r.area.toFixed(2)} m² center=(${r.center.x},${r.center.y})`);
    }
  }

  if (b) lines.push(`BOUNDS: x ${b.minX}…${b.maxX}, y ${b.minY}…${b.maxY} cm`);
  return lines.join("\n");
}

// Locate an item by id across the addressable collections.
function findItem(id) {
  if (scene.nodes[id]) return { kind: "node", item: scene.nodes[id] };
  if (scene.edges[id]) return { kind: "edge", item: scene.edges[id] };
  if (scene.openings[id]) return { kind: "opening", item: scene.openings[id] };
  if (scene.furniture[id]) return { kind: "furniture", item: scene.furniture[id] };
  if (scene.zones[id]) return { kind: "zone", item: scene.zones[id] };
  return null;
}

// ── WebSocket bridge ─────────────────────────────────────────────────────────
const clients = new Set();
let wss = null;
try {
  wss = new WebSocketServer({ port: WS_PORT });
  wss.on("connection", (ws) => {
    clients.add(ws);
    log(`browser connected (${clients.size} total)`);
    ws.send(JSON.stringify({ type: "scene", scene }));
    ws.on("message", (raw) => {
      try {
        const msg = JSON.parse(raw.toString());
        if (msg.type === "push" && msg.scene) {
          snapshot(); // allow undo back to the pre-push server state
          scene = normalizeScene(msg.scene); // browser edits become the source of truth
          persist();
          // relay to OTHER viewers (not the sender)
          for (const c of clients) if (c !== ws && c.readyState === 1) c.send(JSON.stringify({ type: "scene", scene }));
        } else if (msg.type === "pull") {
          ws.send(JSON.stringify({ type: "scene", scene }));
        }
      } catch (e) {
        log("bad ws message", e.message);
      }
    });
    ws.on("close", () => {
      clients.delete(ws);
      log(`browser disconnected (${clients.size} left)`);
    });
    ws.on("error", () => {});
  });
  wss.on("error", (e) => log(`WS server error: ${e.message}`));
  log(`WebSocket bridge listening on ws://localhost:${WS_PORT}`);
} catch (e) {
  log(`could not start WS server on ${WS_PORT}: ${e.message}`);
}

function broadcast() {
  const payload = JSON.stringify({ type: "scene", scene });
  for (const c of clients) if (c.readyState === 1) c.send(payload);
}

function normalizeScene(s) {
  return {
    nodes: s.nodes || {},
    edges: s.edges || {},
    openings: s.openings || {},
    furniture: s.furniture || {},
    zones: s.zones || {},
    // preserve the app's newer fields so a browser push → server → broadcast
    // round-trip doesn't drop room names / labels.
    roomNames: s.roomNames || {},
    labels: s.labels || {},
  };
}

// ── MCP server ───────────────────────────────────────────────────────────────
const mcp = new McpServer({ name: "denah", version: "0.1.0" });

const ok = (text) => ({ content: [{ type: "text", text }] });

mcp.registerTool(
  "get_plan",
  {
    title: "Get plan",
    description:
      "Return the current floor plan. By default a concise summary (rooms, areas, extent, counts). " +
      "Pass verbose:true to get DETAILED, addressable data — every node/edge/opening/furniture/zone with its id and coordinates, plus room areas — so you can edit specific elements by id. Call this first to see current state.",
    inputSchema: {
      verbose: z.boolean().optional().describe("include ids + coordinates for every element so you can edit them"),
    },
  },
  async ({ verbose }) => ok(verbose ? planDetail() : planSummary())
);

mcp.registerTool(
  "clear_plan",
  {
    title: "Clear plan",
    description: "Erase everything and start from an empty canvas. Updates the live app immediately.",
    inputSchema: {},
  },
  async () => {
    snapshot();
    scene = emptyScene();
    commit();
    return ok("Cleared. Empty canvas.\n" + planSummary());
  }
);

mcp.registerTool(
  "add_room",
  {
    title: "Add rectangular room / area",
    description:
      "Add a rectangular area by its top-left corner and size, in CENTIMETERS. Corners are shared with existing walls automatically, so adjacent rooms join cleanly. " +
      "Set `floor` to type the floor (terrace/garden/pool etc) — not every area is an interior room. " +
      "`boundary` sets what the FOUR sides are made of: 'wall' (default), 'low' (parapet), 'railing' (balcony/terrace edge), or 'open' (no structure). " +
      "Use `open_sides` to make specific sides open/railing (e.g. a terrace open toward a room). Origin (0,0) is a good start.",
    inputSchema: {
      x: z.number().describe("left edge X in cm"),
      y: z.number().describe("top edge Y in cm"),
      width: z.number().positive().describe("width in cm"),
      height: z.number().positive().describe("height in cm"),
      label: z.string().optional(),
      floor: z.enum(ZONE_TYPES).optional().describe("floor type; drops a zone marker in the center"),
      boundary: z.enum(EDGE_KINDS).optional().describe("type for all 4 sides (default wall)"),
      open_sides: z
        .array(z.enum(["top", "right", "bottom", "left"]))
        .optional()
        .describe("sides to make 'open' instead of the boundary type (e.g. terrace open toward a room)"),
    },
  },
  async ({ x, y, width, height, label, floor, boundary, open_sides }) => {
    snapshot();
    const base = boundary || "wall";
    const open = new Set(open_sides || []);
    const n1 = ensureNode(x, y);
    const n2 = ensureNode(x + width, y);
    const n3 = ensureNode(x + width, y + height);
    const n4 = ensureNode(x, y + height);
    ensureEdge(n1, n2, open.has("top") ? "open" : base);
    ensureEdge(n2, n3, open.has("right") ? "open" : base);
    ensureEdge(n3, n4, open.has("bottom") ? "open" : base);
    ensureEdge(n4, n1, open.has("left") ? "open" : base);
    if (floor && floor !== "room") {
      const id = uid("z");
      scene.zones[id] = { id, type: floor, x: round(x + width / 2), y: round(y + height / 2) };
    }
    commit();
    return ok(
      `Added ${floor && floor !== "room" ? floor : "room"} ${label ? `"${label}" ` : ""}${(width / 100).toFixed(2)}×${(height / 100).toFixed(2)} m at (${x}, ${y})${base !== "wall" ? ` (${base} sides)` : ""}.\n` +
        planSummary()
    );
  }
);

mcp.registerTool(
  "add_wall",
  {
    title: "Add wall",
    description: "Add a single straight wall between two points, in CENTIMETERS. Endpoints snap to existing corners when close.",
    inputSchema: {
      x1: z.number(),
      y1: z.number(),
      x2: z.number(),
      y2: z.number(),
      thickness: z.number().positive().optional().describe("wall thickness in cm (default 15)"),
      kind: z.enum(EDGE_KINDS).optional().describe("wall (default), low, railing, or open"),
    },
  },
  async ({ x1, y1, x2, y2, thickness, kind }) => {
    snapshot();
    const a = ensureNode(x1, y1);
    const b = ensureNode(x2, y2);
    const id = ensureEdge(a, b, kind || "wall");
    if (id && thickness) scene.edges[id].thickness = thickness;
    commit();
    return ok(`Added ${kind && kind !== "wall" ? kind : "wall"} (${x1},${y1})→(${x2},${y2})${id ? ` [${id}]` : ""}.\n` + planSummary());
  }
);

mcp.registerTool(
  "add_door",
  {
    title: "Add door",
    description:
      "Place a door on the wall nearest to a point (cm). The point should be on or beside the target wall. " +
      "`type` picks a real door type with sensible default size/leaf-count: " +
      DOOR_SUBTYPES.join(", ") +
      " (default single). Override width/height in cm if needed.",
    inputSchema: {
      x: z.number(),
      y: z.number(),
      type: z.enum(DOOR_SUBTYPES).optional().describe("door type (default single)"),
      width: z.number().positive().optional().describe("door width in cm (default from type)"),
      height: z.number().positive().optional().describe("door height in cm (default from type)"),
    },
  },
  async ({ x, y, type, width, height }) => {
    const hit = nearestEdge({ x, y });
    if (!hit) return ok(`No wall near (${x}, ${y}). Add a wall/room there first, or pick a point closer to a wall.`);
    const subtype = type || "single";
    const spec = DOOR_TYPES[subtype];
    snapshot();
    const id = uid("o");
    scene.openings[id] = {
      id,
      edgeId: hit.edgeId,
      kind: "door",
      subtype,
      t: Math.max(0.08, Math.min(0.92, hit.t)),
      width: width ?? spec.width,
      sill: 0,
      height: height ?? spec.height,
      leafCount: spec.leafCount,
      hingeSide: "left",
      slideDir: "left",
    };
    commit();
    return ok(`Added ${subtype} door [${id}] on the nearest wall to (${x}, ${y}).\n` + planSummary());
  }
);

mcp.registerTool(
  "add_window",
  {
    title: "Add window",
    description:
      "Place a window on the wall nearest to a point (cm). `type` picks a real window type with sensible default size/sill: " +
      WINDOW_SUBTYPES.join(", ") +
      " (default casement). Override width/height/sill in cm if needed.",
    inputSchema: {
      x: z.number(),
      y: z.number(),
      type: z.enum(WINDOW_SUBTYPES).optional().describe("window type (default casement)"),
      width: z.number().positive().optional().describe("window width in cm (default from type)"),
      height: z.number().positive().optional().describe("window height in cm (default from type)"),
      sill: z.number().min(0).optional().describe("sill height from floor in cm (default from type)"),
    },
  },
  async ({ x, y, type, width, height, sill }) => {
    const hit = nearestEdge({ x, y });
    if (!hit) return ok(`No wall near (${x}, ${y}). Add a wall/room there first, or pick a point closer to a wall.`);
    const subtype = type || "casement";
    const spec = WINDOW_TYPES[subtype];
    snapshot();
    const id = uid("o");
    scene.openings[id] = {
      id,
      edgeId: hit.edgeId,
      kind: "window",
      subtype,
      t: Math.max(0.08, Math.min(0.92, hit.t)),
      width: width ?? spec.width,
      sill: sill ?? spec.sill,
      height: height ?? spec.height,
      leafCount: spec.leafCount,
      hingeSide: "left",
      slideDir: "left",
    };
    commit();
    return ok(`Added ${subtype} window [${id}] on the nearest wall to (${x}, ${y}).\n` + planSummary());
  }
);

mcp.registerTool(
  "add_furniture",
  {
    title: "Add furniture",
    description:
      "Place a furniture item at a point (cm), centered on (x, y). Kinds: " + KINDS.join(", ") + ". Default sizes are realistic; override w/d if needed. rotation is in degrees.",
    inputSchema: {
      kind: z.enum(KINDS),
      x: z.number(),
      y: z.number(),
      rotation: z.number().optional().describe("rotation in degrees (default 0)"),
      w: z.number().positive().optional().describe("width override in cm"),
      d: z.number().positive().optional().describe("depth override in cm"),
      height: z.number().positive().optional().describe("height override in cm (3D extrusion)"),
    },
  },
  async ({ kind, x, y, rotation, w, d, height }) => {
    snapshot();
    const spec = FURNITURE[kind];
    const id = uid("f");
    scene.furniture[id] = {
      id,
      kind,
      x: round(x),
      y: round(y),
      w: w ?? spec.w,
      d: d ?? spec.d,
      height: height ?? spec.height,
      rotation: ((rotation ?? 0) * Math.PI) / 180,
    };
    commit();
    return ok(`Placed ${kind} [${id}] at (${round(x)}, ${round(y)}).\n` + planSummary());
  }
);

mcp.registerTool(
  "add_zone",
  {
    title: "Tag a floor zone",
    description:
      "Drop a floor-type marker at a point (cm). The room/area containing the point adopts that floor: " +
      ZONE_TYPES.join(", ") +
      ". Use this to mark a terrace, garden, bathroom, pool, etc. inside an already-bounded area.",
    inputSchema: {
      type: z.enum(ZONE_TYPES),
      x: z.number(),
      y: z.number(),
    },
  },
  async ({ type, x, y }) => {
    snapshot();
    const id = uid("z");
    scene.zones[id] = { id, type, x: round(x), y: round(y) };
    commit();
    return ok(`Tagged ${type} [${id}] at (${round(x)}, ${round(y)}).\n` + planSummary());
  }
);

mcp.registerTool(
  "set_scene",
  {
    title: "Set full scene",
    description:
      "Replace the entire plan with a raw scene JSON (the same format the app's Save produces — an object with nodes/edges/openings/furniture, or a wrapper with a .scene field). Use for restoring a saved plan or large edits.",
    inputSchema: {
      json: z.string().describe("scene JSON string"),
    },
  },
  async ({ json }) => {
    let data;
    try {
      data = JSON.parse(json);
    } catch (e) {
      return ok(`Invalid JSON: ${e.message}`);
    }
    const s = data?.scene ?? data;
    if (!s || typeof s !== "object" || !s.nodes || !s.edges) return ok("JSON missing nodes/edges.");
    snapshot();
    scene = normalizeScene(s);
    commit();
    return ok("Scene replaced.\n" + planSummary());
  }
);

// ── EDIT tools (target existing elements by id) ──────────────────────────────

mcp.registerTool(
  "move_item",
  {
    title: "Move item",
    description:
      "Move an element to a new absolute position (cm) by its id. Works for a node (corner — walls follow), a furniture item (its center), or a zone marker. Get ids from get_plan with verbose:true. Moving a node reshapes every wall attached to it.",
    inputSchema: {
      id: z.string().describe("id of a node, furniture, or zone"),
      x: z.number().describe("new X in cm"),
      y: z.number().describe("new Y in cm"),
    },
  },
  async ({ id, x, y }) => {
    const found = findItem(id);
    if (!found) return ok(`No item with id "${id}". Use get_plan verbose:true to list ids.`);
    if (found.kind === "edge" || found.kind === "opening")
      return ok(`"${id}" is a ${found.kind}; move_item only handles node/furniture/zone. To reposition a wall move its node(s); for an opening use set_opening (t).`);
    snapshot();
    found.item.x = round(x);
    found.item.y = round(y);
    commit();
    return ok(`Moved ${found.kind} ${id} to (${round(x)}, ${round(y)}).\n` + planSummary());
  }
);

mcp.registerTool(
  "delete_item",
  {
    title: "Delete item",
    description:
      "Delete an element by id (node/edge/opening/furniture/zone). Deleting a node also removes every wall attached to it and any openings on those walls. Deleting an edge removes its openings. Get ids from get_plan with verbose:true.",
    inputSchema: {
      id: z.string().describe("id of any element to remove"),
    },
  },
  async ({ id }) => {
    const found = findItem(id);
    if (!found) return ok(`No item with id "${id}". Use get_plan verbose:true to list ids.`);
    snapshot();
    let removedEdges = 0, removedOpenings = 0;
    if (found.kind === "node") {
      // drop edges touching this node (+ their openings), then the node
      for (const e of Object.values(scene.edges)) {
        if (e.a === id || e.b === id) {
          for (const o of Object.values(scene.openings)) {
            if (o.edgeId === e.id) { delete scene.openings[o.id]; removedOpenings++; }
          }
          delete scene.edges[e.id];
          removedEdges++;
        }
      }
      delete scene.nodes[id];
    } else if (found.kind === "edge") {
      for (const o of Object.values(scene.openings)) {
        if (o.edgeId === id) { delete scene.openings[o.id]; removedOpenings++; }
      }
      delete scene.edges[id];
    } else if (found.kind === "opening") {
      delete scene.openings[id];
    } else if (found.kind === "furniture") {
      delete scene.furniture[id];
    } else if (found.kind === "zone") {
      delete scene.zones[id];
    }
    commit();
    const extra =
      removedEdges || removedOpenings
        ? ` (also removed ${removedEdges} wall(s), ${removedOpenings} opening(s))`
        : "";
    return ok(`Deleted ${found.kind} ${id}${extra}.\n` + planSummary());
  }
);

mcp.registerTool(
  "set_edge",
  {
    title: "Edit wall",
    description:
      "Update an existing wall/edge by id. Set any of: kind (wall/low/railing/open), thickness (cm), height (cm), bulge (signed sagitta ratio — 0 = straight, positive/negative curves the wall to one side). Get ids from get_plan verbose:true.",
    inputSchema: {
      id: z.string().describe("edge id"),
      kind: z.enum(EDGE_KINDS).optional(),
      thickness: z.number().positive().optional().describe("cm"),
      height: z.number().positive().optional().describe("cm"),
      bulge: z.number().optional().describe("curve amount; 0 = straight"),
    },
  },
  async ({ id, kind, thickness, height, bulge }) => {
    const e = scene.edges[id];
    if (!e) return ok(`No edge with id "${id}". Use get_plan verbose:true to list edge ids.`);
    snapshot();
    if (kind !== undefined) e.kind = kind;
    if (thickness !== undefined) e.thickness = thickness;
    if (height !== undefined) e.height = height;
    if (bulge !== undefined) {
      if (bulge === 0) delete e.bulge;
      else e.bulge = bulge;
    }
    commit();
    return ok(`Updated edge ${id}.\n` + planSummary());
  }
);

mcp.registerTool(
  "set_opening",
  {
    title: "Edit door/window",
    description:
      "Update an existing opening (door/window) by id. Set any of: subtype (a real door/window type — " +
      DOOR_SUBTYPES.join("/") + " or " + WINDOW_SUBTYPES.join("/") + "), width (cm), sill (cm from floor), " +
      "height (cm), t (0..1 position along its wall), kind (door/window). Setting `subtype` resets " +
      "width/height/sill/leafCount to that type's defaults (kind follows the subtype); explicit width/height/sill " +
      "still override. Get ids from get_plan verbose:true.",
    inputSchema: {
      id: z.string().describe("opening id"),
      subtype: z.enum([...DOOR_SUBTYPES, ...WINDOW_SUBTYPES]).optional().describe("real door/window type"),
      width: z.number().positive().optional().describe("cm"),
      sill: z.number().min(0).optional().describe("cm from floor"),
      height: z.number().positive().optional().describe("cm"),
      t: z.number().min(0).max(1).optional().describe("position along the wall, 0..1"),
      kind: z.enum(OPENING_KINDS).optional(),
    },
  },
  async ({ id, subtype, width, sill, height, t, kind }) => {
    const o = scene.openings[id];
    if (!o) return ok(`No opening with id "${id}". Use get_plan verbose:true to list opening ids.`);
    snapshot();
    // subtype switch resets the type-driven defaults (mirrors store.setOpeningSubtype)
    if (subtype !== undefined) {
      const isDoor = subtype in DOOR_TYPES;
      const spec = isDoor ? DOOR_TYPES[subtype] : WINDOW_TYPES[subtype];
      o.kind = isDoor ? "door" : "window";
      o.subtype = subtype;
      o.width = spec.width;
      o.height = spec.height;
      o.sill = isDoor ? 0 : spec.sill;
      o.leafCount = spec.leafCount;
    }
    if (width !== undefined) o.width = width;
    if (sill !== undefined) o.sill = sill;
    if (height !== undefined) o.height = height;
    if (t !== undefined) o.t = Math.max(0.02, Math.min(0.98, t));
    if (kind !== undefined) o.kind = kind;
    commit();
    return ok(`Updated ${o.kind}${o.subtype ? ` (${o.subtype})` : ""} ${id}.\n` + planSummary());
  }
);

mcp.registerTool(
  "set_furniture",
  {
    title: "Edit furniture",
    description:
      "Update an existing furniture item by id. Set any of: kind, x, y (center, cm), w, d (size, cm), rotation (degrees). Get ids from get_plan verbose:true.",
    inputSchema: {
      id: z.string().describe("furniture id"),
      kind: z.enum(KINDS).optional(),
      x: z.number().optional().describe("center X, cm"),
      y: z.number().optional().describe("center Y, cm"),
      w: z.number().positive().optional().describe("width, cm"),
      d: z.number().positive().optional().describe("depth, cm"),
      height: z.number().positive().optional().describe("height, cm (3D extrusion)"),
      rotation: z.number().optional().describe("rotation in degrees"),
    },
  },
  async ({ id, kind, x, y, w, d, height, rotation }) => {
    const f = scene.furniture[id];
    if (!f) return ok(`No furniture with id "${id}". Use get_plan verbose:true to list furniture ids.`);
    snapshot();
    if (kind !== undefined) f.kind = kind;
    if (x !== undefined) f.x = round(x);
    if (y !== undefined) f.y = round(y);
    if (w !== undefined) f.w = w;
    if (d !== undefined) f.d = d;
    if (height !== undefined) f.height = height;
    if (rotation !== undefined) f.rotation = (rotation * Math.PI) / 180;
    commit();
    return ok(`Updated furniture ${id}.\n` + planSummary());
  }
);

mcp.registerTool(
  "set_zone",
  {
    title: "Edit zone",
    description: "Update an existing floor-zone marker by id: change its type and/or move it. Get ids from get_plan verbose:true.",
    inputSchema: {
      id: z.string().describe("zone id"),
      type: z.enum(ZONE_TYPES).optional(),
      x: z.number().optional().describe("cm"),
      y: z.number().optional().describe("cm"),
    },
  },
  async ({ id, type, x, y }) => {
    const z2 = scene.zones[id];
    if (!z2) return ok(`No zone with id "${id}". Use get_plan verbose:true to list zone ids.`);
    snapshot();
    if (type !== undefined) z2.type = type;
    if (x !== undefined) z2.x = round(x);
    if (y !== undefined) z2.y = round(y);
    commit();
    return ok(`Updated zone ${id}.\n` + planSummary());
  }
);

mcp.registerTool(
  "rename_room",
  {
    title: "Name a room",
    description:
      "Give a derived room a custom name (e.g. 'Master Bedroom'), or clear it with an empty name. Identify the room by its signature id from get_plan verbose:true (the ROOMS section), or by a point inside it (x,y in cm) and the room containing that point is used.",
    inputSchema: {
      signature: z.string().optional().describe("room signature id from get_plan verbose"),
      x: z.number().optional().describe("a point inside the room, cm (alternative to signature)"),
      y: z.number().optional().describe("a point inside the room, cm"),
      name: z.string().describe("new name; empty string clears it"),
    },
  },
  async ({ signature, x, y, name }) => {
    let sig = signature;
    if (!sig && x !== undefined && y !== undefined) {
      const rooms = detectRooms();
      // pick the room whose centroid is nearest the point (cheap heuristic)
      let best = null, bestD = Infinity;
      for (const r of rooms) {
        const d = dist(r.center, { x, y });
        if (d < bestD) { bestD = d; best = r; }
      }
      if (best) sig = best.id;
    }
    if (!sig) return ok(`No room targeted. Pass a signature (from get_plan verbose) or x,y inside a room.`);
    snapshot();
    if (!name || !name.trim()) delete scene.roomNames[sig];
    else scene.roomNames[sig] = name.trim();
    commit();
    return ok(`${name && name.trim() ? `Named room ${sig} "${name.trim()}"` : `Cleared name for room ${sig}`}.\n` + planSummary());
  }
);

mcp.registerTool(
  "undo",
  {
    title: "Undo last change",
    description:
      "Revert the most recent mutation (any add/edit/delete/clear/set_scene, or a browser push). Pops the in-memory history stack. Repeat to step further back.",
    inputSchema: {},
  },
  async () => {
    if (!undoStack.length) return ok("Nothing to undo.\n" + planSummary());
    const prev = undoStack.pop();
    try {
      scene = normalizeScene(JSON.parse(prev));
    } catch (e) {
      return ok(`Undo failed: ${e.message}`);
    }
    commit();
    return ok(`Undone (${undoStack.length} step(s) left).\n` + planSummary());
  }
);

// ── boot ─────────────────────────────────────────────────────────────────────
loadPersisted();
const transport = new StdioServerTransport();
await mcp.connect(transport);
log(
  "MCP server ready (stdio). Tools: get_plan, clear_plan, add_room, add_wall, add_door, add_window, " +
    "add_furniture, add_zone, set_scene, move_item, delete_item, set_edge, set_opening, set_furniture, " +
    "set_zone, rename_room, undo"
);
log(`State persisted to ${STATE_FILE}`);
