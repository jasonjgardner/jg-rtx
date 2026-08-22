/**
 * Astro content collections backed by the generated catalog.
 *
 * The catalog is produced by `scripts/generate-catalog.ts` into `src/data/`.
 * Loading it through the content layer (rather than importing the JSON) buys
 * schema validation at build time, so a malformed catalog fails the build
 * instead of rendering broken pages.
 */

import { defineCollection, z } from "astro:content";
import { file } from "astro/loaders";

/** A single image file within a texture set. */
const textureFile = z.object({
  file: z.string(),
  ext: z.enum(["png", "tga"]),
  /** `0` means the dimension was not probed (remote vanilla listings). */
  width: z.number().int().nonnegative(),
  height: z.number().int().nonnegative(),
});

/** Animation metadata for a vertically stacked frame strip. */
const flipbook = z.object({
  frames: z.number().int().positive(),
  ticksPerFrame: z.number().positive(),
});

/** The six cube faces, matching `BLOCK_FACES`. Reused for per-face tints. */
const faces = z.object({
  up: z.string().nullable(),
  down: z.string().nullable(),
  north: z.string().nullable(),
  south: z.string().nullable(),
  east: z.string().nullable(),
  west: z.string().nullable(),
});

/**
 * Blocks that get a preview page. Faces may reference different texture sets
 * while sharing one slug — logs, pillars and grass all rely on this.
 */
const blocks = defineCollection({
  loader: file("src/data/blocks.json"),
  schema: z.object({
    id: z.string(),
    slug: z.string(),
    name: z.string(),
    sound: z.string().optional(),
    faces,
    tints: faces,
    sets: z.array(z.string()),
    uniform: z.boolean(),
    coverage: z.enum(["jg", "vanilla", "mixed"]),
  }),
});

/** Bedrock RTX texture sets referenced by at least one block or variety. */
const sets = defineCollection({
  loader: file("src/data/sets.json"),
  schema: z.object({
    id: z.string(),
    origin: z.enum(["jg", "vanilla"]),
    color: textureFile,
    mer: textureFile.optional(),
    mers: textureFile.optional(),
    normal: textureFile.optional(),
    heightmap: textureFile.optional(),
    flipbook: flipbook.optional(),
  }),
});

/** Alternate textures a viewer can swap in for a given texture set. */
const varieties = defineCollection({
  loader: file("src/data/varieties.json"),
  schema: z.object({
    id: z.string(),
    setId: z.string(),
    collection: z.string(),
    label: z.string(),
    color: textureFile,
    mer: textureFile.optional(),
    mers: textureFile.optional(),
    normal: textureFile.optional(),
    heightmap: textureFile.optional(),
  }),
});

export const collections = { blocks, sets, varieties };
