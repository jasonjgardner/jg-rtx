import sharp from "sharp";
import { join } from "path";

// --- CONFIGURATION ---

// The labPBR Metal Standards (Linear Space Targets)
// Derived from n/k refractive indices
const METAL_TARGETS = [
  { name: "Iron",     id: 230, rgb: [0.53123, 0.51236, 0.49583] },
  { name: "Gold",     id: 231, rgb: [0.94423, 0.77610, 0.37340] },
  { name: "Aluminum", id: 232, rgb: [0.91230, 0.91385, 0.91968] },
  { name: "Chrome",   id: 233, rgb: [0.55560, 0.55454, 0.55478] },
  { name: "Copper",   id: 234, rgb: [0.92595, 0.72090, 0.50415] },
  { name: "Lead",     id: 235, rgb: [0.63248, 0.62594, 0.64148] },
  { name: "Platinum", id: 236, rgb: [0.67885, 0.64240, 0.58841] },
  { name: "Silver",   id: 237, rgb: [0.96200, 0.94947, 0.92212] },
];

// Standard Dielectric F0 (4% reflectance) ~ 10/255
const DIELECTRIC_VAL = 10;
const METAL_THRESHOLD = 128; // 0.5 * 255

// --- UTILS ---

// Fast Lookup Table for sRGB (0-255) to Linear (0.0-1.0)
// Pre-calculating this avoids Math.pow() calls inside the pixel loop (massive speedup)
const sRGB_LUT = new Float32Array(256);
for (let i = 0; i < 256; i++) {
  sRGB_LUT[i] = Math.pow(i / 255.0, 2.2);
}

async function createF0(
  albedoPath: string,
  metallicPath: string,
  roughnessPath: string,
  outputPath: string
) {
  console.log(`Processing ${albedoPath}...`);

  try {
    // 1. Load Albedo to get dimensions
    const albedo = sharp(albedoPath);
    const meta = await albedo.metadata();
    
    if (!meta.width || !meta.height) throw new Error("Could not read image metadata");
    const { width, height } = meta;

    // 2. Load and standardize inputs
    // We force all inputs to the same size and specific channel counts to ensure the buffer math aligns.
    
    // Albedo: Ensure RGB (3 channels), remove alpha if present
    const albedoBuf = await albedo
      .resize(width, height)
      .removeAlpha()
      .raw()
      .toBuffer();

    // Metallic: Ensure Grayscale (1 channel)
    const metallicBuf = await sharp(metallicPath)
      .resize(width, height)
      .grayscale()
      .raw()
      .toBuffer();

    // Roughness: Ensure Grayscale (1 channel)
    const roughnessBuf = await sharp(roughnessPath)
      .resize(width, height)
      .grayscale()
      .raw()
      .toBuffer();

    // 3. Prepare Output Buffer (RGBA = 4 channels)
    const pixelCount = width * height;
    const outputBuf = new Uint8Array(pixelCount * 4);

    // 4. The Loop (Pixel Processing)
    // We iterate through every pixel.
    for (let i = 0; i < pixelCount; i++) {
      const rIdx = i * 3; // Index for RGB buffer
      const oIdx = i * 4; // Index for Output RGBA buffer

      // --- A. Read Metallic ---
      const metalVal = metallicBuf[i];
      const isMetal = metalVal > METAL_THRESHOLD;

      // --- B. Calculate F0 (Red Channel) ---
      let f0_out = DIELECTRIC_VAL;

      if (isMetal) {
        // Read Raw sRGB
        const r_srgb = albedoBuf[rIdx];
        const g_srgb = albedoBuf[rIdx + 1];
        const b_srgb = albedoBuf[rIdx + 2];

        // Convert to Linear using LUT
        const r_lin = sRGB_LUT[r_srgb];
        const g_lin = sRGB_LUT[g_srgb];
        const b_lin = sRGB_LUT[b_srgb];

        // Find closest metal
        let bestDist = Infinity;
        let bestID = 0;

        // Unrolled loop optimization isn't strictly necessary here, normal loop is fast enough in V8
        for (const metal of METAL_TARGETS) {
          // Euclidean Distance Squared (Linear Space)
          const dr = r_lin - metal.rgb[0];
          const dg = g_lin - metal.rgb[1];
          const db = b_lin - metal.rgb[2];
          
          const distSq = (dr * dr) + (dg * dg) + (db * db);

          if (distSq < bestDist) {
            bestDist = distSq;
            bestID = metal.id;
          }
        }
        f0_out = bestID;
      }

        // --- C. Write Output Pixel ---
    // R: Smoothness (from Roughness map)
    const roughVal = roughnessBuf[i];
    const smoothVal = 255 - roughVal; // Invert Roughness to get Smoothness

    // G: F0 Value
    outputBuf[oIdx] = smoothVal;      // R Channel
    outputBuf[oIdx + 1] = f0_out;     // G Channel
    outputBuf[oIdx + 2] = 0;           // B Channel

    outputBuf[oIdx + 3] = 255;         // A Channel (Opaque)

    } // End Pixel Loop

    // 5. Save Output Image
    await sharp(outputBuf, {
      raw: {
        width: width,
        height: height,
        channels: 4
      }
    })
    .png()
    .toFile(outputPath);

    console.log(`Saved F0 map to ${outputPath}`);

  } catch (error) {
    console.error(`Error processing ${albedoPath}:`, error);
  }
}