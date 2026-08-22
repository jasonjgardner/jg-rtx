/**
 * Conformance tests for the Bedrock to labPBR converter.
 *
 * These assert the parts of the labPBR 1.3 standard that are easy to get subtly wrong:
 * the dielectric/metal boundary in green, the porosity/SSS boundary in blue, the
 * reserved `255` in alpha, and the tangent-frame sign convention in `_n`.
 */

import { describe, expect, test } from "bun:test";
import {
  chromaticity,
  linearToSrgb,
  luminance,
  saturation,
  srgb8ToLinearRgb,
  srgbToLinear,
  toByte,
} from "./color";
import {
  clampNormalXy,
  DEFAULT_AO_OPTIONS,
  DEFAULT_MAX_SLOPE,
  DEFAULT_POISSON_LAMBDA,
  heightmapToNormal,
  heightToAlpha,
  heightToAo,
  integrateHeight,
  isPowerOfTwo,
  MIN_HEIGHT_ALPHA,
  normalToGradients,
} from "./height";
import {
  assertDielectricF0,
  DEFAULT_METAL_THRESHOLD,
  resolveMetalRule,
  resolveMetalTarget,
  resolveMetalThreshold,
  resolvePorosity,
} from "./materials";
import {
  ALBEDO_AS_F0,
  fresnelF0FromNk,
  matchMetalPreset,
  MAX_DIELECTRIC_F0,
  METAL_PRESETS,
  metalPresetById,
} from "./metals";
import { encodeNormal, hasUnreconstructableZ, reconstructNormal } from "./normal";
import { uniformRaster, type IRaster } from "./raster";
import { detectDisagreement, maskedMedianAlbedo } from "./report";
import {
  encodeEmission,
  encodeSpecular,
  encodeSubsurface,
  hasAnyEmission,
  MAX_EMISSION,
  NO_EMISSION,
  SSS_BASE,
} from "./specular";
import { decodeTga } from "./tga";

/** Build an RGBA raster from a per-pixel callback. */
function raster(width: number, height: number, fill: (x: number, y: number) => number[]): IRaster {
  const data = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const [r, g, b, a] = fill(x, y);
      const offset = (y * width + x) * 4;
      data[offset] = r ?? 0;
      data[offset + 1] = g ?? 0;
      data[offset + 2] = b ?? 0;
      data[offset + 3] = a ?? 255;
    }
  }
  return { width, height, data };
}

const baseSpecular = {
  metalThreshold: 0.5,
  metalTarget: "albedo" as const,
  dielectricF0: 10,
  porosity: 0,
  hasSubsurface: false,
};

describe("colour", () => {
  test("sRGB decode uses the piecewise curve, not pow(2.2)", () => {
    expect(srgbToLinear(0)).toBe(0);
    expect(srgbToLinear(1)).toBeCloseTo(1, 12);
    expect(srgbToLinear(0.04)).toBeCloseTo(0.04 / 12.92, 12);
    // The gamma-2.2 shortcut would give 0.2158 here; the real curve gives 0.2140.
    expect(srgbToLinear(0.5)).toBeCloseTo(0.21404, 4);
  });

  test("sRGB encode round-trips decode", () => {
    for (const value of [0, 0.01, 0.25, 0.5, 0.9, 1]) {
      expect(linearToSrgb(srgbToLinear(value))).toBeCloseTo(value, 10);
    }
  });

  test("8-bit lookup matches the analytic curve", () => {
    expect(srgb8ToLinearRgb(255, 128, 0)).toEqual([
      srgbToLinear(1),
      srgbToLinear(128 / 255),
      0,
    ]);
  });

  test("luminance and saturation behave on the extremes", () => {
    expect(luminance([1, 1, 1])).toBeCloseTo(1, 10);
    expect(saturation([0, 0, 0])).toBe(0);
    expect(saturation([1, 1, 1])).toBe(0);
    expect(saturation([1, 0, 0])).toBe(1);
  });

  test("chromaticity discards brightness", () => {
    const bright = chromaticity([0.8, 0.4, 0.2]);
    const dark = chromaticity([0.2, 0.1, 0.05]);
    bright.forEach((value, index) => expect(value).toBeCloseTo(dark[index] ?? 0, 10));
  });

  test("toByte clamps and survives NaN", () => {
    expect(toByte(-5)).toBe(0);
    expect(toByte(300)).toBe(255);
    expect(toByte(Number.NaN)).toBe(0);
    expect(toByte(127.5)).toBe(128);
  });
});

describe("metal presets", () => {
  test("F0 derives from n/k as the standard publishes it", () => {
    // Iron's published F0, to five decimals.
    expect(fresnelF0FromNk(2.9114, 3.0893)).toBeCloseTo(0.53123, 5);
    expect(fresnelF0FromNk(0.18299, 3.4242)).toBeCloseTo(0.94423, 5);
  });

  test("all eight metals occupy 230..237", () => {
    expect(METAL_PRESETS.map((preset) => preset.id)).toEqual([230, 231, 232, 233, 234, 235, 236, 237]);
    expect(METAL_PRESETS.every((preset) => preset.f0.every((c) => c > 0 && c < 1))).toBe(true);
  });

  test("lookup by id round-trips, and 255 is not a preset", () => {
    expect(metalPresetById(231)?.name).toBe("Gold");
    expect(metalPresetById(ALBEDO_AS_F0)).toBeNull();
    expect(metalPresetById(MAX_DIELECTRIC_F0)).toBeNull();
  });

  test("each preset matches itself", () => {
    for (const preset of METAL_PRESETS) {
      expect(matchMetalPreset(preset.f0).preset.id).toBe(preset.id);
    }
  });

  test("gold albedo still reads as gold when darkened", () => {
    // JG RTX gold_block, masked median, linear.
    const match = matchMetalPreset([0.88, 0.672, 0.292]);
    expect(match.preset.name).toBe("Gold");
    expect(match.confidence).toBeGreaterThan(0.5);
  });

  test("an over-saturated copper albedo is reported as low confidence", () => {
    // JG RTX cut_copper. Its hue sits nearer gold than copper, which is exactly why the
    // curated table -- not this matcher -- decides the metal.
    const match = matchMetalPreset([0.352, 0.127, 0.072]);
    expect(match.confidence).toBeLessThan(0.5);
  });
});

describe("curated materials", () => {
  test("copper family resolves to copper with a threshold that keeps copper_block", () => {
    // copper_block's metalness never exceeds 127, so 0.5 would erase it entirely.
    const rule = resolveMetalRule("copper_block");
    expect(resolveMetalTarget(rule)).toBe(234);
    expect(resolveMetalThreshold(rule)).toBeLessThan(127 / 255);
  });

  test("oxidized_copper_chain1 is copper, not iron", () => {
    expect(resolveMetalTarget(resolveMetalRule("oxidized_copper_chain1"))).toBe(234);
  });

  test("rail_golden is gold but rail_normal is iron", () => {
    expect(resolveMetalTarget(resolveMetalRule("rail_golden"))).toBe(231);
    expect(resolveMetalTarget(resolveMetalRule("rail_normal"))).toBe(230);
  });

  test("lodestone's flat 67 metalness clears its threshold", () => {
    const rule = resolveMetalRule("lodestone_top");
    expect(resolveMetalTarget(rule)).toBe(230);
    expect(67 / 255).toBeGreaterThanOrEqual(resolveMetalThreshold(rule));
  });

  test("anvil's dim 32..102 smear clears its threshold", () => {
    expect(32 / 255).toBeGreaterThanOrEqual(resolveMetalThreshold(resolveMetalRule("anvil_base")));
  });

  test("honey is forced dielectric despite 0.62 metalness", () => {
    expect(resolveMetalTarget(resolveMetalRule("honey_top"))).toBe("dielectric");
  });

  test("undeclared textures fall back to albedo-as-F0", () => {
    expect(resolveMetalRule("jigsaw_front")).toBeNull();
    expect(resolveMetalTarget(null)).toBe("albedo");
    expect(resolveMetalThreshold(null)).toBe(DEFAULT_METAL_THRESHOLD);
  });

  test("porosity never leaves the 0..64 band", () => {
    const names = ["stone", "sponge", "wool_colored_red", "gold_block", "glass", "sand", "unknown_x"];
    for (const name of names) {
      const value = resolvePorosity(name);
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThanOrEqual(64);
    }
  });

  test("glazed_terracotta is non-porous even though terracotta is not", () => {
    expect(resolvePorosity("glazed_terracotta_red")).toBe(0);
    expect(resolvePorosity("hardened_clay_stained_red")).toBeGreaterThan(0);
  });

  test("a dielectric F0 in the metal range is rejected", () => {
    expect(() => assertDielectricF0(230)).toThrow(RangeError);
    expect(() => assertDielectricF0(255)).toThrow(RangeError);
    expect(assertDielectricF0(10)).toBe(10);
  });
});

describe("specular encoding", () => {
  test("smoothness is a plain inversion of roughness", () => {
    const mer = uniformRaster(2, 2, [0, 0, 64, 0]);
    const out = encodeSpecular(mer, baseSpecular);
    expect(out.data[0]).toBe(255 - 64);
  });

  test("non-metal pixels get the configured dielectric F0", () => {
    const mer = uniformRaster(2, 2, [0, 0, 128, 0]);
    expect(encodeSpecular(mer, baseSpecular).data[1]).toBe(10);
  });

  test("metal pixels above the threshold get the preset id", () => {
    const mer = uniformRaster(2, 2, [200, 0, 128, 0]);
    const out = encodeSpecular(mer, { ...baseSpecular, metalTarget: 234 });
    expect(out.data[1]).toBe(234);
  });

  test("metal pixels below the threshold stay dielectric", () => {
    const mer = uniformRaster(2, 2, [100, 0, 128, 0]);
    const out = encodeSpecular(mer, { ...baseSpecular, metalTarget: 234 });
    expect(out.data[1]).toBe(10);
  });

  test("the threshold is inclusive at exactly 0.5", () => {
    const mer = uniformRaster(1, 1, [128, 0, 0, 0]);
    const out = encodeSpecular(mer, { ...baseSpecular, metalTarget: 230 });
    expect(out.data[1]).toBe(230);
  });

  test("a dielectric target ignores metalness entirely", () => {
    const mer = uniformRaster(2, 2, [255, 0, 128, 0]);
    const out = encodeSpecular(mer, { ...baseSpecular, metalTarget: "dielectric" });
    expect(out.data[1]).toBe(10);
  });

  test("albedo-as-F0 emits 255", () => {
    const mer = uniformRaster(2, 2, [255, 0, 128, 0]);
    expect(encodeSpecular(mer, baseSpecular).data[1]).toBe(ALBEDO_AS_F0);
  });

  test("subsurface never lands in the porosity band", () => {
    for (const s of [0, 1, 28, 127, 254, 255]) {
      expect(encodeSubsurface(s)).toBeGreaterThanOrEqual(SSS_BASE);
      expect(encodeSubsurface(s)).toBeLessThanOrEqual(255);
    }
    expect(encodeSubsurface(0)).toBe(65);
    expect(encodeSubsurface(255)).toBe(255);
  });

  test("SSS textures write blue from alpha; others write porosity", () => {
    const mers = uniformRaster(2, 2, [0, 0, 100, 28]);
    expect(encodeSpecular(mers, { ...baseSpecular, hasSubsurface: true }).data[2]).toBe(
      encodeSubsurface(28),
    );
    expect(encodeSpecular(mers, { ...baseSpecular, porosity: 40 }).data[2]).toBe(40);
  });

  test("emission is clamped below the reserved 255", () => {
    expect(encodeEmission(255)).toBe(MAX_EMISSION);
    expect(encodeEmission(0)).toBe(0);
    expect(encodeEmission(255)).toBeLessThan(NO_EMISSION);
  });

  test("a texture with no emission gets a flat 255 alpha", () => {
    const mer = uniformRaster(2, 2, [0, 0, 128, 0]);
    expect(hasAnyEmission(mer)).toBe(false);
    expect(encodeSpecular(mer, baseSpecular).data[3]).toBe(NO_EMISSION);
  });

  test("an emissive texture encodes zero-emission pixels as 0, not 255", () => {
    const mer = raster(2, 1, (x) => [0, x === 0 ? 200 : 0, 128, 0]);
    expect(hasAnyEmission(mer)).toBe(true);
    const out = encodeSpecular(mer, baseSpecular);
    expect(out.data[3]).toBe(encodeEmission(200));
    expect(out.data[7]).toBe(0);
  });

  test("every output byte stays inside its labPBR band", () => {
    // Green varies, so this texture is emissive: alpha must never reach the reserved 255.
    const mer = raster(16, 16, (x, y) => [x * 17, y * 17, (x + y) * 8, x * 16]);
    const out = encodeSpecular(mer, { ...baseSpecular, metalTarget: 231, porosity: 40 });
    expect(hasAnyEmission(mer)).toBe(true);

    for (let i = 0; i < out.data.length; i += 4) {
      const green = out.data[i + 1] ?? 0;
      expect(green === 10 || green === 231).toBe(true);
      expect(out.data[i + 2]).toBe(40);
      expect(out.data[i + 3]).toBeLessThanOrEqual(MAX_EMISSION);
    }
  });

  test("porosity and SSS never collide in the blue channel", () => {
    const mers = raster(16, 16, (x) => [0, 0, 128, x * 16]);
    const sss = encodeSpecular(mers, { ...baseSpecular, hasSubsurface: true });
    const porous = encodeSpecular(mers, { ...baseSpecular, porosity: 64 });
    for (let i = 2; i < sss.data.length; i += 4) {
      expect(sss.data[i]).toBeGreaterThanOrEqual(SSS_BASE);
      expect(porous.data[i]).toBeLessThanOrEqual(64);
    }
  });
});

describe("normal map and height reconstruction", () => {
  test("power-of-two detection", () => {
    expect([1, 2, 64, 256, 512].every(isPowerOfTwo)).toBe(true);
    expect([0, 3, 100, 255].some(isPowerOfTwo)).toBe(false);
  });

  test("XY outside the unit disc is projected back inside", () => {
    const [x, y] = clampNormalXy(255, 255);
    const nx = x / 127.5 - 1;
    const ny = y / 127.5 - 1;
    expect(nx * nx + ny * ny).toBeLessThanOrEqual(1);
  });

  test("XY already inside the unit disc is untouched", () => {
    expect(clampNormalXy(128, 128)).toEqual([128, 128]);
    expect(clampNormalXy(160, 140)).toEqual([160, 140]);
  });

  /**
   * Round-trip: build a normal map from a known height field under the DirectX
   * convention, integrate it, and check the result correlates with the original. This
   * pins down every sign in {@link normalToGradients} and {@link integrateHeight}.
   */
  test("Frankot-Chellappa recovers a synthetic height field", () => {
    const size = 32;
    const truth = new Float64Array(size * size);
    for (let row = 0; row < size; row += 1) {
      for (let column = 0; column < size; column += 1) {
        truth[row * size + column] =
          2 * Math.sin((2 * Math.PI * column) / size) * Math.cos((2 * Math.PI * row) / size);
      }
    }

    const wrap = (v: number) => (v % size + size) % size;
    const encoded = raster(size, size, (x, y) => {
      // Central differences of the truth field.
      const dx =
        ((truth[y * size + wrap(x + 1)] as number) - (truth[y * size + wrap(x - 1)] as number)) / 2;
      const dy =
        ((truth[wrap(y + 1) * size + x] as number) - (truth[wrap(y - 1) * size + x] as number)) / 2;
      // n proportional to (-dH/dx, -dH/dy, 1), normalised, then encoded.
      const length = Math.hypot(-dx, -dy, 1);
      return [
        Math.round(((-dx / length + 1) * 255) / 2),
        Math.round(((-dy / length + 1) * 255) / 2),
        Math.round(((1 / length + 1) * 255) / 2),
        255,
      ];
    });

    const recovered = integrateHeight(normalToGradients(encoded), size, size);

    const meanTruth = truth.reduce((a, b) => a + b, 0) / truth.length;
    const meanGot = recovered.reduce((a, b) => a + b, 0) / recovered.length;
    let covariance = 0;
    let varianceTruth = 0;
    let varianceGot = 0;
    for (let i = 0; i < truth.length; i += 1) {
      const a = (truth[i] as number) - meanTruth;
      const b = (recovered[i] as number) - meanGot;
      covariance += a * b;
      varianceTruth += a * a;
      varianceGot += b * b;
    }
    const correlation = covariance / Math.sqrt(varianceTruth * varianceGot);
    expect(correlation).toBeGreaterThan(0.99);
  });

  test("a flat normal map integrates to a flat height and full-bright AO", () => {
    const size = 8;
    const flat = raster(size, size, () => [128, 128, 255, 255]);
    const field = integrateHeight(normalToGradients(flat), size, size);
    expect(Math.max(...field) - Math.min(...field)).toBeLessThan(1e-9);

    const ao = heightToAo(field, size, size, { directions: 8, radius: 2, strength: 1, floor: 0 });
    expect([...ao].every((value) => value === 255)).toBe(true);

    const alpha = heightToAlpha(field, size, { heightScale: 1 });
    expect([...alpha].every((value) => value === 255)).toBe(true);
  });

  test("height alpha never emits the reserved 0", () => {
    const field = Float64Array.from({ length: 16 }, (_unused, i) => -i * 1000);
    const alpha = heightToAlpha(field, 4, { heightScale: 1 });
    expect(Math.min(...alpha)).toBeGreaterThanOrEqual(MIN_HEIGHT_ALPHA);
  });

  test("a deeper pixel encodes to a lower alpha", () => {
    // Width 4 means a 25%-of-block depth budget of exactly 1 texel, so keep the relief
    // inside that budget or every pixel saturates at the floor.
    const field = Float64Array.from([0, -0.1, -0.2, -0.5]);
    const alpha = heightToAlpha(field, 4, { heightScale: 1 });
    expect(alpha[0]).toBe(255);
    expect(alpha[1]).toBeGreaterThan(alpha[2] as number);
    expect(alpha[2]).toBeGreaterThan(alpha[3] as number);
    expect(alpha[3]).toBe(128);
  });

  test("relief deeper than 25% of a block saturates rather than rescaling", () => {
    const field = Float64Array.from([0, -1, -2, -3]);
    const alpha = heightToAlpha(field, 4, { heightScale: 1 });
    expect(alpha[0]).toBe(255);
    expect([...alpha].slice(1)).toEqual([MIN_HEIGHT_ALPHA, MIN_HEIGHT_ALPHA, MIN_HEIGHT_ALPHA]);
  });

  test("heightScale deepens the relief", () => {
    const field = Float64Array.from([0, -0.1, -0.2, -0.4]);
    const shallow = heightToAlpha(field, 4, { heightScale: 1 });
    const deep = heightToAlpha(field, 4, { heightScale: 2 });
    expect(deep[3]).toBeLessThan(shallow[3] as number);
  });

  test("encodeNormal passes red and green through and fills blue/alpha", () => {
    const size = 4;
    const normal = raster(size, size, () => [140, 120, 250, 255]);
    const field = new Float64Array(size * size);
    const out = encodeNormal(normal, field, {
      ao: { directions: 4, radius: 1, strength: 1, floor: 0 },
      writeAo: true,
      writeHeight: true,
      heightScale: 1,
    });
    expect(out.data[0]).toBe(140);
    expect(out.data[1]).toBe(120);
    expect(out.data[2]).toBe(255);
    expect(out.data[3]).toBe(255);
  });

  /**
   * A blue byte of 127 decodes to nz = -0.0039: a normal in (or under) the tangent
   * plane. Unclamped, `-nx / nz` reaches ~1000 and a handful of such texels flatten the
   * entire Poisson solve against the depth clamp. 625 of this pack's 967 normal maps hit
   * this before the clamp existed.
   */
  test("degenerate normals cannot produce unbounded gradients", () => {
    const degenerate = raster(4, 4, () => [255, 255, 127, 255]);
    const { dx, dy } = normalToGradients(degenerate);
    for (let i = 0; i < dx.length; i += 1) {
      expect(Number.isFinite(dx[i] as number)).toBe(true);
      expect(Math.hypot(dx[i] as number, dy[i] as number)).toBeLessThanOrEqual(
        DEFAULT_MAX_SLOPE + 1e-9,
      );
    }
  });

  test("gentle slopes pass through the clamp untouched", () => {
    // nx = 0.2, nz ~ 0.98 => slope ~ 0.2, far below the cap.
    const gentle = raster(2, 2, () => [153, 128, 253, 255]);
    const { dx } = normalToGradients(gentle, DEFAULT_MAX_SLOPE);
    expect(Math.abs(dx[0] as number)).toBeGreaterThan(0.1);
    expect(Math.abs(dx[0] as number)).toBeLessThan(0.3);
  });

  test("a lower maxSlope clamps harder", () => {
    const steep = raster(2, 2, () => [230, 128, 140, 255]);
    const loose = normalToGradients(steep, 8);
    const tight = normalToGradients(steep, 1);
    expect(Math.abs(tight.dx[0] as number)).toBeLessThan(Math.abs(loose.dx[0] as number));
    expect(Math.abs(tight.dx[0] as number)).toBeLessThanOrEqual(1 + 1e-9);
  });

  /**
   * Bedrock allows `heightmap` in place of `normal`. Synthesising a normal and then
   * reading its gradients back must recover the height map's own slopes.
   */
  test("heightmapToNormal round-trips through normalToGradients", () => {
    const size = 16;
    // A gentle ramp along columns: dH/dx is constant and small.
    const heightmap = raster(size, size, (x) => {
      const v = Math.round(128 + 40 * Math.sin((2 * Math.PI * x) / size));
      return [v, v, v, 255];
    });
    const normal = heightmapToNormal(heightmap);
    const { dx, dy } = normalToGradients(normal);

    // Rows are constant, so dH/drow must vanish. An exact zero is not representable in
    // 8 bits (byte 128 decodes to +1/255), so allow one quantisation step.
    const quantisationStep = 1 / 127.5;
    for (let i = 0; i < dy.length; i += 1) {
      expect(Math.abs(dy[i] as number)).toBeLessThanOrEqual(quantisationStep);
    }

    // And the recovered dH/dx must track the analytic derivative of the ramp.
    const depthTexels = 0.25 * size;
    const expectedAtZero = ((40 * Math.sin((2 * Math.PI) / size)) / 255) * depthTexels;
    expect(dx[0] as number).toBeCloseTo(expectedAtZero, 1);
  });

  test("heightmapToNormal produces a valid, mostly-flat normal for a flat heightmap", () => {
    const flat = heightmapToNormal(raster(8, 8, () => [200, 200, 200, 255]));
    for (let i = 0; i < flat.data.length; i += 4) {
      expect(flat.data[i]).toBe(128);
      expect(flat.data[i + 1]).toBe(128);
      expect(flat.data[i + 2]).toBe(255);
    }
  });

  /**
   * Energy of a field at wavelengths longer than `minWavelength` texels. This is the
   * "patchiness" the regularisation exists to remove.
   */
  function lowFrequencyEnergy(field: Float64Array, size: number, minWavelength: number): number {
    // Naive DFT over the low-frequency band only; the test grids are small.
    const maxK = Math.floor(size / minWavelength);
    let energy = 0;
    for (let ky = -maxK; ky <= maxK; ky += 1) {
      for (let kx = -maxK; kx <= maxK; kx += 1) {
        if (kx === 0 && ky === 0) continue;
        let re = 0;
        let im = 0;
        for (let y = 0; y < size; y += 1) {
          for (let x = 0; x < size; x += 1) {
            const phase = (-2 * Math.PI * (kx * x + ky * y)) / size;
            const v = field[y * size + x] as number;
            re += v * Math.cos(phase);
            im += v * Math.sin(phase);
          }
        }
        energy += (re * re + im * im) / (size * size * size * size);
      }
    }
    return energy;
  }

  /** Deterministic value noise, standing in for a grass-like detail normal map. */
  function noisyNormal(size: number): IRaster {
    return raster(size, size, (x, y) => {
      const n = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453;
      const a = n - Math.floor(n);
      const m = Math.sin(x * 39.3468 + y * 11.135) * 24634.6345;
      const b = m - Math.floor(m);
      return [Math.round(a * 255), Math.round(b * 255), 200, 255];
    });
  }

  test("regularisation suppresses the low-frequency drift that makes foliage patchy", () => {
    const size = 32;
    const gradients = normalToGradients(noisyNormal(size));

    const unregularised = integrateHeight(gradients, size, size, 0);
    const regularised = integrateHeight(gradients, size, size, DEFAULT_POISSON_LAMBDA);

    const before = lowFrequencyEnergy(unregularised, size, 16);
    const after = lowFrequencyEnergy(regularised, size, 16);

    expect(after).toBeLessThan(before);
  });

  test("a larger lambda damps low frequencies harder", () => {
    const size = 32;
    const gradients = normalToGradients(noisyNormal(size));
    const energyAt = (lambda: number) =>
      lowFrequencyEnergy(integrateHeight(gradients, size, size, lambda), size, 16);

    expect(energyAt(0.05)).toBeLessThan(energyAt(0.01));
    expect(energyAt(0.01)).toBeLessThan(energyAt(0));
  });

  test("lambda defaults to DEFAULT_POISSON_LAMBDA, and 0 restores the classic solve", () => {
    const size = 32;
    const gradients = normalToGradients(noisyNormal(size));
    const implicit = integrateHeight(gradients, size, size);
    const explicit = integrateHeight(gradients, size, size, DEFAULT_POISSON_LAMBDA);
    const classic = integrateHeight(gradients, size, size, 0);

    expect([...implicit]).toEqual([...explicit]);
    expect([...implicit]).not.toEqual([...classic]);
  });

  test("regularisation still preserves genuine mid-scale relief", () => {
    // A one-cycle-per-16-texels ridge: real structure, well above the damping corner.
    const size = 32;
    const truth = new Float64Array(size * size);
    for (let y = 0; y < size; y += 1) {
      for (let x = 0; x < size; x += 1) {
        truth[y * size + x] = Math.sin((2 * Math.PI * x * 2) / size);
      }
    }

    const wrap = (v: number) => ((v % size) + size) % size;
    const encoded = raster(size, size, (x, y) => {
      const dx =
        ((truth[y * size + wrap(x + 1)] as number) - (truth[y * size + wrap(x - 1)] as number)) / 2;
      const len = Math.hypot(-dx, 0, 1);
      return [
        Math.round(((-dx / len + 1) * 255) / 2),
        Math.round(((0 / len + 1) * 255) / 2),
        Math.round(((1 / len + 1) * 255) / 2),
        255,
      ];
    });

    const field = integrateHeight(normalToGradients(encoded), size, size);

    let cov = 0;
    let vt = 0;
    let vf = 0;
    const meanT = truth.reduce((a, b) => a + b, 0) / truth.length;
    const meanF = field.reduce((a, b) => a + b, 0) / field.length;
    for (let i = 0; i < truth.length; i += 1) {
      const a = (truth[i] as number) - meanT;
      const b = (field[i] as number) - meanF;
      cov += a * b;
      vt += a * a;
      vf += b * b;
    }
    expect(cov / Math.sqrt(vt * vf)).toBeGreaterThan(0.95);
  });

  /**
   * Baked AO must stay gentle. The shader already darkens crevices via `N . L` from the
   * same normal map, so a full-strength horizon AO double-counts -- which is what turned
   * grass and dirt splotchy (dirt bottomed out at 23/255, i.e. 91% occlusion).
   */
  test("the AO floor caps how dark occlusion can get", () => {
    const size = 16;
    // A deeply pitted field: unfloored AO would drive this near black.
    const field = Float64Array.from({ length: size * size }, (_unused, i) =>
      i % 3 === 0 ? -40 : 0,
    );

    const unfloored = heightToAo(field, size, size, {
      directions: 8,
      radius: 4,
      strength: 1,
      floor: 0,
    });
    const floored = heightToAo(field, size, size, {
      directions: 8,
      radius: 4,
      strength: 1,
      floor: 0.8,
    });

    expect(Math.min(...unfloored)).toBeLessThan(0.8 * 255);
    expect(Math.min(...floored)).toBeGreaterThanOrEqual(Math.floor(0.8 * 255));
  });

  test("lowering AO strength lightens the occlusion", () => {
    const size = 16;
    const field = Float64Array.from({ length: size * size }, (_unused, i) =>
      i % 3 === 0 ? -40 : 0,
    );
    const base = { directions: 8, radius: 4, floor: 0 };
    const strong = heightToAo(field, size, size, { ...base, strength: 1 });
    const weak = heightToAo(field, size, size, { ...base, strength: 0.25 });

    const mean = (a: Uint8Array) => [...a].reduce((x, y) => x + y, 0) / a.length;
    expect(mean(weak)).toBeGreaterThan(mean(strong));
  });

  test("the shipped AO default is gentle enough not to splotch noisy ground", () => {
    expect(DEFAULT_AO_OPTIONS.strength).toBeLessThanOrEqual(0.5);
    expect(DEFAULT_AO_OPTIONS.floor).toBeGreaterThanOrEqual(0.7);

    // Under the shipped default even a violently pitted field cannot exceed the floor.
    const size = 16;
    const field = Float64Array.from({ length: size * size }, (_unused, i) =>
      i % 2 === 0 ? -100 : 0,
    );
    const ao = heightToAo(field, size, size, DEFAULT_AO_OPTIONS);
    expect(Math.min(...ao)).toBeGreaterThanOrEqual(Math.floor(DEFAULT_AO_OPTIONS.floor * 255));
  });

  test("hasUnreconstructableZ detects exactly the NaN-risk texels", () => {
    expect(hasUnreconstructableZ(raster(2, 2, () => [128, 128, 255, 255]))).toBe(false);
    // 255,255 decodes to (1,1): length^2 = 2, well outside the unit disc.
    expect(hasUnreconstructableZ(raster(2, 2, () => [255, 255, 255, 255]))).toBe(true);
    // One bad texel among good ones must still trip it.
    expect(hasUnreconstructableZ(raster(2, 2, (x, y) => (x + y === 0 ? [255, 255, 0, 255] : [128, 128, 255, 255])))).toBe(true);
  });

  /**
   * The repair path must not trust blue as a Z source (labPBR puts AO there), and its
   * output must satisfy the invariant a shader relies on.
   */
  test("reconstructNormal pulls every texel back inside the unit disc", () => {
    const broken = raster(8, 8, () => [255, 255, 0, 255]);
    expect(hasUnreconstructableZ(broken)).toBe(true);

    const fixed = reconstructNormal(broken);
    expect(hasUnreconstructableZ(fixed)).toBe(false);
  });

  test("reconstructNormal derives Z from XY rather than copying blue", () => {
    // Blue is deliberately garbage (0). A flat normal must still come back with Z ~ 1.
    const flatWithJunkBlue = raster(4, 4, () => [128, 128, 0, 255]);
    const fixed = reconstructNormal(flatWithJunkBlue);
    expect(fixed.data[0]).toBe(128);
    expect(fixed.data[1]).toBe(128);
    // nx = ny ~ 0 => nz ~ 1 => byte ~ 255, not the 0 that was in blue.
    expect(fixed.data[2]).toBeGreaterThan(250);
    expect(fixed.data[3]).toBe(255);
  });

  test("reconstructNormal leaves already-valid XY untouched", () => {
    const good = raster(4, 4, () => [160, 140, 200, 255]);
    const fixed = reconstructNormal(good);
    expect(fixed.data[0]).toBe(160);
    expect(fixed.data[1]).toBe(140);
  });

  test("a repaired normal survives the full height and AO pipeline", () => {
    const broken = raster(16, 16, (x) => (x % 2 === 0 ? [255, 255, 0, 255] : [140, 120, 250, 255]));
    const rebuilt = reconstructNormal(broken);
    const field = integrateHeight(normalToGradients(rebuilt), 16, 16);
    const encoded = encodeNormal(rebuilt, field, {
      ao: { directions: 8, radius: 4, strength: 1, floor: 0 },
      writeAo: true,
      writeHeight: true,
      heightScale: 1,
    });

    expect(hasUnreconstructableZ(encoded)).toBe(false);
    for (let i = 3; i < encoded.data.length; i += 4) {
      expect(encoded.data[i]).toBeGreaterThanOrEqual(MIN_HEIGHT_ALPHA);
    }
  });

  test("encodeNormal rejects a mismatched height field", () => {
    const normal = raster(2, 2, () => [128, 128, 255, 255]);
    expect(() =>
      encodeNormal(normal, new Float64Array(3), {
        ao: { directions: 4, radius: 1, strength: 1, floor: 0 },
        writeAo: false,
        writeHeight: false,
        heightScale: 1,
      }),
    ).toThrow();
  });
});

describe("reporting", () => {
  test("masked median ignores off-mask pixels", () => {
    // Left half is metal and red; right half is non-metal and green.
    const albedo = raster(16, 16, (x) => (x < 8 ? [200, 0, 0, 255] : [0, 200, 0, 255]));
    const mer = raster(16, 16, (x) => [x < 8 ? 255 : 0, 0, 0, 255]);
    expect(maskedMedianAlbedo(albedo, mer, 128)?.srgb).toEqual([200, 0, 0]);
  });

  test("masked median ignores fully transparent albedo", () => {
    // Every pixel is metal, but the right half is cut out and must not drag the median.
    const albedo = raster(16, 16, (x) => (x < 8 ? [200, 0, 0, 255] : [0, 0, 0, 0]));
    const mer = raster(16, 16, () => [255, 0, 0, 255]);
    expect(maskedMedianAlbedo(albedo, mer, 128)?.srgb).toEqual([200, 0, 0]);
  });

  test("masked median returns null when too few pixels qualify", () => {
    const albedo = raster(16, 16, () => [200, 0, 0, 255]);
    const mer = raster(16, 16, () => [0, 0, 0, 255]);
    expect(maskedMedianAlbedo(albedo, mer, 128)).toBeNull();
  });

  test("masked median refuses misaligned rasters instead of sampling the wrong texel", () => {
    const albedo = raster(16, 16, () => [200, 0, 0, 255]);
    const mer = raster(8, 8, () => [255, 0, 0, 255]);
    expect(() => maskedMedianAlbedo(albedo, mer, 128)).toThrow();
  });

  test("the 255 fallback never counts as a disagreement", () => {
    const match = { presetName: "Gold", presetId: 231, confidence: 0.9, medianSrgb: [1, 1, 1] as const };
    expect(detectDisagreement(ALBEDO_AS_F0, match)).toBe(false);
    expect(detectDisagreement(null, match)).toBe(false);
  });

  test("a confident mismatch against a declared preset is flagged", () => {
    const match = { presetName: "Gold", presetId: 231, confidence: 0.9, medianSrgb: [1, 1, 1] as const };
    expect(detectDisagreement(234, match)).toBe(true);
    expect(detectDisagreement(231, match)).toBe(false);
  });

  test("a low-confidence mismatch is not flagged", () => {
    const match = { presetName: "Gold", presetId: 231, confidence: 0.2, medianSrgb: [1, 1, 1] as const };
    expect(detectDisagreement(234, match)).toBe(false);
  });
});

describe("tga", () => {
  /** Build a 2x1 uncompressed 32bpp bottom-origin BGRA Targa. */
  function makeTga(imageType: number, payload: number[], descriptor = 0): Uint8Array {
    const header = new Uint8Array(18);
    header[2] = imageType;
    header[12] = 2; // width lo
    header[14] = 1; // height lo
    header[16] = 32;
    header[17] = descriptor;
    return Uint8Array.from([...header, ...payload]);
  }

  test("decodes uncompressed BGRA and reorders to RGBA", () => {
    // Two pixels: blue-ish then red-ish, stored BGRA.
    const tga = makeTga(2, [10, 20, 30, 255, 40, 50, 60, 128]);
    const out = decodeTga(tga);
    expect(out.width).toBe(2);
    expect(out.height).toBe(1);
    expect([...out.data]).toEqual([30, 20, 10, 255, 60, 50, 40, 128]);
  });

  test("decodes an RLE run", () => {
    // One repeated-run packet of 2 identical pixels.
    const tga = makeTga(10, [0x81, 7, 8, 9, 255]);
    const out = decodeTga(tga);
    expect([...out.data]).toEqual([9, 8, 7, 255, 9, 8, 7, 255]);
  });

  test("decodes an RLE literal", () => {
    const tga = makeTga(10, [0x01, 1, 2, 3, 255, 4, 5, 6, 255]);
    const out = decodeTga(tga);
    expect([...out.data]).toEqual([3, 2, 1, 255, 6, 5, 4, 255]);
  });

  test("honours the top-origin descriptor bit", () => {
    const bottom = decodeTga(makeTga(2, [1, 1, 1, 255, 2, 2, 2, 255], 0x00));
    const top = decodeTga(makeTga(2, [1, 1, 1, 255, 2, 2, 2, 255], 0x20));
    // Single row, so both agree; the flag matters only for multi-row images.
    expect([...bottom.data]).toEqual([...top.data]);
  });

  test("rejects unsupported variants rather than guessing", () => {
    expect(() => decodeTga(makeTga(1, []))).toThrow();
    expect(() => decodeTga(new Uint8Array(4))).toThrow();
  });

  test("rejects a truncated RLE stream", () => {
    expect(() => decodeTga(makeTga(10, [0xff]))).toThrow();
  });
});
