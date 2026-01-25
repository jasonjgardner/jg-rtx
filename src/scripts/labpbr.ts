import sharp from "sharp";

const F0s = {
  230: {
    n: [2.9114, 2.9497, 2.5845],
    k: [3.0893, 2.9318, 2.767],
  },
  231: {
    n: [0.18299, 0.42108, 1.3734],
    k: [3.4242, 2.3459, 1.7704],
  },
  232: {
    n: [1.3456, 0.96521, 0.61722],
    k: [7.4746, 6.3995, 5.3031],
  },
  233: {
    n: [3.1071, 3.1812, 2.323],
    k: [3.3314, 3.3291, 3.135],
  },
  234: {
    n: [0.27105, 0.67693, 1.3164],
    k: [3.6092, 2.6248, 2.2921],
  },
  235: {
    n: [1.91, 1.83, 1.44],
    k: [3.51, 3.4, 3.18],
  },
  236: {
    n: [2.3757, 2.0847, 1.8453],
    k: [4.2655, 3.7153, 3.1365],
  },
  237: {
    n: [0.15943, 0.14512, 0.13547],
    k: [3.9291, 3.19, 2.3808],
  },
} as const;

type Rgb = readonly [number, number, number];

function srgbToLinear(srgb: number) {
  if (srgb <= 0.04045) return srgb / 12.92;
  return Math.pow((srgb + 0.055) / 1.055, 2.4);
}

function f0FromNk(n: number, k: number) {
  const nMinus1 = n - 1;
  const nPlus1 = n + 1;
  const numer = nMinus1 * nMinus1 + k * k;
  const denom = nPlus1 * nPlus1 + k * k;
  return numer / denom;
}

function rgbDistanceSq(a: Rgb, b: Rgb) {
  const dr = a[0] - b[0];
  const dg = a[1] - b[1];
  const db = a[2] - b[2];
  return dr * dr + dg * dg + db * db;
}

async function averageBasecolorLinear(pathOrNull: string | null): Promise<Rgb | null> {
  if (!pathOrNull) return null;

  let exists = false;
  try {
    exists = await Bun.file(pathOrNull).exists();
  } catch {
    return null;
  }

  if (!exists) return null;

  try {
    const image = sharp(pathOrNull, { failOn: "none" });
    const { data, info } = await image
      .raw()
      .ensureAlpha()
      .toBuffer({ resolveWithObject: true });

    const step = Math.max(1, Math.floor((info.width * info.height) / 4096));

    let r = 0;
    let g = 0;
    let b = 0;
    let count = 0;

    for (let i = 0; i < data.length; i += 4 * step) {
      const a = data[i + 3] ?? 255;
      if (a === 0) continue;

      r += srgbToLinear((data[i + 0] ?? 0) / 255);
      g += srgbToLinear((data[i + 1] ?? 0) / 255);
      b += srgbToLinear((data[i + 2] ?? 0) / 255);
      count++;
    }

    if (count === 0) return null;
    return [r / count, g / count, b / count] as const;
  } catch {
    return null;
  }
}

function getMetalPresets() {
  const entries = Object.entries(F0s).map(([bitValue, v]) => {
    const n = v.n as Rgb;
    const k = v.k as Rgb;
    const f0: Rgb = [f0FromNk(n[0], k[0]), f0FromNk(n[1], k[1]), f0FromNk(n[2], k[2])];
    return {
      bitValue: Number(bitValue),
      f0,
    };
  });

  entries.sort((a, b) => a.bitValue - b.bitValue);
  return entries;
}

async function pickMetalPresetBitValue(basecolorPathOrNull: string | null) {
  const avg = await averageBasecolorLinear(basecolorPathOrNull);
  if (!avg) return null;

  const metals = getMetalPresets();

  let bestBitValue: number | null = null;
  let bestDist = Number.POSITIVE_INFINITY;

  for (const metal of metals) {
    const dist = rgbDistanceSq(avg, metal.f0);
    if (dist >= bestDist) continue;

    bestDist = dist;
    bestBitValue = metal.bitValue;
  }

  return bestBitValue;
}

/**
 * Convert a tangent-space normal map to a heightmap using Poisson integration.
 *
 * Assumptions:
 * - Normal map is RGB, 8-bit
 * - Tangent space (+X right, +Y up, +Z out of surface)
 * - OpenGL-style normals (Y+ = up). Flip Y if needed.
 */
export async function normalMapToHeightmap(
  inputPath: string,
  outputPath: string,
  options?: {
    strength?: number; // Height scale
    iterations?: number; // Poisson solver iterations
    flipY?: boolean; // DirectX vs OpenGL normals
  },
) {
  const { strength = 1.0, iterations = 200, flipY = false } = options ?? {};

  // Load normal map
  const image = sharp(inputPath, { failOn: "none" });
  const { data, info } = await image
    .raw()
    .ensureAlpha()
    .toBuffer({ resolveWithObject: true });

  const width = info.width;
  const height = info.height;

  const size = width * height;

  // Gradient fields
  const gradX = new Float32Array(size);
  const gradY = new Float32Array(size);

  // Decode normals → gradients
  for (let i = 0; i < size; i++) {
    const idx = i * 4;

    let nx = (data[idx + 0] / 255) * 2 - 1;
    let ny = (data[idx + 1] / 255) * 2 - 1;
    let nz = (data[idx + 2] / 255) * 2 - 1;

    if (flipY) ny = -ny;

    // Avoid division explosions
    nz = Math.max(0.001, nz);

    // ∂h/∂x = -nx / nz
    // ∂h/∂y = -ny / nz
    gradX[i] = (-nx / nz) * strength;
    gradY[i] = (-ny / nz) * strength;
  }

  // Height field (Poisson solve)
  const heightField = new Float32Array(size);
  const next = new Float32Array(size);

  // Jacobi iteration
  for (let iter = 0; iter < iterations; iter++) {
    for (let y = 1; y < height - 1; y++) {
      for (let x = 1; x < width - 1; x++) {
        const i = y * width + x;

        const dx = gradX[i] - gradX[i - 1];
        const dy = gradY[i] - gradY[i - width];

        next[i] =
          (heightField[i - 1] +
            heightField[i + 1] +
            heightField[i - width] +
            heightField[i + width] -
            dx -
            dy) *
          0.25;
      }
    }

    heightField.set(next);
  }

  // Normalize to 0–255
  let min = Infinity;
  let max = -Infinity;
  for (let i = 0; i < size; i++) {
    const v = heightField[i];
    if (v < min) min = v;
    if (v > max) max = v;
  }

  const range = max - min || 1;

  const output = Buffer.alloc(size);
  for (let i = 0; i < size; i++) {
    output[i] = Math.max(0, 255 - Math.round(((heightField[i] - min) / range) * 255));
  }

  return output;
}

/**
 * Extract ambient occlusion from a heightmap.
 *
 * Heightmap must be single-channel (0–255 or 16-bit normalized)
 */
export function heightmapToAO(
  heightmapBuffer: Buffer,
  width: number,
  height: number,
  options?: {
    radius?: number; // Sample radius in pixels
    strength?: number; // AO strength
    samples?: number; // Angular samples
  },
) {
  const { radius = 8, strength = 1.0, samples = 16 } = options ?? {};

  const size = width * height;
  const heights = new Float32Array(size);

  // Normalize height values from single-channel buffer
  for (let i = 0; i < size; i++) {
    heights[i] = heightmapBuffer[i] / 255;
  }

  const ao = new Float32Array(size);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      const h0 = heights[i];

      let occlusion = 0;

      for (let s = 0; s < samples; s++) {
        const angle = (s / samples) * Math.PI * 2;
        const dx = Math.cos(angle);
        const dy = Math.sin(angle);

        let maxSlope = -Infinity;

        for (let r = 1; r <= radius; r++) {
          const sx = Math.round(x + dx * r);
          const sy = Math.round(y + dy * r);

          if (sx < 0 || sx >= width || sy < 0 || sy >= height) break;

          const j = sy * width + sx;
          const dh = heights[j] - h0;
          const slope = dh / r;

          if (slope > maxSlope) {
            maxSlope = slope;
          }
        }

        occlusion += Math.max(0, maxSlope);
      }

      ao[i] = Math.exp(-occlusion * strength);
    }
  }

  // Normalize AO
  let min = Infinity;
  let max = -Infinity;
  for (let i = 0; i < size; i++) {
    if (ao[i] < min) min = ao[i];
    if (ao[i] > max) max = ao[i];
  }

  const range = max - min || 1;
  const output = Buffer.alloc(size);

  for (let i = 0; i < size; i++) {
    output[i] = Math.round(((ao[i] - min) / range) * 255);
  }

  return output;
}

/**
 * Convert MER texture to LabPBR specular format
 */
export async function convertMerToLabPBR(
  inputPath: string,
  outputPath: string,
  basecolorPathOrNull: string | null,
): Promise<void> {
  const metalPresetBitValue = await pickMetalPresetBitValue(basecolorPathOrNull);

  const image = sharp(inputPath);
  const metadata = await image.metadata();
  const { width, height } = metadata;

  if (!width || !height) {
    throw new Error(`Invalid image dimensions for ${inputPath}`);
  }

  // Extract raw RGBA pixel data
  const { data, info } = await image
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const output = Buffer.alloc(info.width * info.height * 4);

  for (let i = 0; i < data.length; i += 4) {
    const metalness = data[i]; // MER Red channel
    const emissive = data[i + 1]; // MER Green channel
    const roughness = data[i + 2]; // MER Blue channel

    // Convert roughness to perceptual smoothness
    // LabPBR: roughness = pow(1.0 - perceptualSmoothness, 2.0)
    // So: perceptualSmoothness = 1 - sqrt(roughness)
    const roughnessNorm = roughness / 255;
    const perceptualSmoothness = 1.0 - Math.sqrt(roughnessNorm);
    const smoothnessValue = Math.round(perceptualSmoothness * 255);

    // Convert metalness to LabPBR F0/metalness encoding
    // 0-229: F0 for dielectrics (linear)
    // 230-254: Hardcoded metals
    // 255: Full metal using albedo as F0
    let f0Value = 0;
    if (metalness <= 128) {
      f0Value = Math.round((metalness / 128) * 229);
    }

    if (metalness > 230) {
      f0Value = 255;
    }

    if (metalness > 128 && metalness <= 230) {
      f0Value = metalPresetBitValue ?? Math.round(230 + ((metalness - 128) / 127) * 25);
    }

    // Emissive: LabPBR uses 0-254 (255 is ignored)
    const emissiveValue = Math.min(254, emissive);

    // LabPBR _s format:
    // R: Perceptual Smoothness
    // G: F0/Metalness
    // B: Porosity/SSS (set to 0)
    // A: Emission
    output[i] = smoothnessValue; // R: Smoothness
    output[i + 1] = f0Value; // G: F0/Metalness
    output[i + 2] = 0; // B: Porosity (unused)
    output[i + 3] = emissiveValue; // A: Emission
  }

  await sharp(output, {
    raw: {
      width: info.width,
      height: info.height,
      channels: 4,
    },
  })
    .png()
    .toFile(outputPath);
}

/**
 * Convert DirectX normal map to OpenGL format
 * DirectX uses Y-down, OpenGL uses Y-up
 */
export async function convertNormalDXtoGL(
  inputPath: string,
  outputPath: string,
  heightmapPath?: string,
): Promise<void> {
  const image = sharp(inputPath);
  const { data: rawData, info } = await image
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const heightmap = await normalMapToHeightmap(inputPath, outputPath);
  const ao = heightmapToAO(heightmap, info.width, info.height);

  // Get heightmap from file
  let pom: Buffer | null = null;
  if (heightmapPath) {
    try {
      pom = Buffer.from(await Bun.file(heightmapPath).arrayBuffer());
    } catch {
      pom = null;
    }
  }

  const output = Buffer.alloc(info.width * info.height * 4);

  for (let i = 0; i < rawData.length; i += 4) {
    const pixelIndex = i / 4;
    output[i] = rawData[i]; // R: X (unchanged)
    output[i + 1] = 255 - rawData[i + 1]; // G: Y (inverted for OpenGL)
    output[i + 2] = ao[pixelIndex] ?? rawData[i + 2]; // B: Z (ambient occlusion)
    output[i + 3] = pom?.[pixelIndex] ?? rawData[i + 3]; // A: Heightmap for POM
  }

  await sharp(output, {
    raw: {
      width: info.width,
      height: info.height,
      channels: 4,
    },
  })
    .png()
    .toFile(outputPath);
}