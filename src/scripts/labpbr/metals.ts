/**
 * The eight labPBR predefined metals, derived from their complex indices of
 * refraction rather than hardcoded as RGB.
 *
 * labPBR 1.3 specular green channel:
 * - `0..229`   dielectric F0, stored linearly as `value / 255`
 * - `230..254` predefined metal; albedo tints the reflection
 * - `255`      "albedo as F0" fallback for metals outside the preset list
 *
 * @see https://shaderlabs.org/wiki/LabPBR_Material_Standard
 */

import { chromaticity, distanceSquared, saturation, type Rgb } from "./color";

/** Green-channel value meaning "use the albedo texture directly as F0". */
export const ALBEDO_AS_F0 = 255;

/** Lowest green-channel value that is interpreted as a metal rather than an F0. */
export const FIRST_METAL_VALUE = 230;

/** Highest green-channel value that maps to a *predefined* metal. */
export const LAST_PREDEFINED_METAL_VALUE = 254;

/** Largest green-channel value still interpreted as a dielectric F0. */
export const MAX_DIELECTRIC_F0 = 229;

/** A labPBR predefined metal and its measured optical constants. */
export interface IMetalPreset {
  /** Green-channel value that selects this metal, `230..237`. */
  readonly id: number;
  /** Human-readable name, used in reports. */
  readonly name: string;
  /** Refractive index per channel. */
  readonly n: Rgb;
  /** Extinction coefficient per channel. */
  readonly k: Rgb;
  /** Normal-incidence reflectance per channel, derived from {@link n} and {@link k}. */
  readonly f0: Rgb;
}

/**
 * Fresnel reflectance at normal incidence for a conductor.
 *
 * `F0 = ((n - 1)^2 + k^2) / ((n + 1)^2 + k^2)`
 *
 * @param n - Refractive index for one channel.
 * @param k - Extinction coefficient for the same channel.
 */
export function fresnelF0FromNk(n: number, k: number): number {
  const kSquared = k * k;
  return ((n - 1) ** 2 + kSquared) / ((n + 1) ** 2 + kSquared);
}

/** Optical constants exactly as published in the labPBR standard. */
const METAL_CONSTANTS: readonly {
  id: number;
  name: string;
  n: Rgb;
  k: Rgb;
}[] = [
  { id: 230, name: "Iron", n: [2.9114, 2.9497, 2.5845], k: [3.0893, 2.9318, 2.767] },
  { id: 231, name: "Gold", n: [0.18299, 0.42108, 1.3734], k: [3.4242, 2.3459, 1.7704] },
  { id: 232, name: "Aluminum", n: [1.3456, 0.96521, 0.61722], k: [7.4746, 6.3995, 5.3031] },
  { id: 233, name: "Chrome", n: [3.1071, 3.1812, 2.323], k: [3.3314, 3.3291, 3.135] },
  { id: 234, name: "Copper", n: [0.27105, 0.67693, 1.3164], k: [3.6092, 2.6248, 2.2921] },
  { id: 235, name: "Lead", n: [1.91, 1.83, 1.44], k: [3.51, 3.4, 3.18] },
  { id: 236, name: "Platinum", n: [2.3757, 2.0847, 1.8453], k: [4.2655, 3.7153, 3.1365] },
  { id: 237, name: "Silver", n: [0.15943, 0.14512, 0.13547], k: [3.9291, 3.19, 2.3808] },
];

/** The eight predefined metals with their F0 precomputed. */
export const METAL_PRESETS: readonly IMetalPreset[] = METAL_CONSTANTS.map((metal) => ({
  ...metal,
  f0: [
    fresnelF0FromNk(metal.n[0], metal.k[0]),
    fresnelF0FromNk(metal.n[1], metal.k[1]),
    fresnelF0FromNk(metal.n[2], metal.k[2]),
  ] as const,
}));

const PRESETS_BY_ID: ReadonlyMap<number, IMetalPreset> = new Map(
  METAL_PRESETS.map((preset) => [preset.id, preset]),
);

/**
 * Look up a preset by its green-channel value.
 *
 * @param id - A value in `230..237`.
 * @returns The preset, or `null` when `id` is not a predefined metal.
 */
export function metalPresetById(id: number): IMetalPreset | null {
  return PRESETS_BY_ID.get(id) ?? null;
}

/** Result of matching an albedo colour against the preset table. */
export interface IMetalMatch {
  /** Closest preset by the metric described on {@link matchMetalPreset}. */
  readonly preset: IMetalPreset;
  /** Raw metric distance; smaller is closer. */
  readonly distance: number;
  /** Heuristic agreement in `[0, 1]`. Values below ~0.5 mean "do not trust this". */
  readonly confidence: number;
}

/** Distance at which confidence reaches zero. Tuned so gold/copper score >0.6. */
const CONFIDENCE_SCALE = 0.9;

/** Weight applied to the saturation term relative to the chromaticity term. */
const SATURATION_WEIGHT = 0.6;

/**
 * Find the labPBR preset whose reflectance best matches an albedo colour.
 *
 * **This is advisory only.** It exists so the converter can *flag* textures whose
 * curated override disagrees with what the pixels look like. It must never be the
 * sole decider, for a measured reason: the eight presets are physical F0 values,
 * which are pale and desaturated (copper's F0 is `0.93, 0.72, 0.50`), whereas hand
 * authored metal albedo is dark and saturated (JG RTX's `cut_copper` is
 * `0.35, 0.13, 0.07`). Plain Euclidean distance in linear RGB therefore collapses
 * almost every metal in this pack onto iron, simply because iron is the darkest
 * preset. Chromaticity alone is no better: it scatters the six near-neutral metals
 * at random.
 *
 * The metric below compares chromaticity (brightness-invariant, so a darkened
 * albedo still reads as "gold-hued") plus a saturation term (so an over-saturated
 * copper is not mistaken for gold). Even so, expect low confidence on grey metals.
 *
 * @param albedoLinear - Linear-light albedo, typically the median of the masked pixels.
 * @returns The nearest preset with a confidence score.
 */
export function matchMetalPreset(albedoLinear: Rgb): IMetalMatch {
  const albedoChroma = chromaticity(albedoLinear);
  const albedoSaturation = saturation(albedoLinear);

  const scored = METAL_PRESETS.map((preset) => {
    const chromaDistance = Math.sqrt(
      distanceSquared(albedoChroma, chromaticity(preset.f0)),
    );
    const saturationDistance = Math.abs(albedoSaturation - saturation(preset.f0));
    return {
      preset,
      distance: chromaDistance + SATURATION_WEIGHT * saturationDistance,
    };
  });

  const best = scored.reduce((a, b) => (b.distance < a.distance ? b : a));

  return {
    preset: best.preset,
    distance: best.distance,
    confidence: Math.max(0, 1 - best.distance / CONFIDENCE_SCALE),
  };
}
