/**
 * Filesystem helpers shared by the catalog scanners.
 *
 * Both the resource-pack scanner and the variety scanner need the same three
 * primitives: walk a tree, index images by extensionless path, and turn one of
 * those paths back into a concrete file with probed dimensions.
 */

import { readdir } from "node:fs/promises";
import { join, posix, relative, sep } from "node:path";
import { imageSize } from "./imageSize";
import type { ITextureFile, TextureExt } from "../../src/lib/types";

/** Image extensions Bedrock will load, in resolution priority order. */
export const EXTENSIONS: readonly TextureExt[] = ["png", "tga"] as const;

/** Filename suffixes that mark a PBR companion rather than a standalone texture. */
export const COMPANION_SUFFIX = /_(mer|mers|normal|heightmap)$/i;

/** An index of image files, keyed by extensionless path. */
export type FileIndex = ReadonlyMap<string, TextureExt[]>;

/**
 * Node exposes a Dirent's containing directory as `parentPath` (Node 22) and,
 * on older runtimes, as the deprecated `path`. Read whichever is present.
 */
const direntDir = (
  entry: { parentPath?: string; path?: string },
  fallback: string,
): string => entry.parentPath ?? entry.path ?? fallback;

/**
 * Recursively list every file under a directory.
 *
 * @param root Directory to walk. A missing directory yields an empty list
 *   rather than throwing, since optional trees (e.g. `variety/`) may be absent.
 * @returns Paths relative to `root`, using POSIX separators.
 */
export const walk = async (root: string): Promise<string[]> => {
  const entries = await readdir(root, { withFileTypes: true, recursive: true })
    .catch(() => []);

  return entries
    .filter((entry) => entry.isFile())
    .map((entry) =>
      relative(root, join(direntDir(entry, root), entry.name))
        .split(sep)
        .join(posix.sep),
    );
};

/**
 * Build a lookup of extensionless path to the extensions present for it.
 * A name may exist as both `.png` and `.tga`; priority is decided at read time.
 *
 * @param paths Relative file paths, typically from {@link walk}.
 */
export const indexFiles = (paths: readonly string[]): FileIndex => {
  const index = new Map<string, TextureExt[]>();

  paths.forEach((path) => {
    const match = /^(.*)\.(png|tga)$/i.exec(path);
    if (!match) return;

    const [, stem, rawExt] = match;
    if (!stem || !rawExt) return;

    const ext = rawExt.toLowerCase() as TextureExt;
    const existing = index.get(stem);

    if (!existing) {
      index.set(stem, [ext]);
      return;
    }

    existing.push(ext);
  });

  return index;
};

/**
 * Resolve an extensionless path to a concrete file and probe its dimensions.
 *
 * @param stem Extensionless path, relative to `root`.
 * @param root Absolute directory the index was built against.
 * @param index File index built by {@link indexFiles}.
 * @param prefix Prepended to the returned `file` path so callers can emit
 *   pack-relative or repo-relative paths as needed.
 * @returns The resolved file, or `null` when no readable image matches.
 */
export const fileForStem = async (
  stem: string,
  root: string,
  index: FileIndex,
  prefix = "",
): Promise<ITextureFile | null> => {
  const available = index.get(stem) ?? [];
  const ext = EXTENSIONS.find((candidate) => available.includes(candidate));
  if (!ext) return null;

  const relPath = `${stem}.${ext}`;
  const size = await imageSize(join(root, relPath), ext);
  if (!size) return null;

  return {
    file: `${prefix}${relPath}`,
    ext,
    width: size.width,
    height: size.height,
  };
};

/**
 * Collect the PBR companions sitting alongside a colour map.
 *
 * @param stem Extensionless path of the colour map.
 * @param root Absolute directory the index was built against.
 * @param index File index built by {@link indexFiles}.
 * @param prefix Path prefix for emitted files.
 * @returns A partial role map containing only companions that exist.
 */
export const companionsForStem = async (
  stem: string,
  root: string,
  index: FileIndex,
  prefix = "",
): Promise<Partial<Record<"mer" | "mers" | "normal" | "heightmap", ITextureFile>>> => {
  const found = await Promise.all(
    (["mer", "mers", "normal", "heightmap"] as const).map(async (role) => {
      const file = await fileForStem(`${stem}_${role}`, root, index, prefix);
      return file ? ([role, file] as const) : null;
    }),
  );

  return Object.fromEntries(
    found.filter((entry): entry is NonNullable<typeof entry> => entry !== null),
  );
};
