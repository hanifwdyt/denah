import { useMemo } from "react";
import { useStore, firstSelection } from "../../store/useStore";
import { detectRooms } from "../../lib/rooms";
import { fmtArea } from "../../lib/geometry";
import { validateScene } from "../../lib/validation";
import { ITrash, IRotate, IClose, IFlipH, ISwing, IWarn } from "./Icons";
import { FURNITURE } from "../../lib/furniture";
import { ZONES, ZONE_ORDER } from "../../lib/zones";
import { roomSignature, openingSubtype } from "../../lib/types";
import type { EdgeKind, FurnitureKind, Opening, OpeningSubtype } from "../../lib/types";
import {
  DOOR_TYPES,
  DOOR_TYPE_ORDER,
  WINDOW_TYPES,
  WINDOW_TYPE_ORDER,
  DOOR_WIDTH_PRESETS,
  DOOR_HEIGHT_PRESETS,
  WINDOW_SIZE_PRESETS,
  WINDOW_SILL_PRESETS,
} from "../../lib/openings";

export function Inspector() {
  const scene = useStore((s) => s.scene);
  const selection = useStore((s) => s.selection);
  const units = useStore((s) => s.settings.units);
  const updateEdge = useStore((s) => s.updateEdge);
  const updateOpening = useStore((s) => s.updateOpening);
  const setOpeningSubtype = useStore((s) => s.setOpeningSubtype);
  const updateFurniture = useStore((s) => s.updateFurniture);
  const updateZone = useStore((s) => s.updateZone);
  const updateLabel = useStore((s) => s.updateLabel);
  const rotateSelected = useStore((s) => s.rotateSelected);
  const deleteSelected = useStore((s) => s.deleteSelected);
  const clearSelection = useStore((s) => s.clearSelection);
  const setRoomName = useStore((s) => s.setRoomName);
  const open = useStore((s) => s.inspectorOpen);
  const setOpen = useStore((s) => s.setInspectorOpen);

  const rooms = useMemo(() => detectRooms(scene), [scene]);
  const issues = useMemo(() => validateScene(scene), [scene]);
  const totalArea = rooms.reduce((a, r) => a + r.area, 0);

  const sel = firstSelection({ selection });
  const multi = selection.length > 1;

  const edge = !multi && sel?.kind === "edge" ? scene.edges[sel.id] : null;
  const opening = !multi && sel?.kind === "opening" ? scene.openings[sel.id] : null;
  const openingEdge = opening ? scene.edges[opening.edgeId] : null;
  const furn = !multi && sel?.kind === "furniture" ? scene.furniture[sel.id] : null;
  const zone = !multi && sel?.kind === "zone" ? scene.zones[sel.id] : null;
  const label = !multi && sel?.kind === "label" ? scene.labels[sel.id] : null;

  if (!open) return null;

  const kicker = multi
    ? "Selection"
    : edge
      ? "Boundary"
      : opening
        ? opening.kind
        : furn
          ? FURNITURE[furn.kind].label
          : zone
            ? "Floor zone"
            : label
              ? "Text label"
              : "Project";
  const title = multi
    ? `${selection.length} items`
    : edge || opening || furn || zone || label
      ? "Properties"
      : "Overview";

  return (
    <aside className="inspector">
      <div className="insp-head">
        <div>
          <div className="insp-kicker">{kicker}</div>
          <div className="insp-title">{title}</div>
        </div>
        <button className="iconbtn insp-close" onClick={() => setOpen(false)} aria-label="Close panel">
          <IClose width={16} height={16} />
        </button>
      </div>

      <div className="insp-body">
        {multi && (
          <MultiPanel
            selection={selection}
            furnCount={selection.filter((s) => s.kind === "furniture").length}
            onRotate={rotateSelected}
            onClear={clearSelection}
            onDelete={deleteSelected}
          />
        )}

        {edge && (
          <EdgePanel
            kind={edge.kind ?? "wall"}
            thickness={edge.thickness}
            height={edge.height}
            onKind={(v) => updateEdge(edge.id, { kind: v })}
            onThickness={(v) => updateEdge(edge.id, { thickness: v })}
            onHeight={(v) => updateEdge(edge.id, { height: v })}
            onDelete={deleteSelected}
          />
        )}

        {zone && (
          <ZonePanel type={zone.type} onType={(t) => updateZone(zone.id, { type: t })} onDelete={deleteSelected} />
        )}

        {opening && openingEdge && (
          <OpeningPanel
            opening={opening}
            onPatch={(p) => updateOpening(opening.id, p)}
            onSubtype={(s) => setOpeningSubtype(opening.id, s)}
            onDelete={deleteSelected}
          />
        )}

        {furn && (
          <FurniturePanel
            kind={furn.kind}
            w={furn.w}
            d={furn.d}
            rotation={furn.rotation}
            onW={(v) => updateFurniture(furn.id, { w: v })}
            onD={(v) => updateFurniture(furn.id, { d: v })}
            onRotate={(delta) => rotateSelected(delta)}
            onDelete={deleteSelected}
          />
        )}

        {label && (
          <LabelPanel
            text={label.text}
            onText={(v) => updateLabel(label.id, { text: v })}
            onDelete={deleteSelected}
          />
        )}

        {!multi && !edge && !opening && !furn && !zone && !label && (
          <>
            <div className="stat-grid" style={{ marginBottom: 16 }}>
              <div className="stat">
                <div className="n mono">{rooms.length}</div>
                <div className="l">Rooms</div>
              </div>
              <div className="stat">
                <div className="n mono">{Object.keys(scene.edges).length}</div>
                <div className="l">Walls</div>
              </div>
              <div className="stat">
                <div className="n mono">{fmtArea(totalArea, units).replace(/\s\S+$/, "")}</div>
                <div className="l">{units === "imperial" ? "ft² total" : "m² total"}</div>
              </div>
              <div className="stat">
                <div className="n mono">{Object.keys(scene.openings).length}</div>
                <div className="l">Openings</div>
              </div>
            </div>

            {rooms.length > 0 ? (
              <>
                <div className="field-label" style={{ marginBottom: 8 }}>
                  <span>Rooms — tap to name</span>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {rooms
                    .sort((a, b) => b.area - a.area)
                    .map((r, i) => {
                      const sig = roomSignature(r.nodeIds);
                      const name = scene.roomNames[sig] ?? "";
                      return (
                        <div key={r.id} className="room-row">
                          <input
                            className="room-name"
                            value={name}
                            placeholder={`Room ${i + 1}`}
                            onChange={(e) => setRoomName(sig, e.target.value)}
                            aria-label={`Name for room ${i + 1}`}
                          />
                          <span className="mono room-area">{fmtArea(r.area, units)}</span>
                        </div>
                      );
                    })}
                </div>
              </>
            ) : (
              <p className="empty-hint">
                Pick the <b>Wall</b> tool <span className="kbd">W</span> and click to drop corners. Close a
                loop and it becomes a measured <b>room</b>. Tap <span className="kbd">⏎</span> or{" "}
                <span className="kbd">Esc</span> to finish a run.
              </p>
            )}

            <IssuesSection
              issues={issues}
              onPick={(at) => {
                if (!at) clearSelection();
              }}
            />
          </>
        )}
      </div>
    </aside>
  );
}

// ── multi-select ─────────────────────────────────────────────────────────────
function MultiPanel(props: {
  selection: { kind: string; id: string }[];
  furnCount: number;
  onRotate: (delta: number) => void;
  onClear: () => void;
  onDelete: () => void;
}) {
  const counts = props.selection.reduce<Record<string, number>>((acc, s) => {
    acc[s.kind] = (acc[s.kind] ?? 0) + 1;
    return acc;
  }, {});
  return (
    <>
      <p className="empty-hint" style={{ marginBottom: 12 }}>
        <b>{props.selection.length} items</b> selected. Bulk actions apply to all.
      </p>
      <div className="multi-counts">
        {Object.entries(counts).map(([k, n]) => (
          <span className="multi-chip" key={k}>
            {n} {k}
            {n > 1 ? "s" : ""}
          </span>
        ))}
      </div>

      {props.furnCount > 0 && (
        <div className="field" style={{ marginTop: 14 }}>
          <div className="field-label">
            <span>Rotate all furniture</span>
            <span className="val">{props.furnCount}</span>
          </div>
          <div className="seg">
            <button onClick={() => props.onRotate(-Math.PI / 12)} aria-label="Rotate selected −15 degrees">
              −15°
            </button>
            <button onClick={() => props.onRotate(Math.PI / 12)} aria-label="Rotate selected +15 degrees">
              +15°
            </button>
            <button onClick={() => props.onRotate(Math.PI / 2)} aria-label="Rotate selected 90 degrees">
              <IRotate width={13} height={13} /> 90°
            </button>
          </div>
        </div>
      )}

      <button className="btn-ghost" onClick={props.onClear} style={{ marginTop: 8 }}>
        Clear selection
      </button>
      <button className="btn-ghost btn-danger" onClick={props.onDelete} style={{ marginTop: 8 }}>
        <ITrash width={15} height={15} /> Delete all ({props.selection.length})
      </button>
    </>
  );
}

// ── validation issues ────────────────────────────────────────────────────────
function IssuesSection(props: {
  issues: ReturnType<typeof validateScene>;
  onPick: (at?: { x: number; y: number }) => void;
}) {
  if (props.issues.length === 0) return null;
  const errors = props.issues.filter((i) => i.severity === "error").length;
  return (
    <div className="issues">
      <div className="field-label" style={{ margin: "16px 0 8px" }}>
        <span>
          Issues {errors > 0 && <span style={{ color: "var(--danger)" }}>· {errors} error{errors > 1 ? "s" : ""}</span>}
        </span>
        <span className="val">{props.issues.length}</span>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
        {props.issues.map((iss) => (
          <button
            key={iss.id}
            className={`issue-row ${iss.severity}`}
            onClick={() => props.onPick(iss.at)}
            title={iss.at ? "Clear selection" : undefined}
          >
            <IWarn width={13} height={13} className={`issue-ico ${iss.severity}`} />
            <span>{iss.message}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

// ── shared slider ────────────────────────────────────────────────────────────
function Slider(props: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  unit?: string;
  onChange: (v: number) => void;
}) {
  return (
    <div className="field">
      <div className="field-label">
        <span>{props.label}</span>
        <span className="val">
          {Math.round(props.value)}
          {props.unit ?? " cm"}
        </span>
      </div>
      <input
        className="slider"
        type="range"
        min={props.min}
        max={props.max}
        step={props.step ?? 1}
        value={props.value}
        onChange={(e) => props.onChange(Number(e.target.value))}
        aria-label={props.label}
      />
    </div>
  );
}

// ── slider + exact numeric entry (type precise cm) ───────────────────────────
function NumberField(props: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  unit?: string;
  onChange: (v: number) => void;
}) {
  const step = props.step ?? 1;
  const clamp = (v: number) => Math.min(props.max, Math.max(props.min, v));
  return (
    <div className="field">
      <div className="field-label">
        <span>{props.label}</span>
        <div className="num-entry">
          <input
            className="num-input mono"
            type="number"
            min={props.min}
            max={props.max}
            step={step}
            value={Math.round(props.value)}
            onChange={(e) => {
              const raw = e.target.value;
              if (raw === "") return;
              const n = Number(raw);
              if (Number.isFinite(n)) props.onChange(clamp(n));
            }}
            aria-label={`${props.label} value`}
          />
          <span className="num-unit">{props.unit ?? "cm"}</span>
        </div>
      </div>
      <input
        className="slider"
        type="range"
        min={props.min}
        max={props.max}
        step={step}
        value={props.value}
        onChange={(e) => props.onChange(Number(e.target.value))}
        aria-label={props.label}
      />
    </div>
  );
}

const EDGE_KINDS: { v: EdgeKind; label: string }[] = [
  { v: "wall", label: "Wall" },
  { v: "low", label: "Low" },
  { v: "railing", label: "Rail" },
  { v: "open", label: "Open" },
];

function EdgePanel(props: {
  kind: EdgeKind;
  thickness: number;
  height: number;
  onKind: (v: EdgeKind) => void;
  onThickness: (v: number) => void;
  onHeight: (v: number) => void;
  onDelete: () => void;
}) {
  const solid = props.kind === "wall" || props.kind === "low";
  return (
    <>
      <div className="field">
        <div className="field-label">
          <span>Boundary type</span>
        </div>
        <div className="seg">
          {EDGE_KINDS.map((e) => (
            <button
              key={e.v}
              className={props.kind === e.v ? "on" : ""}
              onClick={() => props.onKind(e.v)}
              aria-pressed={props.kind === e.v}
            >
              {e.label}
            </button>
          ))}
        </div>
      </div>
      {solid && <Slider label="Thickness" value={props.thickness} min={5} max={40} onChange={props.onThickness} />}
      {props.kind === "wall" && (
        <Slider label="Height" value={props.height} min={200} max={400} onChange={props.onHeight} />
      )}
      <p className="empty-hint" style={{ marginBottom: 12 }}>
        {props.kind === "wall" && "Full-height wall."}
        {props.kind === "low" && "Low wall / parapet (waist height)."}
        {props.kind === "railing" && "Posts + handrail — for balconies & terraces."}
        {props.kind === "open" && "No structure — just marks where a zone ends."}
      </p>
      <button className="btn-ghost btn-danger" onClick={props.onDelete}>
        <ITrash width={15} height={15} /> Delete boundary
      </button>
    </>
  );
}

function ZonePanel(props: {
  type: keyof typeof ZONES;
  onType: (t: keyof typeof ZONES) => void;
  onDelete: () => void;
}) {
  return (
    <>
      <div className="field-label" style={{ marginBottom: 9 }}>
        <span>Floor / area type</span>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6, marginBottom: 14 }}>
        {ZONE_ORDER.map((z) => {
          const spec = ZONES[z];
          const on = props.type === z;
          return (
            <button
              key={z}
              onClick={() => props.onType(z)}
              aria-pressed={on}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                padding: "9px 10px",
                borderRadius: "var(--r-sm)",
                background: on ? "var(--amber-glow)" : "var(--bg-1)",
                border: `1px solid ${on ? "var(--amber-dim)" : "var(--line-soft)"}`,
                color: on ? "var(--amber-bright)" : "var(--ink-1)",
                fontSize: 12.5,
                fontWeight: 600,
              }}
            >
              <span style={{ width: 12, height: 12, borderRadius: 3, background: spec.swatch, flexShrink: 0 }} />
              {spec.label}
            </button>
          );
        })}
      </div>
      <p className="empty-hint" style={{ marginBottom: 12 }}>
        Drop this marker inside a room to set its floor. Terrace, garden & pool read as outdoor in 3D.
      </p>
      <button className="btn-ghost btn-danger" onClick={props.onDelete}>
        <ITrash width={15} height={15} /> Delete zone
      </button>
    </>
  );
}

function FurniturePanel(props: {
  kind: FurnitureKind;
  w: number;
  d: number;
  rotation: number;
  onW: (v: number) => void;
  onD: (v: number) => void;
  onRotate: (delta: number) => void;
  onDelete: () => void;
}) {
  const deg = Math.round(((props.rotation * 180) / Math.PI) % 360);
  const spec = FURNITURE[props.kind];
  const resetSize = () => {
    props.onW(spec.w);
    props.onD(spec.d);
  };
  return (
    <>
      <div className="field-label" style={{ marginBottom: 8 }}>
        <span>Footprint — type exact cm</span>
        <button className="link-btn" onClick={resetSize} aria-label="Reset to standard size">
          standard {spec.w}×{spec.d}
        </button>
      </div>
      <NumberField label="Width" value={props.w} min={10} max={500} onChange={props.onW} />
      <NumberField label="Depth" value={props.d} min={10} max={500} onChange={props.onD} />
      <div className="field" style={{ marginBottom: 14 }}>
        <div className="field-label">
          <span>Height (3D)</span>
          <span className="val">{spec.height} cm</span>
        </div>
        <p className="empty-hint" style={{ margin: 0 }}>
          Standard height for this object type — used in the 3D model.
        </p>
      </div>
      <div className="field">
        <div className="field-label">
          <span>Rotation</span>
          <span className="val">{((deg % 360) + 360) % 360}°</span>
        </div>
        <div className="seg">
          <button onClick={() => props.onRotate(-Math.PI / 12)} aria-label="Rotate −15 degrees">
            −15°
          </button>
          <button onClick={() => props.onRotate(Math.PI / 12)} aria-label="Rotate +15 degrees">
            +15°
          </button>
          <button onClick={() => props.onRotate(Math.PI / 2)} aria-label="Rotate 90 degrees">
            <IRotate width={13} height={13} /> 90°
          </button>
        </div>
      </div>
      <button className="btn-ghost btn-danger" onClick={props.onDelete} style={{ marginTop: 4 }}>
        <ITrash width={15} height={15} /> Delete object
      </button>
    </>
  );
}

function LabelPanel(props: { text: string; onText: (v: string) => void; onDelete: () => void }) {
  return (
    <>
      <div className="field">
        <div className="field-label">
          <span>Label text</span>
        </div>
        <textarea
          className="label-input"
          value={props.text}
          rows={3}
          placeholder="Type annotation…"
          onChange={(e) => props.onText(e.target.value)}
          aria-label="Label text"
        />
      </div>
      <button className="btn-ghost btn-danger" onClick={props.onDelete} style={{ marginTop: 4 }}>
        <ITrash width={15} height={15} /> Delete label
      </button>
    </>
  );
}

function OpeningPanel(props: {
  opening: Opening;
  onPatch: (p: Partial<Opening>) => void;
  onSubtype: (s: OpeningSubtype) => void;
  onDelete: () => void;
}) {
  const o = props.opening;
  const sub = openingSubtype(o);
  const isDoor = o.kind === "door";
  const swings = isDoor ? DOOR_TYPES[sub as keyof typeof DOOR_TYPES]?.swings ?? true : false;

  const wPreset = (w: number) =>
    o.width === w ? "on" : "";
  const flipHinge = () =>
    props.onPatch({ hingeSide: o.hingeSide === "right" ? "left" : "right" });
  const flipSwing = () =>
    props.onPatch({ swingDir: o.swingDir === "out" ? "in" : "out" });
  const flipSlide = () =>
    props.onPatch({ slideDir: o.slideDir === "right" ? "left" : "right" });

  return (
    <>
      {/* ── type ─────────────────────────────────────────────────────────── */}
      <div className="field">
        <div className="field-label">
          <span>{isDoor ? "Door type" : "Window type"}</span>
        </div>
        <div className="type-grid">
          {(isDoor ? DOOR_TYPE_ORDER : WINDOW_TYPE_ORDER).map((s) => {
            const spec = isDoor ? DOOR_TYPES[s as keyof typeof DOOR_TYPES] : WINDOW_TYPES[s as keyof typeof WINDOW_TYPES];
            const on = sub === s;
            return (
              <button
                key={s}
                className={`type-chip ${on ? "on" : ""}`}
                onClick={() => props.onSubtype(s)}
                aria-pressed={on}
                title={spec.hint}
              >
                {spec.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* ── size presets ─────────────────────────────────────────────────── */}
      {isDoor ? (
        <div className="field">
          <div className="field-label">
            <span>Width preset</span>
          </div>
          <div className="preset-row">
            {DOOR_WIDTH_PRESETS.map((w) => (
              <button
                key={w}
                className={`preset-chip mono ${wPreset(w)}`}
                onClick={() => props.onPatch({ width: w })}
                aria-pressed={o.width === w}
              >
                {w}
              </button>
            ))}
          </div>
          <div className="field-label" style={{ marginTop: 10 }}>
            <span>Height preset</span>
          </div>
          <div className="preset-row">
            {DOOR_HEIGHT_PRESETS.map((h) => (
              <button
                key={h}
                className={`preset-chip mono ${o.height === h ? "on" : ""}`}
                onClick={() => props.onPatch({ height: h })}
                aria-pressed={o.height === h}
              >
                {h}
              </button>
            ))}
          </div>
        </div>
      ) : (
        <div className="field">
          <div className="field-label">
            <span>Size preset</span>
          </div>
          <div className="preset-row">
            {WINDOW_SIZE_PRESETS.map((p) => {
              const on = o.width === p.width && o.height === p.height;
              return (
                <button
                  key={p.label}
                  className={`preset-chip mono ${on ? "on" : ""}`}
                  onClick={() => props.onPatch({ width: p.width, height: p.height })}
                  aria-pressed={on}
                >
                  {p.label}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* ── exact numeric size ───────────────────────────────────────────── */}
      <NumberField label="Width" value={o.width} min={40} max={400} onChange={(v) => props.onPatch({ width: v })} />
      <NumberField label="Height" value={o.height} min={60} max={280} onChange={(v) => props.onPatch({ height: v })} />

      {!isDoor && (
        <>
          <NumberField label="Sill height" value={o.sill} min={0} max={180} onChange={(v) => props.onPatch({ sill: v })} />
          <div className="preset-row" style={{ marginTop: -6, marginBottom: 14 }}>
            {WINDOW_SILL_PRESETS.map((s) => (
              <button
                key={s}
                className={`preset-chip mono ${o.sill === s ? "on" : ""}`}
                onClick={() => props.onPatch({ sill: s })}
                aria-pressed={o.sill === s}
              >
                {s}
              </button>
            ))}
          </div>
        </>
      )}

      <div className="field">
        <div className="field-label">
          <span>Position on wall</span>
          <span className="val">{Math.round(o.t * 100)}%</span>
        </div>
        <input
          className="slider"
          type="range"
          min={0.05}
          max={0.95}
          step={0.01}
          value={o.t}
          onChange={(e) => props.onPatch({ t: Number(e.target.value) })}
          aria-label="Position on wall"
        />
      </div>

      {isDoor && (
        <div className="field">
          <div className="field-label">
            <span>{swings ? "Swing" : "Slide"}</span>
          </div>
          {swings ? (
            <div className="seg">
              <button onClick={flipHinge} aria-label="Flip hinge side">
                <IFlipH width={14} height={14} /> Hinge
              </button>
              <button onClick={flipSwing} aria-label="Flip swing direction">
                <ISwing width={14} height={14} /> Swing
              </button>
            </div>
          ) : (
            <div className="seg">
              <button
                className={o.slideDir !== "right" ? "on" : ""}
                onClick={() => o.slideDir === "right" && flipSlide()}
                aria-pressed={o.slideDir !== "right"}
              >
                Slide ←
              </button>
              <button
                className={o.slideDir === "right" ? "on" : ""}
                onClick={() => o.slideDir !== "right" && flipSlide()}
                aria-pressed={o.slideDir === "right"}
              >
                Slide →
              </button>
            </div>
          )}
        </div>
      )}

      <button className="btn-ghost btn-danger" onClick={props.onDelete} style={{ marginTop: 4 }}>
        <ITrash width={15} height={15} /> Delete {o.kind}
      </button>
    </>
  );
}
