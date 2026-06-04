import { Rect, Circle, Ellipse, Line, Group } from "react-konva";
import type { FurnitureKind } from "../../lib/types";
import { FURNITURE } from "../../lib/furniture";

// Detailed top-down architectural symbols, drawn centered at (0,0) in cm.
// `k` converts screen px → world units so detail strokes stay crisp at any zoom.
//
// Dispatch order: bespoke `render2d` hint (from the catalog) → category fallback.
// Every symbol is sized to the instance w×d so it stays dimensionally correct.
export function FurnitureGlyph2D({
  kind,
  w,
  d,
  k,
  stroke,
  fill,
}: {
  kind: FurnitureKind;
  w: number;
  d: number;
  k: number;
  stroke: string;
  fill: string;
}) {
  const hw = w / 2;
  const hd = d / 2;
  const sw = 1.4 * k;
  const dw = 1 * k;
  const detail = "rgba(160,170,186,0.4)";
  const soft = "rgba(160,170,186,0.10)";

  const body = (radius: number | number[], extra?: object) => (
    <Rect x={-hw} y={-hd} width={w} height={d} cornerRadius={radius as number} fill={fill} stroke={stroke} strokeWidth={sw} {...extra} />
  );

  const spec = FURNITURE[kind];
  // Prefer the bespoke render hint; fall back to the kind itself so legacy
  // hand-authored switch cases keep matching.
  const art = spec?.render2d ?? kind;

  switch (art) {
    // ── SEATING ────────────────────────────────────────────────────────────
    case "sofa":
    case "sofa3": {
      // straight sofa with arms, back cushion strip and seat cushions
      const arm = Math.min(w * 0.12, 18);
      const back = Math.min(d * 0.32, 28);
      const innerW = w - 2 * arm;
      const seats = Math.max(1, Math.round(innerW / 70));
      const cushGap = 5;
      const cushW = (innerW - cushGap * (seats - 1)) / seats;
      const cushY = -hd + back;
      const cushH = d - back - 6;
      return (
        <Group>
          {body(16)}
          <Rect x={-hw} y={-hd} width={w} height={back} cornerRadius={[16, 16, 4, 4]} fill={soft} stroke={detail} strokeWidth={dw} />
          <Rect x={-hw} y={-hd} width={arm} height={d} cornerRadius={[16, 4, 4, 16]} stroke={detail} strokeWidth={dw} />
          <Rect x={hw - arm} y={-hd} width={arm} height={d} cornerRadius={[4, 16, 16, 4]} stroke={detail} strokeWidth={dw} />
          {Array.from({ length: seats }, (_, i) => (
            <Rect key={i} x={-hw + arm + i * (cushW + cushGap)} y={cushY} width={cushW} height={cushH} cornerRadius={6} stroke={detail} strokeWidth={dw} />
          ))}
        </Group>
      );
    }
    case "sofaL": {
      // L-shaped sectional: main run along the top + a return down the right.
      const back = Math.min(d * 0.18, 26);
      const armR = Math.min(w * 0.28, 90); // depth of the chaise return
      return (
        <Group>
          {body(14)}
          {/* back along the top */}
          <Rect x={-hw} y={-hd} width={w} height={back} cornerRadius={[14, 14, 4, 4]} fill={soft} stroke={detail} strokeWidth={dw} />
          {/* right return back */}
          <Rect x={hw - back} y={-hd} width={back} height={d} cornerRadius={[4, 14, 14, 4]} fill={soft} stroke={detail} strokeWidth={dw} />
          {/* left arm */}
          <Rect x={-hw} y={-hd} width={Math.min(w * 0.1, 16)} height={d} cornerRadius={[14, 4, 4, 14]} stroke={detail} strokeWidth={dw} />
          {/* main seat cushions */}
          <Rect x={-hw + 16} y={-hd + back} width={w - 16 - armR} height={d - back - 6} cornerRadius={6} stroke={detail} strokeWidth={dw} />
          {/* chaise cushion */}
          <Rect x={hw - armR} y={-hd + back} width={armR - back - 4} height={d - back - 6} cornerRadius={6} stroke={detail} strokeWidth={dw} />
        </Group>
      );
    }
    case "armchair": {
      const arm = Math.min(w * 0.18, 18);
      const back = Math.min(d * 0.28, 22);
      return (
        <Group>
          {body(16)}
          <Rect x={-hw} y={-hd} width={w} height={back} cornerRadius={[16, 16, 4, 4]} fill={soft} stroke={detail} strokeWidth={dw} />
          <Rect x={-hw} y={-hd} width={arm} height={d} cornerRadius={[16, 4, 4, 16]} stroke={detail} strokeWidth={dw} />
          <Rect x={hw - arm} y={-hd} width={arm} height={d} cornerRadius={[4, 16, 16, 4]} stroke={detail} strokeWidth={dw} />
          <Rect x={-hw + arm} y={-hd + back} width={w - 2 * arm} height={d - back - 5} cornerRadius={6} stroke={detail} strokeWidth={dw} />
        </Group>
      );
    }
    case "chair": {
      return (
        <Group>
          {body(8)}
          {/* backrest strip on the top edge */}
          <Rect x={-hw} y={-hd} width={w} height={Math.min(d * 0.22, 12)} cornerRadius={[8, 8, 2, 2]} fill={soft} stroke={detail} strokeWidth={dw} />
        </Group>
      );
    }
    case "office_chair": {
      const r = Math.min(w, d) / 2;
      return (
        <Group>
          <Circle radius={r} fill={fill} stroke={stroke} strokeWidth={sw} />
          {/* seat */}
          <Circle radius={r * 0.62} stroke={detail} strokeWidth={dw} />
          {/* backrest arc on top */}
          <Rect x={-r * 0.66} y={-r} width={r * 1.32} height={r * 0.32} cornerRadius={[r, r, 3, 3]} fill={soft} stroke={detail} strokeWidth={dw} />
        </Group>
      );
    }
    case "stool": {
      const r = Math.min(w, d) / 2;
      return (
        <Group>
          <Circle radius={r} fill={fill} stroke={stroke} strokeWidth={sw} />
          <Circle radius={r * 0.6} stroke={detail} strokeWidth={dw} />
        </Group>
      );
    }

    // ── TABLES ─────────────────────────────────────────────────────────────
    case "dining": {
      // table top with chairs arrayed along the long sides
      const seats = Math.max(2, Math.round(w / 60));
      const per = Math.floor(seats / 2);
      const chairs: React.ReactNode[] = [];
      const cw = Math.min((w - 12) / per - 6, 42);
      const cd = Math.min(d * 0.26, 26);
      for (let i = 0; i < per; i++) {
        const cx = -hw + (w / per) * (i + 0.5);
        chairs.push(<Rect key={`t${i}`} x={cx - cw / 2} y={-hd - cd - 4 * k} width={cw} height={cd} cornerRadius={5} stroke={detail} strokeWidth={dw} />);
        chairs.push(<Rect key={`b${i}`} x={cx - cw / 2} y={hd + 4 * k} width={cw} height={cd} cornerRadius={5} stroke={detail} strokeWidth={dw} />);
      }
      return (
        <Group>
          {body(5)}
          <Rect x={-hw + 8} y={-hd + 8} width={w - 16} height={d - 16} cornerRadius={3} stroke={detail} strokeWidth={dw} />
          {chairs}
        </Group>
      );
    }
    case "coffee_table": {
      return (
        <Group>
          {body(8)}
          <Rect x={-hw + 7} y={-hd + 7} width={w - 14} height={d - 14} cornerRadius={5} stroke={detail} strokeWidth={dw} />
        </Group>
      );
    }
    case "desk": {
      return (
        <Group>
          {body(4)}
          {/* back edge + a drawer block */}
          <Line points={[-hw, -hd + 10, hw, -hd + 10]} stroke={detail} strokeWidth={dw} />
          <Rect x={hw - w * 0.32} y={-hd + 12} width={w * 0.28} height={d - 18} cornerRadius={3} stroke={detail} strokeWidth={dw} />
          <Line points={[hw - w * 0.18, -hd + 12 + (d - 18) / 2, hw - w * 0.18 + 6, -hd + 12 + (d - 18) / 2]} stroke={detail} strokeWidth={dw} />
        </Group>
      );
    }

    // ── BEDS ───────────────────────────────────────────────────────────────
    case "bed": {
      // pillows scale with width (single = 1, double/queen/king = 2)
      const twoPillows = w >= 130;
      const pillow = Math.min(d * 0.2, 34);
      return (
        <Group>
          {body(8)}
          {/* duvet fold line */}
          <Line points={[-hw, -hd + pillow + 10, hw, -hd + pillow + 10]} stroke={detail} strokeWidth={dw} />
          {twoPillows ? (
            <>
              <Rect x={-hw + 8} y={-hd + 7} width={(w - 24) / 2} height={pillow} cornerRadius={6} fill={soft} stroke={detail} strokeWidth={dw} />
              <Rect x={8} y={-hd + 7} width={(w - 24) / 2} height={pillow} cornerRadius={6} fill={soft} stroke={detail} strokeWidth={dw} />
            </>
          ) : (
            <Rect x={-hw + 8} y={-hd + 7} width={w - 16} height={pillow} cornerRadius={6} fill={soft} stroke={detail} strokeWidth={dw} />
          )}
        </Group>
      );
    }

    // ── STORAGE ────────────────────────────────────────────────────────────
    case "wardrobe": {
      // double doors with a center split + handles, hanging-rail dashed line
      return (
        <Group>
          {body(3)}
          <Line points={[0, -hd, 0, hd]} stroke={detail} strokeWidth={dw} />
          <Circle x={-6 * k} y={0} radius={1.6 * k + 0.5} fill={detail} />
          <Circle x={6 * k} y={0} radius={1.6 * k + 0.5} fill={detail} />
          <Line points={[-hw + 5, -hd + 6, hw - 5, -hd + 6]} stroke={detail} strokeWidth={dw} dash={[6 * k, 5 * k]} />
        </Group>
      );
    }
    case "bookshelf": {
      // shelves drawn as horizontal divisions
      const shelves = Math.max(2, Math.round(w / 45));
      return (
        <Group>
          {body(2)}
          {Array.from({ length: shelves - 1 }, (_, i) => {
            const x = -hw + (w / shelves) * (i + 1);
            return <Line key={i} points={[x, -hd, x, hd]} stroke={detail} strokeWidth={dw} />;
          })}
        </Group>
      );
    }
    case "tv_unit": {
      return (
        <Group>
          {body(3)}
          {/* drawer/door divisions */}
          <Line points={[-hw + w / 3, -hd, -hw + w / 3, hd]} stroke={detail} strokeWidth={dw} />
          <Line points={[-hw + (2 * w) / 3, -hd, -hw + (2 * w) / 3, hd]} stroke={detail} strokeWidth={dw} />
        </Group>
      );
    }

    // ── KITCHEN ────────────────────────────────────────────────────────────
    case "counter": {
      return (
        <Group>
          {body(2)}
          {/* worktop edge line */}
          <Rect x={-hw + 3} y={-hd + 3} width={w - 6} height={d - 6} cornerRadius={2} stroke={detail} strokeWidth={dw} />
        </Group>
      );
    }
    case "stove": {
      return (
        <Group>
          {body(4)}
          {[
            [-w * 0.22, -d * 0.22],
            [w * 0.22, -d * 0.22],
            [-w * 0.22, d * 0.22],
            [w * 0.22, d * 0.22],
          ].map(([bx, by], i) => (
            <Circle key={i} x={bx} y={by} radius={Math.min(w, d) * 0.16} stroke={detail} strokeWidth={dw} />
          ))}
        </Group>
      );
    }
    case "oven": {
      return (
        <Group>
          {body(4)}
          <Rect x={-hw + 6} y={-hd + 8} width={w - 12} height={d - 16} cornerRadius={3} stroke={detail} strokeWidth={dw} />
          <Circle x={0} y={-hd + 4 * k} radius={1.8 * k + 0.5} fill={detail} />
        </Group>
      );
    }
    case "fridge": {
      return (
        <Group>
          {body(4)}
          {/* freezer/fridge split + handle */}
          <Line points={[-hw, -hd + d * 0.34, hw, -hd + d * 0.34]} stroke={detail} strokeWidth={dw} />
          <Line points={[hw - 8, -hd + 6, hw - 8, -hd + d * 0.34 - 6]} stroke={detail} strokeWidth={dw} />
          <Line points={[hw - 8, -hd + d * 0.34 + 6, hw - 8, hd - 6]} stroke={detail} strokeWidth={dw} />
        </Group>
      );
    }

    // ── BATHROOM / fixtures ────────────────────────────────────────────────
    case "toilet": {
      return (
        <Group>
          {/* tank at the back (top) */}
          <Rect x={-hw} y={-hd} width={w} height={d * 0.28} cornerRadius={4} fill={fill} stroke={stroke} strokeWidth={sw} />
          {/* bowl */}
          <Ellipse x={0} y={hd - d * 0.36} radiusX={w * 0.42} radiusY={d * 0.34} fill={fill} stroke={stroke} strokeWidth={sw} />
          <Ellipse x={0} y={hd - d * 0.36} radiusX={w * 0.26} radiusY={d * 0.2} stroke={detail} strokeWidth={dw} />
        </Group>
      );
    }
    case "sink": {
      return (
        <Group>
          {body(6)}
          <Ellipse x={0} y={2} radiusX={w * 0.34} radiusY={d * 0.3} stroke={detail} strokeWidth={dw} />
          <Circle x={0} y={-hd + 7} radius={2.5 * k + 1} fill={detail} />
        </Group>
      );
    }
    case "bathtub": {
      return (
        <Group>
          {body(18)}
          {/* inner basin */}
          <Rect x={-hw + 8} y={-hd + 8} width={w - 16} height={d - 16} cornerRadius={14} stroke={detail} strokeWidth={dw} />
          {/* drain + tap on one short end */}
          <Circle x={-hw + 18} y={0} radius={2.4 * k + 1} stroke={detail} strokeWidth={dw} />
        </Group>
      );
    }
    case "shower": {
      return (
        <Group>
          {body(3)}
          {/* diagonal tray drain lines */}
          <Line points={[-hw, -hd, hw, hd]} stroke={detail} strokeWidth={dw} />
          <Line points={[hw, -hd, -hw, hd]} stroke={detail} strokeWidth={dw} />
          <Circle x={0} y={0} radius={3 * k + 1} stroke={detail} strokeWidth={dw} />
        </Group>
      );
    }
    case "washing_machine": {
      const r = Math.min(w, d) * 0.32;
      return (
        <Group>
          {body(3)}
          <Circle radius={r} stroke={detail} strokeWidth={dw} />
          <Circle radius={r * 0.55} stroke={detail} strokeWidth={dw} />
        </Group>
      );
    }

    // ── APPLIANCES / DECOR ─────────────────────────────────────────────────
    case "tv": {
      // thin slab — render as a bar (depth is tiny)
      return (
        <Group>
          <Rect x={-hw} y={-hd} width={w} height={Math.max(d, 6 * k)} cornerRadius={2} fill="rgba(30,34,40,0.5)" stroke={stroke} strokeWidth={sw} />
          <Line points={[-hw + 6, 0, hw - 6, 0]} stroke={detail} strokeWidth={dw} />
        </Group>
      );
    }
    case "piano": {
      // upright/grand outline: rounded body + keyboard strip on the front
      return (
        <Group>
          {body([6, 6, 40, 40])}
          <Rect x={-hw + 4} y={hd - Math.min(d * 0.22, 16)} width={w - 8} height={Math.min(d * 0.22, 16)} cornerRadius={2} fill={soft} stroke={detail} strokeWidth={dw} />
        </Group>
      );
    }
    case "plant": {
      return (
        <Group>
          {/* pot */}
          <Circle radius={Math.min(w, d) / 2} fill={fill} stroke={stroke} strokeWidth={sw} />
          {/* foliage clusters */}
          <Circle radius={Math.min(w, d) * 0.28} stroke={detail} strokeWidth={dw} />
          <Circle x={-w * 0.14} y={-d * 0.1} radius={Math.min(w, d) * 0.16} stroke={detail} strokeWidth={dw} />
          <Circle x={w * 0.15} y={d * 0.12} radius={Math.min(w, d) * 0.14} stroke={detail} strokeWidth={dw} />
        </Group>
      );
    }
    case "rug": {
      return (
        <Group>
          <Rect x={-hw} y={-hd} width={w} height={d} cornerRadius={2} fill={fill} stroke={stroke} strokeWidth={sw} dash={[10 * k, 8 * k]} />
          <Rect x={-hw + 14} y={-hd + 14} width={w - 28} height={d - 28} cornerRadius={2} stroke={detail} strokeWidth={dw} dash={[6 * k, 6 * k]} />
        </Group>
      );
    }
    case "table": {
      return (
        <Group>
          {body(5)}
          <Rect x={-hw + 8} y={-hd + 8} width={w - 16} height={d - 16} cornerRadius={3} stroke={detail} strokeWidth={dw} />
        </Group>
      );
    }

    // ── CATEGORY FALLBACKS ─────────────────────────────────────────────────
    default:
      return <CategoryFallback kind={kind} w={w} d={d} k={k} stroke={stroke} fill={fill} />;
  }
}

// Clean per-CATEGORY fallback art for kinds without a bespoke symbol. Uses the
// catalog `category` so new kinds still read as the right kind of object.
function CategoryFallback({
  kind,
  w,
  d,
  k,
  stroke,
  fill,
}: {
  kind: FurnitureKind;
  w: number;
  d: number;
  k: number;
  stroke: string;
  fill: string;
}) {
  const hw = w / 2;
  const hd = d / 2;
  const sw = 1.4 * k;
  const dw = 1 * k;
  const detail = "rgba(160,170,186,0.4)";
  const soft = "rgba(160,170,186,0.10)";
  const spec = FURNITURE[kind];
  const cat = spec?.category ?? "tables";

  const rect = (radius: number | number[]) => (
    <Rect x={-hw} y={-hd} width={w} height={d} cornerRadius={radius as number} fill={fill} stroke={stroke} strokeWidth={sw} />
  );

  switch (cat) {
    case "seating": {
      // soft rounded body with a back-cushion strip
      const back = Math.min(d * 0.3, 22);
      return (
        <Group>
          {rect(14)}
          <Rect x={-hw} y={-hd} width={w} height={back} cornerRadius={[14, 14, 4, 4]} fill={soft} stroke={detail} strokeWidth={dw} />
        </Group>
      );
    }
    case "beds":
      // rect + a pillow strip along the top
      return (
        <Group>
          {rect(8)}
          <Rect x={-hw + 8} y={-hd + 7} width={w - 16} height={Math.min(d * 0.2, 30)} cornerRadius={6} fill={soft} stroke={detail} strokeWidth={dw} />
        </Group>
      );
    case "tables":
      // rect with an inset top
      return (
        <Group>
          {rect(5)}
          <Rect x={-hw + 8} y={-hd + 8} width={w - 16} height={d - 16} cornerRadius={3} stroke={detail} strokeWidth={dw} />
        </Group>
      );
    case "storage":
      // rect with door split lines (vertical)
      return (
        <Group>
          {rect(3)}
          <Line points={[0, -hd, 0, hd]} stroke={detail} strokeWidth={dw} />
        </Group>
      );
    case "kitchen":
    case "appliances":
      // rect + inset detail panel
      return (
        <Group>
          {rect(3)}
          <Rect x={-hw + 5} y={-hd + 5} width={w - 10} height={d - 10} cornerRadius={2} stroke={detail} strokeWidth={dw} />
        </Group>
      );
    case "bathroom":
      // rounded fixture with an inset basin
      return (
        <Group>
          {rect(12)}
          <Ellipse x={0} y={0} radiusX={w * 0.3} radiusY={d * 0.3} stroke={detail} strokeWidth={dw} />
        </Group>
      );
    case "decor":
    default:
      return rect(5);
  }
}
