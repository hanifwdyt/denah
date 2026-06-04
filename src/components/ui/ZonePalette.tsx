import { useStore } from "../../store/useStore";
import { ZONES, ZONE_ORDER } from "../../lib/zones";

export function ZonePalette() {
  const tool = useStore((s) => s.tool);
  const type = useStore((s) => s.zoneType);
  const setType = useStore((s) => s.setZoneType);
  const inspectorOpen = useStore((s) => s.inspectorOpen);

  if (tool !== "zone") return null;

  return (
    <div className={`palette ${inspectorOpen ? "inset" : ""}`}>
      <span className="palette-label">FLOOR</span>
      <div className="palette-row">
        {ZONE_ORDER.map((z) => {
          const spec = ZONES[z];
          const on = type === z;
          return (
            <button
              key={z}
              className={`palette-item ${on ? "on" : ""}`}
              onClick={() => setType(z)}
              title={spec.label}
            >
              <span className="palette-glyph" style={{ width: 22, height: 22, borderRadius: 6, background: spec.swatch, borderColor: spec.swatch }} />
              <span className="palette-name">{spec.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
