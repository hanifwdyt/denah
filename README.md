# DENAH — drafting instrument

A precision **2D/3D floor plan editor** in the browser. Draw walls in plan view,
drop doors & windows, and toggle into an extruded 3D model — all from one shared
data model.

## Why it's built this way

The plan is a **planar graph**: shared `Node`s joined by `Edge`s (walls). This is
the single decision everything else rides on:

- **Rooms** are derived as bounded faces (cycles) of the graph — never drawn by
  hand. Area is computed via the shoelace formula. See `src/lib/rooms.ts`.
- **Joints** stay clean because corners share a node.
- **3D** just extrudes each edge to a box and punches openings. See
  `src/components/Scene3D/model.ts`.

## Stack

- **Vite + React + TypeScript**
- **Konva / react-konva** — 2D canvas (infinite pan/zoom, layered rendering)
- **three / @react-three/fiber / drei** — 3D model view (lazy-loaded)
- **Zustand** — scene state, tool state machine, undo/redo
- **Motion** — 2D↔3D crossfade

## Architecture

```
src/
  lib/
    types.ts        core model (Node/Edge/Opening/Furniture/Scene), defaults
    geometry.ts     vec math, screen↔world, snapping, edge picking, formatting
    rooms.ts        planar-graph face detection → measured rooms
  store/useStore.ts zustand store + actions (draw, edit, history)
  components/
    Canvas2D/       Konva stage, grid, walls, openings, dimensions, tools
    Scene3D/        r3f scene + 2D→3D extrusion model builder
    ui/             toolbar, top bar, inspector, status bar, view toggle, icons
  design/           tokens.css + global.css (graphite + amber aesthetic)
```

## Run

```bash
pnpm install
pnpm dev        # http://localhost:5180
pnpm build
```

## Controls

| Key | Tool |
| --- | --- |
| `V` | Select (drag corners / furniture) |
| `W` | Wall — click to drop corners, `Enter`/`Esc` to finish, hold `Shift` for ortho |
| `D` | Door — click on a wall |
| `F` | Window — click on a wall |
| `B` | Furniture — pick from the palette, click to place |
| `H` | Pan (also: drag empty space, middle-mouse) |
| `R` | Rotate selected furniture (`Shift+R` reverse) |
| `⌫` | Delete selection · `⌘Z` / `⌘⇧Z` undo/redo · scroll to zoom |

Click **Model** (top toggle) to extrude the plan into 3D.

## Files & export

- **Open / Save** project as `.denah.json` (top bar). Work also **autosaves** to
  `localStorage` and restores on reload.
- **Export** menu → PNG or PDF of the current view (2D plan or 3D model).

## Touch

One finger draws/selects/pans; **two fingers pinch to zoom** and pan. The right
panel collapses on small screens (toggle in the top bar).
