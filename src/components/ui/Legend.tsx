import { useState, useEffect } from "react";
import { AnimatePresence, motion } from "motion/react";
import { ZONES, ZONE_ORDER } from "../../lib/zones";
import { ILegend, IHelp, IClose } from "./Icons";

// ─────────────────────────────────────────────────────────────────────────────
// Onboarding chrome: a Legend reference + a first-run Help guide.
//
// Boundary types and zone colours are explained with ICON + LETTER badges (not
// colour alone) so the key stays legible for colour-blind users.
// ─────────────────────────────────────────────────────────────────────────────

const FIRST_RUN_KEY = "denah:onboarded";

/** boundary-type key — each has a letter badge + glyph, never colour only. */
const BOUNDARIES: { letter: string; label: string; desc: string; render: () => JSX.Element }[] = [
  {
    letter: "W",
    label: "Wall",
    desc: "Full-height solid wall. Holds doors & windows.",
    render: () => <span className="lg-line wall" />,
  },
  {
    letter: "L",
    label: "Low wall",
    desc: "Waist-height parapet / half wall.",
    render: () => <span className="lg-line low" />,
  },
  {
    letter: "R",
    label: "Railing",
    desc: "Posts + handrail for balconies & terraces.",
    render: () => <span className="lg-line rail" />,
  },
  {
    letter: "O",
    label: "Open",
    desc: "No structure — only marks where a zone ends.",
    render: () => <span className="lg-line open" />,
  },
];

export function Legend() {
  const [open, setOpen] = useState(false);

  return (
    <div className="legend-wrap">
      <button
        className={`iconbtn has-tip legend-btn ${open ? "on" : ""}`}
        onClick={() => setOpen((o) => !o)}
        aria-label="Legend"
        aria-expanded={open}
      >
        <ILegend width={17} height={17} />
        <span className="tip right">Legend</span>
      </button>

      <AnimatePresence>
        {open && (
          <>
            <div className="menu-scrim" onClick={() => setOpen(false)} />
            <motion.div
              className="legend-panel"
              role="dialog"
              aria-label="Map legend"
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -8 }}
              transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
            >
              <div className="legend-head">
                <span className="insp-kicker">Reference</span>
                <button className="iconbtn legend-x" onClick={() => setOpen(false)} aria-label="Close legend">
                  <IClose width={15} height={15} />
                </button>
              </div>

              <div className="legend-sec-title">Boundary types</div>
              <div className="legend-list">
                {BOUNDARIES.map((b) => (
                  <div className="legend-item" key={b.letter}>
                    <span className="lg-badge" aria-hidden>
                      {b.letter}
                    </span>
                    <span className="lg-glyph" aria-hidden>
                      {b.render()}
                    </span>
                    <div className="lg-text">
                      <b>{b.label}</b>
                      <span>{b.desc}</span>
                    </div>
                  </div>
                ))}
              </div>

              <div className="legend-sec-title">Floor / zone types</div>
              <div className="legend-list">
                {ZONE_ORDER.map((z) => {
                  const spec = ZONES[z];
                  return (
                    <div className="legend-item" key={z}>
                      <span
                        className="lg-badge"
                        style={{ background: spec.swatch, color: "#0b0d11", borderColor: spec.swatch }}
                        aria-hidden
                      >
                        {spec.label[0]}
                      </span>
                      <div className="lg-text">
                        <b>{spec.label}</b>
                        <span>{spec.outdoor ? "Outdoor surface" : "Interior floor"}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}

// ── first-run help guide ─────────────────────────────────────────────────────
export function HelpGuide() {
  const [open, setOpen] = useState(false);

  // show automatically on first ever visit
  useEffect(() => {
    try {
      if (!localStorage.getItem(FIRST_RUN_KEY)) setOpen(true);
    } catch {
      /* localStorage may be blocked */
    }
  }, []);

  const close = () => {
    setOpen(false);
    try {
      localStorage.setItem(FIRST_RUN_KEY, "1");
    } catch {
      /* ignore */
    }
  };

  return (
    <>
      <button
        className="iconbtn has-tip help-btn"
        onClick={() => setOpen(true)}
        aria-label="Help and quick start guide"
      >
        <IHelp width={17} height={17} />
        <span className="tip bottom">Help</span>
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            className="help-scrim"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={close}
          >
            <motion.div
              className="help-card"
              role="dialog"
              aria-modal="true"
              aria-label="Quick start guide"
              initial={{ opacity: 0, y: 14, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 14, scale: 0.98 }}
              transition={{ duration: 0.26, ease: [0.16, 1, 0.3, 1] }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="help-head">
                <div>
                  <div className="insp-kicker">Welcome to Denah</div>
                  <div className="help-title">Drafting in 30 seconds</div>
                </div>
                <button className="iconbtn" onClick={close} aria-label="Close guide">
                  <IClose width={16} height={16} />
                </button>
              </div>

              <ol className="help-steps">
                <li>
                  <b>Draw walls.</b> Pick the <span className="kbd">W</span> tool, click to drop corners,
                  press <span className="kbd">⏎</span> to finish a run. Close a loop and it becomes a
                  measured room.
                </li>
                <li>
                  <b>Boundary types matter.</b> Every segment is a <i>wall</i>, <i>low wall</i>,{" "}
                  <i>railing</i>, or <i>open</i> edge. <i>Open</i> still closes a room for area, but
                  builds no structure in 3D — handy for terraces. Select a segment to change its type, or
                  open the <b>Legend</b> (left edge).
                </li>
                <li>
                  <b>Add doors &amp; windows.</b> Tools <span className="kbd">D</span> /{" "}
                  <span className="kbd">F</span>, then click on a wall. Doors are interactive in 3D — click
                  to swing them open.
                </li>
                <li>
                  <b>Tag floors &amp; furnish.</b> <span className="kbd">Z</span> drops a floor-type
                  marker inside a room; <span className="kbd">B</span> places furniture.{" "}
                  <span className="kbd">L</span> adds a text label.
                </li>
                <li>
                  <b>Go 3D.</b> Toggle <b>Model</b> up top to walk the volume. Stack floors with the level
                  tabs (bottom-left).
                </li>
              </ol>

              <button className="help-cta" onClick={close}>
                Start drafting
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
