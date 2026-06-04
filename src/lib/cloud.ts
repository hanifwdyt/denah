// ─────────────────────────────────────────────────────────────────────────────
// Cloud plan CRUD against the Supabase `plans` table.
//
// A plan row stores the full DenahDoc { levels, activeLevelId, units } as JSONB.
// All functions degrade gracefully when `supabase === null` (guest mode):
//   - listPlans()  → []
//   - load/save/…  → throw a friendly Error the UI can show
// ─────────────────────────────────────────────────────────────────────────────
import { supabase } from "./supabase";
import type { DenahDoc } from "./storage";
import { useStore } from "../store/useStore";

/** A saved plan as returned from the cloud (doc is the full DenahDoc). */
export interface CloudPlan {
  id: string;
  name: string;
  doc: DenahDoc;
  updated_at: string;
}

/** Lightweight row for the dashboard list (no heavy doc until opened). */
export interface CloudPlanMeta {
  id: string;
  name: string;
  updated_at: string;
  /** rough size hints for thumbnails: level + furniture counts. */
  levelCount: number;
  furnitureCount: number;
  edgeCount: number;
}

const GUEST_ERR = "Sign in to save plans to the cloud.";

function notConfigured(): never {
  throw new Error(GUEST_ERR);
}

/** Build a DenahDoc snapshot from the live store. */
export function currentDoc(): DenahDoc {
  const s = useStore.getState();
  return {
    levels: s.levels,
    activeLevelId: s.activeLevelId,
    units: s.settings.units,
  };
}

/** Apply a loaded DenahDoc to the live store (undoable via loadLevels). */
export function applyDoc(doc: DenahDoc) {
  const s = useStore.getState();
  s.loadLevels(doc.levels, doc.activeLevelId);
  if (doc.units && doc.units !== s.settings.units) {
    s.setSettings({ units: doc.units });
  }
}

/** Count helpers for list metadata. */
function metaFromDoc(doc: DenahDoc): Pick<CloudPlanMeta, "levelCount" | "furnitureCount" | "edgeCount"> {
  let furnitureCount = 0;
  let edgeCount = 0;
  for (const l of doc.levels ?? []) {
    furnitureCount += Object.keys(l.scene?.furniture ?? {}).length;
    edgeCount += Object.keys(l.scene?.edges ?? {}).length;
  }
  return { levelCount: doc.levels?.length ?? 0, furnitureCount, edgeCount };
}

/** List the signed-in user's plans (newest first). Empty in guest mode. */
export async function listPlans(): Promise<CloudPlanMeta[]> {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from("plans")
    .select("id,name,doc,updated_at")
    .order("updated_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []).map((row) => ({
    id: row.id as string,
    name: (row.name as string) ?? "Untitled plan",
    updated_at: row.updated_at as string,
    ...metaFromDoc((row.doc as DenahDoc) ?? { levels: [], activeLevelId: "", units: "metric" }),
  }));
}

/** Load a full plan by id. */
export async function loadPlan(id: string): Promise<CloudPlan> {
  if (!supabase) notConfigured();
  const { data, error } = await supabase.from("plans").select("id,name,doc,updated_at").eq("id", id).single();
  if (error) throw new Error(error.message);
  return {
    id: data.id as string,
    name: (data.name as string) ?? "Untitled plan",
    doc: data.doc as DenahDoc,
    updated_at: data.updated_at as string,
  };
}

/**
 * Save a plan. When `id` is given → update that row. Otherwise → insert a new
 * row owned by the current user. Returns the saved row id.
 */
export async function savePlan(doc: DenahDoc, id: string | null, name: string): Promise<string> {
  if (!supabase) notConfigured();
  const cleanName = name.trim() || "Untitled plan";
  const now = new Date().toISOString();

  if (id) {
    const { data, error } = await supabase
      .from("plans")
      .update({ doc, name: cleanName, updated_at: now })
      .eq("id", id)
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return data.id as string;
  }

  const { data: auth } = await supabase.auth.getUser();
  const userId = auth.user?.id;
  if (!userId) throw new Error(GUEST_ERR);

  const { data, error } = await supabase
    .from("plans")
    .insert({ user_id: userId, doc, name: cleanName, updated_at: now })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  return data.id as string;
}

/** Delete a plan by id. */
export async function deletePlan(id: string): Promise<void> {
  if (!supabase) notConfigured();
  const { error } = await supabase.from("plans").delete().eq("id", id);
  if (error) throw new Error(error.message);
}

/** Rename a plan by id. */
export async function renamePlan(id: string, name: string): Promise<void> {
  if (!supabase) notConfigured();
  const { error } = await supabase
    .from("plans")
    .update({ name: name.trim() || "Untitled plan", updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw new Error(error.message);
}
