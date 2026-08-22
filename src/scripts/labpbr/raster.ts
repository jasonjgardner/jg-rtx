/**
 * Image loading and saving for the converter.
 *
 * Every image becomes a top-left origin, 8-bit RGBA {@link IRaster} so the encoders
 * never have to care whether a source was RGB, palettised, or a Targa.
 */

import { readFile } from "node:fs/promises";
import sharp from "sharp";
import { decodeTga } from "./tga";

/** A top-left origin, 8-bit RGBA image. */
export interface IRaster {
  readonly width: number;
  readonly height: number;
  /** `width * height * 4` bytes, RGBA order. */
  readonly data: Uint8Array;
}

/**
 * Load a PNG or TGA as RGBA.
 *
 * PNGs go through `sharp`, which expands palettes and adds an opaque alpha channel
 * when one is missing. TGAs are decoded in-process because `sharp` has no Targa support.
 *
 * @param filePath - Absolute or CWD-relative path ending in `.png` or `.tga`.
 * @throws When the file cannot be read or decoded.
 */
export async function loadRaster(filePath: string): Promise<IRaster> {
  if (filePath.toLowerCase().endsWith(".tga")) {
    const bytes = await readFile(filePath);
    const decoded = decodeTga(new Uint8Array(bytes));
    return { width: decoded.width, height: decoded.height, data: decoded.data };
  }

  const { data, info } = await sharp(filePath, { failOn: "none" })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  if (info.channels !== 4) {
    throw new Error(`Expected 4 channels from ${filePath}, got ${info.channels}`);
  }

  const expected = info.width * info.height * 4;
  if (data.length !== expected) {
    throw new Error(
      `Unexpected raw buffer for ${filePath}: ${data.length} bytes, expected ${expected} ` +
        `(a >8-bit source would produce this)`,
    );
  }

  return { width: info.width, height: info.height, data: new Uint8Array(data) };
}

/**
 * Write an RGBA raster as a PNG.
 *
 * The alpha channel is always retained: labPBR stores emissiveness in `_s` alpha and
 * the height map in `_n` alpha, so an optimiser that drops an all-opaque alpha would
 * silently change meaning.
 *
 * @param filePath - Destination path.
 * @param raster - Pixels to encode.
 */
export async function writePng(filePath: string, raster: IRaster): Promise<void> {
  await sharp(Buffer.from(raster.data), {
    raw: { width: raster.width, height: raster.height, channels: 4 },
  })
    .png({ compressionLevel: 9, palette: false })
    .toFile(filePath);
}

/**
 * Create a uniformly coloured raster, used for `texture_set.json` entries that give a
 * scalar `[metalness, emissive, roughness]` instead of a file.
 */
export function uniformRaster(
  width: number,
  height: number,
  rgba: readonly [number, number, number, number],
): IRaster {
  const data = new Uint8Array(width * height * 4);
  for (let index = 0; index < data.length; index += 4) {
    data[index] = rgba[0];
    data[index + 1] = rgba[1];
    data[index + 2] = rgba[2];
    data[index + 3] = rgba[3];
  }
  return { width, height, data };
}

/**
 * Nearest-neighbour resample.
 *
 * Nearest, not bilinear: these are pixel-art masks, and interpolating a metalness
 * mask would invent intermediate values that the thresholding step then has to guess at.
 *
 * @returns `raster` itself when it already has the requested size.
 */
export function resampleNearest(raster: IRaster, width: number, height: number): IRaster {
  if (raster.width === width && raster.height === height) return raster;

  const data = new Uint8Array(width * height * 4);
  const xRatio = raster.width / width;
  const yRatio = raster.height / height;

  for (let row = 0; row < height; row += 1) {
    const sourceRow = Math.min(raster.height - 1, Math.floor(row * yRatio));
    for (let column = 0; column < width; column += 1) {
      const sourceColumn = Math.min(raster.width - 1, Math.floor(column * xRatio));
      const source = (sourceRow * raster.width + sourceColumn) * 4;
      const target = (row * width + column) * 4;
      data[target] = raster.data[source] ?? 0;
      data[target + 1] = raster.data[source + 1] ?? 0;
      data[target + 2] = raster.data[source + 2] ?? 0;
      data[target + 3] = raster.data[source + 3] ?? 255;
    }
  }

  return { width, height, data };
}
