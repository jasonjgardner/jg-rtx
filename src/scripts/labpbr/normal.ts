/**
 * Bedrock `_normal.png` to labPBR `_n`.
 *
 * | labPBR `_n` | Source | Transform |
 * |---|---|---|
 * | R normal X | normal red | copied, rescaled into the unit disc |
 * | G normal Y | normal green | copied, rescaled into the unit disc |
 * | B ambient occlusion | (none) | horizon AO over the recovered height field |
 * | A height / POM | `_heightmap.png` when declared, else the recovered field | `255` = surface, `1` = 25% deep |
 *
 * ## The green channel is *not* flipped
 *
 * labPBR specifies DirectX normals: *"The normal vector should be encoded in DirectX
 * format (Y-)"*. Bedrock's are DirectX too, verified three ways against this pack:
 * the correlation of `dH/drow` with `green - 128` is negative on every non-flat
 * `_heightmap.png`; Frankot-Chellappa reconstruction matches the real heightmap under
 * DirectX on 6 of 6; and a curl-free integrability test prefers DirectX on 226 of 233
 * textures. Red and green therefore pass through untouched. Inverting green -- as
 * `convertNormalDXtoGL` in the older `labpbr.ts` does -- corrupts every normal map.
 *
 * ## Z is dropped, and XY must be renormalised
 *
 * Blue carries AO, so shaders rebuild Z as `sqrt(1 - dot(n.xy, n.xy))`. That is
 * imaginary wherever the stored XY already exceeds unit length, which happens in 635
 * of this pack's 959 normal maps. {@link clampNormalXy} projects those back inside.
 */

import {
  clampNormalXy,
  heightToAlpha,
  heightToAo,
  type IAoOptions,
  type IHeightAlphaOptions,
} from "./height";
import type { IRaster } from "./raster";

/** Inputs for {@link encodeNormal}. */
export interface INormalOptions extends IHeightAlphaOptions {
  /** AO sampling parameters. */
  readonly ao: IAoOptions;
  /** Emit AO into blue. When `false`, blue is a flat `255` (no occlusion). */
  readonly writeAo: boolean;
  /** Emit a height map into alpha. When `false`, alpha is a flat `255` (no depth). */
  readonly writeHeight: boolean;
}

/** True when a normal map contains any texel whose stored XY exceeds unit length. */
export function hasUnreconstructableZ(normal: IRaster): boolean {
  for (let offset = 0; offset < normal.data.length; offset += 4) {
    const nx = (normal.data[offset] ?? 128) / 127.5 - 1;
    const ny = (normal.data[offset + 1] ?? 128) / 127.5 - 1;
    if (nx * nx + ny * ny > 1) return true;
  }
  return false;
}

/**
 * Rebuild a usable tangent-space normal from an existing labPBR `_n` map.
 *
 * Repairing an already-published `_n` is not the same as converting a Bedrock
 * `_normal`: the blue channel no longer holds Z (labPBR puts AO there, and a
 * half-converted pack may hold anything), so blue cannot be trusted as a Z source.
 *
 * Instead this does exactly what a labPBR shader does — projects XY back inside the
 * unit disc, then derives `nz = sqrt(1 - dot(n.xy, n.xy))`. The result is a normal
 * raster with valid XY and a *consistent* Z, suitable for feeding the same height and
 * AO pipeline used by the Bedrock path.
 *
 * @param normal - An existing `_n` map, RGBA.
 * @returns A normal raster: R/G = renormalised XY, B = reconstructed Z, A = opaque.
 */
export function reconstructNormal(normal: IRaster): IRaster {
  const data = new Uint8Array(normal.data.length);

  for (let offset = 0; offset < normal.data.length; offset += 4) {
    const [x, y] = clampNormalXy(
      normal.data[offset] ?? 128,
      normal.data[offset + 1] ?? 128,
    );

    const nx = x / 127.5 - 1;
    const ny = y / 127.5 - 1;
    const nz = Math.sqrt(Math.max(0, 1 - (nx * nx + ny * ny)));

    data[offset] = x;
    data[offset + 1] = y;
    data[offset + 2] = Math.max(0, Math.min(255, Math.round((nz + 1) * 127.5)));
    data[offset + 3] = 255;
  }

  return { width: normal.width, height: normal.height, data };
}

/**
 * Encode a labPBR normal map.
 *
 * @param normal - Bedrock `_normal.png` as RGBA.
 * @param field - Height field in texels, zero-mean, from {@link integrateHeight} or
 *   {@link heightmapToField}. Must have `normal.width * normal.height` entries.
 * @param options - AO and height tuning.
 * @throws When `field` does not match the normal map's pixel count.
 */
export function encodeNormal(
  normal: IRaster,
  field: Float64Array,
  options: INormalOptions,
): IRaster {
  const count = normal.width * normal.height;
  if (field.length !== count) {
    throw new Error(`Height field has ${field.length} entries, expected ${count}`);
  }

  const ao = options.writeAo
    ? heightToAo(field, normal.width, normal.height, options.ao)
    : null;
  const alpha = options.writeHeight
    ? heightToAlpha(field, normal.width, { heightScale: options.heightScale })
    : null;

  const data = new Uint8Array(count * 4);

  for (let index = 0; index < count; index += 1) {
    const offset = index * 4;
    const [x, y] = clampNormalXy(
      normal.data[offset] ?? 128,
      normal.data[offset + 1] ?? 128,
    );
    data[offset] = x;
    data[offset + 1] = y;
    data[offset + 2] = ao ? (ao[index] ?? 255) : 255;
    data[offset + 3] = alpha ? (alpha[index] ?? 255) : 255;
  }

  return { width: normal.width, height: normal.height, data };
}
