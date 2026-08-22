/**
 * Resolves a historical texture revision into fetchable URLs.
 *
 * The catalog records only the *colour map's* path per revision, because that
 * is what defines a design. A texture set's PBR companions are derived from it
 * by name, on the assumption they sat beside the colour map at that commit —
 * which is how the pack has always been laid out.
 *
 * That assumption does not always hold, and deliberately so: `_mers` maps did
 * not exist before "Extracted MER channels to folder groups" in 2022, so a
 * revision older than that has no companion to fetch. Callers must therefore
 * treat a missing companion as normal and fall back to the current file rather
 * than failing the whole texture.
 */

import { commitUrl, fileUrl } from "./cdn";
import type { ITextureFile, ITextureSet, ITextureVersion, TextureRole } from "./types";

/** PBR roles that sit beside a colour map, in load order. */
const COMPANION_ROLES: readonly TextureRole[] = [
  "mer",
  "mers",
  "normal",
  "heightmap",
] as const;

/** Split a path into its extensionless stem and its extension. */
const splitExtension = (path: string): readonly [string, string] => {
  const match = /^(.*)(\.(?:png|tga))$/i.exec(path);

  return match?.[1] && match[2] ? [match[1], match[2]] : [path, ""];
};

/**
 * The URLs to try for one role of a historical revision.
 *
 * @param set The texture set as it exists today.
 * @param role Which map to resolve.
 * @param version The revision being shown.
 * @returns The revision URL first and the current URL as a fallback, or an
 *   empty list when the set has no such map at all.
 */
export const versionUrls = (
  set: ITextureSet,
  role: TextureRole,
  version: ITextureVersion,
): readonly string[] => {
  const file: ITextureFile | undefined = role === "color" ? set.color : set[role];

  if (!file) return [];

  const current = fileUrl(file, set.origin);

  if (role === "color") return [commitUrl(version.path, version.commit), current];

  const [stem, extension] = splitExtension(version.path);
  const [, currentExtension] = splitExtension(file.file);

  // Companions kept the colour map's stem; their container may differ (several
  // `_mers` maps are `.tga` beside a `.png` colour map), so try the extension
  // this set actually uses today before the colour map's.
  const candidates = [...new Set([currentExtension, extension])]
    .filter((candidate) => candidate.length > 0)
    .map((candidate) => commitUrl(`${stem}_${role}${candidate}`, version.commit));

  return [...candidates, current];
};

/** Whether a role is a PBR companion rather than the colour map. */
export const isCompanionRole = (role: TextureRole): boolean =>
  COMPANION_ROLES.includes(role);
