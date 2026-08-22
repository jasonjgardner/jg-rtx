/**
 * Fetches Mojang's vanilla resource-pack metadata, with an on-disk cache.
 *
 * `blocks.json` is the authority on which textures each block puts on each
 * face — it is the only reason logs, pillars and grass can share one page slug
 * while showing different textures per face. `terrain_texture.json` then maps
 * the texture *keys* that `blocks.json` references to actual file paths.
 *
 * Both are fetched from jsDelivr rather than checked in, so the catalog tracks
 * upstream automatically. The cache keeps repeat local runs offline-friendly.
 */

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { parseJsonc } from "./jsonc";
import { VANILLA_REF } from "../../src/lib/cdn";

/** Where fetched upstream JSON is cached between runs. */
const CACHE_DIR = ".cache";

const VANILLA_BASE =
  `https://cdn.jsdelivr.net/gh/Mojang/bedrock-samples@${VANILLA_REF}/resource_pack`;

/**
 * A `blocks.json` entry. `textures` is polymorphic: a bare string applies one
 * texture to every face, an array is a variant list (first entry wins for
 * preview purposes), and an object keys textures by face or by `side`.
 */
export interface IVanillaBlock {
  readonly sound?: string;
  readonly textures?: string | readonly string[] | Readonly<Record<string, string | readonly string[]>>;
  readonly carried_textures?: unknown;
}

/**
 * A `terrain_texture.json` entry, which may carry a tint alongside the path.
 * Both `overlay_color` and `tint_color` appear upstream and mean the same here.
 */
export interface ITerrainTexture {
  readonly path: string;
  readonly overlay_color?: string;
  readonly tint_color?: string;
}

/** The polymorphic `textures` value of a terrain entry. */
export type TerrainTextureValue =
  | string
  | ITerrainTexture
  | readonly (string | ITerrainTexture)[];

/** The `texture_data` map from a `terrain_texture.json`. */
export type TerrainTextureData = Readonly<Record<string, { readonly textures: TerrainTextureValue }>>;

/**
 * Fetch a JSON document, falling back to a cached copy when the network is
 * unavailable. Successful fetches refresh the cache.
 *
 * @param url Absolute URL to fetch.
 * @param cacheName Filename to cache under inside `.cache/`.
 * @throws If the document is neither fetchable nor cached.
 */
const fetchJsonCached = async <T>(url: string, cacheName: string): Promise<T> => {
  const cachePath = join(CACHE_DIR, cacheName);

  try {
    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(`${response.status} ${response.statusText}`);
    }

    // Mojang ships these with a BOM and a leading `//` disclaimer.
    const text = await response.text();
    const parsed = parseJsonc<T>(text);

    await mkdir(CACHE_DIR, { recursive: true });
    await writeFile(cachePath, text, "utf8");

    return parsed;
  } catch (error) {
    const cached = await readFile(cachePath, "utf8").catch(() => null);

    if (cached === null) {
      throw new Error(
        `Could not fetch ${url} and no cached copy exists at ${cachePath}: ${error}`,
      );
    }

    console.warn(`  ! ${url} unreachable, using cached ${cacheName}`);
    return parseJsonc<T>(cached);
  }
};

/**
 * Load vanilla `blocks.json`, stripped of its `format_version` marker so the
 * remaining keys are all block identifiers.
 */
export const loadVanillaBlocks = async (): Promise<Record<string, IVanillaBlock>> => {
  const raw = await fetchJsonCached<Record<string, unknown>>(
    `${VANILLA_BASE}/blocks.json`,
    "vanilla-blocks.json",
  );

  const { format_version: _ignored, ...blocks } = raw;

  return blocks as Record<string, IVanillaBlock>;
};

/** Load vanilla `terrain_texture.json` and return just its `texture_data` map. */
export const loadVanillaTerrain = async (): Promise<TerrainTextureData> => {
  const raw = await fetchJsonCached<{ texture_data: TerrainTextureData }>(
    `${VANILLA_BASE}/textures/terrain_texture.json`,
    "vanilla-terrain-texture.json",
  );

  return raw.texture_data ?? {};
};
