# denah-mcp

A Model Context Protocol bridge for the DENAH floor-plan editor. It lets Claude
(in Claude Code) **draw into the live web app** — you describe what you want here,
Claude calls the tools, and the plan appears in the browser in real time.

```
Claude Code ──stdio──▶ denah-mcp ──WebSocket(5181)──▶ browser app (5180)
                       (in-memory scene)              live render + auto-fit
```

## How it works

- The server keeps an in-memory scene (cm units, same shape as the app).
- Each tool mutates the scene and **broadcasts** it to every connected browser.
- The browser also **pushes** your manual edits back, so `get_plan` stays current.
- The bridge is two-way and reconnects automatically. If the app isn't open, the
  tools still work — open `http://localhost:5180` and it syncs on connect.

## Tools

| Tool | What it does |
| --- | --- |
| `get_plan` | Summary: rooms + areas, extent, counts, connected viewers |
| `clear_plan` | Empty the canvas |
| `add_room` | Rectangle by top-left `x,y` + `width,height` (cm). Shared corners auto-join |
| `add_wall` | Single wall between two points (cm) |
| `add_door` | Door on the wall nearest a point |
| `add_window` | Window on the wall nearest a point |
| `add_furniture` | Place an item (`sofa, bed, table, chair, desk, plant, rug, toilet, sink, stove`) |
| `set_scene` | Replace everything with a raw/`Save`d scene JSON |

All coordinates are **centimeters**, origin `(0,0)` top-left, `+y` downward.

## Register with Claude Code

Already added at user scope:

```bash
claude mcp add denah --scope user -- node /Users/hanift.widiyanto/app/denah/mcp/server.js
```

Restart your Claude Code session to load the `denah` tools, then just ask —
e.g. *"buatin denah apartemen 2 kamar 8×6 meter, kasih sofa di ruang tamu."*

## Config

- `DENAH_WS_PORT` — WebSocket port (default `5181`).
- The server logs to **stderr only**; stdout is the MCP protocol channel.
