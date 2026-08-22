/**
 * Inventories every file in the resource pack so the browser can rebuild it.
 *
 * The download runs entirely client-side: a worker pool fetches each file from
 * jsDelivr, resizes the textures the viewer asked to shrink, and streams the
 * result into a ZIP. None of that is possible without knowing, up front, every
 * path in the pack and how large it is — jsDelivr will serve any file but will
 * not enumerate the repository.
 *
 * Byte sizes are recorded so the UI can show an honest download estimate before
 * the viewer commits to a multi-hundred-megabyte transfer.
 */

import { stat } from "node:fs/promises";
import { join } from "node:path";
import { walk } from "./fsx";

/** One file in the pack. */
export interface IPackFile {
  /** Path relative to the resource-pack root, e.g. `textures/blocks/stone.png`. */
  readonly file: string;
  /** Size on disk in bytes. */
  readonly bytes: number;
}

/** The pack inventory, split so the UI can reason about resizable content. */
export interface IPackInventory {
  /** Images under `textures/`, which the resize pipeline may shrink. */
  readonly textures: readonly IPackFile[];
  /** Everything else — manifests, JSON configs, and the pack icon. */
  readonly other: readonly IPackFile[];
}

/** Files that must never ship inside a generated pack. */
const EXCLUDED = /(^|\/)(\.DS_Store|Thumbs\.db|desktop\.ini)$/i;

/** Image extensions the resize pipeline understands. */
const IMAGE = /\.(png|tga)$/i;

/**
 * Walk a resource pack and record every file with its size.
 *
 * @param packRoot Absolute path to the resource-pack root.
 * @returns The inventory, with textures separated from configuration files.
 */
export const scanPackFiles = async (packRoot: string): Promise<IPackInventory> => {
  const paths = (await walk(packRoot)).filter((path) => !EXCLUDED.test(path));

  const files = await Promise.all(
    paths.map(async (file) => {
      const info = await stat(join(packRoot, file)).catch(() => null);

      return info === null ? null : ({ file, bytes: info.size } satisfies IPackFile);
    }),
  );

  const present = files
    .filter((entry): entry is IPackFile => entry !== null)
    .sort((left, right) => left.file.localeCompare(right.file));

  return {
    textures: present.filter((entry) => IMAGE.test(entry.file)),
    other: present.filter((entry) => !IMAGE.test(entry.file)),
  };
};
