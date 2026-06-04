import { useMemo, useState } from "react";
import { useStore } from "../../store/useStore";
import {
  FURNITURE,
  FURNITURE_BY_CATEGORY,
  FURNITURE_CATEGORIES,
  FURNITURE_ORDER,
} from "../../lib/furniture";
import type { FurnitureKind } from "../../lib/types";

export function FurniturePalette() {
  const tool = useStore((s) => s.tool);
  const kind = useStore((s) => s.furnitureKind);
  const setKind = useStore((s) => s.setFurnitureKind);
  const category = useStore((s) => s.furnitureCategory);
  const setCategory = useStore((s) => s.setFurnitureCategory);
  const inspectorOpen = useStore((s) => s.inspectorOpen);
  const [query, setQuery] = useState("");

  const q = query.trim().toLowerCase();

  // When searching, ignore the active category and match across everything.
  const items: FurnitureKind[] = useMemo(() => {
    if (q) {
      return FURNITURE_ORDER.filter((k) => {
        const spec = FURNITURE[k];
        return (
          spec.label.toLowerCase().includes(q) ||
          spec.category.toLowerCase().includes(q) ||
          k.toLowerCase().includes(q)
        );
      });
    }
    return FURNITURE_BY_CATEGORY[category] ?? [];
  }, [q, category]);

  if (tool !== "furniture") return null;

  return (
    <div className={`palette palette-furniture ${inspectorOpen ? "inset" : ""}`}>
      <div className="palette-tabs" role="tablist" aria-label="Furniture categories">
        {FURNITURE_CATEGORIES.map((c) => (
          <button
            key={c.id}
            role="tab"
            aria-selected={!q && category === c.id}
            className={`palette-tab ${!q && category === c.id ? "on" : ""}`}
            onClick={() => {
              setCategory(c.id);
              setQuery("");
            }}
          >
            {c.label}
          </button>
        ))}
        <div className="palette-search">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search…"
            aria-label="Search furniture"
            spellCheck={false}
          />
          {q && (
            <button
              className="palette-search-clear"
              onClick={() => setQuery("")}
              aria-label="Clear search"
            >
              ×
            </button>
          )}
        </div>
      </div>

      <div className="palette-row palette-grid" role="listbox" aria-label="Furniture items">
        {items.length === 0 && <span className="palette-empty">No matches</span>}
        {items.map((k) => {
          const spec = FURNITURE[k];
          const on = kind === k;
          const ratio = spec.w / spec.d;
          const bw = Math.min(26, 16 * Math.max(1, ratio));
          const bh = Math.min(26, 16 * Math.max(1, 1 / ratio));
          return (
            <button
              key={k}
              role="option"
              aria-selected={on}
              className={`palette-item ${on ? "on" : ""}`}
              onClick={() => setKind(k)}
              title={`${spec.label} · ${spec.w}×${spec.d} cm`}
            >
              <span
                className="palette-glyph"
                style={{
                  width: bw,
                  height: bh,
                  borderRadius:
                    spec.shape === "round" ? "50%" : spec.shape === "soft" ? 5 : 2,
                  borderStyle: spec.shape === "dashed" ? "dashed" : "solid",
                }}
              />
              <span className="palette-name">{spec.label}</span>
              <span className="palette-size mono">
                {spec.w}×{spec.d}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
