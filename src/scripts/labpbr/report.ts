/**
 * Conversion reporting.
 *
 * The metal decision is made by the curated table, never by colour matching. But the
 * colour match still runs, purely so a human can audit the table: any texture where the
 * declared metal disagrees with what the masked pixels look like is surfaced, as is
 * every texture that fell through to the `255` albedo-as-F0 fallback.
 */

import { srgb8ToLinearRgb, type Rgb } from "./color";
import { matchMetalPreset, metalPresetById } from "./metals";
import type { IRaster } from "./raster";

/** One texture's outcome. */
export interface ITextureReport {
  readonly bedrockName: string;
  readonly javaNames: readonly string[];
  /** Fraction of pixels classified as metal, `0..1`. */
  readonly metalFraction: number;
  /** Threshold that produced {@link metalFraction}. */
  readonly threshold: number;
  /** Green-channel value written for metal pixels, or `null` when the texture has none. */
  readonly metalValue: number | null;
  /** Name of the curated rule that fired, or `null` for the fallback. */
  readonly ruleNote: string | null;
  /** What the masked albedo looks like, when a colour match was possible. */
  readonly colorMatch: {
    readonly presetName: string;
    readonly presetId: number;
    readonly confidence: number;
    readonly medianSrgb: readonly [number, number, number];
  } | null;
  /** `true` when a curated preset was used and colour matching suggests a different metal. */
  readonly disagrees: boolean;
  readonly wroteSpecular: boolean;
  readonly wroteNormal: boolean;
  readonly warnings: readonly string[];
}

/** Median of a numeric array. Mutates nothing. */
function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = values.toSorted((a, b) => a - b);
  const middle = sorted.length >> 1;
  return sorted[middle] ?? 0;
}

/** Fewer masked pixels than this and colour matching is meaningless. */
const MIN_MASKED_PIXELS = 32;

/**
 * Median albedo of the pixels the metalness mask selects.
 *
 * Median rather than mean: `gold_block`'s metal mask also covers ~2500 near-black seam
 * pixels, which drag a mean well off the gold hue. Fully transparent albedo is skipped
 * so cutout textures (`iron_bars` is 52% transparent) do not average in their backdrop.
 *
 * @returns `null` when too few pixels qualify.
 * @throws When the two rasters are not the same size; callers must resample first,
 *   otherwise the shared pixel index silently samples the wrong texel.
 */
export function maskedMedianAlbedo(
  albedo: IRaster,
  mer: IRaster,
  thresholdByte: number,
): { linear: Rgb; srgb: readonly [number, number, number] } | null {
  if (albedo.width !== mer.width || albedo.height !== mer.height) {
    throw new Error(
      `Albedo ${albedo.width}x${albedo.height} and MER ${mer.width}x${mer.height} must be aligned`,
    );
  }

  const reds: number[] = [];
  const greens: number[] = [];
  const blues: number[] = [];

  const count = albedo.width * albedo.height;
  for (let index = 0; index < count; index += 1) {
    const offset = index * 4;
    if ((mer.data[offset] ?? 0) < thresholdByte) continue;
    if ((albedo.data[offset + 3] ?? 255) === 0) continue;
    reds.push(albedo.data[offset] ?? 0);
    greens.push(albedo.data[offset + 1] ?? 0);
    blues.push(albedo.data[offset + 2] ?? 0);
  }

  if (reds.length < MIN_MASKED_PIXELS) return null;

  const srgb = [median(reds), median(greens), median(blues)] as const;
  return { linear: srgb8ToLinearRgb(srgb[0], srgb[1], srgb[2]), srgb };
}

/** Compute the advisory colour match for a texture, if its albedo is available. */
export function buildColorMatch(
  albedo: IRaster | null,
  mer: IRaster,
  thresholdByte: number,
): ITextureReport["colorMatch"] {
  if (!albedo) return null;

  const masked = maskedMedianAlbedo(albedo, mer, thresholdByte);
  if (!masked) return null;

  const match = matchMetalPreset(masked.linear);
  return {
    presetName: match.preset.name,
    presetId: match.preset.id,
    confidence: Number(match.confidence.toFixed(3)),
    medianSrgb: masked.srgb,
  };
}

/**
 * Whether a curated preset contradicts the colour match strongly enough to review.
 *
 * Only fires when a *predefined* metal (230..237) was declared; the `255` fallback makes
 * no claim about which metal a texture is, so it cannot disagree with anything.
 */
export function detectDisagreement(
  metalValue: number | null,
  colorMatch: ITextureReport["colorMatch"],
  minimumConfidence = 0.5,
): boolean {
  if (metalValue === null || colorMatch === null) return false;
  if (metalPresetById(metalValue) === null) return false;
  if (colorMatch.confidence < minimumConfidence) return false;
  return colorMatch.presetId !== metalValue;
}

/** Aggregate counts printed at the end of a run. */
export interface IRunSummary {
  readonly converted: number;
  readonly skipped: number;
  readonly failed: number;
  readonly specularWritten: number;
  readonly normalWritten: number;
  readonly disagreements: readonly ITextureReport[];
  readonly fallbacks: readonly ITextureReport[];
}

/** Roll individual texture reports into a run summary. */
export function summarise(reports: readonly ITextureReport[], failed: number): IRunSummary {
  const withMetal = reports.filter((report) => report.metalValue !== null);
  return {
    converted: reports.filter((r) => r.wroteSpecular || r.wroteNormal).length,
    skipped: reports.filter((r) => !r.wroteSpecular && !r.wroteNormal).length,
    failed,
    specularWritten: reports.filter((r) => r.wroteSpecular).length,
    normalWritten: reports.filter((r) => r.wroteNormal).length,
    disagreements: reports.filter((r) => r.disagrees),
    fallbacks: withMetal.filter((r) => r.metalValue === 255 && r.metalFraction > 0.01),
  };
}
