import type Konva from "konva";
import type { WebGLRenderer } from "three";
import { useStore } from "../store/useStore";
import {
  buildPlanGeometry,
  planToSvgString,
  INK,
  type PlanGeometry,
  type Poly,
  type TextItem,
} from "./exportSvg";
import { fmtLen } from "./geometry";

// Holders let UI in the chrome reach the live canvases without prop-drilling.
export const stageHolder: { stage: Konva.Stage | null } = { stage: null };
export const glHolder: { gl: WebGLRenderer | null } = { gl: null };

const BG = "#0e1014";

function downloadDataURL(dataURL: string, filename: string) {
  const a = document.createElement("a");
  a.href = dataURL;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

function downloadBlob(content: string, mime: string, filename: string) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** composite a (possibly transparent) PNG onto a solid background */
function compositeOnBg(src: string, bg: string): Promise<{ url: string; w: number; h: number }> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const c = document.createElement("canvas");
      c.width = img.width;
      c.height = img.height;
      const ctx = c.getContext("2d")!;
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, c.width, c.height);
      ctx.drawImage(img, 0, 0);
      resolve({ url: c.toDataURL("image/png"), w: img.width, h: img.height });
    };
    img.src = src;
  });
}

/** capture the current view (2D Konva stage or 3D gl canvas) as a PNG data URL */
async function capture(mode: "2d" | "3d"): Promise<{ url: string; w: number; h: number } | null> {
  if (mode === "2d") {
    const stage = stageHolder.stage;
    if (!stage) return null;
    const raw = stage.toDataURL({ pixelRatio: 2 });
    return compositeOnBg(raw, BG);
  }
  const gl = glHolder.gl;
  if (!gl) return null;
  // ensure the latest frame is present in the drawing buffer
  const canvas = gl.domElement;
  return { url: canvas.toDataURL("image/png"), w: canvas.width, h: canvas.height };
}

export async function exportPNG(mode: "2d" | "3d", filename = "floor-plan") {
  const shot = await capture(mode);
  if (!shot) return;
  downloadDataURL(shot.url, `${filename}-${mode}.png`);
}

export async function exportPDF(mode: "2d" | "3d", filename = "floor-plan") {
  const shot = await capture(mode);
  if (!shot) return;
  const { jsPDF } = await import("jspdf");
  const orientation = shot.w >= shot.h ? "landscape" : "portrait";
  const pdf = new jsPDF({ orientation, unit: "pt", format: [shot.w, shot.h] });
  pdf.addImage(shot.url, "PNG", 0, 0, shot.w, shot.h);
  pdf.save(`${filename}-${mode}.pdf`);
}

// ── shared scene access ──────────────────────────────────────────────────────
function planFromStore(): PlanGeometry {
  const s = useStore.getState();
  return buildPlanGeometry(s.scene, s.settings.units, s.scene.roomNames ?? {});
}

function activeLevelName(): string {
  const s = useStore.getState();
  return s.levels.find((l) => l.id === s.activeLevelId)?.name ?? "Plan";
}

// ─────────────────────────────────────────────────────────────────────────────
// VECTOR SVG export — true geometry, not a screenshot.
// ─────────────────────────────────────────────────────────────────────────────
export async function exportSVG(mode: "2d" | "3d", filename = "floor-plan") {
  if (mode !== "2d") {
    // 3D has no meaningful vector form — fall back to a raster PNG so the action
    // still does something useful instead of silently no-op'ing.
    return exportPNG(mode, filename);
  }
  const geo = planFromStore();
  const svg = planToSvgString(geo);
  downloadBlob(svg, "image/svg+xml", `${filename}-2d.svg`);
}

// ─────────────────────────────────────────────────────────────────────────────
// SCALED architectural PDF — vector, with title block, scale bar, north arrow.
// ─────────────────────────────────────────────────────────────────────────────

export interface ScaledPdfOptions {
  filename?: string;
  projectName?: string;
  date?: string; // omit → today
}

// A-series sheet sizes in mm (landscape)
const SHEETS = [
  { name: "A4", w: 297, h: 210 },
  { name: "A3", w: 420, h: 297 },
] as const;

// candidate architectural scales (drawing : world), 1 unit drawing = N units world
const SCALE_DENOMS = [20, 25, 50, 75, 100, 125, 150, 200, 250, 500, 1000];

export async function exportScaledPDF(mode: "2d" | "3d", optsOrName?: ScaledPdfOptions | string) {
  if (mode !== "2d") return exportPDF(mode, typeof optsOrName === "string" ? optsOrName : optsOrName?.filename);

  const opts: ScaledPdfOptions = typeof optsOrName === "string" ? { filename: optsOrName } : optsOrName ?? {};
  const filename = opts.filename ?? "floor-plan";
  const projectName = opts.projectName ?? activeLevelName();
  const dateStr = opts.date ?? new Date().toISOString().slice(0, 10);
  const units = useStore.getState().settings.units;

  const geo = planFromStore();
  const { jsPDF } = await import("jspdf");

  const TITLE_H = 22; // mm — title block strip at the bottom
  const MARGIN = 12; // mm — page margin around the drawing frame

  // plan extents in cm → mm at 1:1 (1 cm = 10 mm)
  const planWcm = Math.max(1, geo.bounds.maxX - geo.bounds.minX);
  const planHcm = Math.max(1, geo.bounds.maxY - geo.bounds.minY);
  const planPadCm = 40; // breathing room around the plan
  const totalWcm = planWcm + planPadCm * 2;
  const totalHcm = planHcm + planPadCm * 2;

  // choose sheet + scale that fits. scale denom S means: 1 drawing-mm = S world-mm.
  // world mm = cm * 10. drawing mm available = sheet inner area.
  let chosen: { sheet: (typeof SHEETS)[number]; denom: number; drawW: number; drawH: number } | null = null;
  outer: for (const sheet of SHEETS) {
    const innerW = sheet.w - MARGIN * 2;
    const innerH = sheet.h - MARGIN * 2 - TITLE_H;
    for (const denom of SCALE_DENOMS) {
      const drawW = (totalWcm * 10) / denom; // mm on paper
      const drawH = (totalHcm * 10) / denom;
      if (drawW <= innerW && drawH <= innerH) {
        chosen = { sheet, denom, drawW, drawH };
        break outer;
      }
    }
  }
  // fallback: biggest sheet, coarsest scale even if it slightly overflows
  if (!chosen) {
    const sheet = SHEETS[SHEETS.length - 1];
    const denom = SCALE_DENOMS[SCALE_DENOMS.length - 1];
    chosen = {
      sheet,
      denom,
      drawW: (totalWcm * 10) / denom,
      drawH: (totalHcm * 10) / denom,
    };
  }

  const { sheet, denom, drawW, drawH } = chosen;
  const pdf = new jsPDF({ orientation: "landscape", unit: "mm", format: [sheet.w, sheet.h] });

  // sheet background
  pdf.setFillColor(255, 255, 255);
  pdf.rect(0, 0, sheet.w, sheet.h, "F");

  // drawing frame
  const innerW = sheet.w - MARGIN * 2;
  const innerH = sheet.h - MARGIN * 2 - TITLE_H;
  pdf.setDrawColor(40, 46, 56);
  pdf.setLineWidth(0.4);
  pdf.rect(MARGIN, MARGIN, innerW, innerH);

  // center the plan within the frame.
  // world(cm) → paper(mm): mm = (cm * 10) / denom, plus offset.
  const offX = MARGIN + (innerW - drawW) / 2;
  const offY = MARGIN + (innerH - drawH) / 2;
  const sx = (cmX: number) => offX + ((cmX - geo.bounds.minX + planPadCm) * 10) / denom;
  const sy = (cmY: number) => offY + ((cmY - geo.bounds.minY + planPadCm) * 10) / denom;
  // line width: world cm → paper mm
  const lw = (cm: number) => Math.max(0.05, (cm * 10) / denom);
  const fs = (cm: number) => Math.max(2, ((cm * 10) / denom) * 2.83465); // cm world → pt approx for jsPDF font

  const hexRGB = (hex: string): [number, number, number] => {
    const h = hex.replace("#", "");
    return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
  };

  const drawPoly = (p: Poly) => {
    if (p.pts.length < 2 && !(p.fill && p.closed)) return;
    if (p.fill && p.closed) {
      const [r, g, b] = hexRGBfromAny(p.fill);
      pdf.setFillColor(r, g, b);
    }
    if (p.stroke) {
      const [r, g, b] = hexRGB(p.stroke);
      pdf.setDrawColor(r, g, b);
      pdf.setLineWidth(lw(p.width ?? 1));
    }
    const pts = p.pts.map((pt) => [sx(pt.x), sy(pt.y)] as [number, number]);
    // jsPDF lines() draws relative deltas from a start point
    if (p.fill && p.closed) {
      const start = pts[0];
      const deltas = pts.slice(1).map((q, i) => [q[0] - pts[i][0], q[1] - pts[i][1]] as [number, number]);
      pdf.lines(deltas, start[0], start[1], [1, 1], "F", true);
    }
    if (p.stroke) {
      const start = pts[0];
      const deltas = pts.slice(1).map((q, i) => [q[0] - pts[i][0], q[1] - pts[i][1]] as [number, number]);
      pdf.lines(deltas, start[0], start[1], [1, 1], "S", !!p.closed);
    }
  };

  const drawText = (t: TextItem) => {
    const [r, g, b] = hexRGB(t.fill);
    pdf.setTextColor(r, g, b);
    pdf.setFont(t.mono ? "courier" : "helvetica", (t.weight ?? 400) >= 600 ? "bold" : "normal");
    pdf.setFontSize(fs(t.size));
    const align = t.anchor === "middle" ? "center" : t.anchor === "end" ? "right" : "left";
    pdf.text(t.text, sx(t.x), sy(t.y), { align: align as "left" | "center" | "right", baseline: "middle" });
  };

  // clip-ish: jsPDF has no easy clip; rely on scale fitting. Draw in z-order.
  for (const f of geo.fills) drawPoly(f);
  for (const d of geo.dims) drawPoly(d);
  for (const w of geo.walls) drawPoly(w);
  for (const j of geo.joints) {
    const [r, g, b] = hexRGB(j.fill);
    pdf.setFillColor(r, g, b);
    pdf.circle(sx(j.x), sy(j.y), Math.max(0.1, (j.r * 10) / denom), "F");
  }
  for (const s of geo.symbols) drawPoly(s);
  for (const t of geo.texts) drawText(t);

  // ── title block ────────────────────────────────────────────────────────────
  const tbY = sheet.h - MARGIN - TITLE_H;
  pdf.setDrawColor(40, 46, 56);
  pdf.setLineWidth(0.4);
  pdf.rect(MARGIN, tbY, innerW, TITLE_H);

  pdf.setTextColor(29, 36, 48);
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(13);
  pdf.text(projectName, MARGIN + 4, tbY + 9);

  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(8);
  pdf.setTextColor(90, 100, 114);
  pdf.text(`FLOOR PLAN`, MARGIN + 4, tbY + 15.5);
  pdf.text(`Date: ${dateStr}`, MARGIN + 4, tbY + 19.5);

  // scale text (right area of title block)
  pdf.setFont("courier", "bold");
  pdf.setFontSize(11);
  pdf.setTextColor(29, 36, 48);
  pdf.text(`SCALE 1:${denom}`, MARGIN + innerW - 4, tbY + 9, { align: "right" });
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(7);
  pdf.setTextColor(90, 100, 114);
  pdf.text(`Sheet ${sheet.name}  |  Units: ${units}`, MARGIN + innerW - 4, tbY + 15, { align: "right" });

  // ── scale bar ───────────────────────────────────────────────────────────────
  // pick a "nice" world length whose paper length is ~30-50mm.
  drawScaleBar(pdf, denom, MARGIN + innerW / 2 - 25, tbY + TITLE_H - 5, units);

  // ── north arrow (top-right of drawing frame) ─────────────────────────────────
  drawNorthArrow(pdf, MARGIN + innerW - 14, MARGIN + 16);

  pdf.save(`${filename}-2d-scaled.pdf`);
}

// jsPDF fills come in as rgba() strings (room tints) or hex; resolve to RGB.
function hexRGBfromAny(c: string): [number, number, number] {
  if (c.startsWith("#")) {
    const h = c.replace("#", "");
    return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
  }
  const m = c.match(/rgba?\(([^)]+)\)/);
  if (m) {
    const [r, g, b] = m[1].split(",").map((s) => parseFloat(s));
    return [r, g, b];
  }
  return [200, 204, 212];
}

function drawScaleBar(
  pdf: import("jspdf").jsPDF,
  denom: number,
  x: number,
  y: number,
  units: "metric" | "imperial"
) {
  // choose a round world length (cm) that maps to a reasonable paper width.
  const targetMm = 50; // desired bar length on paper
  // worldCm such that (worldCm*10)/denom ≈ targetMm
  const idealCm = (targetMm * denom) / 10;
  const niceCm = niceRound(idealCm);
  const barMm = (niceCm * 10) / denom;
  const segs = 4;
  const segMm = barMm / segs;

  pdf.setLineWidth(0.3);
  for (let i = 0; i < segs; i++) {
    const x0 = x + i * segMm;
    const dark = i % 2 === 0;
    pdf.setFillColor(...(dark ? ([29, 36, 48] as [number, number, number]) : ([255, 255, 255] as [number, number, number])));
    pdf.setDrawColor(29, 36, 48);
    pdf.rect(x0, y, segMm, 1.6, dark ? "FD" : "D");
  }
  pdf.setFontSize(6.5);
  pdf.setFont("helvetica", "normal");
  pdf.setTextColor(90, 100, 114);
  pdf.text("0", x, y - 1, { align: "center" });
  pdf.text(fmtLen(niceCm, units), x + barMm, y - 1, { align: "center" });
}

function niceRound(v: number): number {
  const pow = Math.pow(10, Math.floor(Math.log10(v)));
  const f = v / pow;
  let nf: number;
  if (f < 1.5) nf = 1;
  else if (f < 3.5) nf = 2;
  else if (f < 7.5) nf = 5;
  else nf = 10;
  return nf * pow;
}

function drawNorthArrow(pdf: import("jspdf").jsPDF, cx: number, cy: number) {
  const r = 7;
  pdf.setDrawColor(29, 36, 48);
  pdf.setLineWidth(0.3);
  pdf.circle(cx, cy, r, "D");
  // arrow: filled triangle pointing up, half-filled diamond style
  pdf.setFillColor(29, 36, 48);
  pdf.triangle(cx, cy - r + 1, cx - 2.6, cy + 2.5, cx, cy - 0.5, "F");
  pdf.setFillColor(120, 130, 144);
  pdf.triangle(cx, cy - r + 1, cx + 2.6, cy + 2.5, cx, cy - 0.5, "F");
  pdf.setFontSize(7);
  pdf.setFont("helvetica", "bold");
  pdf.setTextColor(29, 36, 48);
  pdf.text("N", cx, cy + r + 3.5, { align: "center" });
}

// re-export the ink palette in case the UI wants matching swatches
export { INK as EXPORT_INK };
