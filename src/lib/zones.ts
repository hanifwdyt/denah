import type { ZoneType } from "./types";

export interface ZoneSpec {
  type: ZoneType;
  label: string;
  /** 3D floor material */
  color: string;
  roughness: number;
  metalness: number;
  /** true → outdoor (no implied ceiling, distinct treatment) */
  outdoor: boolean;
  /** water bodies get a recessed translucent surface */
  water?: boolean;
  /** 2D room-fill tint */
  fill2d: string;
  /** UI accent / swatch */
  swatch: string;
}

export const ZONES: Record<ZoneType, ZoneSpec> = {
  room: {
    type: "room",
    label: "Room",
    color: "#7c8390",
    roughness: 0.95,
    metalness: 0,
    outdoor: false,
    fill2d: "rgba(120,150,175,0.05)",
    swatch: "#7c8390",
  },
  terrace: {
    type: "terrace",
    label: "Terrace",
    color: "#9c7a4f",
    roughness: 0.82,
    metalness: 0,
    outdoor: true,
    fill2d: "rgba(180,130,70,0.07)",
    swatch: "#b48a52",
  },
  garden: {
    type: "garden",
    label: "Garden",
    color: "#5d7c48",
    roughness: 1,
    metalness: 0,
    outdoor: true,
    fill2d: "rgba(110,160,90,0.08)",
    swatch: "#6fae5c",
  },
  bathroom: {
    type: "bathroom",
    label: "Bathroom",
    color: "#aab4bd",
    roughness: 0.45,
    metalness: 0.05,
    outdoor: false,
    fill2d: "rgba(150,185,205,0.06)",
    swatch: "#aab4bd",
  },
  kitchen: {
    type: "kitchen",
    label: "Kitchen",
    color: "#9aa3ad",
    roughness: 0.6,
    metalness: 0.03,
    outdoor: false,
    fill2d: "rgba(150,170,190,0.05)",
    swatch: "#9aa3ad",
  },
  garage: {
    type: "garage",
    label: "Garage",
    color: "#6a6f78",
    roughness: 0.9,
    metalness: 0,
    outdoor: false,
    fill2d: "rgba(130,140,155,0.05)",
    swatch: "#6a6f78",
  },
  water: {
    type: "water",
    label: "Pool",
    color: "#2f6d86",
    roughness: 0.15,
    metalness: 0.1,
    outdoor: true,
    water: true,
    fill2d: "rgba(70,150,185,0.10)",
    swatch: "#3f9ec8",
  },
};

export const ZONE_ORDER: ZoneType[] = [
  "room",
  "terrace",
  "garden",
  "bathroom",
  "kitchen",
  "garage",
  "water",
];
