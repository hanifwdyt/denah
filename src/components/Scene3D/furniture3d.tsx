import { Suspense, useMemo, Component, type ReactNode } from "react";
import { useGLTF } from "@react-three/drei";
import * as THREE from "three";
import type { FurnitureMesh } from "./model";
import { FURNITURE } from "../../lib/furniture";

// ─────────────────────────────────────────────────────────────────────────────
// 3D furniture. If a model file exists at /models/<kind>.glb (listed in
// /models/manifest.json) it is loaded and auto-fitted; otherwise a procedural
// mesh built from primitives is used. Either way it looks like furniture, not a
// box — and dropping a GLB in upgrades it instantly.
//
// Each item renders inside a group whose origin is the floor center; parts build
// upward in +Y. Units are meters.
// ─────────────────────────────────────────────────────────────────────────────

function shade(hex: string, amt: number) {
  const c = new THREE.Color(hex);
  c.offsetHSL(0, 0, amt);
  return `#${c.getHexString()}`;
}

function Box({
  p,
  s,
  color,
  rough = 0.8,
  metalness = 0.03,
}: {
  p: [number, number, number];
  s: [number, number, number];
  color: string;
  rough?: number;
  metalness?: number;
}) {
  return (
    <mesh position={p} castShadow receiveShadow>
      <boxGeometry args={s} />
      <meshStandardMaterial color={color} roughness={rough} metalness={metalness} />
    </mesh>
  );
}

function Cyl({
  p,
  rt,
  rb,
  h,
  color,
  seg = 18,
}: {
  p: [number, number, number];
  rt: number;
  rb: number;
  h: number;
  color: string;
  seg?: number;
}) {
  return (
    <mesh position={p} castShadow receiveShadow>
      <cylinderGeometry args={[rt, rb, h, seg]} />
      <meshStandardMaterial color={color} roughness={0.7} metalness={0.04} />
    </mesh>
  );
}

function legs(w: number, d: number, h: number, color: string, t = 0.05) {
  const xs = [-(w / 2 - t), w / 2 - t];
  const zs = [-(d / 2 - t), d / 2 - t];
  const out: ReactNode[] = [];
  let i = 0;
  for (const x of xs)
    for (const z of zs)
      out.push(<Box key={i++} p={[x, h / 2, z]} s={[t * 2, h, t * 2]} color={color} rough={0.6} />);
  return out;
}

// A generic upholstered sofa of given footprint (used by sofa variants).
function Couch({ w, h, d, c, light, dark }: { w: number; h: number; d: number; c: string; light: string; dark: string }) {
  return (
    <group>
      <Box p={[0, h * 0.2, d * 0.05]} s={[w, h * 0.4, d * 0.9]} color={c} />
      <Box p={[0, h * 0.55, -d / 2 + d * 0.12]} s={[w, h * 0.7, d * 0.24]} color={c} />
      <Box p={[-(w / 2 - w * 0.06), h * 0.42, 0]} s={[w * 0.12, h * 0.55, d]} color={dark} />
      <Box p={[w / 2 - w * 0.06, h * 0.42, 0]} s={[w * 0.12, h * 0.55, d]} color={dark} />
      <Box p={[-w * 0.2, h * 0.46, d * 0.08]} s={[w * 0.34, h * 0.14, d * 0.66]} color={light} rough={0.9} />
      <Box p={[w * 0.2, h * 0.46, d * 0.08]} s={[w * 0.34, h * 0.14, d * 0.66]} color={light} rough={0.9} />
    </group>
  );
}

// A mattressed bed of given footprint with headboard + pillows.
function BedFrame({ w, h, d, light, dark, pillows = 2 }: { w: number; h: number; d: number; light: string; dark: string; pillows?: number }) {
  const px = pillows === 1 ? [0] : [-w * 0.24, w * 0.24];
  return (
    <group>
      <Box p={[0, h * 0.25, 0]} s={[w, h * 0.5, d]} color={dark} />
      <Box p={[0, h * 0.72, d * 0.06]} s={[w * 0.96, h * 0.42, d * 0.9]} color={light} rough={0.95} />
      <Box p={[0, h * 0.9, -d / 2 + d * 0.02]} s={[w, h * 1.0, d * 0.06]} color={dark} />
      {px.map((x, i) => (
        <Box key={i} p={[x, h * 1.0, -d / 2 + d * 0.16]} s={[Math.min(w * 0.42, 0.55), h * 0.2, d * 0.22]} color="#eef1f6" rough={0.95} />
      ))}
    </group>
  );
}

// A tall storage carcass with doors + a plinth (wardrobe/pantry/cabinet).
function Carcass({ w, h, d, c, light, dark, doors = 2 }: { w: number; h: number; d: number; c: string; light: string; dark: string; doors?: number }) {
  const out: ReactNode[] = [
    <Box key="body" p={[0, h * 0.5 + 0.02, 0]} s={[w, h * 0.96, d]} color={c} />,
    <Box key="plinth" p={[0, 0.02, d * 0.02]} s={[w * 0.96, 0.04, d * 0.9]} color={dark} />,
  ];
  const dw = w / doors;
  for (let i = 0; i < doors; i++) {
    const x = -w / 2 + dw * (i + 0.5);
    out.push(<Box key={`d${i}`} p={[x, h * 0.5, d / 2 - 0.005]} s={[dw * 0.92, h * 0.9, 0.02]} color={light} rough={0.7} />);
    // handle
    const hx = x + (i % 2 === 0 ? dw * 0.36 : -dw * 0.36);
    out.push(<Box key={`h${i}`} p={[hx, h * 0.5, d / 2 + 0.01]} s={[0.02, h * 0.18, 0.02]} color={shade(c, -0.2)} rough={0.4} />);
  }
  return <group>{out}</group>;
}

// An open shelving unit (bookshelf) with horizontal shelves.
function Shelves({ w, h, d, c, dark }: { w: number; h: number; d: number; c: string; dark: string }) {
  const out: ReactNode[] = [
    <Box key="back" p={[0, h * 0.5, -d / 2 + 0.01]} s={[w, h, 0.02]} color={dark} />,
    <Box key="lt" p={[-w / 2 + 0.02, h * 0.5, 0]} s={[0.04, h, d]} color={c} />,
    <Box key="rt" p={[w / 2 - 0.02, h * 0.5, 0]} s={[0.04, h, d]} color={c} />,
  ];
  const n = Math.max(3, Math.round(h / 0.35));
  for (let i = 0; i <= n; i++) {
    const y = (h * i) / n;
    out.push(<Box key={`s${i}`} p={[0, y, 0]} s={[w, 0.03, d]} color={c} />);
  }
  // a few "books" for life
  for (let i = 0; i < n; i++) {
    const y = (h * (i + 0.5)) / n;
    out.push(<Box key={`b${i}`} p={[-w * 0.1, y, 0.02]} s={[w * 0.5, (h / n) * 0.7, d * 0.7]} color={shade(c, (i % 3) * 0.05 - 0.05)} rough={0.9} />);
  }
  return <group>{out}</group>;
}

// A base cabinet run with a worktop (kitchen counter / island).
function Counter({ w, h, d, c, light, dark, sink = false }: { w: number; h: number; d: number; c: string; light: string; dark: string; sink?: boolean }) {
  return (
    <group>
      <Box p={[0, h * 0.46, 0]} s={[w * 0.98, h * 0.86, d * 0.94]} color={c} />
      {/* worktop */}
      <Box p={[0, h * 0.94, 0]} s={[w, h * 0.06, d]} color={dark} rough={0.4} />
      {/* cabinet door divisions */}
      {[-w * 0.25, w * 0.25].map((x, i) => (
        <Box key={i} p={[x, h * 0.45, d / 2 - 0.01]} s={[w * 0.42, h * 0.7, 0.02]} color={light} rough={0.7} />
      ))}
      {sink && (
        <group>
          <Box p={[0, h * 0.92, 0]} s={[w * 0.5, h * 0.1, d * 0.5]} color={shade(c, -0.12)} rough={0.3} />
          <Cyl p={[0, h * 1.02, -d * 0.22]} rt={0.018} rb={0.018} h={0.18} color="#c9cdd6" />
        </group>
      )}
    </group>
  );
}

// ── procedural per-kind ──────────────────────────────────────────────────────
function Procedural({ item }: { item: FurnitureMesh }) {
  const [w, h, d] = item.dim;
  const c = item.color;
  const light = shade(c, 0.06);
  const dark = shade(c, -0.07);

  // resolve a render hint so several kinds can share a recipe
  const hint = FURNITURE[item.kind]?.render3d ?? item.kind;

  switch (hint) {
    // ── seating ──────────────────────────────────────────────────────────────
    case "sofa":
    case "sofa3":
      return <Couch w={w} h={h} d={d} c={c} light={light} dark={dark} />;
    case "sofaL": {
      // L-sectional: main couch + a return arm along +x, set into the depth.
      const mainD = d * 0.45;
      const armW = w * 0.42;
      return (
        <group>
          <group position={[0, 0, -d / 2 + mainD / 2]}>
            <Couch w={w} h={h} d={mainD} c={c} light={light} dark={dark} />
          </group>
          {/* chaise return */}
          <Box p={[w / 2 - armW / 2, h * 0.2, d * 0.08]} s={[armW, h * 0.4, d * 0.92]} color={c} />
          <Box p={[w / 2 - armW * 0.12, h * 0.42, d * 0.08]} s={[armW * 0.18, h * 0.55, d * 0.92]} color={dark} />
          <Box p={[w / 2 - armW / 2, h * 0.46, d * 0.12]} s={[armW * 0.7, h * 0.14, d * 0.7]} color={light} rough={0.9} />
        </group>
      );
    }
    case "armchair":
      return (
        <group>
          <Box p={[0, h * 0.28, d * 0.05]} s={[w * 0.86, h * 0.4, d * 0.86]} color={c} />
          <Box p={[0, h * 0.6, -d / 2 + d * 0.14]} s={[w * 0.86, h * 0.7, d * 0.24]} color={c} />
          <Box p={[-(w / 2 - w * 0.08), h * 0.45, 0]} s={[w * 0.16, h * 0.5, d * 0.86]} color={dark} />
          <Box p={[w / 2 - w * 0.08, h * 0.45, 0]} s={[w * 0.16, h * 0.5, d * 0.86]} color={dark} />
          <Box p={[0, h * 0.5, d * 0.06]} s={[w * 0.6, h * 0.14, d * 0.6]} color={light} rough={0.9} />
        </group>
      );
    case "office_chair":
      return (
        <group>
          {/* 5-star base + gas lift */}
          {[0, 1, 2, 3, 4].map((k) => {
            const a = (k / 5) * Math.PI * 2;
            return <Box key={k} p={[Math.cos(a) * w * 0.3, 0.03, Math.sin(a) * d * 0.3]} s={[w * 0.5, 0.05, 0.06]} color={dark} />;
          })}
          <Cyl p={[0, h * 0.3, 0]} rt={0.03} rb={0.03} h={h * 0.5} color={shade(c, -0.2)} />
          <Box p={[0, h * 0.56, 0]} s={[w * 0.86, h * 0.1, d * 0.86]} color={c} />
          <Box p={[0, h * 0.8, -d / 2 + d * 0.12]} s={[w * 0.8, h * 0.45, d * 0.14]} color={c} />
        </group>
      );
    case "chair":
      return (
        <group>
          <Box p={[0, h * 0.45, 0]} s={[w, h * 0.08, d]} color={c} />
          <Box p={[0, h * 0.72, -d / 2 + d * 0.08]} s={[w, h * 0.5, d * 0.12]} color={c} />
          {legs(w, d, h * 0.44, dark, 0.03)}
        </group>
      );
    case "stool":
      return (
        <group>
          <Cyl p={[0, h - 0.04, 0]} rt={Math.min(w, d) * 0.46} rb={Math.min(w, d) * 0.46} h={0.06} color={c} />
          {legs(w * 0.78, d * 0.78, h - 0.06, dark, 0.025)}
        </group>
      );

    // ── beds ─────────────────────────────────────────────────────────────────
    case "bed":
      return <BedFrame w={w} h={h} d={d} light={light} dark={dark} pillows={w < 1.1 ? 1 : 2} />;

    // ── tables ───────────────────────────────────────────────────────────────
    case "table":
      return (
        <group>
          <Box p={[0, h - h * 0.04, 0]} s={[w, h * 0.08, d]} color={c} />
          {legs(w, d, h * 0.94, dark)}
        </group>
      );
    case "dining": {
      // dining table + chairs sized by footprint (2 per long side)
      const chairs: ReactNode[] = [];
      const perSide = w >= 2.1 ? 3 : 2;
      for (let i = 0; i < perSide; i++) {
        const x = -w / 2 + (w * (i + 0.5)) / perSide;
        for (const zz of [-d / 2 - 0.22, d / 2 + 0.22]) {
          chairs.push(<Box key={`${i}-${zz}`} p={[x, 0.23, zz]} s={[0.42, 0.46, 0.42]} color={shade(c, -0.12)} />);
          chairs.push(<Box key={`b${i}-${zz}`} p={[x, 0.5, zz + (zz < 0 ? -0.18 : 0.18)]} s={[0.42, 0.5, 0.05]} color={shade(c, -0.12)} />);
        }
      }
      return (
        <group>
          <Box p={[0, h - 0.03, 0]} s={[w, 0.06, d]} color={c} />
          {legs(w, d, h * 0.95, dark)}
          {chairs}
        </group>
      );
    }
    case "coffee_table":
      return (
        <group>
          <Box p={[0, h - 0.02, 0]} s={[w, 0.04, d]} color={c} />
          <Box p={[0, h * 0.4, 0]} s={[w * 0.9, 0.03, d * 0.9]} color={dark} />
          {legs(w, d, h * 0.95, dark, 0.03)}
        </group>
      );
    case "desk":
      return (
        <group>
          <Box p={[0, h - 0.025, 0]} s={[w, 0.05, d]} color={c} />
          <Box p={[-w / 2 + w * 0.03, h * 0.45, 0]} s={[w * 0.05, h * 0.9, d * 0.92]} color={dark} />
          <Box p={[w / 2 - w * 0.16, h * 0.42, 0]} s={[w * 0.3, h * 0.82, d * 0.86]} color={dark} />
          <Box p={[0, h * 0.5, -d / 2 + 0.02]} s={[w, h * 0.5, 0.04]} color={dark} />
        </group>
      );

    // ── storage ──────────────────────────────────────────────────────────────
    case "wardrobe":
      return <Carcass w={w} h={h} d={d} c={c} light={light} dark={dark} doors={w > 1.2 ? 3 : 2} />;
    case "bookshelf":
      return <Shelves w={w} h={h} d={d} c={c} dark={dark} />;
    case "tv_unit":
      return (
        <group>
          <Box p={[0, h * 0.5, 0]} s={[w, h * 0.96, d]} color={c} />
          <Box p={[0, 0.03, d * 0.02]} s={[w * 0.96, 0.06, d * 0.9]} color={dark} />
          {[-w * 0.25, w * 0.25].map((x, i) => (
            <Box key={i} p={[x, h * 0.5, d / 2 - 0.005]} s={[w * 0.44, h * 0.85, 0.02]} color={light} rough={0.7} />
          ))}
        </group>
      );

    // ── kitchen ──────────────────────────────────────────────────────────────
    case "counter":
      return <Counter w={w} h={h} d={d} c={c} light={light} dark={dark} />;
    case "fridge":
      return (
        <group>
          <Box p={[0, h * 0.5, 0]} s={[w, h, d]} color={c} rough={0.4} />
          {/* freezer/fridge split door + handles */}
          <Box p={[0, h * 0.65, d / 2 - 0.005]} s={[w * 0.94, h * 0.62, 0.02]} color={light} rough={0.35} />
          <Box p={[0, h * 0.18, d / 2 - 0.005]} s={[w * 0.94, h * 0.3, 0.02]} color={light} rough={0.35} />
          <Box p={[w * 0.4, h * 0.65, d / 2 + 0.01]} s={[0.02, h * 0.3, 0.03]} color={shade(c, -0.25)} rough={0.3} />
          <Box p={[w * 0.4, h * 0.18, d / 2 + 0.01]} s={[0.02, h * 0.16, 0.03]} color={shade(c, -0.25)} rough={0.3} />
        </group>
      );
    case "oven":
      return (
        <group>
          <Box p={[0, h * 0.5, 0]} s={[w, h, d]} color={c} rough={0.4} />
          {/* oven door window */}
          <Box p={[0, h * 0.42, d / 2 - 0.005]} s={[w * 0.78, h * 0.5, 0.02]} color="#1c1f25" rough={0.2} metalness={0.2} />
          {/* control panel + knobs */}
          <Box p={[0, h * 0.86, d / 2 - 0.005]} s={[w * 0.92, h * 0.14, 0.02]} color={dark} />
          {[-0.3, -0.1, 0.1, 0.3].map((fx, i) => (
            <Cyl key={i} p={[w * fx, h * 0.86, d / 2 + 0.02]} rt={0.02} rb={0.02} h={0.03} color="#c9cdd6" />
          ))}
        </group>
      );
    case "stove":
      return (
        <group>
          <Box p={[0, h * 0.45, 0]} s={[w, h * 0.9, d]} color={c} />
          <Box p={[0, h * 0.92, 0]} s={[w * 0.98, h * 0.06, d * 0.98]} color={dark} rough={0.5} />
          {[
            [-w * 0.22, -d * 0.22],
            [w * 0.22, -d * 0.22],
            [-w * 0.22, d * 0.22],
            [w * 0.22, d * 0.22],
          ].map(([x, z], i) => (
            <Cyl key={i} p={[x, h * 0.96, z]} rt={Math.min(w, d) * 0.15} rb={Math.min(w, d) * 0.15} h={0.015} color="#15171c" />
          ))}
        </group>
      );

    // ── bathroom ─────────────────────────────────────────────────────────────
    case "bathtub":
      return (
        <group>
          <Box p={[0, h * 0.45, 0]} s={[w, h * 0.9, d]} color={c} rough={0.3} />
          {/* recessed basin */}
          <Box p={[0, h * 0.92, 0]} s={[w * 0.86, h * 0.3, d * 0.7]} color={shade(c, 0.1)} rough={0.2} />
          <Cyl p={[-w * 0.4, h * 1.0, -d * 0.28]} rt={0.018} rb={0.018} h={0.16} color="#c9cdd6" />
        </group>
      );
    case "shower":
      return (
        <group>
          {/* tray */}
          <Box p={[0, 0.04, 0]} s={[w, 0.08, d]} color={shade(c, 0.12)} rough={0.3} />
          {/* glass walls (two sides) */}
          <mesh position={[0, h * 0.5, -d / 2 + 0.01]} castShadow>
            <boxGeometry args={[w, h * 0.95, 0.015]} />
            <meshPhysicalMaterial color="#bcd6da" transmission={0.7} transparent opacity={0.35} roughness={0.08} />
          </mesh>
          <mesh position={[-w / 2 + 0.01, h * 0.5, 0]} castShadow>
            <boxGeometry args={[0.015, h * 0.95, d]} />
            <meshPhysicalMaterial color="#bcd6da" transmission={0.7} transparent opacity={0.35} roughness={0.08} />
          </mesh>
          {/* shower head */}
          <Cyl p={[-w / 2 + 0.1, h * 0.92, -d / 2 + 0.12]} rt={0.06} rb={0.06} h={0.03} color="#c9cdd6" />
        </group>
      );
    case "washing_machine":
      return (
        <group>
          <Box p={[0, h * 0.5, 0]} s={[w, h, d]} color={c} rough={0.4} />
          {/* round door */}
          <Cyl p={[0, h * 0.48, d / 2 - 0.01]} rt={Math.min(w, d) * 0.34} rb={Math.min(w, d) * 0.34} h={0.04} color="#2a2e35" seg={20} />
          <Cyl p={[0, h * 0.48, d / 2]} rt={Math.min(w, d) * 0.24} rb={Math.min(w, d) * 0.24} h={0.03} color="#7f97a8" seg={20} />
          <Box p={[0, h * 0.9, d / 2 - 0.005]} s={[w * 0.9, h * 0.12, 0.02]} color={dark} />
        </group>
      );
    case "toilet":
      return (
        <group>
          <Cyl p={[0, h * 0.4, d * 0.14]} rt={w * 0.46} rb={w * 0.36} h={h * 0.7} color={c} />
          <Box p={[0, h * 0.7, -d / 2 + d * 0.1]} s={[w * 0.86, h * 1.2, d * 0.2]} color={c} />
          <Cyl p={[0, h * 0.76, d * 0.14]} rt={w * 0.48} rb={w * 0.46} h={h * 0.08} color={light} />
        </group>
      );
    case "sink":
      // wall basin OR kitchen sink-in-counter, depending on depth
      return (
        <group>
          <Box p={[0, h * 0.45, 0]} s={[w * 0.82, h * 0.82, d * 0.82]} color={dark} />
          <Box p={[0, h * 0.9, 0]} s={[w, h * 0.14, d]} color={c} />
          <Box p={[0, h * 0.9, 0]} s={[w * 0.66, h * 0.16, d * 0.66]} color={shade(c, -0.1)} rough={0.4} />
          <Cyl p={[0, h * 1.02, -d * 0.32]} rt={0.02} rb={0.02} h={h * 0.22} color="#c9cdd6" />
        </group>
      );

    // ── decor / appliances ───────────────────────────────────────────────────
    case "tv":
      return (
        <group>
          <Box p={[0, h * 0.62, 0]} s={[w, h * 0.7, Math.max(d, 0.06)]} color="#15171c" rough={0.3} metalness={0.2} />
          <Box p={[0, h * 0.62, 0.005]} s={[w * 0.95, h * 0.64, 0.01]} color="#0b0d11" rough={0.1} metalness={0.3} />
          {/* stand */}
          <Box p={[0, h * 0.14, 0]} s={[w * 0.22, h * 0.28, d * 1.4]} color="#22252b" />
          <Box p={[0, 0.01, 0]} s={[w * 0.4, 0.02, d * 3]} color="#22252b" />
        </group>
      );
    case "piano":
      return (
        <group>
          <Box p={[0, h * 0.6, 0]} s={[w, h * 0.7, d]} color={c} rough={0.25} metalness={0.1} />
          {/* keyboard ledge */}
          <Box p={[0, h * 0.38, d / 2 + 0.04]} s={[w * 0.9, 0.06, 0.18]} color="#eef1f6" rough={0.3} />
          <Box p={[0, h * 0.39, d / 2 + 0.04]} s={[w * 0.86, 0.02, 0.16]} color="#1a1a1a" rough={0.3} />
          {legs(w, d, h * 0.36, shade(c, -0.1), 0.04)}
        </group>
      );
    case "plant": {
      const potH = h * 0.32;
      const r = Math.min(w, d) / 2;
      return (
        <group>
          <Cyl p={[0, potH / 2, 0]} rt={r * 0.78} rb={r * 0.58} h={potH} color="#8a6f53" />
          <mesh position={[0, potH + r * 0.7, 0]} castShadow>
            <sphereGeometry args={[r * 1.0, 16, 14]} />
            <meshStandardMaterial color={c} roughness={0.9} />
          </mesh>
          <mesh position={[-r * 0.4, potH + r * 1.2, r * 0.2]} castShadow>
            <sphereGeometry args={[r * 0.6, 14, 12]} />
            <meshStandardMaterial color={light} roughness={0.9} />
          </mesh>
        </group>
      );
    }
    case "rug":
      return <Box p={[0, h / 2, 0]} s={[w, Math.max(h, 0.01), d]} color={c} rough={1} />;

    default:
      return <CategoryFallback item={item} />;
  }
}

// ── category fallback ─────────────────────────────────────────────────────────
// Any kind without a bespoke recipe still reads as proper furniture, shaped by
// its contract category rather than a featureless box.
function CategoryFallback({ item }: { item: FurnitureMesh }) {
  const [w, h, d] = item.dim;
  const c = item.color;
  const light = shade(c, 0.06);
  const dark = shade(c, -0.07);
  const cat = FURNITURE[item.kind]?.category ?? "decor";

  switch (cat) {
    case "seating":
      // generic bench/cushion seat
      return (
        <group>
          <Box p={[0, h * 0.42, 0]} s={[w, h * 0.16, d]} color={c} />
          <Box p={[0, h * 0.5, d * 0.04]} s={[w * 0.94, h * 0.1, d * 0.88]} color={light} rough={0.9} />
          {legs(w, d, h * 0.34, dark, 0.03)}
        </group>
      );
    case "tables":
      return (
        <group>
          <Box p={[0, h - h * 0.05, 0]} s={[w, h * 0.1, d]} color={c} />
          {legs(w, d, h * 0.92, dark)}
        </group>
      );
    case "beds":
      return <BedFrame w={w} h={h} d={d} light={light} dark={dark} pillows={w < 1.1 ? 1 : 2} />;
    case "storage":
      // a drawer chest with horizontal drawer lines
      return (
        <group>
          <Box p={[0, h * 0.5, 0]} s={[w, h * 0.96, d]} color={c} />
          <Box p={[0, 0.03, d * 0.02]} s={[w * 0.96, 0.06, d * 0.9]} color={dark} />
          {[0.25, 0.5, 0.75].map((f, i) => (
            <Box key={i} p={[0, h * f, d / 2 - 0.005]} s={[w * 0.9, h * 0.2, 0.02]} color={light} rough={0.7} />
          ))}
        </group>
      );
    case "kitchen":
      // base cabinet + worktop
      return <Counter w={w} h={h} d={d} c={c} light={light} dark={dark} />;
    case "bathroom":
      // rounded fixture
      return (
        <group>
          <Cyl p={[0, h * 0.5, 0]} rt={Math.min(w, d) * 0.5} rb={Math.min(w, d) * 0.42} h={h} color={c} seg={20} />
          <Cyl p={[0, h * 0.96, 0]} rt={Math.min(w, d) * 0.5} rb={Math.min(w, d) * 0.5} h={h * 0.08} color={light} seg={20} />
        </group>
      );
    case "appliances":
      // boxy appliance with a control strip
      return (
        <group>
          <Box p={[0, h * 0.5, 0]} s={[w, h, d]} color={c} rough={0.4} />
          <Box p={[0, h * 0.88, d / 2 - 0.005]} s={[w * 0.9, h * 0.12, 0.02]} color={dark} />
        </group>
      );
    case "decor":
    default:
      return <Box p={[0, h / 2, 0]} s={[w, Math.max(h, 0.02), d]} color={c} rough={0.9} />;
  }
}

// ── GLB loader (auto-fit to footprint) ───────────────────────────────────────
function GLBModel({ url, w, d }: { url: string; w: number; d: number }) {
  const { scene } = useGLTF(url);
  const cloned = useMemo(() => scene.clone(true), [scene]);
  const fit = useMemo(() => {
    const box = new THREE.Box3().setFromObject(cloned);
    const size = new THREE.Vector3();
    box.getSize(size);
    const s = Math.min(w / (size.x || 1), d / (size.z || 1));
    const cx = ((box.min.x + box.max.x) / 2) * s;
    const cz = ((box.min.z + box.max.z) / 2) * s;
    cloned.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh) {
        m.castShadow = true;
        m.receiveShadow = true;
      }
    });
    return { s, pos: [-cx, -box.min.y * s, -cz] as [number, number, number] };
  }, [cloned, w, d]);
  return <primitive object={cloned} scale={fit.s} position={fit.pos} />;
}

class Boundary extends Component<{ fallback: ReactNode; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

// ── public item ──────────────────────────────────────────────────────────────
export function FurnitureItem({ item, available }: { item: FurnitureMesh; available: Set<string> }) {
  const proc = <Procedural item={item} />;
  const useGlb = available.has(item.kind);
  return (
    <group position={item.pos} rotation={[0, item.rotY, 0]}>
      {useGlb ? (
        <Boundary fallback={proc}>
          <Suspense fallback={proc}>
            <GLBModel url={`/models/${item.kind}.glb`} w={item.dim[0]} d={item.dim[2]} />
          </Suspense>
        </Boundary>
      ) : (
        proc
      )}
    </group>
  );
}
