/**
 * jsDelivr URL construction for the two upstream repositories.
 *
 * jsDelivr serves both repos with `access-control-allow-origin: *`, which is
 * what makes the in-browser pack build possible at all — the worker pool can
 * fetch every texture directly. Note that jsDelivr's *data* API refuses to list
 * either repo ("Package size exceeded the configured limit of 50 MB"), so the
 * file inventory must come from the generated catalog, never from the CDN.
 */

import type { ITextureFile, TextureOrigin } from "./types";

/** Git ref of the JG RTX pack to serve textures from. */
export const PACK_REF = "main";

/** Git ref of Mojang's vanilla sample pack, used for un-overridden blocks. */
export const VANILLA_REF = "main";

/** Prefix for JG RTX resource-pack files (paths are relative to the RP root). */
export const JG_RP_BASE =
  `https://cdn.jsdelivr.net/gh/jasonjgardner/jg-rtx@${PACK_REF}/bedrock/pack/RP/` as const;

/** Prefix for JG RTX repo-root files, e.g. anything under `bedrock/variety/`. */
export const JG_REPO_BASE =
  `https://cdn.jsdelivr.net/gh/jasonjgardner/jg-rtx@${PACK_REF}/` as const;

/** Prefix for Mojang vanilla resource-pack files. */
export const VANILLA_RP_BASE =
  `https://cdn.jsdelivr.net/gh/Mojang/bedrock-samples@${VANILLA_REF}/resource_pack/` as const;

/**
 * Resolve a pack-relative path to a fetchable CDN URL.
 *
 * @param file Path relative to the resource-pack root, e.g. `textures/blocks/stone.png`.
 * @param origin Which repository holds the file.
 * @returns An absolute, CORS-enabled jsDelivr URL.
 */
export const textureUrl = (file: string, origin: TextureOrigin = "jg"): string =>
  `${origin === "vanilla" ? VANILLA_RP_BASE : JG_RP_BASE}${file}`;

/**
 * Resolve a repo-root-relative path (variety textures live outside the RP).
 *
 * @param file Path relative to the JG RTX repo root, e.g. `bedrock/variety/...`.
 */
export const repoUrl = (file: string): string => `${JG_REPO_BASE}${file}`;

/**
 * URL for any {@link ITextureFile}. Variety files are stored repo-relative and
 * are detected by their `bedrock/` prefix; everything else is pack-relative.
 *
 * @param texture The file to resolve.
 * @param origin Repository to serve from when the path is pack-relative.
 */
export const fileUrl = (
  texture: ITextureFile,
  origin: TextureOrigin = "jg",
): string =>
  texture.file.startsWith("bedrock/")
    ? repoUrl(texture.file)
    : textureUrl(texture.file, origin);
