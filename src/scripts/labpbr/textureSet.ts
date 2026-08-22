/**
 * Reading and resolving Bedrock `*.texture_set.json` files.
 *
 * The pack's texture sets cannot be trusted at face value:
 *
 * - The `_subsurface` key and the `_mers` filename disagree constantly. Five sets name
 *   a `_mers` file that only exists as `.tga`; fourteen `_mer.png` files carry
 *   subsurface data in an alpha channel their filename never advertises.
 * - Roughly twenty sets give a scalar `[metalness, emissive, roughness]` triple instead
 *   of a texture.
 * - Twenty-five sets omit `normal` entirely.
 *
 * The **key** (`metalness_emissive_roughness` vs `..._subsurface`) is authoritative for
 * semantics; the **filesystem** is authoritative for which file to open.
 */

import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileExists } from "./fs";

/** A resolved reference to a texture layer. */
export type LayerSource =
  | { readonly kind: "file"; readonly path: string }
  /** A `[metalness, emissive, roughness]` triple given inline in the JSON. */
  | { readonly kind: "scalar"; readonly rgb: readonly [number, number, number] };

/** Everything one `*.texture_set.json` contributes to the conversion. */
export interface IResolvedTextureSet {
  /** Bedrock base name, e.g. `gold_block`. */
  readonly name: string;
  /** Albedo, when it exists on disk. */
  readonly color: string | null;
  /** MER or MERS layer. */
  readonly mer: LayerSource | null;
  /** `true` when the MER(S) alpha channel is subsurface scattering. */
  readonly hasSubsurface: boolean;
  /** Tangent-space normal map, when declared and present. */
  readonly normal: string | null;
  /** Explicit height map, when declared and present. */
  readonly heightmap: string | null;
}

const MER_KEY = "metalness_emissive_roughness";
const MERS_KEY = "metalness_emissive_roughness_subsurface";
const EXTENSIONS = [".png", ".tga"] as const;

/** Narrow an unknown JSON value to a `[number, number, number]` triple. */
function asScalarTriple(value: unknown): readonly [number, number, number] | null {
  if (!Array.isArray(value) || value.length < 3) return null;
  const [r, g, b] = value;
  if (typeof r !== "number" || typeof g !== "number" || typeof b !== "number") return null;
  return [r, g, b] as const;
}

/**
 * Find a texture on disk, trying `.png` then `.tga`.
 *
 * @param directory - Directory holding the pack's block textures.
 * @param stem - Filename without extension.
 */
export async function resolveTexturePath(
  directory: string,
  stem: string,
): Promise<string | null> {
  for (const extension of EXTENSIONS) {
    const candidate = path.join(directory, `${stem}${extension}`);
    if (await fileExists(candidate)) return candidate;
  }
  return null;
}

/** Toggle a stem between the `_mer` and `_mers` spellings. */
function swapMerSuffix(stem: string): string | null {
  if (stem.endsWith("_mers")) return stem.slice(0, -1);
  if (stem.endsWith("_mer")) return `${stem}s`;
  return null;
}

/**
 * Resolve the MER(S) file a texture set refers to, tolerating the pack's
 * `_mer`/`_mers` naming drift.
 *
 * Tries the declared stem first, then swaps the `_mer`/`_mers` suffix, so a set that
 * says `hay_block_side_mers` still finds `hay_block_side_mer.png`, and vice versa.
 */
async function resolveMerPath(directory: string, stem: string): Promise<string | null> {
  const direct = await resolveTexturePath(directory, stem);
  if (direct) return direct;

  const swapped = swapMerSuffix(stem);
  if (!swapped) return null;

  return resolveTexturePath(directory, swapped);
}

/** Parsed shape of the `minecraft:texture_set` object. */
interface IRawTextureSet {
  readonly color?: unknown;
  readonly normal?: unknown;
  readonly heightmap?: unknown;
  readonly [MER_KEY]?: unknown;
  readonly [MERS_KEY]?: unknown;
}

/**
 * Read and resolve one `*.texture_set.json`.
 *
 * @param jsonPath - Path to the texture set file.
 * @returns The resolved set. Missing layers come back as `null` rather than throwing,
 *   so a texture with no normal map still contributes its `_s`.
 * @throws When the file is not valid JSON or lacks `minecraft:texture_set`.
 */
export async function readTextureSet(jsonPath: string): Promise<IResolvedTextureSet> {
  const directory = path.dirname(jsonPath);
  const name = path.basename(jsonPath).replace(/\.texture_set\.json$/i, "");

  // Some of the pack's texture sets are saved with a UTF-8 BOM, which JSON.parse rejects.
  const raw = (await readFile(jsonPath, "utf-8")).replace(/^﻿/, "");
  const parsed: unknown = JSON.parse(raw);
  if (typeof parsed !== "object" || parsed === null || !("minecraft:texture_set" in parsed)) {
    throw new Error(`${jsonPath}: missing "minecraft:texture_set"`);
  }

  const set = (parsed as Record<string, unknown>)["minecraft:texture_set"] as IRawTextureSet;
  const hasSubsurface = MERS_KEY in set;
  const merValue = hasSubsurface ? set[MERS_KEY] : set[MER_KEY];

  const mer = await resolveMerLayer(directory, merValue);
  const colorStem = typeof set.color === "string" ? set.color : null;
  const normalStem = typeof set.normal === "string" ? set.normal : null;
  const heightStem = typeof set.heightmap === "string" ? set.heightmap : null;

  return {
    name,
    color: colorStem ? await resolveTexturePath(directory, colorStem) : null,
    mer,
    hasSubsurface,
    normal: normalStem ? await resolveTexturePath(directory, normalStem) : null,
    heightmap: heightStem ? await resolveTexturePath(directory, heightStem) : null,
  };
}

/** Turn a raw MER(S) JSON value into a {@link LayerSource}. */
async function resolveMerLayer(directory: string, value: unknown): Promise<LayerSource | null> {
  const scalar = asScalarTriple(value);
  if (scalar) return { kind: "scalar", rgb: scalar };

  if (typeof value !== "string") return null;

  const resolved = await resolveMerPath(directory, value);
  if (!resolved) return null;

  return { kind: "file", path: resolved };
}
