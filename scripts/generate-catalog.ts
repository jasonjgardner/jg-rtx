/**
 * Generates the block/texture/variety catalog the Astro site builds from.
 *
 * The `pages` branch deliberately contains no pack data, and jsDelivr's data
 * API refuses to list either upstream repository ("Package size exceeded the
 * configured limit of 50 MB"), so the file inventory cannot be discovered at
 * runtime. This script produces it once, at build time, from a checkout of the
 * JG RTX repo plus Mojang's published vanilla listing.
 *
 * Usage:
 * ```sh
 * bun run scripts/generate-catalog.ts --src "../JG RTX"
 * bun run scripts/generate-catalog.ts --src .jg-rtx --vanilla .bedrock-samples
 * ```
 *
 * `--vanilla` is optional. Given a checkout it probes real dimensions; without
 * one it falls back to the GitHub trees API, which is enough for previews.
 */

import { mkdir, writeFile } from "node:fs/promises";
import { isAbsolute, join, resolve } from "node:path";
import { readFile } from "node:fs/promises";
import { resolveBlocks } from "./lib/blocks";
import { loadFlipbookTicks } from "./lib/flipbooks";
import { collectHistory, hasGitHistory, type IHistoryEntry } from "./lib/history";
import { parseJsonc } from "./lib/jsonc";
import { scanPackFiles } from "./lib/packFiles";
import { fetchVanillaListing, setsFromListing } from "./lib/remoteSets";
import { scanTextureSets } from "./lib/textureSets";
import { scanVarieties } from "./lib/varieties";
import { loadVanillaBlocks, loadVanillaTerrain } from "./lib/vanilla";
import { PACK_REF, VANILLA_REF } from "../src/lib/cdn";
import type { ICatalog, ITextureSet } from "../src/lib/types";
import type { TerrainTextureData } from "./lib/vanilla";

/** Where generated JSON is written, relative to the project root. */
const OUT_DIR = "src/data";

/** Path of the JG RTX resource pack inside its repository. */
const RP_SUBPATH = "bedrock/pack/RP";

/** Path of the variety tree inside the JG RTX repository. */
const VARIETY_SUBPATH = "bedrock/variety";

/**
 * Parse `--flag value` pairs from argv.
 *
 * @param argv Raw arguments, excluding the runtime and script path.
 */
const parseArgs = (argv: readonly string[]): ReadonlyMap<string, string> => {
  const args = new Map<string, string>();

  argv.forEach((token, index) => {
    if (!token.startsWith("--")) return;

    const inline = token.indexOf("=");

    if (inline !== -1) {
      args.set(token.slice(2, inline), token.slice(inline + 1));
      return;
    }

    const next = argv[index + 1];
    args.set(token.slice(2), next !== undefined && !next.startsWith("--") ? next : "true");
  });

  return args;
};

/**
 * Read a pack's own `terrain_texture.json`, which overrides vanilla entries.
 *
 * @param packRoot Absolute path to the resource-pack root.
 * @returns The `texture_data` map, or an empty object when absent.
 */
const loadPackTerrain = async (packRoot: string): Promise<TerrainTextureData> => {
  const raw = await readFile(join(packRoot, "textures", "terrain_texture.json"), "utf8")
    .catch(() => null);

  if (raw === null) return {};

  const parsed = parseJsonc<{ texture_data?: TerrainTextureData }>(raw);

  return parsed.texture_data ?? {};
};

/**
 * Load vanilla texture sets, preferring a local checkout when one is supplied.
 *
 * @param vanillaPath Optional path to a `bedrock-samples` checkout.
 * @param ticksByPath Merged flipbook timings, used when scanning a checkout.
 */
const loadVanillaSets = async (
  vanillaPath: string | undefined,
  ticksByPath: ReadonlyMap<string, number>,
): Promise<Map<string, ITextureSet>> => {
  if (vanillaPath !== undefined) {
    console.log(`  vanilla: scanning checkout at ${vanillaPath}`);
    return scanTextureSets(join(vanillaPath, "resource_pack"), "vanilla", ticksByPath);
  }

  console.log("  vanilla: fetching listing from the GitHub trees API");
  const listing = await fetchVanillaListing();

  return setsFromListing(listing);
};

/**
 * Load the committed history so a run without git history leaves it intact.
 *
 * A shallow CI checkout cannot read revisions; regenerating from one would
 * silently delete every previous design the site offers.
 */
const readExistingHistory = async (): Promise<IHistoryEntry[]> => {
  const raw = await readFile(join(OUT_DIR, "history.json"), "utf8").catch(() => null);

  if (raw === null) return [];

  console.log("  history: preserving the committed file (no git history available)");

  return JSON.parse(raw) as IHistoryEntry[];
};

/** Write one JSON file, pretty-printed only when small enough to stay readable. */
const writeJson = async (name: string, value: unknown): Promise<number> => {
  const text = JSON.stringify(value);
  const path = join(OUT_DIR, name);

  await writeFile(path, text, "utf8");

  return text.length;
};

/** Entry point. */
const main = async (): Promise<void> => {
  const args = parseArgs(process.argv.slice(2));

  const srcArg = args.get("src") ?? process.env.JG_RTX_SRC ?? "../JG RTX";
  const src = isAbsolute(srcArg) ? srcArg : resolve(process.cwd(), srcArg);
  const vanillaArg = args.get("vanilla") ?? process.env.BEDROCK_SAMPLES_SRC;
  const vanillaPath = vanillaArg === undefined
    ? undefined
    : isAbsolute(vanillaArg) ? vanillaArg : resolve(process.cwd(), vanillaArg);

  console.log(`JG RTX source: ${src}`);

  const packRoot = join(src, RP_SUBPATH);

  // Animations must be known before scanning so tall strips can be classified.
  const ticksByPath = await loadFlipbookTicks(packRoot);

  const [jgSets, vanillaSets, vanillaBlocks, vanillaTerrain, packTerrain] =
    await Promise.all([
      scanTextureSets(packRoot, "jg", ticksByPath),
      loadVanillaSets(vanillaPath, ticksByPath),
      loadVanillaBlocks(),
      loadVanillaTerrain(),
      loadPackTerrain(packRoot),
    ]);

  console.log(`  texture sets: ${jgSets.size} JG RTX, ${vanillaSets.size} vanilla`);

  // JG RTX's own terrain entries win over Mojang's.
  const terrain: TerrainTextureData = { ...vanillaTerrain, ...packTerrain };

  const blocks = resolveBlocks(vanillaBlocks, terrain, jgSets, vanillaSets);

  const varieties = await scanVarieties(join(src, VARIETY_SUBPATH), `${VARIETY_SUBPATH}/`);

  // The download rebuilds the whole pack in the browser, so it needs every
  // path and size up front — jsDelivr serves files but will not list them.
  const inventory = await scanPackFiles(packRoot);
  const packBytes = [...inventory.textures, ...inventory.other]
    .reduce((sum, entry) => sum + entry.bytes, 0);

  // Emit only the sets that at least one block or variety actually references,
  // so the site never ships metadata for textures it cannot reach.
  const referenced = new Set([
    ...blocks.flatMap((block) => block.sets),
    ...varieties.map((variety) => variety.setId),
  ]);

  const sets = [...referenced]
    .map((id) => jgSets.get(id) ?? vanillaSets.get(id))
    .filter((set): set is ITextureSet => set !== undefined)
    .sort((left, right) => left.id.localeCompare(right.id));

  // Previous designs, read from the pack's git log. Only JG RTX's own textures
  // have history here; vanilla ones live in another repository.
  //
  // The pack's history is ~10 GB, so CI checks out shallow and cannot produce
  // this. In that case the committed file is preserved rather than overwritten
  // with an empty one, which would silently delete every previous design.
  const colorFiles = new Map(
    sets
      .filter((set) => set.origin === "jg")
      .map((set) => [set.id, set.color.file] as const),
  );

  const history = await hasGitHistory(src)
    ? await collectHistory(src, colorFiles)
    : await readExistingHistory();

  const catalog: ICatalog = {
    blocks,
    sets,
    varieties,
    meta: {
      generatedAt: new Date().toISOString(),
      packRef: PACK_REF,
      vanillaRef: VANILLA_REF,
      counts: {
        blocks: blocks.length,
        sets: sets.length,
        varieties: varieties.length,
      },
      packBytes,
      packFileCount: inventory.textures.length + inventory.other.length,
    },
  };

  await mkdir(OUT_DIR, { recursive: true });

  const sizes = await Promise.all([
    writeJson("blocks.json", catalog.blocks),
    writeJson("sets.json", catalog.sets),
    writeJson("varieties.json", catalog.varieties),
    writeJson("meta.json", catalog.meta),
    writeJson("pack-files.json", inventory),
    writeJson("history.json", history),
  ]);

  const total = sizes.reduce((sum, size) => sum + size, 0);

  const byCoverage = blocks.reduce<Record<string, number>>(
    (accumulator, block) => ({
      ...accumulator,
      [block.coverage]: (accumulator[block.coverage] ?? 0) + 1,
    }),
    {},
  );

  console.log(
    `  blocks: ${blocks.length} (${byCoverage.jg ?? 0} JG, ` +
      `${byCoverage.mixed ?? 0} mixed, ${byCoverage.vanilla ?? 0} vanilla)`,
  );
  console.log(`  varieties: ${varieties.length}`);
  console.log(
    `  history: ${history.length} textures with previous designs, ` +
      `${history.reduce((sum, entry) => sum + entry.versions.length, 0)} revisions`,
  );
  console.log(
    `  pack files: ${inventory.textures.length} textures + ` +
      `${inventory.other.length} other, ${(packBytes / 1024 ** 2).toFixed(0)} MB at source`,
  );
  console.log(`  emitted: ${sets.length} sets, ${(total / 1024).toFixed(0)} KB total`);
};

await main();
