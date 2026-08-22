/**
 * Resolves vanilla `blocks.json` into per-face texture assignments.
 *
 * The chain is three hops, and every hop is needed:
 *
 * ```
 * blocks.json      oak_log -> { up: "log_oak_top", side: "log_oak" }
 * terrain_texture  log_oak -> "textures/blocks/log_oak"
 * texture sets     textures/blocks/log_oak -> { color, mer, normal }
 * ```
 *
 * `blocks.json` speaks in *texture keys*, not paths, which is why
 * `terrain_texture.json` must be merged (JG RTX's overrides layered over
 * Mojang's) before anything can be resolved to a file.
 */

import type { IBlockEntry, ITextureSet, BlockFace } from "../../src/lib/types";
import { BLOCK_FACES } from "../../src/lib/types";
import { shapeForBlock } from "../../src/lib/blockShapes";
import type {
  IVanillaBlock,
  TerrainTextureData,
  TerrainTextureValue,
} from "./vanilla";

/** The four lateral faces that a `side` shorthand expands to. */
const LATERAL_FACES: readonly BlockFace[] = ["north", "south", "east", "west"] as const;

/** Blocks with no renderable geometry, excluded from the catalog. */
const SKIP_IDS = new Set(["air", "structure_void", "barrier", "light_block"]);

/**
 * Convert a block identifier to a URL slug.
 *
 * @param id Block id such as `oak_log`.
 * @returns Slug such as `oak-log`.
 */
export const toSlug = (id: string): string =>
  id.replace(/^minecraft:/, "").replace(/_/g, "-").toLowerCase();

/**
 * Convert a block identifier to a display title.
 *
 * @param id Block id such as `oak_log`.
 * @returns Title such as `Oak Log`.
 */
export const toTitle = (id: string): string =>
  id
    .replace(/^minecraft:/, "")
    .split("_")
    .filter((word) => word.length > 0)
    .map((word) => `${word[0]?.toUpperCase() ?? ""}${word.slice(1)}`)
    .join(" ");

/** A resolved terrain texture: its path and any biome tint applied to it. */
interface IResolvedTexture {
  readonly path: string;
  /** Hex colour multiplied over the texture, e.g. grass and foliage. */
  readonly tint: string | null;
}

/**
 * Extract the first usable path (and tint) from a `terrain_texture.json` value.
 *
 * Entries may be a bare path, a `{ path, overlay_color }` object, or an array
 * of either for randomised variants. Grass, leaves and vines ship greyscale and
 * rely entirely on `overlay_color` for their colour, so the tint has to survive
 * resolution or those blocks preview as grey. The first entry is representative.
 *
 * @param value The raw `textures` value.
 * @returns The resolved texture, or `null` if none is present.
 */
const firstTexture = (value: TerrainTextureValue | undefined): IResolvedTexture | null => {
  if (typeof value === "string") return { path: value, tint: null };

  if (Array.isArray(value)) {
    const first = value.find((entry) => entry !== undefined && entry !== null);
    return first === undefined ? null : firstTexture(first as TerrainTextureValue);
  }

  if (value && typeof value === "object" && "path" in value) {
    if (typeof value.path !== "string") return null;

    // Two tint keys exist in the wild: `overlay_color` (grass, foliage) and
    // `tint_color` (waterlily). They mean the same thing here.
    const tint = [value.overlay_color, value.tint_color]
      .find((candidate) => typeof candidate === "string") ?? null;

    return { path: value.path, tint };
  }

  return null;
};

/**
 * Leading token of a texture path, used to decide tint inheritance.
 * `textures/blocks/grass_top` yields `grass`.
 */
const family = (path: string): string =>
  path.split("/").pop()?.split("_")[0] ?? "";

/**
 * Fill in tints that Bedrock derives from a biome colormap rather than declaring.
 *
 * `grass_side` carries `overlay_color`, but `grass_top` declares nothing — in
 * game its green comes from `textures/colormap/grass.png`, which is biome
 * dependent and not represented in `blocks.json`. Left alone, a grass block
 * previews with a green side and a grey top.
 *
 * The fallback is deliberately narrow: an untinted face adopts a tinted
 * sibling's colour only when their textures share a leading name token. That
 * covers `grass_side` → `grass_top` while leaving grass's `down` face (`dirt`)
 * alone, which must stay brown.
 *
 * @param resolved Per-face resolution results.
 * @returns Tint per face.
 */
const inheritTints = (
  resolved: readonly (readonly [BlockFace, IResolvedTexture | null])[],
): Record<BlockFace, string | null> => {
  const tinted = resolved
    .map(([, hit]) => hit)
    .filter((hit): hit is IResolvedTexture => hit !== null && hit.tint !== null);

  return Object.fromEntries(
    resolved.map(([face, hit]) => {
      if (hit === null) return [face, null];
      if (hit.tint !== null) return [face, hit.tint];

      const sibling = tinted.find((other) => family(other.path) === family(hit.path));

      return [face, sibling?.tint ?? null];
    }),
  ) as Record<BlockFace, string | null>;
};

/**
 * Resolve a `blocks.json` texture key to a texture-set id and tint.
 *
 * @param key The texture key, e.g. `log_oak`.
 * @param terrain Merged terrain-texture data.
 * @returns The resolved set id and tint.
 */
const resolveKey = (key: string, terrain: TerrainTextureData): IResolvedTexture => {
  const resolved = firstTexture(terrain[key]?.textures);

  // Some packs reference a texture path directly instead of a terrain key.
  if (resolved === null) {
    return {
      path: key.startsWith("textures/") ? key : `textures/blocks/${key}`,
      tint: null,
    };
  }

  return resolved;
};

/**
 * Expand a `blocks.json` `textures` declaration into all six faces.
 *
 * @param textures The polymorphic `textures` value.
 * @returns Texture *keys* per face, before terrain resolution.
 */
const expandFaces = (
  textures: IVanillaBlock["textures"],
): Record<BlockFace, string | null> => {
  const empty = Object.fromEntries(
    BLOCK_FACES.map((face) => [face, null]),
  ) as Record<BlockFace, string | null>;

  if (textures === undefined) return empty;

  // A bare string (or a variant array) applies to every face.
  if (typeof textures === "string") {
    return Object.fromEntries(
      BLOCK_FACES.map((face) => [face, textures]),
    ) as Record<BlockFace, string | null>;
  }

  if (Array.isArray(textures)) {
    const first = textures.find((entry) => typeof entry === "string") ?? null;
    return Object.fromEntries(
      BLOCK_FACES.map((face) => [face, first]),
    ) as Record<BlockFace, string | null>;
  }

  const record = textures as Readonly<Record<string, string | readonly string[]>>;

  /** Read one key from the record, flattening variant arrays. */
  const read = (name: string): string | null => {
    const value = record[name];
    if (typeof value === "string") return value;
    if (Array.isArray(value)) return value.find((entry) => typeof entry === "string") ?? null;
    return null;
  };

  const side = read("side");

  return BLOCK_FACES.reduce<Record<BlockFace, string | null>>((accumulator, face) => {
    const direct = read(face);
    const lateral = LATERAL_FACES.includes(face) ? side : null;

    return { ...accumulator, [face]: direct ?? lateral ?? null };
  }, empty);
};

/**
 * Build catalog entries for every block that resolves to at least one texture.
 *
 * @param vanillaBlocks Parsed `blocks.json`.
 * @param terrain Merged terrain-texture data (JG RTX over vanilla).
 * @param jgSets Texture sets found in the JG RTX pack.
 * @param vanillaSets Texture sets found in Mojang's sample pack.
 * @returns Block entries sorted by slug, plus the set ids they reference.
 */
export const resolveBlocks = (
  vanillaBlocks: Readonly<Record<string, IVanillaBlock>>,
  terrain: TerrainTextureData,
  jgSets: ReadonlyMap<string, ITextureSet>,
  vanillaSets: ReadonlyMap<string, ITextureSet>,
): IBlockEntry[] =>
  Object.entries(vanillaBlocks)
    .filter(([id]) => !SKIP_IDS.has(id.replace(/^minecraft:/, "")))
    .map(([rawId, block]) => {
      const id = rawId.replace(/^minecraft:/, "");
      const keys = expandFaces(block.textures);

      const resolved = BLOCK_FACES.map((face) => {
        const key = keys[face];
        const hit = key === null ? null : resolveKey(key, terrain);
        const exists = hit !== null && (jgSets.has(hit.path) || vanillaSets.has(hit.path));

        return [face, exists ? hit : null] as const;
      });

      const faces = Object.fromEntries(
        resolved.map(([face, hit]) => [face, hit?.path ?? null]),
      ) as Record<BlockFace, string | null>;

      const tints = inheritTints(resolved);

      const sets = [...new Set(BLOCK_FACES.map((face) => faces[face]))]
        .filter((setId): setId is string => setId !== null);

      const jgCount = sets.filter((setId) => jgSets.has(setId)).length;

      return {
        id,
        slug: toSlug(id),
        name: toTitle(id),
        ...(block.sound ? { sound: block.sound } : {}),
        faces,
        tints,
        sets,
        uniform: sets.length === 1,
        coverage:
          jgCount === sets.length ? "jg" : jgCount === 0 ? "vanilla" : "mixed",
        shape: shapeForBlock(id),
      } satisfies IBlockEntry;
    })
    .filter((entry) => entry.sets.length > 0)
    .sort((left, right) => left.slug.localeCompare(right.slug));
