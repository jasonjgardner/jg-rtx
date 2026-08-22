/**
 * Samples the pack's biome colormaps for foliage and grass tints.
 *
 * Leaves are the one family `terrain_texture.json` says nothing about. Grass
 * declares an `overlay_color` there, but leaves are authored greyscale and
 * coloured by the engine from `textures/colormap/*.png`, indexed by biome
 * climate. Without that step `leaves_jungle` — which is *literally* greyscale,
 * mean saturation 0.000 — previews as a white cube.
 *
 * The colours come from the pack's own colormaps rather than from hardcoded
 * vanilla values, so a pack that restyles its foliage restyles its previews too.
 */

import { textureUrl } from "./cdn";

/** Colormaps the pack ships, keyed by the name blocks refer to. */
export type ColormapId = "foliage" | "grass" | "birch" | "evergreen";

/** Pack-relative path of each colormap. */
const COLORMAP_FILES: Readonly<Record<ColormapId, string>> = {
  foliage: "textures/colormap/foliage.png",
  grass: "textures/colormap/grass.png",
  birch: "textures/colormap/birch.png",
  evergreen: "textures/colormap/evergreen.png",
};

/**
 * Climate the colormaps are sampled at — a temperate, fairly wet biome.
 *
 * A colormap is a 256×256 triangle indexed by `(1 - temperature)` and
 * `(1 - temperature × downfall)`, and only the half where `y >= x` is defined.
 * The obvious "default" of temperature 0.5 / downfall 1.0 lands exactly on the
 * diagonal *boundary*, which reads back edge values — it turns this pack's
 * birch map bright yellow (`#efe205`) instead of its actual `#a7bb32`. Sampling
 * inside the triangle avoids that.
 *
 * A preview has no biome, so one representative climate stands in for all.
 */
const SAMPLE_TEMPERATURE = 0.7;
const SAMPLE_DOWNFALL = 0.8;

/** In-flight and completed samples, so each colormap is fetched once. */
const cache = new Map<ColormapId, Promise<string | null>>();

/** Format an RGB triple as a CSS hex colour. */
const toHex = (red: number, green: number, blue: number): string =>
  `#${[red, green, blue].map((c) => c.toString(16).padStart(2, "0")).join("")}`;

/**
 * Fetch a colormap and read the representative climate's colour out of it.
 *
 * @param id Which colormap to sample.
 * @returns The colour as a hex string, or `null` if it could not be read —
 *   in which case the caller should leave the texture untinted rather than
 *   guess.
 */
const sample = async (id: ColormapId): Promise<string | null> => {
  try {
    const response = await fetch(textureUrl(COLORMAP_FILES[id]));

    if (!response.ok) return null;

    const bitmap = await createImageBitmap(await response.blob());
    const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
    const context = canvas.getContext("2d", { willReadFrequently: true });

    if (!context) {
      bitmap.close();
      return null;
    }

    context.imageSmoothingEnabled = false;
    context.drawImage(bitmap, 0, 0);

    const x = Math.min(
      bitmap.width - 1,
      Math.floor((1 - SAMPLE_TEMPERATURE) * (bitmap.width - 1)),
    );
    const y = Math.min(
      bitmap.height - 1,
      Math.floor((1 - SAMPLE_TEMPERATURE * SAMPLE_DOWNFALL) * (bitmap.height - 1)),
    );

    const { data } = context.getImageData(x, y, 1, 1);
    bitmap.close();

    return toHex(data[0] ?? 0, data[1] ?? 0, data[2] ?? 0);
  } catch {
    return null;
  }
};

/**
 * Get a colormap's tint, fetching it at most once per page.
 *
 * @param id Which colormap to read.
 */
export const colormapTint = (id: ColormapId): Promise<string | null> => {
  const existing = cache.get(id);

  if (existing) return existing;

  const pending = sample(id);
  cache.set(id, pending);

  return pending;
};
