import { useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { OrbitControls, Grid, ContactShadows } from "@react-three/drei";
import * as THREE from "three";
import { useStore } from "../../store/useStore";
import { buildModel, type Model, type LevelModel } from "./model";
import { glHolder } from "../../lib/exporter";
import { FurnitureItem } from "./furniture3d";
import { ZONES } from "../../lib/zones";

export function Scene3D() {
  const levels = useStore((s) => s.levels);
  const model = useMemo(
    () => buildModel(levels.map((l) => ({ scene: l.scene, elevation: l.elevation }))),
    [levels]
  );

  const [introDone, setIntroDone] = useState(false);
  const [available, setAvailable] = useState<Set<string>>(new Set());

  // in-canvas controls (local UI state)
  const [showRoof, setShowRoof] = useState(false);
  const [sunAz, setSunAz] = useState(0.65); // 0..1 → azimuth around the model

  // discover which kinds have a dropped-in GLB model
  useEffect(() => {
    let alive = true;
    fetch("/models/manifest.json")
      .then((r) => (r.ok ? r.json() : { available: [] }))
      .then((m) => alive && setAvailable(new Set(m.available || [])))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  // sun position on a dome around the model centre, driven by the azimuth slider
  const sun = useMemo<[number, number, number]>(() => {
    const ang = sunAz * Math.PI * 2;
    const r = Math.max(8, model.radius * 1.6);
    return [model.center[0] + Math.cos(ang) * r, model.radius * 1.4 + 9, model.center[2] + Math.sin(ang) * r];
  }, [sunAz, model.center, model.radius]);
  const fill = useMemo<[number, number, number]>(() => {
    const ang = sunAz * Math.PI * 2 + Math.PI; // opposite side
    const r = Math.max(6, model.radius * 1.2);
    return [model.center[0] + Math.cos(ang) * r, model.radius * 0.7 + 4, model.center[2] + Math.sin(ang) * r];
  }, [sunAz, model.center, model.radius]);

  const ctrlBtn: React.CSSProperties = {
    display: "flex",
    alignItems: "center",
    gap: 8,
    padding: "6px 11px",
    background: "rgba(18,21,28,0.78)",
    border: "1px solid #2a313d",
    borderRadius: 8,
    color: "#cfd6e6",
    font: "11px/1 'Geist Mono', ui-monospace, monospace",
    letterSpacing: "0.06em",
    textTransform: "uppercase",
    backdropFilter: "blur(6px)",
    userSelect: "none",
  };

  return (
    <div className="stage-wrap" style={{ position: "relative", background: "linear-gradient(180deg,#12151c 0%,#0b0d11 100%)" }}>
      <Canvas
        shadows
        dpr={[1, 2]}
        gl={{ antialias: true, preserveDrawingBuffer: true, toneMapping: THREE.ACESFilmicToneMapping }}
        camera={{ fov: 42, position: [model.center[0], 16, model.center[2] + 0.01], near: 0.1, far: 400 }}
      >
        <color attach="background" args={["#0b0d11"]} />
        <fog attach="fog" args={["#0b0d11", model.radius * 3, model.radius * 11]} />

        <hemisphereLight args={["#cfd6e6", "#161a22", 0.55]} />
        <ambientLight intensity={0.22} />
        <directionalLight
          position={sun}
          intensity={1.55}
          color="#fff3e0"
          castShadow
          shadow-mapSize={[2048, 2048]}
          shadow-bias={-0.0004}
        >
          <orthographicCamera attach="shadow-camera" args={[-26, 26, 26, -26, 0.1, 90]} />
        </directionalLight>
        {/* cool fill from the opposite side */}
        <directionalLight position={fill} intensity={0.35} color="#9fb4d8" />
        {/* warm bounce from below the sun side */}
        <directionalLight position={[sun[0], 2, sun[2]]} intensity={0.18} color="#f2a65a" />

        <RegisterGL />

        {/* exterior ground plane */}
        <mesh
          rotation={[-Math.PI / 2, 0, 0]}
          position={[model.center[0], -0.02, model.center[2]]}
          receiveShadow
        >
          <planeGeometry args={[model.radius * 40, model.radius * 40]} />
          <meshStandardMaterial color="#15181f" roughness={1} metalness={0} />
        </mesh>

        <Floors model={model} />
        <Walls model={model} />
        {showRoof && <Ceilings model={model} />}
        <Rails model={model} />
        <Doors model={model} />
        <Glazing model={model} />
        <FurnitureMeshes levels={model.levels} available={available} />

        <Grid
          position={[model.center[0], -0.002, model.center[2]]}
          args={[60, 60]}
          cellSize={0.5}
          cellThickness={0.6}
          cellColor="#222732"
          sectionSize={5}
          sectionThickness={1}
          sectionColor="#2f3744"
          fadeDistance={model.radius * 7}
          fadeStrength={1.5}
          followCamera={false}
          infiniteGrid
        />
        <ContactShadows
          position={[model.center[0], 0.001, model.center[2]]}
          scale={model.radius * 6}
          blur={2.4}
          opacity={0.5}
          far={6}
        />

        {!introDone && <CameraRig target={model.center} radius={model.radius} onDone={() => setIntroDone(true)} />}
        {introDone && (
          <OrbitControls
            target={model.center}
            enableDamping
            dampingFactor={0.08}
            maxPolarAngle={Math.PI / 2.05}
            minDistance={1.5}
            maxDistance={model.radius * 10}
            makeDefault
          />
        )}
      </Canvas>

      {/* in-canvas controls overlay */}
      <div
        style={{
          position: "absolute",
          top: 12,
          right: 12,
          display: "flex",
          flexDirection: "column",
          gap: 8,
          alignItems: "flex-end",
          pointerEvents: "none",
        }}
      >
        <button
          onClick={() => setShowRoof((v) => !v)}
          style={{
            ...ctrlBtn,
            cursor: "pointer",
            pointerEvents: "auto",
            color: showRoof ? "#0b0d11" : "#cfd6e6",
            background: showRoof ? "#e0a049" : ctrlBtn.background,
            borderColor: showRoof ? "#e0a049" : "#2a313d",
          }}
          title="Toggle interior ceilings / roof slabs"
        >
          {showRoof ? "ROOF ON" : "ROOF OFF"}
        </button>

        <div style={{ ...ctrlBtn, pointerEvents: "auto" }}>
          <span style={{ color: "#e0a049" }}>SUN</span>
          <input
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={sunAz}
            onChange={(e) => setSunAz(parseFloat(e.target.value))}
            style={{ width: 96, accentColor: "#e0a049", cursor: "pointer" }}
          />
        </div>
      </div>

      <div className="scene3d-tag">
        MODEL VIEW · <b>drag</b> orbit · <b>scroll</b> zoom · extruded from plan
      </div>
    </div>
  );
}

// ── meshes ──────────────────────────────────────────────────────────────────
function Walls({ model }: { model: Model }) {
  const wallMat = useMemo(
    () => new THREE.MeshStandardMaterial({ color: "#e9ebf0", roughness: 0.9, metalness: 0.0 }),
    []
  );
  const trimMat = useMemo(
    () => new THREE.MeshStandardMaterial({ color: "#d4d7df", roughness: 0.7, metalness: 0.03 }),
    []
  );
  // window frames read as painted timber/aluminium
  const frameMat = useMemo(
    () => new THREE.MeshStandardMaterial({ color: "#c7ccd4", roughness: 0.55, metalness: 0.15 }),
    []
  );
  return (
    <group>
      {model.boxes.map((b, i) => (
        <mesh
          key={i}
          position={b.pos}
          rotation={[0, b.rotY, 0]}
          castShadow
          receiveShadow
          material={b.kind === "frame" ? frameMat : b.kind === "wall" ? wallMat : trimMat}
        >
          <boxGeometry args={b.dim} />
        </mesh>
      ))}
    </group>
  );
}

function Glazing({ model }: { model: Model }) {
  const glassMat = useMemo(
    () =>
      new THREE.MeshPhysicalMaterial({
        color: "#9fd3d8",
        transmission: 0.6,
        transparent: true,
        opacity: 0.4,
        roughness: 0.1,
        metalness: 0,
        thickness: 0.02,
        side: THREE.DoubleSide,
      }),
    []
  );
  const frameMat = useMemo(
    () => new THREE.MeshStandardMaterial({ color: "#c7ccd4", roughness: 0.55, metalness: 0.15 }),
    []
  );
  return (
    <group>
      {model.glass.map((g, i) => (
        <WindowAssembly key={i} g={g} glassMat={glassMat} frameMat={frameMat} />
      ))}
    </group>
  );
}

// One window: glass pane(s) + subtype-specific mullions. Bay windows project out.
function WindowAssembly({
  g,
  glassMat,
  frameMat,
}: {
  g: Model["glass"][number];
  glassMat: THREE.Material;
  frameMat: THREE.Material;
}) {
  const t = 0.03; // mullion member thickness (m)
  const muls: React.ReactNode[] = [];
  // local frame: x across the opening, y up, z = wall normal. Glass sits at z=0.
  const addBarV = (x: number, key: string) =>
    muls.push(
      <mesh key={key} position={[x, 0, 0.005]} material={frameMat}>
        <boxGeometry args={[t, g.h, t]} />
      </mesh>
    );
  const addBarH = (y: number, key: string) =>
    muls.push(
      <mesh key={key} position={[0, y, 0.005]} material={frameMat}>
        <boxGeometry args={[g.w, t, t]} />
      </mesh>
    );

  if (g.subtype === "bay") {
    // BAY: three angled panels projecting outward past the wall plane, with a
    // little sloped roof + sill ledge. Center panel parallel to wall, side
    // panels splayed ~45°. Built in the opening's local frame then placed.
    return <BayWindow g={g} glassMat={glassMat} frameMat={frameMat} />;
  }

  switch (g.subtype) {
    case "casement":
      addBarV(0, "cv"); // single center mullion (sash divider)
      break;
    case "fixed":
      // no operable sash — just a clean pane, slim perimeter only
      break;
    case "sliding":
      addBarV(0, "sv"); // two horizontally-sliding sashes meet in the middle
      break;
    case "double_hung":
      addBarH(0, "dh"); // meeting rail between upper/lower sash
      break;
    case "awning":
      // top-hinged single sash — a slim horizontal mid rail reads well
      addBarH(g.h * 0.1, "aw");
      break;
    case "louvre": {
      // horizontal glass slats: stack thin angled panes instead of one pane
      const n = Math.max(4, Math.round(g.h / 0.14));
      const slats: React.ReactNode[] = [];
      for (let k = 0; k < n; k++) {
        const y = -g.h / 2 + (g.h * (k + 0.5)) / n;
        slats.push(
          <mesh key={k} position={[0, y, 0]} rotation={[-0.35, 0, 0]} material={glassMat}>
            <boxGeometry args={[g.w * 0.94, g.h / n, 0.008]} />
          </mesh>
        );
      }
      return (
        <group position={g.pos} rotation={[0, g.rotY, 0]}>
          {slats}
          <mesh position={[0, 0, 0.005]} material={frameMat}>
            <boxGeometry args={[t, g.h, t]} />
          </mesh>
        </group>
      );
    }
  }

  return (
    <group position={g.pos} rotation={[0, g.rotY, 0]}>
      <mesh material={glassMat}>
        <planeGeometry args={[g.w, g.h]} />
      </mesh>
      {muls}
    </group>
  );
}

// Projecting bay: 3 panes (left splay, center, right splay) beyond the wall.
function BayWindow({
  g,
  glassMat,
  frameMat,
}: {
  g: Model["glass"][number];
  glassMat: THREE.Material;
  frameMat: THREE.Material;
}) {
  const proj = Math.min(g.w * 0.28, 0.6); // how far it pushes out (m)
  const centerW = g.w * 0.5;
  const sideW = Math.hypot(g.w * 0.25, proj);
  const sideAng = Math.atan2(proj, g.w * 0.25); // splay angle
  // In local frame: x across, z outward (+). Center pane is at z=proj.
  const halfC = centerW / 2;
  // left pane goes from (-w/2, 0) to (-centerW/2, proj); right mirrored.
  const t = 0.035;
  const roofY = g.h / 2 + t;
  const sillY = -g.h / 2 - t;
  return (
    <group position={g.pos} rotation={[0, g.rotY, 0]}>
      {/* center pane (parallel to wall, pushed out) */}
      <mesh position={[0, 0, proj]} material={glassMat}>
        <planeGeometry args={[centerW, g.h]} />
      </mesh>
      {/* left splay pane */}
      <group position={[-halfC, 0, proj]} rotation={[0, sideAng, 0]}>
        <mesh position={[-sideW / 2, 0, 0]} material={glassMat}>
          <planeGeometry args={[sideW, g.h]} />
        </mesh>
      </group>
      {/* right splay pane */}
      <group position={[halfC, 0, proj]} rotation={[0, -sideAng, 0]}>
        <mesh position={[sideW / 2, 0, 0]} material={glassMat}>
          <planeGeometry args={[sideW, g.h]} />
        </mesh>
      </group>
      {/* corner mullions */}
      {[-halfC, halfC].map((x, k) => (
        <mesh key={k} position={[x, 0, proj]} material={frameMat}>
          <boxGeometry args={[t, g.h, t]} />
        </mesh>
      ))}
      {/* sloped roof slab over the bay */}
      <mesh position={[0, roofY + 0.03, proj * 0.55]} rotation={[-0.32, 0, 0]} material={frameMat} castShadow>
        <boxGeometry args={[g.w + 0.08, 0.04, proj + 0.18]} />
      </mesh>
      {/* sill ledge under the bay */}
      <mesh position={[0, sillY, proj * 0.55]} material={frameMat} castShadow receiveShadow>
        <boxGeometry args={[g.w + 0.06, 0.05, proj + 0.16]} />
      </mesh>
    </group>
  );
}

function RegisterGL() {
  const gl = useThree((s) => s.gl);
  glHolder.gl = gl;
  return null;
}

function FurnitureMeshes({ levels, available }: { levels: LevelModel[]; available: Set<string> }) {
  return (
    <group>
      {levels.map((lvl, li) => (
        <group key={li}>
          {lvl.furniture.map((f, i) => (
            <FurnitureItem key={`${li}-${i}`} item={f} available={available} />
          ))}
        </group>
      ))}
    </group>
  );
}

function Floors({ model }: { model: Model }) {
  return (
    <group>
      {model.floors.map((f, i) => {
        const spec = ZONES[f.type];
        if (spec.water) {
          // recessed basin floor + translucent water surface
          return (
            <group key={i}>
              <mesh rotation={[Math.PI / 2, 0, 0]} position={[0, f.base - 0.25, 0]} receiveShadow>
                <shapeGeometry args={[f.shape]} />
                <meshStandardMaterial color="#16384a" roughness={0.6} side={THREE.DoubleSide} />
              </mesh>
              <mesh rotation={[Math.PI / 2, 0, 0]} position={[0, f.base - 0.04, 0]}>
                <shapeGeometry args={[f.shape]} />
                <meshPhysicalMaterial
                  color={spec.color}
                  roughness={0.12}
                  metalness={0.1}
                  transmission={0.5}
                  transparent
                  opacity={0.78}
                  side={THREE.DoubleSide}
                />
              </mesh>
            </group>
          );
        }
        return (
          <mesh
            key={i}
            rotation={[Math.PI / 2, 0, 0]}
            position={[0, f.base + (spec.outdoor ? 0.004 : 0), 0]}
            receiveShadow
          >
            <shapeGeometry args={[f.shape]} />
            <meshStandardMaterial
              color={spec.color}
              roughness={spec.roughness}
              metalness={spec.metalness}
              side={THREE.DoubleSide}
            />
          </mesh>
        );
      })}
    </group>
  );
}

// flat ceiling / roof slabs over interior rooms (reuse room floor shapes)
function Ceilings({ model }: { model: Model }) {
  return (
    <group>
      {model.ceilings.map((c, i) => {
        const spec = ZONES[c.type];
        // ceilings face downward (plaster), slightly warmer than walls
        return (
          <mesh key={i} rotation={[-Math.PI / 2, 0, 0]} position={[0, c.y, 0]} castShadow receiveShadow>
            <shapeGeometry args={[c.shape]} />
            <meshStandardMaterial
              color={spec.outdoor ? spec.color : "#dfe2e8"}
              roughness={0.95}
              metalness={0}
              side={THREE.DoubleSide}
            />
          </mesh>
        );
      })}
    </group>
  );
}

function Doors({ model }: { model: Model }) {
  const leaf = useMemo(() => new THREE.MeshStandardMaterial({ color: "#a6764a", roughness: 0.6, metalness: 0.05 }), []);
  const metal = useMemo(() => new THREE.MeshStandardMaterial({ color: "#b6bcc6", roughness: 0.45, metalness: 0.5 }), []);
  const handle = useMemo(() => new THREE.MeshStandardMaterial({ color: "#d9c08a", roughness: 0.3, metalness: 0.6 }), []);
  const [open, setOpen] = useState<Set<string>>(new Set());
  const toggle = (id: string) =>
    setOpen((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  return (
    <group>
      {model.doors.map((d) => (
        <DoorAssembly
          key={d.id}
          d={d}
          open={open.has(d.id)}
          onToggle={() => toggle(d.id)}
          leaf={leaf}
          metal={metal}
          handle={handle}
        />
      ))}
    </group>
  );
}

function DoorAssembly({
  d,
  open,
  onToggle,
  leaf,
  metal,
  handle,
}: {
  d: Model["doors"][number];
  open: boolean;
  onToggle: () => void;
  leaf: THREE.Material;
  metal: THREE.Material;
  handle: THREE.Material;
}) {
  // garage doors read as metal; everything else as timber
  const panelMat = d.subtype === "garage" ? metal : leaf;
  return (
    <group>
      {d.panels.map((p, i) => (
        <DoorPanelMesh
          key={i}
          p={p}
          subtype={d.subtype}
          open={open}
          onToggle={onToggle}
          panelMat={panelMat}
          handle={handle}
        />
      ))}
    </group>
  );
}

function DoorPanelMesh({
  p,
  subtype,
  open,
  onToggle,
  panelMat,
  handle,
}: {
  p: Model["doors"][number]["panels"][number];
  subtype: string;
  open: boolean;
  onToggle: () => void;
  panelMat: THREE.Material;
  handle: THREE.Material;
}) {
  // anchor group: static rotY (so local +X runs along the wall). Inside it, a
  // moving group that EITHER rotates (swing/fold) OR translates along local X
  // (slide/pocket). Initial transform = closed.
  const ref = useRef<THREE.Group>(null);
  useFrame(() => {
    const g = ref.current;
    if (!g) return;
    if (p.motion === "slide") {
      const target = open ? p.slide : 0;
      g.position.x += (target - g.position.x) * 0.16;
    } else {
      const target = open ? p.openAngle : 0;
      g.rotation.y += (target - g.rotation.y) * 0.16;
    }
  });
  const isGarage = subtype === "garage";
  return (
    <group position={p.anchor} rotation={[0, p.rotY, 0]}>
      <group ref={ref}>
        <mesh
          position={[p.width / 2, p.height / 2, 0]}
          castShadow
          receiveShadow
          material={panelMat}
          onClick={(e) => {
            e.stopPropagation();
            onToggle();
          }}
          onPointerOver={(e) => {
            e.stopPropagation();
            document.body.style.cursor = "pointer";
          }}
          onPointerOut={() => {
            document.body.style.cursor = "default";
          }}
        >
          <boxGeometry args={[p.width, p.height, p.thickness]} />
        </mesh>
        {isGarage &&
          [0.2, 0.4, 0.6, 0.8].map((f) => (
            <mesh key={f} position={[p.width / 2, p.height * f, p.thickness * 0.6]} material={panelMat}>
              <boxGeometry args={[p.width * 0.96, 0.015, 0.01]} />
            </mesh>
          ))}
        {p.handle && (
          <mesh position={[p.width * 0.86, p.height * 0.45, p.thickness]} material={handle}>
            <sphereGeometry args={[0.03, 10, 10]} />
          </mesh>
        )}
      </group>
    </group>
  );
}

function Rails({ model }: { model: Model }) {
  const postMat = useMemo(() => new THREE.MeshStandardMaterial({ color: "#b9c0cc", roughness: 0.5, metalness: 0.3 }), []);
  const railMat = useMemo(() => new THREE.MeshStandardMaterial({ color: "#cdd5e2", roughness: 0.4, metalness: 0.35 }), []);
  return (
    <group>
      {model.rails.map((r, i) => {
        const ax = r.a[0], az = r.a[1], bx = r.b[0], bz = r.b[1];
        const dx = bx - ax, dz = bz - az;
        const len = Math.hypot(dx, dz) || 1;
        const rotY = -Math.atan2(dz, dx);
        const mx = (ax + bx) / 2, mz = (az + bz) / 2;
        const base = r.base;
        const postR = 0.022;
        const n = Math.max(2, Math.round(len / 0.9) + 1);
        const posts = [];
        for (let p = 0; p < n; p++) {
          const t = p / (n - 1);
          posts.push(
            <mesh key={p} position={[ax + dx * t, base + r.height / 2, az + dz * t]} castShadow material={postMat}>
              <cylinderGeometry args={[postR, postR, r.height, 8]} />
            </mesh>
          );
        }
        return (
          <group key={i}>
            {posts}
            {/* top rail */}
            <mesh position={[mx, base + r.height, mz]} rotation={[0, rotY, 0]} castShadow material={railMat}>
              <boxGeometry args={[len, 0.05, 0.05]} />
            </mesh>
            {/* mid rail */}
            <mesh position={[mx, base + r.height * 0.5, mz]} rotation={[0, rotY, 0]} material={railMat}>
              <boxGeometry args={[len, 0.03, 0.03]} />
            </mesh>
          </group>
        );
      })}
    </group>
  );
}

// ── intro camera animation: top-down → angled perspective ──────────────────
function CameraRig({
  target,
  radius,
  onDone,
}: {
  target: [number, number, number];
  radius: number;
  onDone: () => void;
}) {
  const { camera } = useThree();
  const t = useRef(0);
  const start = useMemo(() => new THREE.Vector3(target[0], radius * 4 + 6, target[2] + 0.01), [target, radius]);
  const end = useMemo(
    () => new THREE.Vector3(target[0] + radius * 1.6, radius * 1.5 + 2.5, target[2] + radius * 2.4),
    [target, radius]
  );
  const tgt = useMemo(() => new THREE.Vector3(...target), [target]);

  useFrame((_, dt) => {
    t.current = Math.min(1, t.current + dt / 1.25);
    const e = easeOutCubic(t.current);
    camera.position.lerpVectors(start, end, e);
    camera.lookAt(tgt);
    if (t.current >= 1) onDone();
  });
  return null;
}

const easeOutCubic = (x: number) => 1 - Math.pow(1 - x, 3);
