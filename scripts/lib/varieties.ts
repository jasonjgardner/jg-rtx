/**
 * Scans `bedrock/variety/**` for alternate textures a viewer can swap in.
 *
 * Two layouts coexist in the repository and both are supported:
 *
 * 1. **Per-set directory** — `pages/textures/blocks/<setName>/<variant>.png`.
 *    Every image inside the directory is an alternative for `<setName>`, so
 *    `stone/stone1.png` and `stone/stone_alt.png` both target `textures/blocks/stone`.
 *
 * 2. **Flat collection** — `<collection>/textures/blocks/<setName>.png`, used by
 *    `modern/`, `vanilla/` and the `glass/subpacks/*` styles. Here the filename
 *    *is* the target set, and the collection name is the variety's label.
 *
 * The scanner tolerates missing and empty directories, so the feature lights up
 * incrementally as variety folders are populated.
 */

import {
  COMPANION_SUFFIX,
  companionsForStem,
  fileForStem,
  indexFiles,
  walk,
} from "./fsx";
import type { IVariety } from "../../src/lib/types";

/** Marker segment that separates the collection prefix from the texture path. */
const BLOCKS_SEGMENT = "textures/blocks/";

/**
 * Turn a file, directory or collection name into a readable label.
 * The `collection:subpack` form keeps only the subpack, so
 * `glass:medieval_glass` reads as `Medieval Glass` rather than
 * `Glass:medieval Glass`.
 */
const toLabel = (name: string): string =>
  (name.includes(":") ? (name.split(":").pop() ?? name) : name)
    .split(/[_\-/]/)
    .filter((word) => word.length > 0)
    .map((word) => `${word[0]?.toUpperCase() ?? ""}${word.slice(1)}`)
    .join(" ");

/**
 * Derive the collection name from a variety path.
 *
 * `glass/subpacks/medieval_glass/textures/blocks/x.png` becomes
 * `glass:medieval_glass`; `modern/textures/blocks/x.png` becomes `modern`.
 *
 * @param prefix Path segments preceding `textures/blocks/`.
 */
const toCollection = (prefix: string): string => {
  const parts = prefix.split("/").filter((part) => part.length > 0);
  const subpackIndex = parts.indexOf("subpacks");

  if (subpackIndex === -1) return parts.join("/");

  const root = parts.slice(0, subpackIndex).join("/");
  const subpack = parts[subpackIndex + 1] ?? "";

  return subpack.length > 0 ? `${root}:${subpack}` : root;
};

/**
 * Scan the variety tree.
 *
 * @param varietyRoot Absolute path to `bedrock/variety`.
 * @param repoPrefix Path prefix that makes emitted files repo-relative, so the
 *   CDN helper can tell them apart from pack-relative textures.
 * @returns Varieties sorted by target set then label.
 */
export const scanVarieties = async (
  varietyRoot: string,
  repoPrefix: string,
): Promise<IVariety[]> => {
  const allFiles = await walk(varietyRoot);
  const index = indexFiles(allFiles);

  const candidates = [...index.keys()].filter((stem) =>
    stem.includes(BLOCKS_SEGMENT) && !COMPANION_SUFFIX.test(stem));

  const varieties = await Promise.all(
    candidates.map(async (stem) => {
      const cut = stem.indexOf(BLOCKS_SEGMENT);
      const prefix = stem.slice(0, cut);
      const tail = stem.slice(cut + BLOCKS_SEGMENT.length);
      const collection = toCollection(prefix);

      const segments = tail.split("/");

      // Layout 1 nests the variant inside a directory named for its target set.
      const nested = segments.length > 1;
      const setName = nested ? segments.slice(0, -1).join("/") : tail;
      const variantName = nested ? segments[segments.length - 1] ?? tail : tail;

      const color = await fileForStem(stem, varietyRoot, index, repoPrefix);
      if (!color) return null;

      const companions = await companionsForStem(stem, varietyRoot, index, repoPrefix);

      return {
        id: `${collection}/${setName}/${variantName}`,
        setId: `${BLOCKS_SEGMENT}${setName}`,
        collection,
        label: nested ? toLabel(variantName) : toLabel(collection),
        color,
        ...companions,
      } satisfies IVariety;
    }),
  );

  return varieties
    .filter((variety): variety is IVariety => variety !== null)
    .sort((left, right) =>
      left.setId.localeCompare(right.setId) || left.label.localeCompare(right.label));
};
