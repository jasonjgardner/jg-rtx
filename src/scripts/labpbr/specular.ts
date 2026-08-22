/**
 * Bedrock MER(S) to labPBR `_s` specular map.
 *
 * ## Channel mapping
 *
 * | labPBR `_s` | Source | Transform |
 * |---|---|---|
 * | R perceptual smoothness | MER blue (roughness) | `255 - roughness` |
 * | G F0 / metalness | MER red (metalness) + curated rule | threshold, then preset / `255` / dielectric |
 * | B porosity or SSS | MERS alpha (subsurface) | `65 + s * 190/255`, else curated porosity |
 * | A emissiveness | MER green (emissive) | `e * 254/255`, or a flat `255` when unused |
 *
 * ## Why smoothness is a plain inversion
 *
 * labPBR defines `linearRoughness = (1 - perceptualSmoothness)^2`, so its red channel
 * holds *perceptual* smoothness. Bedrock's MER roughness is likewise perceptual (the
 * standard glTF/Disney convention, where `alpha = roughness^2`). The two therefore
 * differ by a simple inversion, and `1 - sqrt(roughness)` -- as used by the older
 * `labpbr.ts` -- double-applies the perceptual curve. The shipped Java pack agrees:
 * `stone_s.png` and `cobblestone_s.png` match `255 - MER.blue` exactly.
 */

import { toByte } from "./color";
import { assertDielectricF0, type MetalTarget } from "./materials";
import { ALBEDO_AS_F0 } from "./metals";
import type { IRaster } from "./raster";

/** Lowest labPBR blue value that means subsurface scattering rather than porosity. */
export const SSS_BASE = 65;

/** Span of the subsurface range, `255 - 65`. */
export const SSS_RANGE = 190;

/** Alpha value meaning "this texture does not emit light". */
export const NO_EMISSION = 255;

/** Largest alpha that encodes actual emission; `255` is reserved for "none". */
export const MAX_EMISSION = 254;

/** Everything the specular encoder needs to know about one texture. */
export interface ISpecularOptions {
  /** Normalised metalness at or above which a pixel is metal. Ignored when `target` is `"dielectric"`. */
  readonly metalThreshold: number;
  /** Green-channel value for metal pixels, from the curated rules. */
  readonly metalTarget: MetalTarget;
  /** Green-channel value for non-metal pixels, `0..229`. */
  readonly dielectricF0: number;
  /** Blue-channel porosity, `0..64`. Ignored when the source carries subsurface data. */
  readonly porosity: number;
  /** Whether the MER(S) alpha channel holds subsurface scattering. */
  readonly hasSubsurface: boolean;
}

/**
 * Map Bedrock subsurface `0..255` into labPBR's `65..255` SSS band.
 *
 * Passing the raw value through would drop low-SSS foliage into the `0..64`
 * *porosity* band, silently turning scattering into wetness. `0` maps to `65`, which
 * decodes to 0% scattering.
 */
export function encodeSubsurface(subsurface: number): number {
  return SSS_BASE + Math.round((subsurface / 255) * SSS_RANGE);
}

/**
 * Map Bedrock emissive `0..255` into labPBR's `0..254` alpha band.
 *
 * Clamped below `255` because labPBR treats `255` as "no emission".
 */
export function encodeEmission(emissive: number): number {
  return Math.min(MAX_EMISSION, Math.round((emissive / 255) * MAX_EMISSION));
}

/**
 * Resolve the byte written to green for a metal pixel.
 *
 * @param target - Curated metal target.
 * @param dielectricF0 - Used when the target forbids metal entirely.
 */
function metalValue(target: MetalTarget, dielectricF0: number): number {
  if (target === "dielectric") return dielectricF0;
  if (target === "albedo") return ALBEDO_AS_F0;
  return target;
}

/**
 * Report whether any pixel of a MER map carries emission.
 *
 * A texture with no emission gets a flat `255` alpha (labPBR's "ignore me"), matching
 * the convention used by the 836 non-emissive `_s` files already in the Java pack.
 */
export function hasAnyEmission(mer: IRaster): boolean {
  for (let offset = 1; offset < mer.data.length; offset += 4) {
    if ((mer.data[offset] ?? 0) > 0) return true;
  }
  return false;
}

/**
 * Encode a Bedrock MER(S) raster as a labPBR specular map.
 *
 * @param mer - Metalness in red, emissive in green, roughness in blue, subsurface in
 *   alpha when {@link ISpecularOptions.hasSubsurface} is set.
 * @param options - Curated per-texture settings.
 * @returns An RGBA raster ready to be written as `<name>_s.png`.
 * @throws When `dielectricF0` would be misread as a metal.
 */
export function encodeSpecular(mer: IRaster, options: ISpecularOptions): IRaster {
  const dielectricF0 = assertDielectricF0(options.dielectricF0);
  const forcedDielectric = options.metalTarget === "dielectric";
  const metalByte = metalValue(options.metalTarget, dielectricF0);
  const thresholdByte = options.metalThreshold * 255;
  const emissive = hasAnyEmission(mer);

  const data = new Uint8Array(mer.data.length);

  for (let offset = 0; offset < mer.data.length; offset += 4) {
    const metalness = mer.data[offset] ?? 0;
    const emission = mer.data[offset + 1] ?? 0;
    const roughness = mer.data[offset + 2] ?? 255;
    const subsurface = mer.data[offset + 3] ?? 0;

    const isMetal = !forcedDielectric && metalness >= thresholdByte;

    data[offset] = toByte(255 - roughness);
    data[offset + 1] = isMetal ? metalByte : dielectricF0;
    data[offset + 2] = options.hasSubsurface
      ? encodeSubsurface(subsurface)
      : toByte(options.porosity);
    data[offset + 3] = emissive ? encodeEmission(emission) : NO_EMISSION;
  }

  return { width: mer.width, height: mer.height, data };
}
