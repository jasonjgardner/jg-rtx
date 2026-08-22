/**
 * Scans a resource pack's `textures/blocks/**` tree into {@link ITextureSet}s.
 *
 * A set is anchored on a `.texture_set.json` when one exists, because that file
 * is the pack's own declaration of which PBR maps belong together. Loose images
 * with no sidecar are then indexed as colour-only sets — vanilla ships no
 * sidecars whatsoever, so without that pass every un-overridden block would
 * resolve to nothing.
 *
 * Sets are keyed by their pack-relative path *without* extension — exactly the
 * string `terrain_texture.json` uses — so block resolution is a direct lookup.
 */

import { readFile } from "node:fs/promises";
import { join, posix } from "node:path";
import { parseJsonc } from "./jsonc";
import {
  COMPANION_SUFFIX,
  companionsForStem,
  fileForStem,
  indexFiles,
  walk,
  type FileIndex,
} from "./fsx";
import type {
  IFlipbook,
  ITextureFile,
  ITextureSet,
  TextureOrigin,
  TextureRole,
} from "../../src/lib/types";

/** Suffix identifying a Bedrock texture-set sidecar. */
const SET_SUFFIX = ".texture_set.json";

/** Maps `minecraft:texture_set` keys onto the loader's role names. */
const ROLE_BY_KEY: Readonly<Record<string, TextureRole>> = {
  color: "color",
  metalness_emissive_roughness: "mer",
  metalness_emissive_roughness_subsurface: "mers",
  normal: "normal",
  heightmap: "heightmap",
};

/**
 * Turn a texture-set reference into a concrete file.
 *
 * @param reference Value from `minecraft:texture_set`, e.g. `stone_mer`.
 * @param setDir Directory of the sidecar, since references are relative to it.
 * @param texturesRoot Absolute path of the pack's `textures/` directory.
 * @param index File index for the block textures tree.
 * @returns The resolved file, or `null` when the reference names no real image.
 *   Constant-colour entries (`"#ff0000"`, `[255, 0, 0]`) and dangling
 *   references both land here; the three.js loader supports textures only.
 */
const resolveReference = async (
  reference: unknown,
  setDir: string,
  texturesRoot: string,
  index: FileIndex,
): Promise<ITextureFile | null> => {
  if (typeof reference !== "string" || reference.startsWith("#")) return null;

  const stem = reference.includes("/")
    ? reference.replace(/^textures\//, "")
    : posix.join(setDir, reference);

  return fileForStem(stem, texturesRoot, index, "textures/");
};

/**
 * Derive flipbook metadata for a colour map.
 *
 * A strip is a vertical stack of square frames, so the frame count is
 * `height / width`. Only textures listed in `flipbook_textures.json` animate;
 * a tall texture absent from that file is a still image, not an animation.
 *
 * @param color The set's colour map.
 * @param ticksByPath Frame timings keyed by extensionless pack-relative path.
 */
const deriveFlipbook = (
  color: ITextureFile,
  ticksByPath: ReadonlyMap<string, number>,
): IFlipbook | undefined => {
  const stem = color.file.replace(/\.(png|tga)$/i, "");
  const ticksPerFrame = ticksByPath.get(stem);

  if (ticksPerFrame === undefined) return undefined;
  if (color.height <= color.width || color.height % color.width !== 0) return undefined;

  return { frames: color.height / color.width, ticksPerFrame };
};

/** Assemble a set record, attaching flipbook data when the colour map animates. */
const buildSet = (
  id: string,
  origin: TextureOrigin,
  roles: Partial<Record<TextureRole, ITextureFile>>,
  color: ITextureFile,
  ticksByPath: ReadonlyMap<string, number>,
): ITextureSet => {
  const flipbook = deriveFlipbook(color, ticksByPath);

  return {
    id,
    origin,
    color,
    ...(roles.mer ? { mer: roles.mer } : {}),
    ...(roles.mers ? { mers: roles.mers } : {}),
    ...(roles.normal ? { normal: roles.normal } : {}),
    ...(roles.heightmap ? { heightmap: roles.heightmap } : {}),
    ...(flipbook ? { flipbook } : {}),
  };
};

/**
 * Scan a pack's block textures into texture sets.
 *
 * @param packRoot Absolute path to the resource-pack root (the folder holding `textures/`).
 * @param origin Which repository this pack is served from at runtime.
 * @param ticksByPath Merged flipbook timings from {@link loadFlipbookTicks}.
 * @returns Sets keyed by extensionless pack-relative path, e.g. `textures/blocks/stone`.
 */
export const scanTextureSets = async (
  packRoot: string,
  origin: TextureOrigin,
  ticksByPath: ReadonlyMap<string, number> = new Map(),
): Promise<Map<string, ITextureSet>> => {
  const texturesRoot = join(packRoot, "textures");
  const blocksRel = "blocks";

  const allFiles = (await walk(join(texturesRoot, blocksRel)))
    .map((file) => posix.join(blocksRel, file));

  const index = indexFiles(allFiles);
  const sets = new Map<string, ITextureSet>();

  // Pass 1 — sidecar-declared sets, the pack's own source of truth.
  const sidecars = allFiles.filter((file) => file.endsWith(SET_SUFFIX));

  const declared = await Promise.all(
    sidecars.map(async (sidecar) => {
      const raw = await readFile(join(texturesRoot, sidecar), "utf8").catch(() => null);
      if (raw === null) return null;

      const parsed = parseJsonc<{
        "minecraft:texture_set"?: Record<string, unknown>;
      }>(raw);
      const body = parsed["minecraft:texture_set"];
      if (!body) return null;

      const stem = sidecar.slice(0, -SET_SUFFIX.length);
      const setDir = posix.dirname(stem);

      const entries = await Promise.all(
        Object.entries(body).map(async ([key, value]) => {
          const role = ROLE_BY_KEY[key];
          if (!role) return null;

          const file = await resolveReference(value, setDir, texturesRoot, index);
          if (!file) return null;

          return [role, file] as const;
        }),
      );

      const roles = Object.fromEntries(
        entries.filter((entry): entry is NonNullable<typeof entry> => entry !== null),
      ) as Partial<Record<TextureRole, ITextureFile>>;

      const color = roles.color;
      if (!color) return null;

      return buildSet(`textures/${stem}`, origin, roles, color, ticksByPath);
    }),
  );

  declared
    .filter((set): set is ITextureSet => set !== null)
    .forEach((set) => sets.set(set.id, set));

  // Pass 2 — loose images with no sidecar. Vanilla is entirely this case.
  const loose = [...index.keys()].filter((stem) =>
    !sets.has(`textures/${stem}`) && !COMPANION_SUFFIX.test(stem));

  const looseSets = await Promise.all(
    loose.map(async (stem) => {
      const color = await fileForStem(stem, texturesRoot, index, "textures/");
      if (!color) return null;

      const roles = await companionsForStem(stem, texturesRoot, index, "textures/");

      return buildSet(`textures/${stem}`, origin, roles, color, ticksByPath);
    }),
  );

  looseSets
    .filter((set): set is ITextureSet => set !== null)
    .forEach((set) => sets.set(set.id, set));

  return sets;
};
