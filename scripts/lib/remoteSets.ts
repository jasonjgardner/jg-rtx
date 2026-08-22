/**
 * Builds vanilla texture sets from a remote file listing, with no checkout.
 *
 * Mojang's `bedrock-samples` is a full PBR pack these days — 1206 texture-set
 * sidecars and 1261 `.tga` files — but fetching each sidecar would be 1200+
 * requests. Instead the GitHub trees API returns the whole `textures/blocks`
 * subtree in a single unauthenticated call, and sets are assembled from naming
 * convention (`x.png` + `x_mers.tga` + `x_normal.png`), which vanilla follows
 * consistently.
 *
 * Dimensions are unavailable without downloading each image, so files produced
 * here carry `width`/`height` of `0`, meaning *unknown*. That is acceptable
 * because vanilla textures are preview fallbacks only — they are never written
 * into a generated pack, and the browser reads real dimensions when rendering.
 */

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { COMPANION_SUFFIX, indexFiles, EXTENSIONS } from "./fsx";
import { VANILLA_REF } from "../../src/lib/cdn";
import type { ITextureFile, ITextureSet, TextureExt } from "../../src/lib/types";

/** Where the fetched listing is cached between runs. */
const CACHE_DIR = ".cache";

/** Sentinel meaning "dimensions were not probed". */
export const UNKNOWN_SIZE = 0;

const TREE_URL =
  `https://api.github.com/repos/Mojang/bedrock-samples/git/trees/${VANILLA_REF}:resource_pack/textures/blocks`;

/** A single entry of the GitHub trees API response. */
interface ITreeEntry {
  readonly path: string;
  readonly type: string;
}

/**
 * Fetch the vanilla block-texture file listing, caching it on disk.
 *
 * @returns Paths relative to `resource_pack/textures/blocks`.
 * @throws If the listing is neither fetchable nor cached.
 */
export const fetchVanillaListing = async (): Promise<string[]> => {
  const cachePath = join(CACHE_DIR, "vanilla-blocks-listing.json");

  try {
    const response = await fetch(TREE_URL, {
      headers: { accept: "application/vnd.github+json" },
    });

    if (!response.ok) {
      throw new Error(`${response.status} ${response.statusText}`);
    }

    const body = (await response.json()) as {
      tree?: readonly ITreeEntry[];
      truncated?: boolean;
    };

    if (!body.tree) throw new Error("response contained no tree");

    if (body.truncated === true) {
      console.warn("  ! vanilla listing was truncated by GitHub; coverage may be partial");
    }

    const paths = body.tree
      .filter((entry) => entry.type === "blob")
      .map((entry) => entry.path);

    await mkdir(CACHE_DIR, { recursive: true });
    await writeFile(cachePath, JSON.stringify(paths), "utf8");

    return paths;
  } catch (error) {
    const cached = await readFile(cachePath, "utf8").catch(() => null);

    if (cached === null) {
      throw new Error(
        `Could not fetch the vanilla listing and no cache exists at ${cachePath}: ${error}`,
      );
    }

    console.warn("  ! GitHub listing unreachable, using cached vanilla listing");
    return JSON.parse(cached) as string[];
  }
};

/**
 * Pick the preferred extension for an extensionless path in the listing.
 *
 * @param stem Extensionless path.
 * @param index Index built from the listing.
 */
const pickFile = (
  stem: string,
  index: ReadonlyMap<string, TextureExt[]>,
): ITextureFile | null => {
  const available = index.get(stem) ?? [];
  const ext = EXTENSIONS.find((candidate) => available.includes(candidate));
  if (!ext) return null;

  return {
    file: `textures/blocks/${stem}.${ext}`,
    ext,
    width: UNKNOWN_SIZE,
    height: UNKNOWN_SIZE,
  };
};

/**
 * Assemble vanilla texture sets from a flat file listing.
 *
 * @param paths Paths relative to `resource_pack/textures/blocks`.
 * @returns Sets keyed by extensionless pack-relative path.
 */
export const setsFromListing = (paths: readonly string[]): Map<string, ITextureSet> => {
  const index = indexFiles(paths);
  const sets = new Map<string, ITextureSet>();

  [...index.keys()]
    .filter((stem) => !COMPANION_SUFFIX.test(stem))
    .forEach((stem) => {
      const color = pickFile(stem, index);
      if (!color) return;

      const companions = (["mer", "mers", "normal", "heightmap"] as const)
        .map((role) => {
          const file = pickFile(`${stem}_${role}`, index);
          return file ? ([role, file] as const) : null;
        })
        .filter((entry): entry is NonNullable<typeof entry> => entry !== null);

      const id = `textures/blocks/${stem}`;

      sets.set(id, {
        id,
        origin: "vanilla",
        color,
        ...Object.fromEntries(companions),
      });
    });

  return sets;
};
