/**
 * Power-of-two resize rules, shared by the UI and the texture worker.
 *
 * Two rules matter and both come from how Bedrock packs are built:
 *
 * 1. **Never upscale.** Only sizes at or below a texture's authored width are
 *    offered, so a 64px texture is never inflated to 256.
 * 2. **Scale both axes by the same factor.** Flipbooks are vertical strips of
 *    square frames (`fire_0` is 256×8192, thirty-two 256px frames). Forcing
 *    them square would destroy the animation, so the factor derived from the
 *    width is applied to the height as well — 256×8192 at 64 becomes 64×2048.
 */

import type { ITextureFile } from "./types";

/** Power-of-two sizes the UI offers, descending. */
export const RESIZE_STEPS: readonly number[] = [512, 256, 128, 64, 32, 16] as const;

/** A concrete pixel size. */
export interface ISize {
  readonly width: number;
  readonly height: number;
}

/**
 * Resize options available for a texture of the given authored width.
 *
 * @param width Authored width in pixels. `0` means unknown, which offers nothing.
 * @returns Descending power-of-two widths that would not upscale.
 */
export const resizeOptionsFor = (width: number): number[] =>
  width <= 0 ? [] : RESIZE_STEPS.filter((step) => step < width);

/**
 * Compute the output dimensions for a texture at a target width.
 *
 * @param texture The authored file.
 * @param target Desired width in pixels.
 * @returns Scaled dimensions preserving the aspect ratio, floored at 1px.
 */
export const scaledSize = (texture: ITextureFile, target: number): ISize => {
  if (texture.width <= 0 || target <= 0 || target >= texture.width) {
    return { width: texture.width, height: texture.height };
  }

  const factor = target / texture.width;

  return {
    width: Math.max(1, Math.round(texture.width * factor)),
    height: Math.max(1, Math.round(texture.height * factor)),
  };
};

/**
 * Estimate the encoded byte size of a texture after resizing.
 *
 * Pixel count scales with the square of the factor, and PNG output size tracks
 * pixel count closely enough for a progress estimate. This is deliberately an
 * estimate — the real size is only known once the worker encodes the image.
 *
 * @param bytes Authored file size in bytes.
 * @param texture The authored file.
 * @param target Target width, or `null` to keep the native size.
 */
export const estimateBytes = (
  bytes: number,
  texture: ITextureFile,
  target: number | null,
): number => {
  if (target === null || texture.width <= 0 || target >= texture.width) return bytes;

  const factor = target / texture.width;

  return Math.max(64, Math.round(bytes * factor * factor));
};

/**
 * Format a byte count for display.
 *
 * @param bytes Size in bytes.
 * @returns A short human-readable string such as `34 MB`.
 */
export const formatBytes = (bytes: number): string => {
  const units = ["B", "KB", "MB", "GB"];
  const exponent = bytes <= 0
    ? 0
    : Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
  const value = bytes / 1024 ** exponent;
  const digits = exponent === 0 || value >= 100 ? 0 : 1;

  return `${value.toFixed(digits)} ${units[exponent]}`;
};
