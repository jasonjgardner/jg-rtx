/**
 * Orchestrates the Bedrock to labPBR conversion for one texture and for a whole pack.
 */

import { mkdir } from "node:fs/promises";
import path from "node:path";
import { fileExists } from "./fs";
import {
  DEFAULT_AO_OPTIONS,
  DEFAULT_MAX_SLOPE,
  DEFAULT_POISSON_LAMBDA,
  heightmapToField,
  heightmapToNormal,
  integrateHeight,
  isPowerOfTwo,
  normalToGradients,
  type IAoOptions,
} from "./height";
import {
  DEFAULT_DIELECTRIC_F0,
  resolveMetalRule,
  resolveMetalThreshold,
  resolveMetalTarget,
  resolvePorosity,
} from "./materials";
import { bedrockToJava } from "./names";
import { encodeNormal } from "./normal";
import { loadRaster, resampleNearest, uniformRaster, writePng, type IRaster } from "./raster";
import { buildColorMatch, detectDisagreement, type ITextureReport } from "./report";
import { encodeSpecular } from "./specular";
import type { IResolvedTextureSet, LayerSource } from "./textureSet";

/** Runtime configuration for a conversion run. */
export interface IConvertOptions {
  /** Directory holding the existing Java `block` albedo textures, used for the existence check. */
  readonly javaDir: string;
  /** Directory the generated `_s` / `_n` maps are written to. Usually the same as {@link javaDir}. */
  readonly outDir: string;
  /** Green-channel value for dielectric pixels, `0..229`. */
  readonly dielectricF0: number;
  /** Write `_s` specular maps. */
  readonly specular: boolean;
  /** Write `_n` normal maps. */
  readonly normal: boolean;
  /** Emit AO into `_n` blue. */
  readonly writeAo: boolean;
  /** Emit a POM height map into `_n` alpha. */
  readonly writeHeight: boolean;
  /** Multiplies the recovered relief before it is clamped to 25% block depth. */
  readonly heightScale: number;
  /** Caps the surface slope read out of a normal map, taming degenerate texels. */
  readonly maxSlope: number;
  /** Low-frequency damping in the Poisson solve; suppresses the "patchy" drift. */
  readonly poissonLambda: number;
  /** AO sampling parameters. */
  readonly ao: IAoOptions;
  /** Apply the curated porosity table. When `false`, blue is `0` for non-SSS textures. */
  readonly porosity: boolean;
  /** Only write where the Java albedo already exists, avoiding orphaned maps. */
  readonly requireJavaAlbedo: boolean;
  /** Resolve and report, but write nothing. */
  readonly dryRun: boolean;
}

/** Default resolution assumed when a scalar MER has no albedo to size against. */
const FALLBACK_SIZE = 256;

/** Materialise a MER layer, whether it is a file or an inline scalar triple. */
async function loadMer(source: LayerSource, width: number, height: number): Promise<IRaster> {
  if (source.kind === "file") return loadRaster(source.path);
  return uniformRaster(width, height, [source.rgb[0], source.rgb[1], source.rgb[2], 0]);
}

/**
 * Build the height field backing a `_n` map.
 *
 * An authored heightmap always wins; otherwise the field is integrated from the normal.
 */
function buildHeightField(
  normal: IRaster,
  heightmap: IRaster | null,
  options: Pick<IConvertOptions, "maxSlope" | "poissonLambda">,
): Float64Array {
  if (heightmap) {
    return heightmapToField(resampleNearest(heightmap, normal.width, normal.height));
  }
  return integrateHeight(
    normalToGradients(normal, options.maxSlope),
    normal.width,
    normal.height,
    options.poissonLambda,
  );
}

/** Which Java names a Bedrock texture should be written as. */
async function targetJavaNames(
  bedrockName: string,
  options: IConvertOptions,
): Promise<readonly string[]> {
  const candidates = bedrockToJava(bedrockName);
  if (!options.requireJavaAlbedo) return candidates;

  const checked = await Promise.all(
    candidates.map(async (name) => ({
      name,
      exists: await fileExists(path.join(options.javaDir, `${name}.png`)),
    })),
  );
  return checked.filter((entry) => entry.exists).map((entry) => entry.name);
}

/**
 * Convert one resolved texture set.
 *
 * @param set - Output of `readTextureSet`.
 * @param options - Run configuration.
 * @returns A report describing what was written and what needs human review.
 */
export async function convertTextureSet(
  set: IResolvedTextureSet,
  options: IConvertOptions,
): Promise<ITextureReport> {
  const warnings: string[] = [];
  const javaNames = await targetJavaNames(set.name, options);

  const rule = resolveMetalRule(set.name);
  const threshold = resolveMetalThreshold(rule);
  const target = resolveMetalTarget(rule);
  const thresholdByte = threshold * 255;

  const albedo = set.color ? await loadRaster(set.color).catch(() => null) : null;
  if (set.color && !albedo) warnings.push(`could not decode albedo ${set.color}`);

  const merRaster = set.mer
    ? await loadMer(set.mer, albedo?.width ?? FALLBACK_SIZE, albedo?.height ?? FALLBACK_SIZE)
    : null;

  const metalFraction = merRaster && target !== "dielectric" ? metalCoverage(merRaster, thresholdByte) : 0;
  const metalValue = merRaster ? resolveMetalByte(target, options.dielectricF0) : null;

  const alignedAlbedo =
    albedo && merRaster ? resampleNearest(albedo, merRaster.width, merRaster.height) : null;
  const colorMatch =
    merRaster && metalFraction > 0 ? buildColorMatch(alignedAlbedo, merRaster, thresholdByte) : null;

  const wroteSpecular =
    options.specular && merRaster !== null
      ? await writeSpecular(set, merRaster, javaNames, { rule: target, threshold }, options)
      : false;
  if (options.specular && !merRaster) warnings.push("no MER(S) layer; skipped _s");

  const wroteNormal = options.normal ? await writeNormal(set, javaNames, options, warnings) : false;

  return {
    bedrockName: set.name,
    javaNames,
    metalFraction,
    threshold,
    metalValue: target === "dielectric" ? null : metalValue,
    ruleNote: rule?.note ?? null,
    colorMatch,
    disagrees: detectDisagreement(target === "dielectric" ? null : metalValue, colorMatch),
    wroteSpecular,
    wroteNormal,
    warnings,
  };
}

/** Fraction of pixels at or above the metalness threshold. */
function metalCoverage(mer: IRaster, thresholdByte: number): number {
  const count = mer.width * mer.height;
  let metal = 0;
  for (let index = 0; index < count; index += 1) {
    if ((mer.data[index * 4] ?? 0) >= thresholdByte) metal += 1;
  }
  return count === 0 ? 0 : metal / count;
}

/** Green byte written for metal pixels under a given target. */
function resolveMetalByte(
  target: ReturnType<typeof resolveMetalTarget>,
  dielectricF0: number,
): number {
  if (target === "dielectric") return dielectricF0;
  if (target === "albedo") return 255;
  return target;
}

/** Encode and write the `_s` map for every Java name this texture feeds. */
async function writeSpecular(
  set: IResolvedTextureSet,
  mer: IRaster,
  javaNames: readonly string[],
  metal: { rule: ReturnType<typeof resolveMetalTarget>; threshold: number },
  options: IConvertOptions,
): Promise<boolean> {
  if (javaNames.length === 0) return false;

  const specular = encodeSpecular(mer, {
    metalThreshold: metal.threshold,
    metalTarget: metal.rule,
    dielectricF0: options.dielectricF0,
    porosity: options.porosity ? resolvePorosity(set.name) : 0,
    hasSubsurface: set.hasSubsurface,
  });

  if (options.dryRun) return true;

  await mkdir(options.outDir, { recursive: true });
  await Promise.all(
    javaNames.map((name) => writePng(path.join(options.outDir, `${name}_s.png`), specular)),
  );
  return true;
}

/** Encode and write the `_n` map for every Java name this texture feeds. */
async function writeNormal(
  set: IResolvedTextureSet,
  javaNames: readonly string[],
  options: IConvertOptions,
  warnings: string[],
): Promise<boolean> {
  if (javaNames.length === 0 || (!set.normal && !set.heightmap)) return false;

  const heightmap = set.heightmap ? await loadRaster(set.heightmap).catch(() => null) : null;
  if (set.heightmap && !heightmap) warnings.push(`could not decode heightmap ${set.heightmap}`);

  // Bedrock allows `heightmap` in place of `normal`; three glazed terracotta sets do that.
  const normal = set.normal ? await loadRaster(set.normal) : heightmap && heightmapToNormal(heightmap);
  if (!normal) {
    warnings.push("no normal or heightmap; skipped _n");
    return false;
  }
  if (!set.normal) warnings.push("no normal map; synthesised one from the heightmap");

  if (!isPowerOfTwo(normal.width) || !isPowerOfTwo(normal.height)) {
    warnings.push(`normal ${normal.width}x${normal.height} is not power-of-two; skipped _n`);
    return false;
  }

  const encoded = encodeNormal(normal, buildHeightField(normal, heightmap, options), {
    ao: options.ao,
    writeAo: options.writeAo,
    writeHeight: options.writeHeight,
    heightScale: options.heightScale,
  });

  if (options.dryRun) return true;

  await mkdir(options.outDir, { recursive: true });
  await Promise.all(
    javaNames.map((name) => writePng(path.join(options.outDir, `${name}_n.png`), encoded)),
  );
  return true;
}

/** Baseline options; the CLI overlays flags on top of these. */
export const DEFAULT_CONVERT_OPTIONS: Omit<IConvertOptions, "javaDir" | "outDir"> = {
  dielectricF0: DEFAULT_DIELECTRIC_F0,
  specular: true,
  normal: true,
  writeAo: true,
  writeHeight: true,
  heightScale: 1,
  maxSlope: DEFAULT_MAX_SLOPE,
  poissonLambda: DEFAULT_POISSON_LAMBDA,
  ao: DEFAULT_AO_OPTIONS,
  porosity: true,
  requireJavaAlbedo: true,
  dryRun: true,
};
