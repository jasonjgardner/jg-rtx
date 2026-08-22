/**
 * Shared data model for the JG RTX customizer.
 *
 * These shapes are produced at build time by `scripts/generate-catalog.ts` and
 * consumed by the Astro content collections in `src/content.config.ts`. Keeping
 * them in one place means the generator and the site can never drift.
 */

import type { BlockShapeId } from "./blockShapes";
import type { ColormapId } from "./colormap";

/** Image containers that appear in the pack. Bedrock reads both. */
export type TextureExt = "png" | "tga";

/** Which repository a file is served from. Drives the CDN base URL. */
export type TextureOrigin = "jg" | "vanilla";

/**
 * The six cube faces Bedrock addresses. `blocks.json` may express these as
 * `up`/`down`/`side`, which {@link expandFaceShorthand} widens to all six.
 */
export type BlockFace = "up" | "down" | "north" | "south" | "east" | "west";

/** All six faces in a stable render order (top, bottom, then around). */
export const BLOCK_FACES: readonly BlockFace[] = [
  "up",
  "down",
  "north",
  "south",
  "east",
  "west",
] as const;

/**
 * The PBR role a file plays inside a texture set. Mirrors the keys of
 * `minecraft:texture_set`, collapsed to the names the three.js loader expects.
 */
export type TextureRole =
  | "color"
  | "mer"
  | "mers"
  | "normal"
  | "heightmap";

/** A single image file belonging to a texture set. */
export interface ITextureFile {
  /** Path relative to the resource-pack root, e.g. `textures/blocks/stone.png`. */
  readonly file: string;
  /** Container format, needed because `.tga` requires a JS decoder. */
  readonly ext: TextureExt;
  /** Pixel width as authored. Non-square values indicate a flipbook strip. */
  readonly width: number;
  /** Pixel height as authored. */
  readonly height: number;
}

/**
 * A Bedrock RTX texture set: the color map plus whichever PBR companions the
 * pack ships. `mer`/`mers` and `normal`/`heightmap` are mutually exclusive,
 * matching the loader's contract.
 */
export interface ITextureSet {
  /** Stable id — the file basename, e.g. `stone` or `log_oak_top`. */
  readonly id: string;
  /** Which repo serves these files. */
  readonly origin: TextureOrigin;
  /** Base color / albedo map. Always present. */
  readonly color: ITextureFile;
  /** Metalness / Emissive / Roughness. */
  readonly mer?: ITextureFile;
  /** MER plus a Subsurface alpha channel. */
  readonly mers?: ITextureFile;
  /** DirectX-convention normal map. */
  readonly normal?: ITextureFile;
  /** Grayscale heightmap, an alternative to `normal`. */
  readonly heightmap?: ITextureFile;
  /**
   * Animation frames when this set is a flipbook strip, else `undefined`.
   * Derived from `flipbook_textures.json` plus the color map's aspect ratio.
   */
  readonly flipbook?: IFlipbook;
}

/** Animation metadata for a flipbook (vertically stacked frame strip). */
export interface IFlipbook {
  /** Number of frames in the strip (`height / width`). */
  readonly frames: number;
  /** Game ticks each frame is held. One tick is 1/20 s. */
  readonly ticksPerFrame: number;
}

/**
 * A block that gets its own preview page. Faces may reference different
 * texture sets (logs, pillars, grass) while still sharing one slug.
 */
export interface IBlockEntry {
  /** `blocks.json` key with any `minecraft:` prefix stripped, e.g. `oak_log`. */
  readonly id: string;
  /** URL segment, e.g. `oak-log`. */
  readonly slug: string;
  /** Human-readable title, e.g. `Oak Log`. */
  readonly name: string;
  /** Bedrock sound group, when `blocks.json` declares one. */
  readonly sound?: string;
  /**
   * Texture-set id per face. `null` means the face resolved to nothing —
   * a block declared in `blocks.json` with no usable terrain texture.
   */
  readonly faces: Readonly<Record<BlockFace, string | null>>;
  /**
   * Biome tint per face from `terrain_texture.json`'s `overlay_color`, or
   * `null`. Grass, leaves and vines are authored greyscale and are only the
   * right colour once this is multiplied over them.
   */
  readonly tints: Readonly<Record<BlockFace, string | null>>;
  /** Distinct texture-set ids across all faces, in first-seen order. */
  readonly sets: readonly string[];
  /** True when every face resolves to the same texture set. */
  readonly uniform: boolean;
  /** `jg` when JG RTX overrides every face, `vanilla` when none, else `mixed`. */
  readonly coverage: "jg" | "vanilla" | "mixed";
  /**
   * Voxel shape the block previews as. Resolved from the identifier so it is
   * inspectable in the catalog; viewers can override it in the preview.
   */
  readonly shape: BlockShapeId;
  /**
   * Biome colormap that tints this block, when one applies. Leaves are
   * authored greyscale and coloured by the engine from `textures/colormap/`;
   * `terrain_texture.json` says nothing about them.
   */
  readonly colormap?: ColormapId;
}

/**
 * An alternate texture the viewer can swap in for a given texture set.
 *
 * Two source layouts are supported:
 * - **Per-set directory** — `variety/pages/textures/blocks/<setId>/<name>.png`
 * - **Flat collection** — `variety/<collection>/textures/blocks/<setId>.png`
 */
export interface IVariety {
  /** Unique id, `<collection>/<setId>/<name>`. */
  readonly id: string;
  /** Texture set this variety can replace, e.g. `stone`. */
  readonly setId: string;
  /** Collection it came from, e.g. `pages`, `modern`, `glass:medieval_glass`. */
  readonly collection: string;
  /** Display label derived from the file or directory name. */
  readonly label: string;
  /** Path relative to the repo root, used to build the CDN URL. */
  readonly color: ITextureFile;
  /** PBR companions, when the variety ships them. */
  readonly mer?: ITextureFile;
  readonly mers?: ITextureFile;
  readonly normal?: ITextureFile;
  readonly heightmap?: ITextureFile;
}

/** Everything the site needs, emitted as one file per top-level key. */
export interface ICatalog {
  readonly blocks: readonly IBlockEntry[];
  readonly sets: readonly ITextureSet[];
  readonly varieties: readonly IVariety[];
  readonly meta: ICatalogMeta;
}

/** Provenance for the generated catalog, surfaced in the UI footer. */
export interface ICatalogMeta {
  /** ISO timestamp of generation. */
  readonly generatedAt: string;
  /** Git ref of the JG RTX pack the catalog was built from. */
  readonly packRef: string;
  /** Git ref of Mojang/bedrock-samples used for vanilla fallbacks. */
  readonly vanillaRef: string;
  /** Counts, for the build log and the about page. */
  readonly counts: {
    readonly blocks: number;
    readonly sets: number;
    readonly varieties: number;
  };
  /** Total size of the pack at source resolution, in bytes. */
  readonly packBytes: number;
  /** Number of files in the pack. */
  readonly packFileCount: number;
}
