/**
 * Colour-space helpers shared by the Bedrock MER(S) to labPBR converter.
 *
 * Everything here works in the sRGB transfer function defined by IEC 61966-2-1
 * (the piecewise curve, *not* the `pow(x, 2.2)` approximation). The gamma-2.2
 * shortcut is off by up to ~4/255 in the shadows, which is enough to move a dark
 * metal albedo across a preset boundary when matching against F0 constants.
 */

/** A linear-light RGB triple. Components are nominally in `[0, 1]`. */
export type Rgb = readonly [number, number, number];

const SRGB_DECODE_CUTOFF = 0.04045;
const SRGB_ENCODE_CUTOFF = 0.0031308;

/** Rec. 709 luma coefficients, matching the sRGB primaries. */
const LUMA = [0.2126, 0.7152, 0.0722] as const;

/**
 * Decode a single sRGB-encoded channel in `[0, 1]` to linear light.
 *
 * @param channel - Non-linear sRGB value in `[0, 1]`.
 * @returns Linear-light value in `[0, 1]`.
 */
export function srgbToLinear(channel: number): number {
  if (channel <= SRGB_DECODE_CUTOFF) return channel / 12.92;
  return ((channel + 0.055) / 1.055) ** 2.4;
}

/**
 * Encode a single linear-light channel in `[0, 1]` back to sRGB.
 *
 * @param channel - Linear-light value in `[0, 1]`.
 * @returns Non-linear sRGB value in `[0, 1]`.
 */
export function linearToSrgb(channel: number): number {
  if (channel <= SRGB_ENCODE_CUTOFF) return channel * 12.92;
  return 1.055 * channel ** (1 / 2.4) - 0.055;
}

/**
 * Lookup table mapping an 8-bit sRGB sample directly to linear light.
 *
 * Precomputed because the metal matcher decodes every masked pixel of every
 * texture; calling {@link srgbToLinear} per channel per pixel is measurably slower.
 */
export const SRGB8_TO_LINEAR: Float64Array = Float64Array.from(
  { length: 256 },
  (_unused, index) => srgbToLinear(index / 255),
);

/**
 * Decode an 8-bit sRGB triple to linear light.
 *
 * @param r - Red sample in `[0, 255]`.
 * @param g - Green sample in `[0, 255]`.
 * @param b - Blue sample in `[0, 255]`.
 */
export function srgb8ToLinearRgb(r: number, g: number, b: number): Rgb {
  return [
    SRGB8_TO_LINEAR[r] ?? 0,
    SRGB8_TO_LINEAR[g] ?? 0,
    SRGB8_TO_LINEAR[b] ?? 0,
  ] as const;
}

/**
 * Relative luminance of a linear-light triple.
 *
 * @param rgb - Linear-light RGB.
 * @returns Luminance in `[0, 1]` for in-gamut inputs.
 */
export function luminance(rgb: Rgb): number {
  return LUMA[0] * rgb[0] + LUMA[1] * rgb[1] + LUMA[2] * rgb[2];
}

/**
 * HSV-style saturation of a linear-light triple: `(max - min) / max`.
 *
 * Used to tell the near-neutral metal presets (iron, chrome, aluminium, lead,
 * platinum, silver) apart from the two chromatic ones (gold, copper).
 *
 * @param rgb - Linear-light RGB.
 * @returns Saturation in `[0, 1]`; `0` for black.
 */
export function saturation(rgb: Rgb): number {
  const max = Math.max(rgb[0], rgb[1], rgb[2]);
  if (max <= 0) return 0;
  return (max - Math.min(rgb[0], rgb[1], rgb[2])) / max;
}

/**
 * Normalise a triple by its own mean, discarding overall brightness and keeping
 * only the chromaticity.
 *
 * This is what lets the matcher compare an artistically darkened metal albedo
 * against a physically bright F0 constant. A black input returns a neutral triple.
 *
 * @param rgb - Linear-light RGB.
 */
export function chromaticity(rgb: Rgb): Rgb {
  const mean = (rgb[0] + rgb[1] + rgb[2]) / 3;
  if (mean <= 1e-9) return [1, 1, 1] as const;
  return [rgb[0] / mean, rgb[1] / mean, rgb[2] / mean] as const;
}

/** Squared Euclidean distance between two triples. */
export function distanceSquared(a: Rgb, b: Rgb): number {
  const dr = a[0] - b[0];
  const dg = a[1] - b[1];
  const db = a[2] - b[2];
  return dr * dr + dg * dg + db * db;
}

/**
 * Clamp and round a number into an 8-bit channel.
 *
 * @param value - Any finite number; `NaN` collapses to `0`.
 */
export function toByte(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(255, Math.round(value)));
}

/** Clamp a number into the inclusive range `[min, max]`. */
export function clamp(value: number, min: number, max: number): number {
  if (value < min) return min;
  if (value > max) return max;
  return value;
}
