import { useEffect, useMemo, useRef, useState } from "react";
import { Stage, Layer, Line, Circle, Rect, Group, Text, Arc } from "react-konva";
import type Konva from "konva";
import { useStore } from "../../store/useStore";
import { detectRooms, roomZoneType } from "../../lib/rooms";
import {
  screenToWorld,
  snap,
  pickEdge,
  projectOnArc,
  arcPoints,
  arcLength,
  dist,
  lerp,
  norm,
  sub,
  perp,
  fmtLen,
  fmtArea,
  type Viewport,
  type Units,
} from "../../lib/geometry";
import {
  alignToNodes,
  endpointFromLength,
  boxFrom,
  pointInBox,
  segInBox,
  type AlignGuide,
  type Box,
} from "../../lib/snapping";
import {
  roomSignature,
  selectionHas,
  type Vec2,
  type ID,
  type Selection,
  type Scene,
  type Opening,
  openingSubtype,
} from "../../lib/types";
import { isDoorSubtype } from "../../lib/openings";
import { FURNITURE } from "../../lib/furniture";
import { ZONES } from "../../lib/zones";
import { stageHolder } from "../../lib/exporter";
import { FurnitureGlyph2D } from "./furniture2d";

const C = {
  wall: "#cdd5e2",
  wallSel: "#f2a65a",
  node: "#8b94a3",
  nodeSel: "#ffbe78",
  roomFill: "rgba(120, 150, 175, 0.045)",
  roomFillHi: "rgba(242, 166, 90, 0.06)",
  area: "#7f8896",
  dim: "#67c2c8",
  preview: "#f2a65a",
  door: "#aeb8c8",
  window: "#67c2c8",
  furniture: "rgba(150,160,178,0.10)",
  guide: "rgba(242,166,90,0.55)",
  marquee: "rgba(242,166,90,0.9)",
  marqueeFill: "rgba(242,166,90,0.08)",
  label: "#e6ebf2",
  roomName: "#cdd5e2",
};

// A live drag may move many things at once (multi-select). We track per-id deltas.
interface DragState {
  /** what the user grabbed (drives cursor + snapping reference) */
  kind: "node" | "furniture" | "zone" | "label" | "edge" | "multi";
  /** primary id the user grabbed (for single-target snapping) */
  id: ID;
  /** world drag delta applied to every dragged item */
  dx: number;
  dy: number;
  /** nodes being moved: id -> original pos */
  nodes: { id: ID; x0: number; y0: number }[];
  furniture: { id: ID; x0: number; y0: number }[];
  zones: { id: ID; x0: number; y0: number }[];
  labels: { id: ID; x0: number; y0: number }[];
  /** anchor world point at drag start (for delta math) */
  ax: number;
  ay: number;
}

interface PrecisionInput {
  /** screen px position to overlay the input near the cursor */
  sx: number;
  sy: number;
  length: string;
  angle: string;
}

export function Canvas2D() {
  const wrapRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<Konva.Stage>(null);
  const lenInputRef = useRef<HTMLInputElement>(null);
  const [size, setSize] = useState({ w: 800, h: 600 });

  const scene = useStore((s) => s.scene);
  const viewport = useStore((s) => s.viewport);
  const setViewport = useStore((s) => s.setViewport);
  const tool = useStore((s) => s.tool);
  const settings = useStore((s) => s.settings);
  const selection = useStore((s) => s.selection);
  const draftAnchor = useStore((s) => s.draft.anchorNodeId);
  const furnitureKind = useStore((s) => s.furnitureKind);
  const zoneType = useStore((s) => s.zoneType);
  const fitNonce = useStore((s) => s.fitNonce);
  const units: Units = settings.units;

  const setCursor = useStore((s) => s.setCursor);
  const select = useStore((s) => s.select);
  const setSelection = useStore((s) => s.setSelection);
  const toggleSelection = useStore((s) => s.toggleSelection);
  const startWall = useStore((s) => s.startWall);
  const extendWall = useStore((s) => s.extendWall);
  const finishWall = useStore((s) => s.finishWall);
  const addOpening = useStore((s) => s.addOpening);
  const placeFurniture = useStore((s) => s.placeFurniture);
  const placeZone = useStore((s) => s.placeZone);
  const updateZone = useStore((s) => s.updateZone);
  const moveNode = useStore((s) => s.moveNode);
  const moveFurniture = useStore((s) => s.moveFurniture);
  const updateLabel = useStore((s) => s.updateLabel);
  const addLabel = useStore((s) => s.addLabel);
  const updateEdge = useStore((s) => s.updateEdge);
  const beginGesture = useStore((s) => s.beginGesture);
  const endGesture = useStore((s) => s.endGesture);

  const [drag, setDrag] = useState<DragState | null>(null);
  const [preview, setPreview] = useState<{ p: Vec2; kind: string } | null>(null);
  const [guides, setGuides] = useState<AlignGuide[]>([]);
  const [marquee, setMarquee] = useState<{ a: Vec2; b: Vec2 } | null>(null);
  const [precision, setPrecision] = useState<PrecisionInput | null>(null);
  const panning = useRef<{ x: number; y: number; px: number; py: number } | null>(null);
  const moved = useRef(false);
  // multi-touch (pinch zoom + two-finger pan)
  const pointers = useRef<Map<number, Vec2>>(new Map());
  const pinch = useRef<{ dist0: number; zoom0: number; world0: Vec2 } | null>(null);

  // ── size tracking ──────────────────────────────────────────────────────
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      setSize({ w: el.clientWidth, h: el.clientHeight });
    });
    ro.observe(el);
    setSize({ w: el.clientWidth, h: el.clientHeight });
    return () => ro.disconnect();
  }, []);

  // register stage for PNG/PDF export
  useEffect(() => {
    stageHolder.stage = stageRef.current;
    return () => {
      stageHolder.stage = null;
    };
  }, []);

  // center the demo / origin on first mount
  useEffect(() => {
    setViewport({ zoom: 0.62, panX: size.w / 2 - 250, panY: size.h / 2 - 200 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [size.w === 800]);

  // fit view to content when requested (e.g. after an MCP-generated plan)
  useEffect(() => {
    if (fitNonce === 0) return;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    const t = (x: number, y: number) => {
      minX = Math.min(minX, x); minY = Math.min(minY, y);
      maxX = Math.max(maxX, x); maxY = Math.max(maxY, y);
    };
    for (const n of Object.values(scene.nodes)) t(n.x, n.y);
    for (const f of Object.values(scene.furniture)) {
      t(f.x - f.w / 2, f.y - f.d / 2);
      t(f.x + f.w / 2, f.y + f.d / 2);
    }
    if (!isFinite(minX)) return;
    const pad = 120;
    const cw = Math.max(1, maxX - minX);
    const ch = Math.max(1, maxY - minY);
    const zoom = Math.max(0.12, Math.min(3, Math.min((size.w - pad) / cw, (size.h - pad) / ch)));
    const cx = (minX + maxX) / 2;
    const cy = (minY + maxY) / 2;
    setViewport({ zoom, panX: size.w / 2 - cx * zoom, panY: size.h / 2 - cy * zoom });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fitNonce]);

  // focus the precision input whenever it appears
  useEffect(() => {
    if (precision) lenInputRef.current?.focus();
  }, [precision !== null]);

  // ── effective node position (respects live drag) ────────────────────────
  const dragNodeDelta = (id: ID): Vec2 | null => {
    if (!drag) return null;
    const hit = drag.nodes.find((n) => n.id === id);
    return hit ? { x: hit.x0 + drag.dx, y: hit.y0 + drag.dy } : null;
  };
  const nodePos = (id: ID): Vec2 => {
    const d = dragNodeDelta(id);
    if (d) return d;
    const n = scene.nodes[id];
    return { x: n.x, y: n.y };
  };

  // ── live scene (applies all in-flight node drags) ───────────────────────
  // Only rebuilds the nodes map when a node-affecting drag is active.
  const liveScene = useMemo(() => {
    if (!drag || drag.nodes.length === 0) return scene;
    const nodes = { ...scene.nodes };
    for (const n of drag.nodes) {
      const orig = nodes[n.id];
      if (orig) nodes[n.id] = { ...orig, x: n.x0 + drag.dx, y: n.y0 + drag.dy };
    }
    return { ...scene, nodes };
  }, [scene, drag]);

  // ── memoized room detection ─────────────────────────────────────────────
  // Topology signature: only node positions + edge endpoints + bulge. Furniture,
  // zones, labels, names, pan & zoom changes do NOT trigger re-detection.
  const topoSig = useMemo(() => topologySignature(liveScene), [liveScene]);
  const rooms = useMemo(() => detectRooms(liveScene), [topoSig]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── pointer helpers ─────────────────────────────────────────────────────
  const vp: Viewport = viewport;
  const getWorld = (): Vec2 | null => {
    const stage = stageRef.current;
    const p = stage?.getPointerPosition();
    if (!p) return null;
    return screenToWorld(p, vp);
  };
  const doSnap = (world: Vec2, shift: boolean, exclude?: ID | null) =>
    snap(world, scene, {
      grid: settings.grid,
      zoom: vp.zoom,
      anchor: draftAnchor ? scene.nodes[draftAnchor] : null,
      ortho: settings.snapOrtho || shift,
      excludeNodeId: exclude,
    });

  // ── multi-touch helpers ──────────────────────────────────────────────────
  const localOf = (ev: PointerEvent): Vec2 => {
    const r = wrapRef.current?.getBoundingClientRect();
    return { x: ev.clientX - (r?.left ?? 0), y: ev.clientY - (r?.top ?? 0) };
  };
  const beginPinch = () => {
    const pts = [...pointers.current.values()];
    if (pts.length < 2) return;
    const center = { x: (pts[0].x + pts[1].x) / 2, y: (pts[0].y + pts[1].y) / 2 };
    pinch.current = {
      dist0: Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y) || 1,
      zoom0: vp.zoom,
      world0: screenToWorld(center, vp),
    };
  };
  const updatePinch = () => {
    const pts = [...pointers.current.values()];
    if (pts.length < 2 || !pinch.current) return;
    const center = { x: (pts[0].x + pts[1].x) / 2, y: (pts[0].y + pts[1].y) / 2 };
    const distN = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y) || 1;
    const { dist0, zoom0, world0 } = pinch.current;
    const zoom = Math.max(0.12, Math.min(6, (zoom0 * distN) / dist0));
    setViewport({ zoom, panX: center.x - world0.x * zoom, panY: center.y - world0.y * zoom });
  };

  // ── wheel zoom (toward cursor) ──────────────────────────────────────────
  const onWheel = (e: Konva.KonvaEventObject<WheelEvent>) => {
    e.evt.preventDefault();
    const stage = stageRef.current;
    const p = stage?.getPointerPosition();
    if (!p) return;
    const old = vp.zoom;
    const dir = e.evt.deltaY > 0 ? 0.9 : 1.1;
    const next = Math.max(0.12, Math.min(6, old * dir));
    const wx = (p.x - vp.panX) / old;
    const wy = (p.y - vp.panY) / old;
    setViewport({ zoom: next, panX: p.x - wx * next, panY: p.y - wy * next });
  };

  // ── hit testing (returns a Selection or null) ────────────────────────────
  const hitTest = (world: Vec2): Selection | null => {
    const r = 12 / vp.zoom;
    for (const n of Object.values(scene.nodes)) {
      if (dist(world, nodePos(n.id)) <= r) return { kind: "node", id: n.id };
    }
    const lr = 14 / vp.zoom;
    for (const l of Object.values(scene.labels ?? {})) {
      if (dist(world, l) <= lr) return { kind: "label", id: l.id };
    }
    const zr = 14 / vp.zoom;
    for (const z of Object.values(scene.zones ?? {})) {
      if (dist(world, z) <= zr) return { kind: "zone", id: z.id };
    }
    for (const f of Object.values(scene.furniture)) {
      if (Math.abs(world.x - f.x) <= f.w / 2 && Math.abs(world.y - f.y) <= f.d / 2) {
        return { kind: "furniture", id: f.id };
      }
    }
    const eh = pickEdgeAny(world, scene, vp.zoom, 10);
    if (eh) return { kind: "edge", id: eh.edgeId };
    return null;
  };

  // ── build a drag state from an explicit selection list (move all together) ─
  const buildDragFor = (
    sels: Selection[],
    kind: DragState["kind"],
    primaryId: ID,
    world: Vec2
  ): DragState => {
    const nodes: DragState["nodes"] = [];
    const furniture: DragState["furniture"] = [];
    const zones: DragState["zones"] = [];
    const labels: DragState["labels"] = [];
    const nodeSet = new Set<ID>();
    const addNode = (id: ID) => {
      if (nodeSet.has(id)) return;
      const n = scene.nodes[id];
      if (!n) return;
      nodeSet.add(id);
      nodes.push({ id, x0: n.x, y0: n.y });
    };
    for (const sel of sels) {
      if (sel.kind === "node") addNode(sel.id);
      else if (sel.kind === "edge") {
        const e = scene.edges[sel.id];
        if (e) {
          addNode(e.a);
          addNode(e.b);
        }
      } else if (sel.kind === "furniture") {
        const f = scene.furniture[sel.id];
        if (f) furniture.push({ id: sel.id, x0: f.x, y0: f.y });
      } else if (sel.kind === "zone") {
        const z = scene.zones[sel.id];
        if (z) zones.push({ id: sel.id, x0: z.x, y0: z.y });
      } else if (sel.kind === "label") {
        const l = scene.labels[sel.id];
        if (l) labels.push({ id: sel.id, x0: l.x, y0: l.y });
      }
    }
    return { kind, id: primaryId, dx: 0, dy: 0, nodes, furniture, zones, labels, ax: world.x, ay: world.y };
  };

  // ── pointer down ────────────────────────────────────────────────────────
  const onDown = (e: Konva.KonvaEventObject<PointerEvent>) => {
    pointers.current.set(e.evt.pointerId, localOf(e.evt));
    if (pointers.current.size >= 2) {
      beginPinch();
      setDrag(null);
      panning.current = null;
      setPreview(null);
      setMarquee(null);
      return;
    }

    const world = getWorld();
    if (!world) return;
    const shift = e.evt.shiftKey;
    const mid = e.evt.button === 1;
    moved.current = false;

    if (tool === "pan" || mid) {
      panning.current = { x: vp.panX, y: vp.panY, px: e.evt.clientX, py: e.evt.clientY };
      return;
    }

    if (tool === "wall") {
      const a = alignToNodes(world, scene, { zoom: vp.zoom });
      const s = doSnap(a.point, shift);
      if (!draftAnchor) startWall(s.point, s.snappedNodeId);
      else extendWall(s.point, s.snappedNodeId);
      return;
    }

    if (tool === "door" || tool === "window") {
      const hit = pickEdgeAny(world, scene, vp.zoom, 14);
      if (hit) addOpening(hit.edgeId, hit.t, tool);
      return;
    }

    if (tool === "furniture") {
      const s = doSnap(world, shift);
      placeFurniture(furnitureKind, s.point.x, s.point.y);
      return;
    }

    if (tool === "zone") {
      placeZone(zoneType, world.x, world.y);
      return;
    }

    if (tool === "label") {
      const text = (typeof window !== "undefined" ? window.prompt("Label text", "Label") : "Label") ?? "";
      if (text.trim()) addLabel(world.x, world.y, text.trim());
      return;
    }

    // select tool ----------------------------------------------------------
    if (tool === "select") {
      const hit = hitTest(world);

      if (shift) {
        // shift-click toggles membership; never starts a drag
        if (hit) toggleSelection(hit);
        return;
      }

      if (hit) {
        const alreadySel = selectionHas(selection, hit.kind, hit.id);
        const dragKind = hit.kind === "edge" ? "edge" : (hit.kind as DragState["kind"]);
        if (alreadySel) {
          // keep the existing (possibly multi) selection and drag it all together
          const kind: DragState["kind"] = selection.length > 1 ? "multi" : dragKind;
          setDrag(buildDragFor(selection, kind, hit.id, world));
        } else {
          // replace selection with just this item, then drag it
          select(hit);
          setDrag(buildDragFor([hit], dragKind, hit.id, world));
        }
        return;
      }

      // empty space → start a marquee (and clear selection)
      select(null);
      setMarquee({ a: world, b: world });
    }
  };

  // ── double-click an edge → split (insert node) ──────────────────────────
  const onDblClick = () => {
    if (tool !== "select") return;
    const world = getWorld();
    if (!world) return;
    const hit = pickEdgeAny(world, scene, vp.zoom, 12);
    if (!hit) return;
    splitEdgeAt(hit.edgeId, hit.point);
  };

  // split an edge by inserting a node at world point `p`. Done via store actions
  // so it's undoable + coalesced into ONE history entry via begin/endGesture.
  // Strategy: original edge keeps a→newNode; a fresh edge covers newNode→oldB.
  const splitEdgeAt = (edgeId: ID, p: Vec2) => {
    const e0 = useStore.getState().scene.edges[edgeId];
    if (!e0) return;
    const oldB = e0.b;
    if (oldB === e0.a) return;
    const np = { x: Math.round(p.x), y: Math.round(p.y) };

    beginGesture();
    // 1) create the new node by starting a wall there (ensureNode); capture id.
    startWall(np, null);
    const newNodeId = useStore.getState().draft.anchorNodeId;
    if (!newNodeId) {
      finishWall();
      endGesture();
      return;
    }
    // 2) build the second half (newNode → oldB) by extending the draft wall.
    const ob = useStore.getState().scene.nodes[oldB];
    extendWall({ x: ob.x, y: ob.y }, oldB);
    finishWall();
    // 3) copy the source edge's props onto the freshly-created half.
    const after = useStore.getState().scene;
    const made = Object.values(after.edges).find(
      (e) => (e.a === newNodeId && e.b === oldB) || (e.a === oldB && e.b === newNodeId)
    );
    if (made) {
      updateEdge(made.id, {
        thickness: e0.thickness,
        height: e0.height,
        kind: e0.kind,
        bulge: e0.bulge,
      });
    }
    // 4) repoint the original edge's far end to the new node (first half).
    updateEdge(edgeId, { b: newNodeId });
    endGesture();
    select({ kind: "node", id: newNodeId });
  };

  // ── pointer move ─────────────────────────────────────────────────────────
  const onMove = (e: Konva.KonvaEventObject<PointerEvent>) => {
    if (pointers.current.has(e.evt.pointerId)) pointers.current.set(e.evt.pointerId, localOf(e.evt));
    if (pinch.current && pointers.current.size >= 2) {
      updatePinch();
      return;
    }

    const world = getWorld();
    if (!world) return;
    const shift = e.evt.shiftKey;

    if (panning.current) {
      moved.current = true;
      const dx = e.evt.clientX - panning.current.px;
      const dy = e.evt.clientY - panning.current.py;
      setViewport({ panX: panning.current.x + dx, panY: panning.current.y + dy });
      return;
    }

    if (marquee) {
      moved.current = true;
      setMarquee({ a: marquee.a, b: world });
      return;
    }

    if (drag) {
      moved.current = true;
      // snap the PRIMARY grabbed point; derive a uniform delta for the group
      let targetX = world.x;
      let targetY = world.y;
      let gs: AlignGuide[] = [];
      if (drag.kind === "node" || drag.kind === "edge" || drag.kind === "multi") {
        const a = alignToNodes(world, scene, {
          zoom: vp.zoom,
          excludeNodeId: drag.kind === "node" ? drag.id : null,
        });
        const s = doSnap(a.point, shift, drag.kind === "node" ? drag.id : null);
        targetX = s.point.x;
        targetY = s.point.y;
        gs = a.guides;
      } else {
        const s = doSnap(world, shift);
        targetX = s.point.x;
        targetY = s.point.y;
      }
      setGuides(gs);
      setDrag({ ...drag, dx: targetX - drag.ax, dy: targetY - drag.ay });
      setCursor({ x: targetX, y: targetY });
      return;
    }

    // hover preview + alignment guides
    if (tool === "wall") {
      const a = alignToNodes(world, scene, { zoom: vp.zoom });
      const s = doSnap(a.point, shift);
      setGuides(a.guides);
      setCursor(s.point);
      setPreview({ p: s.point, kind: s.kind });
      // position precision input near cursor while drafting
      if (draftAnchor) {
        const stage = stageRef.current;
        const sp = stage?.getPointerPosition();
        if (sp) {
          setPrecision((prev) => ({
            sx: sp.x + 16,
            sy: sp.y + 16,
            length: prev?.length ?? "",
            angle: prev?.angle ?? "",
          }));
        }
      } else if (precision) {
        setPrecision(null);
      }
      return;
    }

    if (guides.length) setGuides([]);
    const s = doSnap(world, shift);
    setCursor(s.point);
    if (tool === "furniture") setPreview({ p: s.point, kind: s.kind });
    else if (tool === "zone" || tool === "label") setPreview({ p: world, kind: "free" });
    else if (preview) setPreview(null);
  };

  // ── pointer up ────────────────────────────────────────────────────────────
  const onUp = (e: Konva.KonvaEventObject<PointerEvent>) => {
    pointers.current.delete(e.evt.pointerId);
    if (pinch.current) {
      if (pointers.current.size < 2) {
        pinch.current = null;
        panning.current = null;
      }
      return;
    }

    if (marquee) {
      const box = boxFrom(marquee.a, marquee.b);
      const mov = moved.current;
      setMarquee(null);
      // tiny box = a click, not a marquee → leave selection cleared
      if (mov && (box.maxX - box.minX > 2 / vp.zoom || box.maxY - box.minY > 2 / vp.zoom)) {
        setSelection(selectInBox(scene, box));
      }
      return;
    }

    if (drag) {
      if (moved.current && (drag.dx !== 0 || drag.dy !== 0)) {
        beginGesture();
        for (const n of drag.nodes) moveNode(n.id, Math.round(n.x0 + drag.dx), Math.round(n.y0 + drag.dy));
        for (const f of drag.furniture) moveFurniture(f.id, Math.round(f.x0 + drag.dx), Math.round(f.y0 + drag.dy));
        for (const z of drag.zones) updateZone(z.id, { x: Math.round(z.x0 + drag.dx), y: Math.round(z.y0 + drag.dy) });
        for (const l of drag.labels) updateLabel(l.id, { x: Math.round(l.x0 + drag.dx), y: Math.round(l.y0 + drag.dy) });
        endGesture();
      }
      setDrag(null);
      setGuides([]);
    }
    panning.current = null;
  };

  // ── precision input commit ──────────────────────────────────────────────
  const commitPrecision = () => {
    if (!precision || !draftAnchor) return;
    const length = parseFloat(precision.length);
    if (!Number.isFinite(length) || length <= 0) return;
    const anchor = scene.nodes[draftAnchor];
    if (!anchor) return;
    const cur = useStore.getState().cursor ?? anchor;
    const ang = precision.angle.trim() === "" ? null : parseFloat(precision.angle);
    const end = endpointFromLength(anchor, cur, length, ang);
    const s = doSnap(end, false);
    // prefer exact endpoint (don't grid-snap the typed length away) unless it
    // landed on an existing node
    const target = s.snappedNodeId ? s.point : { x: Math.round(end.x), y: Math.round(end.y) };
    extendWall(target, s.snappedNodeId);
    setPrecision((prev) => (prev ? { ...prev, length: "", angle: "" } : null));
  };

  // ── render geometry ──────────────────────────────────────────────────────
  const k = 1 / vp.zoom; // screen-px → world units for constant-size UI
  const grid = useMemo(() => buildGrid(size, vp, settings.grid), [size, vp, settings.grid]);

  const wallEls = useMemo(
    () => renderWalls(liveScene, selection, k),
    [liveScene, selection, k]
  );

  // memoized furniture/zone/label arrays (don't rebuild on pure pan/zoom)
  const furnEls = useMemo(() => {
    return Object.values(scene.furniture).map((f) => {
      const sel = selectionHas(selection, "furniture", f.id);
      return { f, sel };
    });
  }, [scene.furniture, selection]);

  const cursorStyle =
    tool === "wall" || tool === "furniture" || tool === "zone" || tool === "label"
      ? "crosshair"
      : tool === "pan"
        ? "grab"
        : drag
          ? "grabbing"
          : "default";

  const showPrecision = tool === "wall" && draftAnchor != null && precision != null;

  return (
    <div ref={wrapRef} className="stage-wrap" style={{ cursor: cursorStyle, position: "relative" }}>
      <Stage
        ref={stageRef}
        width={size.w}
        height={size.h}
        x={vp.panX}
        y={vp.panY}
        scaleX={vp.zoom}
        scaleY={vp.zoom}
        onWheel={onWheel}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
        onDblClick={onDblClick}
        onDblTap={onDblClick}
        onPointerLeave={() => {
          setCursor(null);
          setPreview(null);
          setGuides([]);
        }}
      >
        {/* grid */}
        <Layer listening={false}>
          {grid.minor.map((pts, i) => (
            <Line key={`mn${i}`} points={pts} stroke="rgba(126,142,168,0.06)" strokeWidth={k} />
          ))}
          {grid.major.map((pts, i) => (
            <Line key={`mj${i}`} points={pts} stroke="rgba(126,142,168,0.13)" strokeWidth={k} />
          ))}
          {/* origin crosshair */}
          <Line points={[-30 * k, 0, 30 * k, 0]} stroke="rgba(242,166,90,0.4)" strokeWidth={k} />
          <Line points={[0, -30 * k, 0, 30 * k]} stroke="rgba(242,166,90,0.4)" strokeWidth={k} />
        </Layer>

        {/* rooms */}
        {settings.showRooms && (
          <Layer listening={false}>
            {rooms.map((r) => {
              const zt = roomZoneType(r.polygon, liveScene);
              const zspec = ZONES[zt];
              const sig = roomSignature(r.nodeIds);
              const customName = scene.roomNames?.[sig];
              return (
                <Group key={r.id}>
                  <Line points={r.polygon.flatMap((p) => [p.x, p.y])} closed fill={zspec.fill2d} />
                  {/* custom room name (above the area) */}
                  {customName ? (
                    <Text
                      text={customName}
                      x={r.centroid.x}
                      y={r.centroid.y - 22 * k}
                      offsetX={70 * k}
                      width={140 * k}
                      align="center"
                      fontFamily="Hanken Grotesk"
                      fontStyle="600"
                      fontSize={13 * k}
                      fill={C.roomName}
                    />
                  ) : (
                    zt !== "room" && (
                      <Text
                        text={zspec.label.toUpperCase()}
                        x={r.centroid.x}
                        y={r.centroid.y + 9 * k}
                        offsetX={40 * k}
                        width={80 * k}
                        align="center"
                        fontFamily="Hanken Grotesk"
                        fontStyle="600"
                        fontSize={10 * k}
                        fill={zspec.swatch}
                      />
                    )
                  )}
                  <Text
                    text={`${fmtArea(r.area, units)}`}
                    x={r.centroid.x}
                    y={r.centroid.y - 7 * k}
                    offsetX={28 * k}
                    width={56 * k}
                    align="center"
                    fontFamily="Geist Mono"
                    fontSize={13 * k}
                    fill={C.area}
                  />
                </Group>
              );
            })}
          </Layer>
        )}

        {/* furniture */}
        <Layer listening={false}>
          {furnEls.map(({ f, sel }) => {
            const dd = drag?.furniture.find((x) => x.id === f.id);
            const fx = dd ? dd.x0 + drag!.dx : f.x;
            const fy = dd ? dd.y0 + drag!.dy : f.y;
            return (
              <FurnitureShape
                key={f.id}
                kind={f.kind}
                x={fx}
                y={fy}
                w={f.w}
                d={f.d}
                rotation={f.rotation}
                selected={sel}
                k={k}
              />
            );
          })}
        </Layer>

        {/* zone markers */}
        <Layer listening={false}>
          {Object.values(scene.zones ?? {}).map((z) => {
            const dd = drag?.zones.find((x) => x.id === z.id);
            const zx = dd ? dd.x0 + drag!.dx : z.x;
            const zy = dd ? dd.y0 + drag!.dy : z.y;
            const sel = selectionHas(selection, "zone", z.id);
            return <ZoneMarker key={z.id} type={z.type} x={zx} y={zy} selected={sel} k={k} />;
          })}
        </Layer>

        {/* walls + openings */}
        <Layer>{wallEls}</Layer>

        {/* dimensions */}
        {settings.showDimensions && (
          <Layer listening={false}>{renderDimensions(liveScene, nodePos, k, units)}</Layer>
        )}

        {/* labels (free text annotations) */}
        <Layer listening={false}>
          {Object.values(scene.labels ?? {}).map((l) => {
            const dd = drag?.labels.find((x) => x.id === l.id);
            const lx = dd ? dd.x0 + drag!.dx : l.x;
            const ly = dd ? dd.y0 + drag!.dy : l.y;
            const sel = selectionHas(selection, "label", l.id);
            return (
              <Text
                key={l.id}
                text={l.text}
                x={lx}
                y={ly}
                offsetX={0}
                offsetY={7 * k}
                fontFamily="Hanken Grotesk"
                fontStyle="600"
                fontSize={14 * k}
                fill={sel ? C.wallSel : C.label}
              />
            );
          })}
        </Layer>

        {/* nodes (handles) */}
        {tool === "select" && (
          <Layer listening={false}>
            {Object.values(scene.nodes).map((n) => {
              const p = nodePos(n.id);
              const sel = selectionHas(selection, "node", n.id);
              return (
                <Circle
                  key={n.id}
                  x={p.x}
                  y={p.y}
                  radius={(sel ? 5.5 : 4) * k}
                  fill={sel ? C.nodeSel : "#0b0d11"}
                  stroke={sel ? C.nodeSel : C.node}
                  strokeWidth={1.6 * k}
                />
              );
            })}
          </Layer>
        )}

        {/* alignment guides + marquee */}
        <Layer listening={false}>
          {guides.map((g, i) => {
            const tl = screenToWorld({ x: 0, y: 0 }, vp);
            const br = screenToWorld({ x: size.w, y: size.h }, vp);
            return g.axis === "v" ? (
              <Line key={`g${i}`} points={[g.coord, tl.y, g.coord, br.y]} stroke={C.guide} strokeWidth={k} dash={[4 * k, 4 * k]} />
            ) : (
              <Line key={`g${i}`} points={[tl.x, g.coord, br.x, g.coord]} stroke={C.guide} strokeWidth={k} dash={[4 * k, 4 * k]} />
            );
          })}
          {marquee && (() => {
            const b = boxFrom(marquee.a, marquee.b);
            return (
              <Rect
                x={b.minX}
                y={b.minY}
                width={b.maxX - b.minX}
                height={b.maxY - b.minY}
                fill={C.marqueeFill}
                stroke={C.marquee}
                strokeWidth={k}
                dash={[5 * k, 4 * k]}
              />
            );
          })()}
        </Layer>

        {/* draft preview */}
        <Layer listening={false}>
          {tool === "wall" && draftAnchor && preview && (
            <DraftPreview from={nodePos(draftAnchor)} to={preview.p} k={k} units={units} />
          )}
          {tool === "wall" && preview && <SnapMarker p={preview.p} kind={preview.kind} k={k} />}
          {tool === "furniture" && preview && (
            <Group opacity={0.5}>
              <FurnitureShape
                kind={furnitureKind}
                x={preview.p.x}
                y={preview.p.y}
                w={FURNITURE[furnitureKind].w}
                d={FURNITURE[furnitureKind].d}
                rotation={0}
                selected
                k={k}
              />
            </Group>
          )}
          {tool === "zone" && preview && (
            <Group opacity={0.6}>
              <ZoneMarker type={zoneType} x={preview.p.x} y={preview.p.y} selected k={k} />
            </Group>
          )}
        </Layer>
      </Stage>

      {/* precision numeric input — HTML overlay near the cursor while drafting */}
      {showPrecision && precision && (
        <div
          style={{
            position: "absolute",
            left: precision.sx,
            top: precision.sy,
            display: "flex",
            gap: 4,
            background: "#1d222c",
            border: "1px solid #2b313d",
            borderRadius: 6,
            padding: "4px 6px",
            boxShadow: "0 4px 14px rgba(0,0,0,0.4)",
            zIndex: 20,
            pointerEvents: "auto",
            fontFamily: "Geist Mono, monospace",
          }}
          onPointerDown={(ev) => ev.stopPropagation()}
        >
          <input
            ref={lenInputRef}
            value={precision.length}
            onChange={(ev) => setPrecision({ ...precision, length: ev.target.value })}
            onKeyDown={(ev) => {
              if (ev.key === "Enter") {
                ev.preventDefault();
                commitPrecision();
              } else if (ev.key === "Escape") {
                ev.preventDefault();
                setPrecision({ ...precision, length: "", angle: "" });
                (ev.target as HTMLInputElement).blur();
              }
            }}
            placeholder="len cm"
            inputMode="decimal"
            style={inputStyle(64)}
          />
          <input
            value={precision.angle}
            onChange={(ev) => setPrecision({ ...precision, angle: ev.target.value })}
            onKeyDown={(ev) => {
              if (ev.key === "Enter") {
                ev.preventDefault();
                commitPrecision();
              }
            }}
            placeholder="∠°"
            inputMode="decimal"
            style={inputStyle(48)}
          />
        </div>
      )}
    </div>
  );
}

const inputStyle = (w: number): React.CSSProperties => ({
  width: w,
  background: "#0b0d11",
  border: "1px solid #2b313d",
  borderRadius: 4,
  color: "#ffbe78",
  fontFamily: "Geist Mono, monospace",
  fontSize: 12,
  padding: "3px 6px",
  outline: "none",
});

// ── topology signature (cheap hash of node positions + edge endpoints) ─────────
function topologySignature(scene: Scene): string {
  const nodeParts: string[] = [];
  for (const id in scene.nodes) {
    const n = scene.nodes[id];
    nodeParts.push(`${id}:${n.x | 0},${n.y | 0}`);
  }
  nodeParts.sort();
  const edgeParts: string[] = [];
  for (const id in scene.edges) {
    const e = scene.edges[id];
    edgeParts.push(`${e.a}>${e.b}:${e.bulge ?? 0}`);
  }
  edgeParts.sort();
  return nodeParts.join("|") + "#" + edgeParts.join("|");
}

// ── marquee selection collector ────────────────────────────────────────────────
function selectInBox(scene: Scene, box: Box): Selection[] {
  const out: Selection[] = [];
  for (const n of Object.values(scene.nodes)) {
    if (pointInBox(n, box)) out.push({ kind: "node", id: n.id });
  }
  for (const e of Object.values(scene.edges)) {
    const a = scene.nodes[e.a];
    const b = scene.nodes[e.b];
    if (a && b && segInBox(a, b, box)) out.push({ kind: "edge", id: e.id });
  }
  for (const f of Object.values(scene.furniture)) {
    if (pointInBox(f, box)) out.push({ kind: "furniture", id: f.id });
  }
  for (const z of Object.values(scene.zones ?? {})) {
    if (pointInBox(z, box)) out.push({ kind: "zone", id: z.id });
  }
  for (const l of Object.values(scene.labels ?? {})) {
    if (pointInBox(l, box)) out.push({ kind: "label", id: l.id });
  }
  return out;
}

// ── edge pick that understands curved (bulge) walls via projectOnArc ───────────
function pickEdgeAny(
  world: Vec2,
  scene: Scene,
  zoom: number,
  thresholdPx = 10
): { edgeId: ID; t: number; point: Vec2 } | null {
  // fast path: straight edges via the geometry helper
  const hasCurves = Object.values(scene.edges).some((e) => e.bulge);
  if (!hasCurves) return pickEdge(world, scene, zoom, thresholdPx);

  const thr = thresholdPx / zoom;
  let best: { edgeId: ID; t: number; point: Vec2; d: number } | null = null;
  for (const e of Object.values(scene.edges)) {
    const a = scene.nodes[e.a];
    const b = scene.nodes[e.b];
    if (!a || !b) continue;
    const half = e.thickness / 2;
    const pr = projectOnArc(world, a, b, e.bulge);
    if (pr.distance <= thr + half && (!best || pr.distance < best.d)) {
      best = { edgeId: e.id, t: pr.t, point: pr.point, d: pr.distance };
    }
  }
  return best ? { edgeId: best.edgeId, t: best.t, point: best.point } : null;
}

// ── zone marker (floor-type pin) ──────────────────────────────────────────────
function ZoneMarker({
  type,
  x,
  y,
  selected,
  k,
}: {
  type: keyof typeof ZONES;
  x: number;
  y: number;
  selected: boolean;
  k: number;
}) {
  const spec = ZONES[type];
  const r = 9 * k;
  return (
    <Group x={x} y={y}>
      <Circle radius={r + 3 * k} fill="rgba(11,13,17,0.55)" stroke={selected ? "#f2a65a" : "transparent"} strokeWidth={1.6 * k} />
      <Circle radius={r} fill={spec.swatch} opacity={0.9} />
      <Circle radius={r * 0.4} fill="#0b0d11" opacity={0.55} />
      <Text
        text={spec.label}
        x={-50 * k}
        y={r + 5 * k}
        width={100 * k}
        align="center"
        fontFamily="Hanken Grotesk"
        fontStyle="600"
        fontSize={10.5 * k}
        fill={spec.swatch}
      />
    </Group>
  );
}

// ── furniture top-down shape ────────────────────────────────────────────────────
function FurnitureShape(props: {
  kind: keyof typeof FURNITURE;
  x: number;
  y: number;
  w: number;
  d: number;
  rotation: number;
  selected: boolean;
  k: number;
}) {
  const { kind, x, y, w, d, rotation, selected, k } = props;
  const spec = FURNITURE[kind];
  const fill = selected ? "rgba(242,166,90,0.12)" : "rgba(150,160,178,0.08)";
  const stroke = selected ? "#f2a65a" : "rgba(160,170,186,0.6)";
  const isRound = spec.shape === "round";

  return (
    <Group x={x} y={y} rotation={(rotation * 180) / Math.PI}>
      <FurnitureGlyph2D kind={kind} w={w} d={d} k={k} stroke={stroke} fill={fill} />
      <Text
        text={spec.label}
        x={-w / 2}
        y={isRound ? d / 2 + 4 * k : -6 * k}
        width={w}
        align="center"
        fontFamily="Hanken Grotesk"
        fontSize={11 * k}
        fill="rgba(180,188,202,0.6)"
      />
    </Group>
  );
}

// ── grid builder ──────────────────────────────────────────────────────────────
function buildGrid(size: { w: number; h: number }, vp: Viewport, gridCm: number) {
  const minor: number[][] = [];
  const major: number[][] = [];
  const tl = screenToWorld({ x: 0, y: 0 }, vp);
  const br = screenToWorld({ x: size.w, y: size.h }, vp);
  const minorPx = gridCm * vp.zoom;
  const drawMinor = minorPx > 7;
  const majorCm = gridCm * 10;

  const x0 = Math.floor(tl.x / gridCm) * gridCm;
  const y0 = Math.floor(tl.y / gridCm) * gridCm;

  if (drawMinor) {
    for (let x = x0; x <= br.x; x += gridCm) {
      if (Math.round(x) % majorCm === 0) continue;
      minor.push([x, tl.y, x, br.y]);
    }
    for (let y = y0; y <= br.y; y += gridCm) {
      if (Math.round(y) % majorCm === 0) continue;
      minor.push([tl.x, y, br.x, y]);
    }
  }
  const mx0 = Math.floor(tl.x / majorCm) * majorCm;
  const my0 = Math.floor(tl.y / majorCm) * majorCm;
  for (let x = mx0; x <= br.x; x += majorCm) major.push([x, tl.y, x, br.y]);
  for (let y = my0; y <= br.y; y += majorCm) major.push([tl.x, y, br.x, y]);

  return { minor, major };
}

// ── wall + opening rendering ──────────────────────────────────────────────────
function renderWalls(
  scene: Scene,
  selection: Selection[],
  k: number
) {
  const els: React.ReactNode[] = [];

  const solidKind = (e: { kind?: string }) => (e.kind ?? "wall") === "wall" || e.kind === "low";

  // joint discs (fill corners) — only for solid wall/low edges
  for (const n of Object.values(scene.nodes)) {
    const degEdges = Object.values(scene.edges).filter((e) => (e.a === n.id || e.b === n.id) && solidKind(e));
    if (degEdges.length === 0) continue;
    const maxT = Math.max(...degEdges.map((e) => ((e.kind ?? "wall") === "low" ? e.thickness * 0.7 : e.thickness)));
    els.push(<Circle key={`j${n.id}`} x={n.x} y={n.y} radius={maxT / 2} fill={C.wall} />);
  }

  for (const e of Object.values(scene.edges)) {
    const A = scene.nodes[e.a];
    const B = scene.nodes[e.b];
    if (!A || !B) continue;
    const L = e.bulge ? arcLength(A, B, e.bulge) : dist(A, B);
    if (L < 1) continue;
    const sel = selectionHas(selection, "edge", e.id);
    const ekind = e.kind ?? "wall";
    const curved = !!e.bulge;
    const arcPts = curved ? arcPoints(A, B, e.bulge) : null;
    const flatArc = arcPts ? arcPts.flatMap((p) => [p.x, p.y]) : null;

    // open boundary — faint dashed line, no structure
    if (ekind === "open") {
      els.push(
        <Line
          key={`o${e.id}`}
          points={flatArc ?? [A.x, A.y, B.x, B.y]}
          stroke={sel ? C.wallSel : "rgba(160,170,186,0.32)"}
          strokeWidth={(sel ? 2.4 : 1.6) * k}
          dash={[3 * k, 9 * k]}
        />
      );
      continue;
    }

    // railing — thin rail line + posts
    if (ekind === "railing") {
      const rcol = sel ? C.wallSel : "rgba(205,213,226,0.85)";
      els.push(<Line key={`r${e.id}`} points={flatArc ?? [A.x, A.y, B.x, B.y]} stroke={rcol} strokeWidth={2 * k} />);
      const n = Math.max(2, Math.round(L / 45) + 1);
      const dir0 = norm(sub(B, A));
      const nrm0 = perp(dir0);
      for (let p = 0; p < n; p++) {
        const t = p / (n - 1);
        const pt = lerp(A, B, t);
        els.push(
          <Line
            key={`rp${e.id}_${p}`}
            points={[pt.x + nrm0.x * 4 * k, pt.y + nrm0.y * 4 * k, pt.x - nrm0.x * 4 * k, pt.y - nrm0.y * 4 * k]}
            stroke={rcol}
            strokeWidth={1.6 * k}
          />
        );
      }
      continue;
    }

    const isLow = ekind === "low";
    const col = sel ? C.wallSel : isLow ? "rgba(160,170,186,0.6)" : C.wall;
    const drawThick = isLow ? e.thickness * 0.7 : e.thickness;

    // curved walls: draw the whole arc as one thick polyline (openings are not
    // gapped on curves — rare combo; keep it visually correct as a solid arc)
    if (curved && flatArc) {
      els.push(
        <Line
          key={`wc${e.id}`}
          points={flatArc}
          stroke={col}
          strokeWidth={drawThick}
          lineCap="round"
          lineJoin="round"
          shadowColor={sel ? "#f2a65a" : undefined}
          shadowBlur={sel ? 18 * k : 0}
          shadowOpacity={sel ? 0.5 : 0}
        />
      );
      continue;
    }

    // gaps from openings
    const ops = Object.values(scene.openings)
      .filter((o) => o.edgeId === e.id)
      .map((o) => ({ ...o, half: o.width / 2 / L }))
      .sort((a, b) => a.t - b.t);

    // solid sub-segments
    let cursor = 0;
    const solids: [number, number][] = [];
    for (const o of ops) {
      const s = Math.max(0, o.t - o.half);
      const en = Math.min(1, o.t + o.half);
      if (s > cursor) solids.push([cursor, s]);
      cursor = Math.max(cursor, en);
    }
    if (cursor < 1) solids.push([cursor, 1]);

    for (let i = 0; i < solids.length; i++) {
      const [s, en] = solids[i];
      const p1 = lerp(A, B, s);
      const p2 = lerp(A, B, en);
      els.push(
        <Line
          key={`w${e.id}_${i}`}
          points={[p1.x, p1.y, p2.x, p2.y]}
          stroke={col}
          strokeWidth={drawThick}
          lineCap="butt"
          shadowColor={sel ? "#f2a65a" : undefined}
          shadowBlur={sel ? 18 * k : 0}
          shadowOpacity={sel ? 0.5 : 0}
        />
      );
    }

    // opening symbols
    const dir = norm(sub(B, A));
    const nrm = perp(dir);
    for (const o of ops) {
      const center = lerp(A, B, o.t);
      els.push(
        <OpeningSymbol
          key={`op${o.id}`}
          o={o}
          center={center}
          dir={dir}
          nrm={nrm}
          thickness={e.thickness}
          k={k}
        />
      );
    }
  }
  return els;
}

// ── opening (door/window) plan symbols, per subtype ─────────────────────────────
function OpeningSymbol({
  o,
  center,
  dir,
  nrm,
  thickness,
  k,
}: {
  o: Opening;
  center: Vec2;
  dir: Vec2;
  nrm: Vec2;
  thickness: number;
  k: number;
}) {
  const half = o.width / 2;
  const t2 = thickness / 2;
  // p1/p2 = jambs along the wall; +nrm / -nrm are the two faces of the wall.
  const p1 = { x: center.x - dir.x * half, y: center.y - dir.y * half };
  const p2 = { x: center.x + dir.x * half, y: center.y + dir.y * half };
  const st = openingSubtype(o);

  const els: React.ReactNode[] = [];
  // jamb ticks span the wall thickness (shared by all symbols).
  const jamb = (key: string, p: Vec2, col: string) =>
    els.push(
      <Line
        key={key}
        points={[p.x + nrm.x * t2, p.y + nrm.y * t2, p.x - nrm.x * t2, p.y - nrm.y * t2]}
        stroke={col}
        strokeWidth={1.4 * k}
      />
    );

  if (isDoorSubtype(st)) {
    const col = C.door;
    jamb(`dj1${o.id}`, p1, col);
    jamb(`dj2${o.id}`, p2, col);

    // hinge side + swing direction (defaults reproduce prior behaviour).
    const hingeAtB = o.hingeSide === "b" || o.hingeSide === "end" || o.hingeSide === "right";
    const swingSign = o.swingDir === "out" || o.swingDir === -1 || o.swingDir === "right" ? -1 : 1;

    // helper: draw one hinged leaf + 90° swing arc from `hinge` toward `far`.
    const leaf = (key: string, hinge: Vec2, far: Vec2, sign: number, leafLen: number) => {
      const swing = { x: hinge.x + nrm.x * leafLen * sign, y: hinge.y + nrm.y * leafLen * sign };
      els.push(<Line key={`${key}l`} points={[hinge.x, hinge.y, swing.x, swing.y]} stroke={col} strokeWidth={1.6 * k} />);
      const baseAngle = (Math.atan2(far.y - hinge.y, far.x - hinge.x) * 180) / Math.PI;
      const swungAngle = (Math.atan2(swing.y - hinge.y, swing.x - hinge.x) * 180) / Math.PI;
      let sweep = swungAngle - baseAngle;
      while (sweep <= -180) sweep += 360;
      while (sweep > 180) sweep -= 360;
      els.push(
        <Arc
          key={`${key}a`}
          x={hinge.x}
          y={hinge.y}
          innerRadius={leafLen}
          outerRadius={leafLen}
          angle={Math.abs(sweep)}
          rotation={sweep >= 0 ? baseAngle : baseAngle + sweep}
          stroke="rgba(174,184,200,0.5)"
          strokeWidth={1.2 * k}
          dash={[6 * k, 5 * k]}
        />
      );
    };

    if (st === "double") {
      // two leaves, one from each jamb, meeting in the middle; mirrored arcs.
      const mid = center;
      leaf(`dA${o.id}`, p1, mid, swingSign, half);
      leaf(`dB${o.id}`, p2, mid, swingSign, half);
    } else if (st === "sliding" || st === "sliding_double" || st === "pocket") {
      // track lines along both faces of the opening.
      const trackOff = t2 * 0.55;
      const trk = (key: string, s: number) =>
        els.push(
          <Line
            key={key}
            points={[p1.x + nrm.x * trackOff * s, p1.y + nrm.y * trackOff * s, p2.x + nrm.x * trackOff * s, p2.y + nrm.y * trackOff * s]}
            stroke="rgba(174,184,200,0.45)"
            strokeWidth={1 * k}
          />
        );
      trk(`tk1${o.id}`, 1);
      trk(`tk2${o.id}`, -1);

      // panel sits offset to one face; pocket panel slides INTO the wall (dashed
      // into the jamb), sliding panel parks over the adjacent solid wall.
      const panelOff = t2 * 0.5;
      if (st === "sliding_double") {
        // two panels meeting at centre, each pulled back toward its jamb.
        els.push(
          <Line key={`sp1${o.id}`} points={[p1.x + nrm.x * panelOff, p1.y + nrm.y * panelOff, center.x + nrm.x * panelOff, center.y + nrm.y * panelOff]} stroke={col} strokeWidth={2.4 * k} />
        );
        els.push(
          <Line key={`sp2${o.id}`} points={[center.x - nrm.x * panelOff, center.y - nrm.y * panelOff, p2.x - nrm.x * panelOff, p2.y - nrm.y * panelOff]} stroke={col} strokeWidth={2.4 * k} />
        );
        // centre-opening arrows
        els.push(<Line key={`sa1${o.id}`} points={[center.x - dir.x * half * 0.4, center.y - dir.y * half * 0.4, p1.x + dir.x * 4 * k, p1.y + dir.y * 4 * k]} stroke="rgba(174,184,200,0.5)" strokeWidth={1 * k} />);
        els.push(<Line key={`sa2${o.id}`} points={[center.x + dir.x * half * 0.4, center.y + dir.y * half * 0.4, p2.x - dir.x * 4 * k, p2.y - dir.y * 4 * k]} stroke="rgba(174,184,200,0.5)" strokeWidth={1 * k} />);
      } else {
        // single sliding / pocket: one panel covering ~the full opening, offset.
        const slideLeft = o.slideDir !== "right";
        const a = slideLeft ? p1 : p2;
        const b = slideLeft ? p2 : p1;
        els.push(
          <Line key={`sp${o.id}`} points={[a.x + nrm.x * panelOff, a.y + nrm.y * panelOff, b.x + nrm.x * panelOff, b.y + nrm.y * panelOff]} stroke={col} strokeWidth={2.4 * k} dash={st === "pocket" ? [7 * k, 4 * k] : undefined} />
        );
        // direction arrow along the wall
        els.push(<Line key={`sar${o.id}`} points={[center.x - dir.x * half * 0.5 * (slideLeft ? -1 : 1), center.y - dir.y * half * 0.5 * (slideLeft ? -1 : 1), a.x, a.y]} stroke="rgba(174,184,200,0.5)" strokeWidth={1 * k} />);
      }
    } else if (st === "folding") {
      // bi-fold: zig-zag concertina segments across the opening.
      const segs = Math.max(2, o.leafCount ?? 4);
      const segLen = o.width / segs;
      const amp = t2 * 0.9;
      const pts: number[] = [];
      for (let i = 0; i <= segs; i++) {
        const base = { x: p1.x + dir.x * segLen * i, y: p1.y + dir.y * segLen * i };
        const peak = i % 2 === 1 ? amp * swingSign : 0;
        pts.push(base.x + nrm.x * peak, base.y + nrm.y * peak);
      }
      els.push(<Line key={`fold${o.id}`} points={pts} stroke={col} strokeWidth={1.8 * k} />);
    } else if (st === "garage") {
      // segmented roller/sectional: panel rect with horizontal slat lines.
      els.push(
        <Line
          key={`gf${o.id}`}
          points={[
            p1.x + nrm.x * t2, p1.y + nrm.y * t2,
            p2.x + nrm.x * t2, p2.y + nrm.y * t2,
            p2.x - nrm.x * t2, p2.y - nrm.y * t2,
            p1.x - nrm.x * t2, p1.y - nrm.y * t2,
          ]}
          closed
          fill="rgba(174,184,200,0.05)"
          stroke={col}
          strokeWidth={1.4 * k}
        />
      );
      const slats = Math.max(2, Math.round(o.width / 45));
      for (let i = 1; i < slats; i++) {
        const s = i / slats;
        const q = { x: p1.x + dir.x * o.width * s, y: p1.y + dir.y * o.width * s };
        els.push(<Line key={`gs${o.id}_${i}`} points={[q.x + nrm.x * t2, q.y + nrm.y * t2, q.x - nrm.x * t2, q.y - nrm.y * t2]} stroke="rgba(174,184,200,0.4)" strokeWidth={1 * k} />);
      }
    } else {
      // single (and default): one hinged leaf + 90° swing arc.
      const hinge = hingeAtB ? p2 : p1;
      const far = hingeAtB ? p1 : p2;
      leaf(`d${o.id}`, hinge, far, swingSign, o.width);
    }
    return <Group>{els}</Group>;
  }

  // ── WINDOWS ───────────────────────────────────────────────────────────────
  // `isDoorSubtype` narrowed away the shared "sliding" value, so read the raw
  // subtype string for the window comparisons below.
  const ws: string = st;
  const col = C.window;
  const fwin = "rgba(103,194,200,0.06)";
  // frame rect spanning the gap across the wall thickness (shared base).
  const framePts = [
    p1.x + nrm.x * t2, p1.y + nrm.y * t2,
    p2.x + nrm.x * t2, p2.y + nrm.y * t2,
    p2.x - nrm.x * t2, p2.y - nrm.y * t2,
    p1.x - nrm.x * t2, p1.y - nrm.y * t2,
  ];

  if (ws === "bay") {
    // 3 angled segments projecting outward (+nrm) from the wall line.
    const proj = Math.min(o.width * 0.28, t2 + 28); // projection depth
    const a = p1;
    const b = p2;
    const inset = o.width * 0.26;
    const c1 = { x: a.x + dir.x * inset + nrm.x * proj, y: a.y + dir.y * inset + nrm.y * proj };
    const c2 = { x: b.x - dir.x * inset + nrm.x * proj, y: b.y - dir.y * inset + nrm.y * proj };
    els.push(
      <Line key={`bay${o.id}`} points={[a.x, a.y, c1.x, c1.y, c2.x, c2.y, b.x, b.y]} closed fill={fwin} stroke={col} strokeWidth={1.4 * k} />
    );
    // glass lines on each pane
    els.push(<Line key={`bg1${o.id}`} points={[a.x, a.y, c1.x, c1.y]} stroke={col} strokeWidth={1 * k} />);
    els.push(<Line key={`bg2${o.id}`} points={[c1.x, c1.y, c2.x, c2.y]} stroke={col} strokeWidth={1 * k} />);
    els.push(<Line key={`bg3${o.id}`} points={[c2.x, c2.y, b.x, b.y]} stroke={col} strokeWidth={1 * k} />);
    return <Group>{els}</Group>;
  }

  // all the others draw the frame rect + a centre glass line.
  els.push(<Line key={`wf${o.id}`} points={framePts} closed fill={fwin} stroke={col} strokeWidth={1.3 * k} />);
  els.push(<Line key={`wm${o.id}`} points={[p1.x, p1.y, p2.x, p2.y]} stroke={col} strokeWidth={1.3 * k} />);

  if (ws === "fixed") {
    // fixed: double line (a second offset glass line) — non-opening.
    const off = t2 * 0.35;
    els.push(<Line key={`wx${o.id}`} points={[p1.x + nrm.x * off, p1.y + nrm.y * off, p2.x + nrm.x * off, p2.y + nrm.y * off]} stroke={col} strokeWidth={1 * k} />);
  } else if (ws === "casement") {
    // casement: hinged sash + opening arc swinging out (+nrm).
    const hingeAtB = o.hingeSide === "b" || o.hingeSide === "end" || o.hingeSide === "right";
    const hinge = hingeAtB ? p2 : p1;
    const far = hingeAtB ? p1 : p2;
    const swing = { x: hinge.x + nrm.x * o.width, y: hinge.y + nrm.y * o.width };
    els.push(<Line key={`wl${o.id}`} points={[hinge.x, hinge.y, swing.x, swing.y]} stroke={col} strokeWidth={1.3 * k} />);
    const baseAngle = (Math.atan2(far.y - hinge.y, far.x - hinge.x) * 180) / Math.PI;
    const swungAngle = (Math.atan2(swing.y - hinge.y, swing.x - hinge.x) * 180) / Math.PI;
    let sweep = swungAngle - baseAngle;
    while (sweep <= -180) sweep += 360;
    while (sweep > 180) sweep -= 360;
    els.push(
      <Arc key={`wa${o.id}`} x={hinge.x} y={hinge.y} innerRadius={o.width} outerRadius={o.width} angle={Math.abs(sweep)} rotation={sweep >= 0 ? baseAngle : baseAngle + sweep} stroke="rgba(103,194,200,0.5)" strokeWidth={1 * k} dash={[6 * k, 5 * k]} />
    );
  } else if (ws === "sliding") {
    // two overlapping panels offset to opposite faces + a slide arrow.
    const off = t2 * 0.4;
    els.push(<Line key={`ws1${o.id}`} points={[p1.x + nrm.x * off, p1.y + nrm.y * off, center.x + dir.x * half * 0.1 + nrm.x * off, center.y + dir.y * half * 0.1 + nrm.y * off]} stroke={col} strokeWidth={2 * k} />);
    els.push(<Line key={`ws2${o.id}`} points={[center.x - dir.x * half * 0.1 - nrm.x * off, center.y - dir.y * half * 0.1 - nrm.y * off, p2.x - nrm.x * off, p2.y - nrm.y * off]} stroke={col} strokeWidth={2 * k} />);
  } else if (ws === "double_hung") {
    // two stacked sashes shown by an extra offset line on each face.
    const off = t2 * 0.4;
    els.push(<Line key={`wh1${o.id}`} points={[p1.x + nrm.x * off, p1.y + nrm.y * off, p2.x + nrm.x * off, p2.y + nrm.y * off]} stroke={col} strokeWidth={1 * k} />);
    els.push(<Line key={`wh2${o.id}`} points={[p1.x - nrm.x * off, p1.y - nrm.y * off, p2.x - nrm.x * off, p2.y - nrm.y * off]} stroke={col} strokeWidth={1 * k} />);
  } else if (ws === "awning") {
    // top-hinged: frame + a diagonal indicating the outward tilt.
    els.push(<Line key={`waw${o.id}`} points={[p1.x, p1.y, p2.x + nrm.x * t2, p2.y + nrm.y * t2]} stroke="rgba(103,194,200,0.6)" strokeWidth={1 * k} />);
  } else if (ws === "louvre") {
    // angled glass slats across the opening.
    const slats = Math.max(3, Math.round(o.width / 16));
    for (let i = 1; i < slats; i++) {
      const s = i / slats;
      const q = { x: p1.x + dir.x * o.width * s, y: p1.y + dir.y * o.width * s };
      els.push(
        <Line
          key={`lv${o.id}_${i}`}
          points={[q.x - dir.x * 4 * k + nrm.x * t2, q.y - dir.y * 4 * k + nrm.y * t2, q.x + dir.x * 4 * k - nrm.x * t2, q.y + dir.y * 4 * k - nrm.y * t2]}
          stroke="rgba(103,194,200,0.55)"
          strokeWidth={1 * k}
        />
      );
    }
  }

  return <Group>{els}</Group>;
}

// ── dimension labels ──────────────────────────────────────────────────────────
function renderDimensions(
  scene: Scene,
  nodePos: (id: ID) => Vec2,
  k: number,
  units: Units
) {
  const els: React.ReactNode[] = [];
  for (const e of Object.values(scene.edges)) {
    const A = nodePos(e.a);
    const B = nodePos(e.b);
    const L = e.bulge ? arcLength(A, B, e.bulge) : dist(A, B);
    if (L < 30) continue;
    const mid = lerp(A, B, 0.5);
    const dir = norm(sub(B, A));
    const nrm = perp(dir);
    const off = e.thickness / 2 + 16 * k;
    const lx = mid.x + nrm.x * off;
    const ly = mid.y + nrm.y * off;
    let deg = (Math.atan2(B.y - A.y, B.x - A.x) * 180) / Math.PI;
    if (deg > 90 || deg < -90) deg += 180;
    els.push(
      <Text
        key={`dm${e.id}`}
        text={fmtLen(L, units)}
        x={lx}
        y={ly}
        rotation={deg}
        offsetX={26 * k}
        offsetY={6 * k}
        width={52 * k}
        align="center"
        fontFamily="Geist Mono"
        fontSize={11 * k}
        fill="rgba(103,194,200,0.85)"
      />
    );
  }
  return els;
}

// ── draft preview + snap marker ────────────────────────────────────────────────
function DraftPreview({ from, to, k, units }: { from: Vec2; to: Vec2; k: number; units: Units }) {
  const L = dist(from, to);
  const mid = lerp(from, to, 0.5);
  return (
    <Group>
      <Line points={[from.x, from.y, to.x, to.y]} stroke={C.preview} strokeWidth={1.6 * k} dash={[8 * k, 6 * k]} />
      <Circle x={from.x} y={from.y} radius={3.5 * k} fill={C.preview} />
      {L > 5 && (
        <Group>
          <Rect x={mid.x - 30 * k} y={mid.y - 24 * k} width={60 * k} height={17 * k} cornerRadius={4 * k} fill="#1d222c" stroke="#2b313d" strokeWidth={k} />
          <Text text={fmtLen(L, units)} x={mid.x - 30 * k} y={mid.y - 20 * k} width={60 * k} align="center" fontFamily="Geist Mono" fontSize={11 * k} fill="#ffbe78" />
        </Group>
      )}
    </Group>
  );
}

function SnapMarker({ p, kind, k }: { p: Vec2; kind: string; k: number }) {
  if (kind === "node") {
    return <Circle x={p.x} y={p.y} radius={7 * k} stroke="#ffbe78" strokeWidth={1.6 * k} />;
  }
  const s = 4 * k;
  return (
    <Group>
      <Line points={[p.x - s, p.y, p.x + s, p.y]} stroke="rgba(242,166,90,0.9)" strokeWidth={1.4 * k} />
      <Line points={[p.x, p.y - s, p.x, p.y + s]} stroke="rgba(242,166,90,0.9)" strokeWidth={1.4 * k} />
    </Group>
  );
}
