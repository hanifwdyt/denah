import * as THREE from "three";
import type {
  Scene,
  FurnitureKind,
  ZoneType,
  DoorSubtype,
  WindowSubtype,
} from "../../lib/types";
import { DEFAULTS, openingSubtype } from "../../lib/types";
import { dist, lerp, arcPoints } from "../../lib/geometry";
import { detectRooms, roomZoneType } from "../../lib/rooms";
import { FURNITURE } from "../../lib/furniture";
import { ZONES } from "../../lib/zones";

const M = 0.01; // cm → m

export interface Box {
  pos: [number, number, number];
  rotY: number;
  dim: [number, number, number];
  kind: "wall" | "sill" | "lintel" | "low" | "frame";
}
/** A window assembly — subtype drives the frame/mullion build at render time. */
export interface Glass {
  pos: [number, number, number]; // center of the opening (wall plane), m
  rotY: number;
  w: number; // m
  h: number; // m
  sill: number; // m — absolute Y of sill (base + sill height)
  thickness: number; // m — wall thickness
  subtype: WindowSubtype;
  /** outward normal in the XZ plane (unit), used by bay windows to project out. */
  normal: [number, number];
}
export interface Rail {
  a: [number, number]; // x,z in m
  b: [number, number];
  height: number; // m
  thickness: number; // m
  base: number; // m (level elevation)
}
/** One physical panel within a door assembly. */
export interface DoorPanel {
  /** Pivot/anchor point in world meters (hinge for swing; rail anchor for slide). */
  anchor: [number, number, number];
  /** Base orientation of the panel (closed), rad. */
  rotY: number;
  /** Panel runs from anchor along +localX for `width`. */
  width: number; // m
  height: number; // m
  thickness: number; // m
  /** Motion when the door opens. */
  motion: "swing" | "slide" | "fold";
  /** For swing/fold: extra rotation (rad) applied at the anchor when open. */
  openAngle: number;
  /** For slide: translation along the panel's local +X (m) when open. */
  slide: number;
  /** Should this panel show a handle? (one per assembly is enough) */
  handle: boolean;
}
/** A complete door at one opening: 1..N panels that move together on click. */
export interface DoorLeaf {
  id: string;
  subtype: DoorSubtype;
  height: number; // m — leaf height (for lintel ref)
  panels: DoorPanel[];
}
export interface FurnitureMesh {
  pos: [number, number, number];
  rotY: number;
  dim: [number, number, number];
  kind: FurnitureKind;
  color: string;
  round: boolean;
}
export interface Floor {
  shape: THREE.Shape;
  type: ZoneType;
  base: number; // m (level elevation of the floor slab)
}
/** Flat ceiling / roof slab over an interior room, at wall height. */
export interface Ceiling {
  shape: THREE.Shape;
  type: ZoneType;
  y: number; // m — top of the walls for this room
}

export interface LevelModel {
  boxes: Box[];
  glass: Glass[];
  rails: Rail[];
  doors: DoorLeaf[];
  furniture: FurnitureMesh[];
  floors: Floor[];
  ceilings: Ceiling[];
  base: number; // m — level elevation
}

export interface Model extends LevelModel {
  center: [number, number, number];
  radius: number;
}

// ── one level → geometry (everything offset upward by `base` meters) ──────────
export function buildLevelModel(
  scene: Scene,
  baseElevationCm = 0,
  bounds?: { track: (x: number, y: number) => void }
): LevelModel {
  const base = baseElevationCm * M;
  const boxes: Box[] = [];
  const glass: Glass[] = [];
  const rails: Rail[] = [];
  const doors: DoorLeaf[] = [];
  const floors: Floor[] = [];
  const ceilings: Ceiling[] = [];

  const track = bounds?.track ?? (() => {});

  for (const e of Object.values(scene.edges)) {
    const A = scene.nodes[e.a];
    const B = scene.nodes[e.b];
    if (!A || !B) continue;
    const L = dist(A, B);
    if (L < 1) continue;
    track(A.x, A.y);
    track(B.x, B.y);
    const ekind = e.kind ?? "wall";

    // 'open' boundaries are invisible (they still close a room/zone for floors)
    if (ekind === "open") continue;

    const curved = !!e.bulge && Math.abs(e.bulge) > 1e-4;

    // railings: posts + handrail, no solid wall (tessellate when curved)
    if (ekind === "railing") {
      const pts = curved ? arcPoints(A, B, e.bulge, 18) : [A, B];
      for (let i = 0; i < pts.length - 1; i++) {
        const p = pts[i];
        const q = pts[i + 1];
        track(p.x, p.y);
        rails.push({
          a: [p.x * M, p.y * M],
          b: [q.x * M, q.y * M],
          height: DEFAULTS.railHeight * M,
          thickness: e.thickness * M,
          base,
        });
      }
      continue;
    }

    const h = ekind === "low" ? Math.min(DEFAULTS.lowHeight, e.height) : e.height;
    const solidKind: Box["kind"] = ekind === "low" ? "low" : "wall";

    // Curved walls: tessellate into straight box segments (openings skipped).
    if (curved) {
      const pts = arcPoints(A, B, e.bulge, 28);
      for (let i = 0; i < pts.length - 1; i++) {
        const p = pts[i];
        const q = pts[i + 1];
        const segLen = dist(p, q);
        if (segLen < 0.5) continue;
        track(p.x, p.y);
        const mid = lerp(p, q, 0.5);
        const segRot = -Math.atan2(q.y - p.y, q.x - p.x);
        boxes.push({
          // small overlap so seams don't gap
          pos: [mid.x * M, (h / 2) * M + base, mid.y * M],
          rotY: segRot,
          dim: [(segLen + 1) * M, h * M, e.thickness * M],
          kind: solidKind,
        });
      }
      continue;
    }

    const rotY = -Math.atan2(B.y - A.y, B.x - A.x);

    const ops = Object.values(scene.openings)
      .filter((o) => o.edgeId === e.id)
      .map((o) => ({ ...o, half: o.width / 2 / L }))
      .sort((a, b) => a.t - b.t);

    // solid full-height spans (same complement logic as 2D)
    let cur = 0;
    const solids: [number, number][] = [];
    for (const o of ops) {
      const s = Math.max(0, o.t - o.half);
      const en = Math.min(1, o.t + o.half);
      if (s > cur) solids.push([cur, s]);
      cur = Math.max(cur, en);
    }
    if (cur < 1) solids.push([cur, 1]);

    const pushBox = (s: number, en: number, y0: number, y1: number, kind: Box["kind"]) => {
      const p1 = lerp(A, B, s);
      const p2 = lerp(A, B, en);
      const segLen = dist(p1, p2);
      if (segLen < 0.5) return;
      const mid = lerp(p1, p2, 0.5);
      boxes.push({
        pos: [mid.x * M, ((y0 + y1) / 2) * M + base, mid.y * M],
        rotY,
        dim: [segLen * M, (y1 - y0) * M, e.thickness * M],
        kind,
      });
    };

    for (const [s, en] of solids) pushBox(s, en, 0, h, solidKind);

    // wall direction (unit) and outward normal in plan coords
    const ddx = (B.x - A.x) / L;
    const ddy = (B.y - A.y) / L;
    // normal (perpendicular). Either side is "outside"; pick (ddy,-ddx).
    const nx = ddy;
    const ny = -ddx;

    // openings: header/lintel for both; framed glass for windows; leaves for doors
    for (const o of ops) {
      const s = Math.max(0, o.t - o.half);
      const en = Math.min(1, o.t + o.half);
      const subtype = openingSubtype(o);

      if (o.kind === "window") {
        const wsub = subtype as WindowSubtype;
        if (o.sill > 2) pushBox(s, en, 0, o.sill, "sill");
        const top = o.sill + o.height;
        if (top < h) pushBox(s, en, top, h, "lintel");

        // — window frame: thin jambs + head + sill rail + a center mullion —
        // (bay windows build their own projecting frame in Scene3D; just the head+jambs here)
        const fT = Math.max(4, Math.min(8, o.width * 0.06)); // frame member thickness (cm)
        const center = lerp(A, B, o.t);
        // jambs (left/right) full window height
        pushBox(s, Math.min(en, s + fT / L), o.sill, top, "frame");
        pushBox(Math.max(s, en - fT / L), en, o.sill, top, "frame");
        // head + sill rails (full opening width)
        pushBox(s, en, top - fT, top, "frame");
        pushBox(s, en, o.sill, o.sill + fT, "frame");
        // center mullion — only for types that read better with one
        if (wsub !== "bay") {
          const mt = fT / L / 2;
          pushBox(Math.max(s, o.t - mt), Math.min(en, o.t + mt), o.sill, top, "frame");
        }

        glass.push({
          pos: [center.x * M, (o.sill + o.height / 2) * M + base, center.y * M],
          rotY,
          w: o.width * M,
          h: o.height * M,
          sill: o.sill * M + base,
          thickness: e.thickness * M,
          subtype: wsub,
          normal: [nx, ny],
        });
      } else {
        // door: header above the leaf(s), plus moving panel(s) per subtype
        if (o.height < h) pushBox(s, en, o.height, h, "lintel");

        const dsub = subtype as DoorSubtype;
        const hingeAtEnd =
          o.hingeSide === "end" || o.hingeSide === "b" || o.hingeSide === "right";

        // swing sign (in/out). default inward.
        let swingSign = -1;
        if (typeof o.swingDir === "number") swingSign = o.swingDir >= 0 ? 1 : -1;
        else if (o.swingDir === "out" || o.swingDir === "right") swingSign = 1;
        else if (o.swingDir === "in" || o.swingDir === "left") swingSign = -1;

        // slide direction along the wall
        const slideToEnd = o.slideDir === "right";

        const pStart = lerp(A, B, s);
        const pEnd = lerp(A, B, en);
        const openW = o.width * M; // total opening width in m
        const oh = o.height * M;
        const th = 0.045;
        const yBase = base;

        const panels: DoorPanel[] = [];

        const swingPanel = (
          anchorPt: { x: number; y: number },
          baseRot: number,
          w: number,
          openA: number,
          handle: boolean
        ): DoorPanel => ({
          anchor: [anchorPt.x * M, yBase, anchorPt.y * M],
          rotY: baseRot,
          width: w,
          height: oh,
          thickness: th,
          motion: "swing",
          openAngle: openA,
          slide: 0,
          handle,
        });

        if (dsub === "double") {
          // two leaves hinged at opposite jambs, meeting in the middle when closed
          const halfW = openW / 2;
          // left leaf hinged at start jamb, runs toward center
          panels.push(swingPanel(pStart, rotY, halfW, 1.35 * swingSign, true));
          // right leaf hinged at end jamb, runs back toward center (rot+PI)
          panels.push(swingPanel(pEnd, rotY + Math.PI, halfW, -1.35 * swingSign, true));
        } else if (dsub === "folding") {
          // bi-fold: 2 hinged segments from one jamb (concertina toward the other)
          const segW = openW / 2;
          const jambPt = hingeAtEnd ? pEnd : pStart;
          const baseRot = hingeAtEnd ? rotY + Math.PI : rotY;
          // first segment hinged at the jamb
          panels.push(swingPanel(jambPt, baseRot, segW, -1.5, true));
          // second segment hinged at the far end of the first (folds back the other way)
          // its anchor is the moving end of segment 1; we approximate by chaining:
          // place it at jamb + segW along wall, fold opposite. Renderer treats as fold-child.
          const midPt = hingeAtEnd ? lerp(A, B, o.t) : lerp(A, B, o.t);
          panels.push({
            anchor: [midPt.x * M, yBase, midPt.y * M],
            rotY: baseRot,
            width: segW,
            height: oh,
            thickness: th,
            motion: "fold",
            openAngle: 3.0, // folds back relative to parent
            slide: 0,
            handle: false,
          });
        } else if (dsub === "sliding" || dsub === "garage") {
          // one panel that slides aside along the wall (garage: slides up via same rig but along wall here)
          const startPt = pStart;
          panels.push({
            anchor: [startPt.x * M, yBase, startPt.y * M],
            rotY,
            width: openW,
            height: oh,
            thickness: th,
            motion: "slide",
            slide: slideToEnd ? openW * 0.92 : -openW * 0.92,
            openAngle: 0,
            handle: true,
          });
        } else if (dsub === "sliding_double") {
          // two panels slide apart (centre-opening)
          const halfW = openW / 2;
          // left panel: from start to center, slides toward start
          panels.push({
            anchor: [pStart.x * M, yBase, pStart.y * M],
            rotY,
            width: halfW,
            height: oh,
            thickness: th,
            motion: "slide",
            slide: -halfW * 0.92,
            openAngle: 0,
            handle: true,
          });
          // right panel: from center to end, slides toward end
          const ctr = lerp(A, B, o.t);
          panels.push({
            anchor: [ctr.x * M, yBase, ctr.y * M],
            rotY,
            width: halfW,
            height: oh,
            thickness: th,
            motion: "slide",
            slide: halfW * 0.92,
            openAngle: 0,
            handle: true,
          });
        } else if (dsub === "pocket") {
          // slides into the wall cavity (same as slide; panel disappears under wall span)
          const startPt = pStart;
          panels.push({
            anchor: [startPt.x * M, yBase, startPt.y * M],
            rotY,
            width: openW,
            height: oh,
            thickness: th,
            motion: "slide",
            slide: slideToEnd ? openW * 0.98 : -openW * 0.98,
            openAngle: 0,
            handle: true,
          });
        } else {
          // single (and any unknown) — one hinged leaf
          const jambPt = hingeAtEnd ? pEnd : pStart;
          const baseRot = hingeAtEnd ? rotY + Math.PI : rotY;
          const sign = hingeAtEnd ? -swingSign : swingSign;
          panels.push(swingPanel(jambPt, baseRot, openW, 1.4 * sign, true));
        }

        doors.push({ id: o.id, subtype: dsub, height: oh, panels });
      }
    }
  }

  // furniture → low boxes (plants render as rounded)
  const furniture: FurnitureMesh[] = [];
  for (const f of Object.values(scene.furniture)) {
    const spec = FURNITURE[f.kind];
    track(f.x, f.y);
    furniture.push({
      pos: [f.x * M, base, f.y * M], // group sits on the floor; parts build upward
      rotY: -f.rotation,
      dim: [f.w * M, Math.max(2, spec.height) * M, f.d * M],
      kind: f.kind,
      color: spec.color,
      round: spec.shape === "round",
    });
  }

  // rooms → typed floor shapes + interior ceiling slabs (at wall height)
  for (const r of detectRooms(scene)) {
    const shape = new THREE.Shape();
    r.polygon.forEach((p, i) => {
      const x = p.x * M;
      const y = p.y * M;
      if (i === 0) shape.moveTo(x, y);
      else shape.lineTo(x, y);
    });
    const type = roomZoneType(r.polygon, scene);
    floors.push({ shape, type, base });
    // outdoor zones (terrace/garden/pool) get NO roof slab
    if (!ZONES[type].outdoor) {
      ceilings.push({ shape, type, y: base + DEFAULTS.wallHeight * M });
    }
  }

  return { boxes, glass, rails, doors, furniture, floors, ceilings, base };
}

// ── all levels stacked → a single Model ───────────────────────────────────────
export function buildModel(
  levels: { scene: Scene; elevation: number }[]
): Model & { levels: LevelModel[] } {
  let minX = Infinity,
    minY = Infinity,
    maxX = -Infinity,
    maxY = -Infinity;
  const track = (x: number, y: number) => {
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  };

  const built: LevelModel[] = levels.map((l, i) =>
    buildLevelModel(l.scene, l.elevation || i * DEFAULTS.wallHeight, { track })
  );

  // flatten the active/primary collections too, so existing consumers keep working
  const flat: LevelModel = {
    boxes: built.flatMap((b) => b.boxes),
    glass: built.flatMap((b) => b.glass),
    rails: built.flatMap((b) => b.rails),
    doors: built.flatMap((b) => b.doors),
    furniture: built.flatMap((b) => b.furniture),
    floors: built.flatMap((b) => b.floors),
    ceilings: built.flatMap((b) => b.ceilings),
    base: 0,
  };

  const hasBounds = isFinite(minX);
  const cx = hasBounds ? ((minX + maxX) / 2) * M : 0;
  const cz = hasBounds ? ((minY + maxY) / 2) * M : 0;
  const radius = hasBounds ? Math.max(2, (Math.hypot(maxX - minX, maxY - minY) / 2) * M) : 4;

  return { ...flat, center: [cx, 0, cz], radius, levels: built };
}
