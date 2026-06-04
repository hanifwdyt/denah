import { useStore } from "../../store/useStore";
import { IPlan, ICube } from "./Icons";

export function ViewToggle() {
  const mode = useStore((s) => s.mode);
  const setMode = useStore((s) => s.setMode);

  return (
    <div className="viewtoggle" role="tablist" aria-label="View mode">
      <button className={mode === "2d" ? "on" : ""} onClick={() => setMode("2d")} role="tab">
        <IPlan width={15} height={15} />
        Plan
      </button>
      <button className={mode === "3d" ? "on" : ""} onClick={() => setMode("3d")} role="tab">
        <ICube width={15} height={15} />
        Model
      </button>
    </div>
  );
}
