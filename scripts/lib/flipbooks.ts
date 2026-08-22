/**
 * Builds the animated-texture lookup by merging vanilla and pack flipbook data.
 *
 * A resource pack's `flipbook_textures.json` lists only what it *adds or
 * overrides* — JG RTX declares 3 entries, while Mojang declares 83 covering
 * fire, water, lava, magma and the bubble columns. Reading the pack file alone
 * would leave almost every animation undetected, so the two are merged with the
 * pack winning on conflicts.
 */

import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { parseJsonc } from "./jsonc";
import { VANILLA_REF } from "../../src/lib/cdn";

const VANILLA_FLIPBOOKS =
  `https://cdn.jsdelivr.net/gh/Mojang/bedrock-samples@${VANILLA_REF}/resource_pack/textures/flipbook_textures.json`;

/** One entry of a `flipbook_textures.json` document. */
interface IFlipbookEntry {
  readonly flipbook_texture?: string;
  readonly ticks_per_frame?: number;
}

/** Frame hold time used when an entry omits `ticks_per_frame`. */
const DEFAULT_TICKS = 1;

/**
 * Reduce flipbook entries to a path to ticks-per-frame lookup.
 *
 * @param entries Parsed flipbook entries.
 */
const toMap = (entries: readonly IFlipbookEntry[]): Map<string, number> =>
  new Map(
    entries
      .filter((entry): entry is IFlipbookEntry & { flipbook_texture: string } =>
        typeof entry.flipbook_texture === "string")
      .map((entry) => [
        entry.flipbook_texture,
        entry.ticks_per_frame ?? DEFAULT_TICKS,
      ]),
  );

/** Fetch Mojang's flipbook declarations, tolerating an offline run. */
const loadVanillaFlipbooks = async (): Promise<Map<string, number>> => {
  const response = await fetch(VANILLA_FLIPBOOKS).catch(() => null);

  if (!response?.ok) {
    console.warn("  ! vanilla flipbook_textures.json unreachable; animations may be missed");
    return new Map();
  }

  const entries = parseJsonc<IFlipbookEntry[]>(await response.text());

  return toMap(entries);
};

/**
 * Read a pack's own flipbook declarations.
 *
 * @param packRoot Absolute path to the resource-pack root.
 */
const loadPackFlipbooks = async (packRoot: string): Promise<Map<string, number>> => {
  const raw = await readFile(join(packRoot, "textures", "flipbook_textures.json"), "utf8")
    .catch(() => null);

  if (raw === null) return new Map();

  return toMap(parseJsonc<IFlipbookEntry[]>(raw));
};

/**
 * Merge vanilla and pack flipbook declarations.
 *
 * @param packRoot Absolute path to the resource-pack root.
 * @returns Ticks-per-frame keyed by extensionless pack-relative path.
 */
export const loadFlipbookTicks = async (
  packRoot: string,
): Promise<ReadonlyMap<string, number>> => {
  const [vanilla, pack] = await Promise.all([
    loadVanillaFlipbooks(),
    loadPackFlipbooks(packRoot),
  ]);

  return new Map([...vanilla, ...pack]);
};
