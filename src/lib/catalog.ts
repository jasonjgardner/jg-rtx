/**
 * Build-time accessors over the content collections.
 *
 * Pages need the catalog indexed rather than listed — "the set for this face",
 * "the varieties for this set" — so these helpers do the grouping once and hand
 * back plain lookups. Everything here runs at build time only.
 */

import { getCollection } from "astro:content";
import type { ITextureSet, ITextureVersion, IVariety, BlockFace } from "./types";

/** A texture set as stored in the `sets` collection. */
export type SetRecord = ITextureSet;

/** A variety as stored in the `varieties` collection. */
export type VarietyRecord = IVariety;

/**
 * Index every texture set by its id.
 *
 * @returns Sets keyed by `textures/blocks/...`.
 */
export const getSetsById = async (): Promise<Map<string, SetRecord>> => {
  const entries = await getCollection("sets");

  return new Map(entries.map((entry) => [entry.data.id, entry.data as SetRecord]));
};

/**
 * Group varieties by the texture set they can replace.
 *
 * @returns Varieties keyed by target set id, in catalog order.
 */
export const getVarietiesBySet = async (): Promise<Map<string, VarietyRecord[]>> => {
  const entries = await getCollection("varieties");

  return entries.reduce((grouped, entry) => {
    const variety = entry.data as VarietyRecord;
    const existing = grouped.get(variety.setId);

    if (!existing) {
      grouped.set(variety.setId, [variety]);
      return grouped;
    }

    existing.push(variety);
    return grouped;
  }, new Map<string, VarietyRecord[]>());
};

/**
 * Index previous designs by the texture set they belong to.
 *
 * @returns Revisions keyed by set id, newest first. Sets with no history are
 *   absent rather than present-and-empty.
 */
export const getHistoryBySet = async (): Promise<Map<string, ITextureVersion[]>> => {
  const entries = await getCollection("history");

  return new Map(
    entries.map((entry) => [entry.data.id, entry.data.versions as ITextureVersion[]]),
  );
};

/** A group of faces that share one texture set. */
export interface IFaceGroup {
  /** The texture set these faces use. */
  readonly setId: string;
  /** Faces drawing from it. */
  readonly faces: readonly BlockFace[];
  /** Short human label, e.g. `Top & bottom` or `Sides`. */
  readonly label: string;
}

/** Named shorthands for common face groupings, longest match first. */
const GROUP_LABELS: readonly { readonly faces: readonly BlockFace[]; readonly label: string }[] = [
  { faces: ["up", "down", "north", "south", "east", "west"], label: "All faces" },
  { faces: ["north", "south", "east", "west"], label: "Sides" },
  { faces: ["up", "down"], label: "Top & bottom" },
];

/** Title-case a single face name. */
const faceLabel = (face: BlockFace): string =>
  `${face[0]?.toUpperCase() ?? ""}${face.slice(1)}`;

/**
 * Describe a set of faces in the shortest accurate way.
 *
 * @param faces Faces sharing one texture.
 */
const labelFor = (faces: readonly BlockFace[]): string => {
  const sorted = [...faces].sort();

  const match = GROUP_LABELS.find(
    (candidate) =>
      candidate.faces.length === faces.length &&
      [...candidate.faces].sort().every((face, index) => face === sorted[index]),
  );

  return match?.label ?? faces.map(faceLabel).join(", ");
};

/**
 * Collapse a block's six faces into groups sharing a texture set.
 *
 * This is what lets a log render as two rows ("Top & bottom", "Sides") instead
 * of six near-identical ones, while keeping one page slug for the block.
 *
 * @param faces Per-face texture set ids, `null` where unresolved.
 * @returns Groups in first-appearance order.
 */
export const groupFaces = (
  faces: Readonly<Record<BlockFace, string | null>>,
): IFaceGroup[] => {
  const order: string[] = [];
  const bySet = new Map<string, BlockFace[]>();

  (Object.entries(faces) as [BlockFace, string | null][]).forEach(([face, setId]) => {
    if (setId === null) return;

    const existing = bySet.get(setId);

    if (!existing) {
      order.push(setId);
      bySet.set(setId, [face]);
      return;
    }

    existing.push(face);
  });

  return order.map((setId) => {
    const grouped = bySet.get(setId) ?? [];

    return { setId, faces: grouped, label: labelFor(grouped) };
  });
};
