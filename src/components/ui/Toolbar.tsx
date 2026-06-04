import { useStore } from "../../store/useStore";
import type { Tool } from "../../lib/types";
import { ICursor, IWall, IDoor, IWindow, IFurniture, IZone, IPan, ILabel } from "./Icons";

const TOOLS: { id: Tool; label: string; key: string; Icon: typeof IWall }[] = [
  { id: "select", label: "Select", key: "V", Icon: ICursor },
  { id: "wall", label: "Wall", key: "W", Icon: IWall },
  { id: "door", label: "Door", key: "D", Icon: IDoor },
  { id: "window", label: "Window", key: "F", Icon: IWindow },
  { id: "furniture", label: "Furniture", key: "B", Icon: IFurniture },
  { id: "zone", label: "Zone / floor", key: "Z", Icon: IZone },
  { id: "label", label: "Text label", key: "L", Icon: ILabel },
  { id: "pan", label: "Pan", key: "H", Icon: IPan },
];

export function Toolbar() {
  const tool = useStore((s) => s.tool);
  const setTool = useStore((s) => s.setTool);

  return (
    <div className="toolbar">
      {TOOLS.map((t, i) => (
        <div key={t.id}>
          <button
            className={`tool has-tip ${tool === t.id ? "on" : ""}`}
            onClick={() => setTool(t.id)}
            aria-label={t.label}
          >
            <t.Icon />
            <span className="badge">{t.key}</span>
            <span className="tip right">
              {t.label}
              <span className="k">{t.key}</span>
            </span>
          </button>
          {i === 0 && <div className="sep" />}
          {i === 6 && <div className="sep" />}
        </div>
      ))}
    </div>
  );
}
