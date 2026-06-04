# Building DENAH: A 2D/3D Floor-Plan Editor, From Empty Folder to Renovation Tool

> A complete technical write-up **and** build diary. This documents *what* was
> built, *how* it works at the code level (data structures, algorithms, the way
> components are inserted and state mutates), *why* each decision was made, and —
> just as importantly — the **bugs we hit and how we fixed them**, in roughly the
> order they happened. It's long on purpose: it's meant to be raw material for a
> longer-form article.

---

## Table of contents

1. [The premise](#1-the-premise)
2. [The foundational decision: a plan is a graph](#2-the-foundational-decision-a-plan-is-a-graph)
3. [The data model in full](#3-the-data-model-in-full)
4. [Coordinate systems: screen vs. world](#4-coordinate-systems-screen-vs-world)
5. [State management: the Zustand store and the `commit()` pattern](#5-state-management-the-zustand-store-and-the-commit-pattern)
6. [How you draw a wall (insertion, step by step)](#6-how-you-draw-a-wall-insertion-step-by-step)
7. [How openings attach to walls](#7-how-openings-attach-to-walls)
8. [Room detection: the algorithm that makes it feel smart](#8-room-detection-the-algorithm-that-makes-it-feel-smart)
9. [Rendering the 2D plan with Konva](#9-rendering-the-2d-plan-with-konva)
10. [Boundaries that aren't walls, and floor zones](#10-boundaries-that-arent-walls-and-floor-zones)
11. [The 2D → 3D pipeline](#11-the-2d--3d-pipeline)
12. [Doors and windows as real objects](#12-doors-and-windows-as-real-objects)
13. [Furniture: catalog, 2D symbols, 3D meshes, GLB drop-in](#13-furniture-catalog-2d-symbols-3d-meshes-glb-drop-in)
14. [Multi-floor](#14-multi-floor)
15. [Undo/redo without the pain (gesture coalescing)](#15-undoredo-without-the-pain-gesture-coalescing)
16. [Persistence and versioned documents](#16-persistence-and-versioned-documents)
17. [Accounts and cloud sync with Supabase](#17-accounts-and-cloud-sync-with-supabase)
18. [The AI bridge (MCP) — design by conversation](#18-the-ai-bridge-mcp--design-by-conversation)
19. [How it was built: multi-agent workflows](#19-how-it-was-built-multi-agent-workflows)
20. [Every bug we hit, and the fix](#20-every-bug-we-hit-and-the-fix)
21. [Performance work](#21-performance-work)
22. [Making it deployable](#22-making-it-deployable)
23. [The design language](#23-the-design-language)
24. [Full tech stack](#24-full-tech-stack)
25. [Lessons](#25-lessons)

---

## 1. The premise

It started as an open question — *"do you understand architectural floor plans?"*
— and converged, through a few clarifying choices, on a concrete brief: a
**furniture-and-walls drawing tool**, **2D plan + 3D model**, with an
**Awwwards-class, deliberately non-generic** look.

The north star solidified later: this is a **renovation tool**. You model your
actual house, with real measurements and real-sized fixtures, so you can verify
changes *before* construction. That single sentence drove a lot of decisions —
real standard furniture sizes, a validation pass, multi-floor support, accurate
areas to the square centimeter.

Everything is client-side. It runs in the browser, offline, with optional
accounts.

---

## 2. The foundational decision: a plan is a graph

Before writing any rendering code, the most consequential choice was how to
**represent the plan in memory**.

The naive approach — and the trap — is to store walls as independent line
segments: `{ x1, y1, x2, y2 }`. It feels natural and it's a dead end. With free
segments, every interesting feature (detecting rooms, joining wall corners,
extruding to 3D) becomes a pile of fragile floating-point special cases.

Instead, the plan is a **planar graph**:

- A **Node** is a shared corner point `(x, y)`.
- An **Edge** is a wall connecting two nodes.
- **Rooms are not stored.** They are *derived* — the bounded faces (cycles) of the
  graph.

This one decision makes three otherwise-expensive things nearly free:

1. **Rooms** become closed loops in the graph → auto-detected with measured areas.
2. **Corner joins** are clean because two walls meeting at a corner literally
   *share the same node*.
3. **3D** is a straightforward extrusion: lift each edge into a box.

The whole app is built on this spine. When you later read about room detection,
3D, and even the AI bridge, they all lean on "the plan is a graph."

---

## 3. The data model in full

Everything is in **centimeters**. The core types (simplified to their essence):

```ts
interface Node { id: string; x: number; y: number }

type EdgeKind = "wall" | "low" | "railing" | "open";
interface Edge {
  id: string;
  a: string;          // node id
  b: string;          // node id
  thickness: number;  // cm
  height: number;     // cm
  kind?: EdgeKind;    // default "wall"
  bulge?: number;     // signed arc sagitta ratio (0/undefined = straight)
}

type OpeningKind = "door" | "window";
interface Opening {
  id: string;
  edgeId: string;
  kind: OpeningKind;
  subtype: string;    // "single" | "double" | "sliding" | ... / "casement" | "bay" | ...
  t: number;          // 0..1 position along the wall
  width: number;
  sill: number;       // windows
  height: number;
  hingeSide?: "start" | "end";
  swingDir?: number;
}

type ZoneType = "room" | "terrace" | "garden" | "bathroom" | "kitchen" | "garage" | "water";
interface Zone { id: string; type: ZoneType; x: number; y: number }

interface Furniture {
  id: string; kind: string;
  x: number; y: number;     // center, world cm
  w: number; d: number;     // footprint
  rotation: number;         // radians
}

interface Label { id: string; x: number; y: number; text: string }

interface Scene {
  nodes:     Record<string, Node>;
  edges:     Record<string, Edge>;
  openings:  Record<string, Opening>;
  furniture: Record<string, Furniture>;
  zones:     Record<string, Zone>;
  roomNames: Record<string, string>;  // keyed by a room "signature"
  labels:    Record<string, Label>;
}
```

A few deliberate choices:

- **Everything is a `Record<id, T>`, not arrays.** O(1) lookup by id (which the AI
  bridge and the inspector rely on) and trivial structural cloning for history.
- **Openings carry a `t` ∈ [0,1]**, not absolute coordinates. A door is "60% of
  the way along *this* wall." If you move the wall, the door moves with it for
  free.
- **Rooms aren't in the model** — they're recomputed. The only room state we
  persist is a `roomNames` map keyed by a *signature* (the sorted list of the
  room's node ids), so a name survives as long as the room's corners do.

Later this `Scene` got wrapped one level up for multi-floor (see §14): the app
actually holds `levels: Level[]` where `Level = { id, name, elevation, scene }`,
and a top-level `scene` field that always mirrors the active level — so every
piece of code that reads `store.scene` kept working unchanged.

---

## 4. Coordinate systems: screen vs. world

This trips up everyone who builds a canvas editor, so it's worth being explicit.

There are two coordinate spaces:

- **World** — centimeters, the plan's own coordinate system. The model lives here.
- **Screen** — pixels in the canvas element, after the viewport's pan + zoom.

The viewport is `{ panX, panY, zoom }`. Conversions:

```ts
screenToWorld(p, vp) = { x: (p.x - vp.panX) / vp.zoom, y: (p.y - vp.panY) / vp.zoom }
worldToScreen(p, vp) = { x: p.x * vp.zoom + vp.panX, y: p.y * vp.zoom + vp.panY }
```

Two consequences that matter everywhere:

1. **Snapping and hit-testing happen in world space**, after converting the
   pointer. Get this wrong and nothing lines up.
2. **Walls scale with zoom (they're real cm), but UI chrome must not.** Handles,
   dimension labels, snap markers, selection outlines should stay the same *screen*
   size at any zoom. The trick: a factor `k = 1 / zoom`. A handle drawn with
   radius `5 * k` in world units always renders as 5 screen pixels. You'll see
   `* k` sprinkled through the 2D rendering code for exactly this reason.

Zoom-to-cursor (scroll wheel) is the canonical version of this math: keep the
world point under the cursor fixed while changing `zoom`, and solve for the new
`pan`.

---

## 5. State management: the Zustand store and the `commit()` pattern

All app state lives in a single **Zustand** store: the scene (levels), selection,
active tool, viewport, settings, plus all the actions that mutate them.

Every mutation flows through one internal helper, `commit()`:

```ts
const commit = (mutator: (draft: Scene) => void) => {
  const st = get();
  const idx = st.levels.findIndex(l => l.id === st.activeLevelId);

  // snapshot the whole level set for undo (unless we're mid-gesture, see §15)
  const pushHistory = !gestureActive || !gestureSnapped;
  const prevSnap = pushHistory ? snapOf(st) : null;
  if (gestureActive) gestureSnapped = true;

  // immutably clone the active scene, mutate the clone, write it back
  const nextScene = structuredClone(st.levels[idx].scene);
  mutator(nextScene);
  const nextLevels = st.levels.slice();
  nextLevels[idx] = { ...nextLevels[idx], scene: nextScene };

  set({
    levels: nextLevels,
    scene: nextScene,                                   // keep the mirror in sync
    ...(prevSnap ? { past: [...st.past, prevSnap], future: [] } : {}),
  });
};
```

So a public action like "place furniture" is tiny:

```ts
placeFurniture: (kind, x, y) => {
  const spec = FURNITURE[kind];
  commit(draft => {
    const id = uid("f");
    draft.furniture[id] = { id, kind, x, y, w: spec.w, d: spec.d, rotation: 0 };
  });
  set({ selection: [{ kind: "furniture", id }] });
}
```

This pattern bought us: immutable updates (React re-renders correctly), automatic
history snapshots, and a single chokepoint where the `scene`-mirrors-active-level
invariant is enforced.

---

## 6. How you draw a wall (insertion, step by step)

Walls are drawn by chained clicks. The interaction is a tiny state machine with a
`draft.anchorNodeId` (the node the next segment grows from):

1. **First click** → `startWall(point, snappedNodeId)`:
   - `ensureNode(point, snappedNodeId)` — if the cursor snapped onto an existing
     node, reuse it; otherwise create a new node.
   - set `draft.anchorNodeId` to that node.

2. **Each subsequent click** → `extendWall(point, snappedNodeId)`:
   - `ensureNode` the target.
   - create an edge `anchor → target` (skipping duplicates).
   - set `anchor = target` so the chain continues.

3. **Enter / Esc** → `finishWall()` clears the anchor.

`ensureNode` is the quiet hero — it's what makes corners *shared*:

```ts
const ensureNode = (draft, point, snappedId) => {
  if (snappedId && draft.nodes[snappedId]) return snappedId;  // reuse
  const id = uid("n");
  draft.nodes[id] = { id, x: point.x, y: point.y };
  return id;
};
```

Snapping decides what `point`/`snappedId` are, by priority:

1. **Node snap** — within a screen-pixel radius of an existing node (converted to
   world). This is what lets you close a loop precisely.
2. **Ortho/45°** — relative to the anchor, when Shift is held.
3. **Grid** — round to the grid (e.g., 10 cm).

Two refinements came later: **alignment guides** (when your cursor's x or y lines
up with another node/edge, a thin guide appears and snaps), and a **precision
input** — a floating HTML `<input>` over the canvas where you type an exact length
and press Enter to commit a wall of precisely that length along the current
direction. (Konva can't host DOM inputs, so the input is an absolutely-positioned
HTML element layered over the stage — a recurring pattern: canvas for graphics,
HTML overlays for text entry.)

---

## 7. How openings attach to walls

You pick the Door or Window tool and click *on a wall*. The hit-test, `pickEdge`,
projects the cursor onto every edge and returns the closest one within a
screen-pixel threshold (inflated by the wall's half-thickness), along with the
projection's `t`:

```ts
function pickEdge(world, scene, zoom, thresholdPx) {
  const thr = thresholdPx / zoom;
  let best = null;
  for (const e of Object.values(scene.edges)) {
    const pr = projectOnSegment(world, nodes[e.a], nodes[e.b]); // {t, point, distance}
    if (pr.distance <= thr + e.thickness / 2 && (!best || pr.distance < best.d))
      best = { edgeId: e.id, t: pr.t, point: pr.point, d: pr.distance };
  }
  return best;
}
```

`addOpening(edgeId, t, kind, subtype)` then creates an opening, pulling default
width/height/sill from a **type catalog** (door subtypes: single, double, sliding,
folding, pocket, garage; window subtypes: casement, fixed, sliding, double-hung,
awning, bay, louvre). Because the opening stores `t`, it stays glued to its wall
through any later edits.

---

## 8. Room detection: the algorithm that makes it feel smart

This is the piece that turns "some lines" into "a 12.4 m² room." It enumerates the
**bounded faces of the planar graph** via a **half-edge traversal**.

The idea: walk the graph always turning *as clockwise as possible*. From a
directed edge `u → v`, at `v` you choose the next neighbor `w` whose direction is
the first one clockwise from the reverse of where you came in. Keep going until
you return to the start. Each closed walk is a face.

```ts
const nextEdge = (u, v) => {
  const back = angle(v, u);            // direction back toward where we came from
  let best = null, bestDelta = Infinity;
  for (const w of neighbors(v)) {
    let delta = back - angle(v, w);    // clockwise angular distance
    while (delta <= 1e-9) delta += 2 * Math.PI;
    if (delta < bestDelta) { bestDelta = delta; best = w; }
  }
  return best;
};
```

For each face you compute the signed area (shoelace). The single *unbounded* outer
face has the opposite winding, so you drop it by sign. Area + centroid give you the
"12.4 m²" label placed in the middle of the room.

**Two subtleties that each cost real debugging time:**

- **Winding sign (the first bug).** In screen coordinates the y-axis points
  *down*, which mirrors the plane. With the clockwise-turn rule, interior faces
  come out **positive** and the outer face negative — the *opposite* of the
  textbook y-up convention. We initially filtered the wrong sign, which silently
  hid every real room. The fix was a one-character flip, but only after reasoning
  through the geometry (and verifying with a tiny Node test that a 2-room demo
  returned 28.8 m² and 19.2 m²).

- **Planarization for T-junctions (the second bug).** When one wall ends in the
  *middle* of another — a "T" — the graph isn't truly planar and the face tracer
  produces absurd, self-crossing "rooms" with areas like 49,953 m². The fix runs a
  **planarize** pass first: for every edge, find any node lying on its interior and
  split the edge there, so a partially-shared wall still closes a clean loop.

```ts
// for each edge, split it at interior nodes (T-junctions)
for (const e of edges) {
  const on = nodes.filter(n => n !== e.a && n !== e.b && liesOnSegment(n, e));
  on.sort(byParamAlongEdge);
  let prev = e.a;
  for (const n of on) { addSubEdge(prev, n); prev = n; }
  addSubEdge(prev, e.b);
}
```

This also future-proofed the model: AI-generated layouts and casual hand-drawing
both create T-junctions, and now they Just Work.

---

## 9. Rendering the 2D plan with Konva

The plan view is an **infinite canvas** on **Konva** (a 2D scene-graph over HTML5
canvas). Structure:

- **Pan/zoom via the stage transform** (`stage.x/y/scale`), never by resizing the
  element. The grid is drawn dynamically to fill only the visible world rectangle,
  so panning across a huge plan never tries to draw millions of lines. Minor grid
  lines are skipped entirely once they'd be denser than ~7 screen pixels apart.
- **Separate layers**, drawn back-to-front: grid → rooms (filled, tinted by floor
  type) → furniture → walls + openings → dimensions → node handles → a live
  draft/preview layer (the wall you're currently dragging, snap markers, ghosts).
- **Walls as thick lines + joint discs.** Each wall is a line with `strokeWidth =
  thickness` (in world units, so it scales correctly). At every shared node we
  draw a filled disc of radius `thickness/2` — that's what fills the corners
  cleanly where two walls meet. Openings are rendered by computing the *gap* and
  drawing the solid wall segments around it, then the symbol (a door's swing arc,
  a window's glass line) in the gap.
- **Everything UI-ish uses the `k = 1/zoom` trick** so it stays a fixed screen
  size.

Pointer events all funnel through the stage: `onPointerDown/Move/Up`, dispatched by
the active tool. Dragging a node updates a *live* drag position (so connected walls
and rooms follow in real time) and only commits to history once on release.

---

## 10. Boundaries that aren't walls, and floor zones

A key realization for modeling *real* homes: **not every boundary is a wall.** A
terrace has a railing; a carport or a void has nothing. So each edge carries a
`kind`:

- `wall` — full-height wall
- `low` — a knee/waist-height parapet
- `railing` — posts + a handrail
- `open` — **no physical structure at all**, but it still *closes the loop* so the
  floor area is computed

That last kind is the conceptual unlock, and it confused users at first (it
confused the client, which is exactly why it's worth explaining well): a floor
needs a boundary to know where it ends, *even when there's no wall there*. An
`open` edge is an invisible line that says "the floor stops here — but draw
nothing."

On top of that, **floor zones**: you drop a zone marker inside a room and it types
the floor — interior, terrace (timber deck), garden (grass), bathroom (tile),
kitchen, garage (concrete), or pool (recessed translucent water). A room adopts the
type of whichever zone marker falls inside it, decided by a **point-in-polygon**
ray-cast. In 3D each type maps to a distinct material; in 2D it tints the room
fill.

---

## 11. The 2D → 3D pipeline

Switching to **Model** mounts a **three.js** scene via **react-three-fiber** (with
**drei** helpers), lazily code-split so the 2D editor's initial load stays small.

A `buildModel(levels)` function turns the scene(s) into renderable geometry. The
core loop, per edge:

```
worldCm → meters (× 0.01)
for each edge:
  kind === "open"     → emit nothing (but still bounds the floor)
  kind === "railing"  → emit posts + a top/mid rail
  kind === "low"      → a half-height box
  kind === "wall"     → a full-height box
  then, per opening on the edge:
    compute the solid spans (the complement of the opening gaps)
    emit a box per solid span
    doors  → a lintel above + clickable leaf panel(s)
    windows→ a lintel + sill + a glass pane + a frame
floors: triangulate each detected room polygon → a floor mesh per zone material
```

Walls are split into solid spans by subtracting opening gaps — the same "complement
of intervals along `t`" computation used in 2D — so a door leaves a real hole, not
an overdraw.

The signature flourish is the **camera intro**: entering 3D animates the camera from
straight-down (the plan view) into an angled perspective — a literal visual bridge.
This fought with the orbit controls at first (two things steering one camera), so we
run the intro animation *without* controls mounted, then mount `OrbitControls` when
it finishes; mounting initializes from the current camera, so the handoff is seamless.

---

## 12. Doors and windows as real objects

Doors went through three iterations, which is a good illustration of "make it
correct, then make it real":

1. **v1 — a gap.** The wall was simply split around the door span. Functional, but
   in 3D it read as a *floor-to-ceiling slot*, not a door.
2. **v2 — lintel + leaf.** Added a header box above the opening (210 → 270 cm) and a
   door *leaf* (a thin panel) swung ~35° open, plus a little handle. Now it reads as
   a door.
3. **v3 — interactive + typed.** The leaf is **closed by default** and **swings open
   when you click it** (an eased `useFrame` rotation toward a target, toggled per
   door). And the model became *type-aware*: one `DoorLeaf` per opening carries a
   `panels[]` array — **single = 1 panel, double = 2 panels** hinged at opposite
   jambs meeting in the middle, with sliding/folding/pocket variants. (We verified
   each subtype's panel count with a headless test.)

Windows similarly grew frames and mullions per type, including a **bay** window that
projects *outward* from the wall plane with its own little sill.

---

## 13. Furniture: catalog, 2D symbols, 3D meshes, GLB drop-in

The catalog is **~55 items across 8 categories** (seating, tables, beds, storage,
kitchen, bathroom, appliances, decor) at **real standard sizes** — queen bed
160×200, 3-seat sofa 220×90, bathtub 170×75, fridge 70×70. Sofas span
loveseat/2-seat/3-seat/sectional. Every instance is freely resizable (type the
exact cm in the inspector), because the whole point is *your* house.

Each spec carries optional `render2d` / `render3d` hints. A renderer uses the
bespoke drawing if it has one, otherwise falls back to a **per-category** symbol/
mesh. That's how 55 kinds get good visuals without 55 hand-authored shapes — the
important ones are bespoke, the long tail is a clean category fallback.

The 2D symbols are composed Konva primitives (a sofa = body + back strip + arms +
cushions). The 3D meshes are composed three.js primitives (a sofa = base + backrest
+ arm boxes + cushion boxes). And there's a **GLB drop-in override**: drop a real
`.glb` model into `public/models/`, list it in a manifest, and the app loads it via
drei's `useGLTF`, **auto-scaling it to the item's footprint** (compute its bounding
box, scale to fit, drop it on the floor) and wrapping it in an error boundary that
falls back to the procedural mesh if the file is missing.

> Aside: we *wanted* to ship real CC0 furniture models out of the box, but the
> build environment had no outbound network, so we couldn't download asset packs.
> The drop-in system is the answer: procedural by default, real models the moment
> you add them.

---

## 14. Multi-floor

Real houses have storeys, so the model gained **levels**:

```ts
interface Level { id: string; name: string; elevation: number /*cm*/; scene: Scene }
```

The store holds `levels: Level[]` + `activeLevelId`, **and** a top-level `scene`
field that *always mirrors the active level's scene*. This was a deliberate
backward-compatibility move: dozens of components already read `store.scene`, so
keeping that pointer pointing at the active level meant the entire 2D editor,
inspector, and exporters kept working with zero changes — they simply operate on
the active level. Only two things needed new code: a level-tabs UI, and the 3D
builder, which now stacks each level's geometry at its `elevation`.

---

## 15. Undo/redo without the pain (gesture coalescing)

The first version of history pushed a full scene snapshot on *every* `commit()`.
That's correct but unusable: dragging a slider or a node fires dozens of commits, so
one Cmd-Z would undo a single pixel of a drag.

The fix is a **gesture** API: `beginGesture()` / `endGesture()`. During a gesture,
only the *first* mutation snapshots history; the rest mutate in place. So a drag or
a slider sweep becomes exactly **one** undo entry. The store tracks two flags
(`gestureActive`, `gestureSnapped`); the canvas wraps drags with begin/end, and the
inspector wraps slider interactions. History snapshots the whole level set, so undo
also covers level add/remove/rename.

---

## 16. Persistence and versioned documents

Saved work is a **document**, not a bare scene:

```ts
interface DenahDoc { levels: Level[]; activeLevelId: string; units: "metric" | "imperial" }
```

`serialize`/`parseDoc` handle it, and the parser is **backward-compatible**: an old
save that's just a single `scene` (from before multi-floor existed) is wrapped into
a one-level "Ground" document on load. The same document is autosaved to
`localStorage` (debounced) and restored on startup. This versioned, tolerant
parsing is what let the data model evolve repeatedly without ever losing a user's
work — including across the two big feature rewrites.

---

## 17. Accounts and cloud sync with Supabase

For multiple users, plans sync to the cloud via **Supabase**:

- **Auth** — email + Google.
- **Storage** — a `plans` table holding the full `DenahDoc` as **JSONB**.
- **Row Level Security** — policies so `auth.uid() = user_id` on every read/write;
  each user only ever sees their own plans. The browser ships the *anon* key (which
  is safe); RLS is what actually enforces privacy.

The whole thing **degrades to guest mode**: if the two `VITE_SUPABASE_*` env vars
aren't set, the Supabase client is `null`, every auth/cloud call becomes a no-op,
and the app runs local-only without ever crashing. The auth UI (a sign-up/login
modal, an account menu, a "My plans" dashboard) all check `isConfigured` and behave
gracefully when it's off. *Guest-first* was a design rule: every cloud feature has a
local fallback.

---

## 18. The AI bridge (MCP) — design by conversation

An experimental and genuinely fun thread: a **Model Context Protocol** server that
let an AI assistant *draw into the live app*.

Architecture:

```
AI assistant ──stdio──▶ MCP server ──WebSocket (5181)──▶ browser (live render)
                        (in-memory scene)
```

The server exposes tools — `add_room`, `add_wall`, `add_door` (with a type),
`add_zone`, plus edit-by-id (`move_item`, `delete_item`, `set_edge`, …) and `undo`.
Each tool mutates an in-memory scene and **broadcasts it over WebSocket** to any
open browser, which applies it instantly. It's **two-way**: the browser pushes the
user's own edits back, with an **anti-echo guard** (compare the last JSON seen in
either direction) so updates don't ping-pong. stdout is reserved for the MCP
protocol; all logs go to stderr.

The room-detection algorithm is ported into the server too, so it can summarize a
plan's areas. It's a dev-only tool (the server runs on the developer's machine), so
in production it's disabled — but it's a real glimpse of *designing a house by
talking to it*.

---

## 19. How it was built: multi-agent workflows

The build process is part of the story. The initial core was hand-built, but two
large feature batches were implemented with **file-disjoint parallel agent
workflows**:

- **Batch A** — 14 improvements: undo coalescing, performance, multi-select,
  precision input, geometry editing, room naming, 3D realism, multi-floor, a more
  powerful MCP, onboarding/a11y, plus curved walls, validation, imperial units, and
  CAD-quality export.
- **Batch B** — the renovation-grade furniture/door/window catalogs + the entire
  Supabase auth + cloud layer.

Each followed the same shape:

1. A **foundation agent** ran first and established the *contract* — the data types
   and store actions everyone else would build against — and returned it as text.
2. Then **5–6 agents ran in parallel**, each owning a **disjoint set of files** (2D
   canvas, 3D, UI panels, MCP, auth, export). Because the repo is a single shared
   working tree (no per-agent isolation), strict file ownership is what prevents two
   agents corrupting each other's edits. The foundation contract was injected
   verbatim into each parallel agent's prompt so they all coded against the same
   API.
3. A **verify + auto-fix loop** ran the full `tsc -b` + `vite build`, and dispatched
   fix agents with the exact errors until the build went green.

Both batches **compiled green on the first verify pass** — which only works because
the work was partitioned by file ownership around an explicit shared contract. The
lesson generalizes: *parallelize by file boundaries, serialize the contract.*

---

## 20. Every bug we hit, and the fix

A faithful list, because the bugs are where the real learning is.

| # | Symptom | Cause | Fix |
| - | ------- | ----- | --- |
| 1 | No rooms ever detected | Winding-sign filter backwards (y-down flips the sign) | Flip the sign test; verified with a headless 2-room test |
| 2 | Rooms with absurd areas (49,953 m²) | T-junctions break planar face tracing | **Planarize**: split edges at interior nodes before tracing |
| 3 | 3D viewport collapsed to a thin strip at the top | `.stage-wrap` had no height; the WebGL canvas asked for `100%` of an `auto`-height parent | Make the stage wrapper `position: absolute; inset: 0` so it fills its parent |
| 4 | Blank white screen after an update | A stale MCP server pushed a scene with no `zones` field; `Object.values(scene.zones)` threw | Kill the stray server **and** add defensive `normScene()` so any incoming scene is filled out |
| 5 | Furniture palette overlapped the inspector panel | Palette centered on the full viewport; the right inspector covered its edge | Hard-anchor the palette's right edge to the left of the inspector when it's open |
| 6 | Doors looked like full-height holes in 3D | The opening was just a gap, no header/leaf | Add a lintel above + a real door leaf (then made it interactive + typed) |
| 7 | "Double door" rendered one leaf | Model emitted one panel | Make `DoorLeaf.panels` an array; double = two leaves at opposite jambs |
| 8 | Couldn't download furniture/asset packs | No outbound network in the build sandbox | Ship procedural meshes + a **GLB drop-in** override instead |
| 9 | `tsc` failed on `import.meta.env.DEV` | No Vite client types referenced | Add `src/vite-env.d.ts` with `/// <reference types="vite/client" />` |
| 10 | (Pre-empted) white-screen on any runtime error | No top-level error boundary | Add an `ErrorBoundary` with a "reset local data" escape hatch |

The throughline: most of these were **invariant violations** (a field assumed to
exist, a coordinate convention assumed, a CSS box assumed to have size). The
durable fixes were *defensive* — normalize inputs, verify assumptions with tiny
headless tests, and fail soft.

---

## 21. Performance work

Two hotspots, both fixed without changing behavior:

1. **Room detection on every pointer move.** The 2D canvas recomputed
   `detectRooms` from a memo keyed on the live scene, which changes on *every*
   drag frame. We memoized it on a cheap **topology signature** (node positions +
   edge endpoints) so it only recomputes when the graph actually changes — not when
   furniture or zones move, and not on pan/zoom.
2. **Planarization was O(E×N).** Every edge tested against every node. Bounded with
   a bounding-box pre-filter so each edge only checks nearby nodes.

Plus structural bundle hygiene: the 3D scene (three.js) is **lazy-loaded**, and PDF
export (jsPDF + html2canvas, ~175 kB gzip) is **dynamically imported** only when
you actually export — so neither is in the initial payload.

---

## 22. Making it deployable

It's a static SPA, so deployment is just "serve the `dist/` folder," but a few
things make it production-grade:

- A multi-stage **Dockerfile** (Node build → nginx serve), with build-args for the
  Supabase env so they bake into the bundle at build time (and default to guest mode
  if omitted).
- An **nginx.conf** with SPA fallback (`try_files … /index.html`), hard caching of
  hashed assets, and no-cache on `index.html` so deploys take effect immediately.
- The MCP bridge is **gated to dev only** (`import.meta.env.DEV`) so a deployed site
  never tries to open a `ws://…:5181` connection that can't exist.

Target host: a static container on **Coolify**.

---

## 23. The design language

A deliberately un-generic aesthetic — the brief explicitly ruled out the "AI slop"
look (cream backgrounds, random serif type). The result is **"drafting
instrument"**: a cool graphite dark theme, a single warm **amber** accent (a
drafting pencil's colour), a faint blueprint grid, and **monospaced numerals
everywhere** so it reads like a precision tool. UI type is *Hanken Grotesk*; every
measurement is *Geist Mono*. The intentional touch is that numbers — coordinates,
dimensions, areas — always look like instrument readouts.

---

## 24. Full tech stack

| Layer | Choice |
| --- | --- |
| Build / dev | **Vite** + **TypeScript** |
| UI framework | **React 18** |
| 2D canvas | **Konva** + **react-konva** |
| 3D | **three.js** + **@react-three/fiber** + **@react-three/drei** |
| State | **Zustand** (gesture-coalesced undo/redo) |
| Animation | **Motion** |
| Auth + cloud | **Supabase** (`@supabase/supabase-js`, Postgres + RLS) |
| Export | **jsPDF** + a hand-rolled vector SVG exporter (lazy) |
| Deploy | static SPA → **Docker (nginx)** on **Coolify** |
| Fonts | Hanken Grotesk (UI) · Geist Mono (numerals) |

---

## 25. Lessons

- **Pick the right core data structure first.** "A plan is a graph" paid for itself
  across rooms, joins, 3D, and the AI bridge. Everything downstream got easier.
- **Coordinate conventions are load-bearing.** A y-down sign flip hid every room;
  the `1/zoom` factor keeps UI legible. Be explicit about screen vs. world.
- **Verify geometry with tiny headless tests.** Several bugs (winding, T-junctions,
  door panel counts) were caught/confirmed by ten-line Node scripts, not by
  clicking around.
- **Fail soft, normalize inputs.** Most crashes were missing-field assumptions. A
  `normScene()` and a top-level error boundary turned would-be white-screens into
  recoverable states.
- **Guest-first.** Every cloud feature having a local fallback means the app is
  always usable, and deployment never blocks on backend setup.
- **Parallelize by file boundaries, serialize the contract.** That's what let
  large, multi-file feature batches be built by parallel agents and still compile
  on the first try.
