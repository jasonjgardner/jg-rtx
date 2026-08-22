/**
 * Height-field reconstruction and ambient occlusion for labPBR `_n` maps.
 *
 * labPBR puts AO in the normal map's blue channel and a POM height map in its alpha.
 * Bedrock supplies neither, so both are derived from the normal map itself.
 *
 * ## Tangent frame
 *
 * Both Bedrock and labPBR store **DirectX** normals: green `0` points up the texture,
 * `255` points down. With `x` along columns and `y` along rows (downwards), a surface
 * `z = H(x, y)` has an unnormalised normal proportional to `(-dH/dx, -dH/dy, 1)`, so
 *
 * ```
 * dH/dcolumn = -nx / nz
 * dH/drow    = -ny / nz
 * ```
 *
 * This was confirmed empirically against the pack's own `_heightmap.png` files: the
 * correlation between `dH/drow` and `green - 128` is negative on all six non-flat
 * heightmaps, and a curl-free integrability test picks DirectX on 226 of 233 textures.
 *
 * ## Integration
 *
 * The gradient field is integrated with the Frankot-Chellappa method: a least-squares
 * Poisson solve in the Fourier domain. Its periodic boundary condition is exactly what
 * tiling block textures want, so the recovered height wraps seamlessly.
 */

import type { IRaster } from "./raster";

/** labPBR reads alpha `0` as a depth of 25% into the block. */
export const MAX_DEPTH_FRACTION = 0.25;

/** Never emit `0`: the spec warns it breaks some shaders' POM implementations. */
export const MIN_HEIGHT_ALPHA = 1;

/** Surface gradients in texels of height per texel of distance. */
export interface IGradientField {
  /** `dH/dcolumn`, row-major. */
  readonly dx: Float64Array;
  /** `dH/drow`, row-major. */
  readonly dy: Float64Array;
}

/** `true` when `value` is a positive power of two. */
export function isPowerOfTwo(value: number): boolean {
  return value > 0 && (value & (value - 1)) === 0;
}

/**
 * Smallest `nz` used as a divisor.
 *
 * Quantisation puts a lot of this pack's normals at blue byte `127`, which decodes to
 * `nz = -0.0039`: a normal lying in (or just under) the tangent plane. Without a floor
 * the gradient `-nx / nz` explodes.
 */
const MIN_NZ = 0.05;

/**
 * Default cap on `|dH/dx, dH/dy|`, i.e. a maximum surface slope of ~76 degrees.
 *
 * A floor on `nz` alone is not enough: at `nz = 0.05` the slope still reaches 20, and a
 * handful of such texels dominate the Poisson solve, flattening the entire recovered
 * field against the depth clamp. Calibrated against the pack's own `_heightmap.png`
 * files: with no clamp, the reconstruction of `birch_trapdoor` correlates `+0.002` with
 * the artist's heightmap and 100% of it saturates; clamping at 4 gives `+0.847` and no
 * saturation. Values of 4 and 6 both work; 4 scores best on all six ground-truth maps.
 */
export const DEFAULT_MAX_SLOPE = 4;

/**
 * Tikhonov regularisation weight for the Poisson solve.
 *
 * The unregularised solve divides by `|w|^2`, so its gain approaches `1/|w|^2` as the
 * frequency approaches zero. In a 256px tile the lowest non-zero frequency is amplified
 * roughly 1600x. Structured textures carry real signal down there, but a high-frequency
 * texture (grass, foliage, gravel) does not: it only has gradient noise and the
 * non-integrable residual, which the solve then inflates into slow, cloud-like swells
 * across the tile. That is the "patchy" artifact.
 *
 * Adding `lambda` to the denominator attenuates each frequency by `w^2 / (w^2 + lambda)`,
 * a high-pass with a corner wavelength of `2*pi / sqrt(lambda)` texels. The default of
 * `0.012` corresponds to a corner around 57 texels, roughly 3.5 Minecraft pixels at
 * 256x: relief within a block survives, drift across the whole tile does not.
 *
 * Measured against the pack's own `_heightmap.png` files, this *raises* mean correlation
 * with the artist's height (0.42 to 0.51) while cutting low-frequency energy on grass by
 * about 6x -- the drift was masking real structure, not just adding to it. Set to `0` for
 * a pure Frankot-Chellappa solve.
 */
export const DEFAULT_POISSON_LAMBDA = 0.012;

/** Hard invariant: `nx^2 + ny^2` must not exceed this, or `sqrt(1 - dot(xy, xy))` goes imaginary. */
const UNIT_DISC = 1;

/**
 * Target length used when rescaling an out-of-range normal.
 *
 * Deliberately below {@link UNIT_DISC}: the rescaled vector is re-quantised to bytes
 * afterwards, and rounding can push a vector that sat exactly on the unit circle back
 * outside it.
 */
const XY_RESCALE_TARGET = 0.98;

/**
 * Decode a DirectX normal map into surface gradients.
 *
 * @param normal - Source `_normal.png` as RGBA.
 * @param maxSlope - Gradient magnitude cap. See {@link DEFAULT_MAX_SLOPE}.
 */
export function normalToGradients(
  normal: IRaster,
  maxSlope: number = DEFAULT_MAX_SLOPE,
): IGradientField {
  const count = normal.width * normal.height;
  const dx = new Float64Array(count);
  const dy = new Float64Array(count);

  for (let index = 0; index < count; index += 1) {
    const offset = index * 4;
    const nx = (normal.data[offset] ?? 128) / 127.5 - 1;
    const ny = (normal.data[offset + 1] ?? 128) / 127.5 - 1;
    const nz = Math.max((normal.data[offset + 2] ?? 255) / 127.5 - 1, MIN_NZ);

    const gx = -nx / nz;
    const gy = -ny / nz;
    const magnitude = Math.hypot(gx, gy);
    const scale = magnitude > maxSlope ? maxSlope / magnitude : 1;

    dx[index] = gx * scale;
    dy[index] = gy * scale;
  }

  return { dx, dy };
}

/**
 * Synthesise a DirectX normal map from a height map.
 *
 * Bedrock's `texture_set.json` accepts `heightmap` *instead of* `normal`; three of this
 * pack's glazed terracotta sets do exactly that, and would otherwise produce no `_n`.
 * Central differences wrap, keeping the result tileable.
 *
 * @param heightmap - Greyscale height in the red channel, `255` = highest.
 */
export function heightmapToNormal(heightmap: IRaster): IRaster {
  const { width, height } = heightmap;
  const field = heightmapToField(heightmap);
  const data = new Uint8Array(width * height * 4);
  const wrap = (value: number, size: number): number => ((value % size) + size) % size;

  for (let row = 0; row < height; row += 1) {
    for (let column = 0; column < width; column += 1) {
      const right = field[row * width + wrap(column + 1, width)] as number;
      const left = field[row * width + wrap(column - 1, width)] as number;
      const down = field[wrap(row + 1, height) * width + column] as number;
      const up = field[wrap(row - 1, height) * width + column] as number;

      // n is proportional to (-dH/dx, -dH/drow, 1); +Y down is the DirectX convention.
      const nx = -(right - left) / 2;
      const ny = -(down - up) / 2;
      const length = Math.hypot(nx, ny, 1);

      const offset = (row * width + column) * 4;
      data[offset] = Math.max(0, Math.min(255, Math.round((nx / length + 1) * 127.5)));
      data[offset + 1] = Math.max(0, Math.min(255, Math.round((ny / length + 1) * 127.5)));
      data[offset + 2] = Math.max(0, Math.min(255, Math.round((1 / length + 1) * 127.5)));
      data[offset + 3] = 255;
    }
  }

  return { width, height, data };
}

/**
 * Rescale a normal's XY so `nx^2 + ny^2 <= 1`.
 *
 * 635 of this pack's 959 normal maps contain quantisation-rounded pixels where the
 * stored XY already exceeds unit length. labPBR shaders reconstruct Z as
 * `sqrt(1 - dot(n.xy, n.xy))`, which turns those pixels into `NaN`. Copying red and
 * green through verbatim (as the previous pipeline did) ships that defect.
 *
 * @param encodedX - Red channel byte.
 * @param encodedY - Green channel byte.
 * @returns Byte pair, unchanged when already inside the unit disc.
 */
export function clampNormalXy(encodedX: number, encodedY: number): [number, number] {
  const nx = encodedX / 127.5 - 1;
  const ny = encodedY / 127.5 - 1;
  const lengthSquared = nx * nx + ny * ny;
  if (lengthSquared <= UNIT_DISC) return [encodedX, encodedY];

  const encode = (value: number): number => Math.max(0, Math.min(255, Math.round((value + 1) * 127.5)));

  // Rescale, re-quantise, then verify. Rounding to a byte can nudge the vector back
  // outside the disc, so shrink until the *encoded* pair is provably inside it.
  let scale = Math.sqrt(XY_RESCALE_TARGET / lengthSquared);
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const x = encode(nx * scale);
    const y = encode(ny * scale);
    const dx = x / 127.5 - 1;
    const dy = y / 127.5 - 1;
    if (dx * dx + dy * dy <= UNIT_DISC) return [x, y];
    scale *= 0.97;
  }

  return [128, 128];
}

/**
 * In-place iterative radix-2 Cooley-Tukey FFT.
 *
 * Forward uses `e^{-2*pi*i*k*n/N}`; inverse uses `e^{+2*pi*i*k*n/N}` and scales by `1/N`.
 *
 * @param re - Real parts, length a power of two.
 * @param im - Imaginary parts, same length.
 * @param inverse - Run the inverse transform.
 */
function fft(re: Float64Array, im: Float64Array, inverse: boolean): void {
  const n = re.length;
  if (n <= 1) return;

  for (let i = 1, j = 0; i < n; i += 1) {
    let bit = n >> 1;
    for (; (j & bit) !== 0; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i >= j) continue;
    // Swap via temporaries: destructuring here allocates a pair array per swap.
    const tempRe = re[i] as number;
    re[i] = re[j] as number;
    re[j] = tempRe;
    const tempIm = im[i] as number;
    im[i] = im[j] as number;
    im[j] = tempIm;
  }

  const sign = inverse ? 1 : -1;
  for (let length = 2; length <= n; length <<= 1) {
    const angle = (sign * 2 * Math.PI) / length;
    const wRe = Math.cos(angle);
    const wIm = Math.sin(angle);
    for (let start = 0; start < n; start += length) {
      let curRe = 1;
      let curIm = 0;
      for (let offset = 0; offset < length / 2; offset += 1) {
        const a = start + offset;
        const b = a + length / 2;
        const bRe = (re[b] as number) * curRe - (im[b] as number) * curIm;
        const bIm = (re[b] as number) * curIm + (im[b] as number) * curRe;
        re[b] = (re[a] as number) - bRe;
        im[b] = (im[a] as number) - bIm;
        re[a] = (re[a] as number) + bRe;
        im[a] = (im[a] as number) + bIm;
        const nextRe = curRe * wRe - curIm * wIm;
        curIm = curRe * wIm + curIm * wRe;
        curRe = nextRe;
      }
    }
  }

  if (!inverse) return;
  for (let i = 0; i < n; i += 1) {
    re[i] = (re[i] as number) / n;
    im[i] = (im[i] as number) / n;
  }
}

/** Row-then-column 2D FFT over a row-major complex image. */
function fft2d(
  re: Float64Array,
  im: Float64Array,
  width: number,
  height: number,
  inverse: boolean,
): void {
  // Rows are contiguous, so transform the views in place: no copy needed.
  for (let row = 0; row < height; row += 1) {
    const base = row * width;
    fft(re.subarray(base, base + width), im.subarray(base, base + width), inverse);
  }

  const colRe = new Float64Array(height);
  const colIm = new Float64Array(height);
  for (let column = 0; column < width; column += 1) {
    for (let row = 0; row < height; row += 1) {
      colRe[row] = re[row * width + column] as number;
      colIm[row] = im[row * width + column] as number;
    }
    fft(colRe, colIm, inverse);
    for (let row = 0; row < height; row += 1) {
      re[row * width + column] = colRe[row] as number;
      im[row * width + column] = colIm[row] as number;
    }
  }
}

/** Signed angular frequency for FFT bin `index` of `size` samples. */
function angularFrequency(index: number, size: number): number {
  const signed = index <= size / 2 ? index : index - size;
  return (2 * Math.PI * signed) / size;
}

/**
 * Recover a height field from surface gradients (Frankot-Chellappa, optionally
 * Tikhonov-regularised).
 *
 * The result has zero mean and is expressed in texels of height. It is periodic, so
 * it tiles without a seam.
 *
 * @param gradients - Output of {@link normalToGradients}.
 * @param width - Must be a power of two.
 * @param height - Must be a power of two.
 * @param lambda - Low-frequency damping. See {@link DEFAULT_POISSON_LAMBDA}; `0` gives
 *   the classic unregularised solve.
 * @throws When either dimension is not a power of two.
 */
export function integrateHeight(
  gradients: IGradientField,
  width: number,
  height: number,
  lambda: number = DEFAULT_POISSON_LAMBDA,
): Float64Array {
  if (!isPowerOfTwo(width) || !isPowerOfTwo(height)) {
    throw new Error(`integrateHeight requires power-of-two dimensions, got ${width}x${height}`);
  }

  const pRe = Float64Array.from(gradients.dx);
  const pIm = new Float64Array(pRe.length);
  const qRe = Float64Array.from(gradients.dy);
  const qIm = new Float64Array(qRe.length);

  fft2d(pRe, pIm, width, height, false);
  fft2d(qRe, qIm, width, height, false);

  const hRe = new Float64Array(pRe.length);
  const hIm = new Float64Array(pRe.length);

  const damping = Math.max(0, lambda);

  for (let row = 0; row < height; row += 1) {
    const wy = angularFrequency(row, height);
    for (let column = 0; column < width; column += 1) {
      const wx = angularFrequency(column, width);
      const magnitudeSquared = wx * wx + wy * wy;
      if (magnitudeSquared === 0) continue;

      // H = (-i*wx*P - i*wy*Q) / (wx^2 + wy^2 + lambda); note -i*(a+bi) = b - ai.
      // The lambda term damps the near-zero frequencies whose 1/w^2 gain would
      // otherwise turn gradient noise into slow swells across the tile.
      const denominator = magnitudeSquared + damping;
      const index = row * width + column;
      hRe[index] = (wx * (pIm[index] as number) + wy * (qIm[index] as number)) / denominator;
      hIm[index] = -(wx * (pRe[index] as number) + wy * (qRe[index] as number)) / denominator;
    }
  }

  fft2d(hRe, hIm, width, height, true);
  return hRe;
}

/** Read a Bedrock `_heightmap.png` into a height field in texels. */
export function heightmapToField(heightmap: IRaster): Float64Array {
  const count = heightmap.width * heightmap.height;
  const field = new Float64Array(count);
  const depthTexels = MAX_DEPTH_FRACTION * heightmap.width;
  for (let index = 0; index < count; index += 1) {
    field[index] = ((heightmap.data[index * 4] ?? 0) / 255) * depthTexels;
  }
  return field;
}

/** Tuning for {@link heightToAlpha}. */
export interface IHeightAlphaOptions {
  /** Multiplies the recovered relief before clamping. `1` keeps the integrated depth. */
  readonly heightScale: number;
}

/**
 * Encode a height field into labPBR's `_n` alpha channel.
 *
 * The peak of the field maps to `255` (surface level) and everything below it is a
 * depth, clamped at 25% of a block. Because the field is in texels and a block spans
 * `width` texels, the depth fraction is physically meaningful rather than a
 * min/max stretch, so flat textures stay flat instead of being amplified to full range.
 */
export function heightToAlpha(
  field: Float64Array,
  width: number,
  options: IHeightAlphaOptions,
): Uint8Array {
  const out = new Uint8Array(field.length);
  const peak = field.reduce((a, b) => (b > a ? b : a), Number.NEGATIVE_INFINITY);
  const maxDepthTexels = MAX_DEPTH_FRACTION * width;

  for (let index = 0; index < field.length; index += 1) {
    const depth = (peak - (field[index] as number)) * options.heightScale;
    const fraction = Math.min(1, Math.max(0, depth / maxDepthTexels));
    out[index] = Math.max(MIN_HEIGHT_ALPHA, Math.round(255 * (1 - fraction)));
  }

  return out;
}

/** Tuning for {@link heightToAo}. */
export interface IAoOptions {
  /** Number of azimuthal directions sampled per pixel. */
  readonly directions: number;
  /** Maximum march distance in texels. */
  readonly radius: number;
  /** Scales the occlusion term; `0` disables AO. */
  readonly strength: number;
  /** Lower bound on visibility in `[0, 1]`; `0.8` caps darkening at 20%. */
  readonly floor: number;
}

/**
 * AO defaults for 256px block textures. Deliberately gentle.
 *
 * labPBR's blue channel is *material* AO: occlusion the normal vector cannot express on
 * its own. It is not a free "add contrast" slider, because the shader already darkens
 * crevices through `N . L` using the very same normal map. Deriving a full-strength
 * horizon AO from that normal therefore double-counts, and on a high-frequency texture
 * (grass, dirt, gravel) the result is the crunchy, mottled look this pack showed at
 * `strength: 1` -- where `dirt` bottomed out at 23/255, i.e. 91% occlusion on flat ground.
 *
 * A low strength plus a visibility floor keeps genuine contact shading on structured
 * surfaces (mortar lines, brick edges) while leaving noisy ground textures essentially
 * untouched. Raise {@link IAoOptions.strength} for more relief, or disable AO entirely to
 * emit a flat `255`.
 */
export const DEFAULT_AO_OPTIONS: IAoOptions = {
  directions: 8,
  radius: 8,
  strength: 0.25,
  floor: 0.8,
};

/**
 * Horizon-based ambient occlusion over a height field.
 *
 * For each pixel and each direction, the largest slope encountered along the march is
 * converted to a horizon elevation; the mean sine of those elevations is the occlusion.
 * Sampling wraps, matching the periodic height field, so tiled blocks stay seamless.
 *
 * @returns One byte per pixel: `255` unoccluded, `0` fully occluded.
 */
export function heightToAo(
  field: Float64Array,
  width: number,
  height: number,
  options: IAoOptions = DEFAULT_AO_OPTIONS,
): Uint8Array {
  const out = new Uint8Array(field.length);
  const radius = Math.max(1, Math.min(Math.round(options.radius), Math.min(width, height) - 1));
  const directions = Math.max(1, Math.round(options.directions));
  const floor = Math.max(0, Math.min(1, options.floor));

  // The march pattern is identical for every pixel, so quantise it once. Doing this
  // inside the pixel loop costs two Math.round calls per sample, which dominates.
  const tapCount = directions * radius;
  const tapX = new Int32Array(tapCount);
  const tapY = new Int32Array(tapCount);
  const inverseStep = new Float64Array(radius);

  for (let step = 0; step < radius; step += 1) inverseStep[step] = 1 / (step + 1);

  for (let direction = 0; direction < directions; direction += 1) {
    const angle = (direction / directions) * Math.PI * 2;
    const dx = Math.cos(angle);
    const dy = Math.sin(angle);
    for (let step = 0; step < radius; step += 1) {
      tapX[direction * radius + step] = Math.round(dx * (step + 1));
      tapY[direction * radius + step] = Math.round(dy * (step + 1));
    }
  }

  for (let row = 0; row < height; row += 1) {
    for (let column = 0; column < width; column += 1) {
      const index = row * width + column;
      const origin = field[index] as number;
      let occlusion = 0;

      for (let direction = 0; direction < directions; direction += 1) {
        const base = direction * radius;
        let maxSlope = 0;

        for (let step = 0; step < radius; step += 1) {
          // |tap| <= radius < width, so a single conditional fixup wraps correctly.
          let sampleColumn = column + (tapX[base + step] as number);
          if (sampleColumn < 0) sampleColumn += width;
          if (sampleColumn >= width) sampleColumn -= width;

          let sampleRow = row + (tapY[base + step] as number);
          if (sampleRow < 0) sampleRow += height;
          if (sampleRow >= height) sampleRow -= height;

          const delta = (field[sampleRow * width + sampleColumn] as number) - origin;
          const slope = delta * (inverseStep[step] as number);
          if (slope > maxSlope) maxSlope = slope;
        }

        occlusion += maxSlope / Math.sqrt(1 + maxSlope * maxSlope);
      }

      const visibility = 1 - (occlusion / directions) * options.strength;
      out[index] = Math.max(0, Math.min(255, Math.round(255 * Math.max(floor, visibility))));
    }
  }

  return out;
}
