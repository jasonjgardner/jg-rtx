import path from 'path';
import fs from 'fs/promises';
import { globby } from 'globby';
import AdmZip from 'adm-zip';
import prompts from 'prompts';
import sharp from 'sharp';
import { randomUUID as nodeRandomUUID } from 'crypto';
import minimist from 'minimist';

// Root paths
const CWD = process.cwd();
const SRC_RP = path.resolve(CWD, 'bedrock/pack/RP');
const SRC_BLOCKS = path.join(SRC_RP, 'textures', 'blocks');
const SRC_TEXTURES = path.join(SRC_RP, 'textures');

// Memory tier mapping for subpack resolutions (higher number = higher memory)
const SUBPACK_MEMORY_TIER: Record<number, number> = {
  256: 6,
  128: 4,
  64: 2,
  32: 0,
};

// --- CLI helpers for CI mode ---
function boolFromArgEnv(argVal: any, envVal: any, def: boolean): boolean {
  if (typeof argVal === 'boolean') return argVal;
  if (typeof argVal === 'string') return ['1','true','yes','on'].includes(argVal.toLowerCase());
  if (typeof envVal === 'string') return ['1','true','yes','on'].includes(envVal.toLowerCase());
  if (typeof envVal === 'boolean') return envVal;
  return def;
}

function strFromArgEnv(argVal: any, envVal: any, def: string): string {
  if (typeof argVal === 'string' && argVal.length) return argVal;
  if (typeof envVal === 'string' && envVal.length) return envVal;
  return def;
}

function numListFromCSV(argVal: any, envVal: any, def: number[]): number[] {
  const pick = typeof argVal === 'string' ? argVal : (typeof envVal === 'string' ? envVal : null);
  if (!pick) return def;
  return pick.split(',').map((s: string) => parseInt(s.trim(), 10)).filter((n: any) => Number.isFinite(n));
}

function strListFromCSV(argVal: any, envVal: any, def: string[]): string[] {
  const pick = typeof argVal === 'string' ? argVal : (typeof envVal === 'string' ? envVal : null);
  if (!pick) return def;
  return pick.split(',').map((s: string) => s.trim()).filter(Boolean);
}

async function optionsFromArgs(): Promise<BuildOptions & { nameRTX: string; nameVV: string; }> {
  const argv = minimist(process.argv.slice(2));
  const ciMode = !!argv.ci || (process.env.CI === 'true');

  // Load default base name from manifest
  let defaultName = 'Resource Pack';
  try {
    const mRaw = await fs.readFile(path.join(SRC_RP, 'manifest.json'), 'utf-8');
    const m = JSON.parse(mRaw);
    defaultName = m?.header?.name || defaultName;
  } catch {}

  const buildsStr = strListFromCSV(argv.builds, process.env.BEDROCK_BUILDS, ['RTX','VV']);
  const builds = buildsStr
    .map(s => s.toUpperCase())
    .filter(s => s === 'RTX' || s === 'VV') as Variant[];

  const includeSubpacks = boolFromArgEnv(argv['include-subpacks'], process.env.BEDROCK_INCLUDE_SUBPACKS, true);
  const subpackRes = numListFromCSV(argv['subpack-res'], process.env.BEDROCK_SUBPACK_RES, [128,64,32]);
  const outBase = strFromArgEnv(argv['out-base'], process.env.BEDROCK_OUT_BASE, 'dist');
  const zipPacks = boolFromArgEnv(argv['zip-packs'], process.env.BEDROCK_ZIP_PACKS, true);
  const rewriteManifest = boolFromArgEnv(argv['rewrite-manifest'], process.env.BEDROCK_REWRITE_MANIFEST, true);
  const updateCapabilities = boolFromArgEnv(argv['update-capabilities'], process.env.BEDROCK_UPDATE_CAPABILITIES, true);
  const newUUIDs = boolFromArgEnv(argv['new-uuids'], process.env.BEDROCK_NEW_UUIDS, true);
  const fallbackMERSForRTX = boolFromArgEnv(argv['fallback-mers-for-rtx'], process.env.BEDROCK_FALLBACK_MERS_FOR_RTX, true);
  const fallbackMERForVV = boolFromArgEnv(argv['fallback-mer-for-vv'], process.env.BEDROCK_FALLBACK_MER_FOR_VV, true);
  const minifyJSON = boolFromArgEnv(argv['minify-json'], process.env.BEDROCK_MINIFY_JSON, true);
  const dryRun = boolFromArgEnv(argv['dry-run'], process.env.BEDROCK_DRY_RUN, ciMode ? false : true);

  const nameRTX = strFromArgEnv(argv['name-rtx'], process.env.BEDROCK_NAME_RTX, `${defaultName} (RTX)`);
  const nameVV  = strFromArgEnv(argv['name-vv'],  process.env.BEDROCK_NAME_VV,  `${defaultName} (Vibrant Visuals)`);

  return {
    builds,
    outBase,
    zipPacks,
    rewriteManifest,
    updateCapabilities,
    newUUIDs,
    fallbackMERSForRTX,
    fallbackMERForVV,
    processScope: 'allTextures', // unused; scope is decided per variant later
    minifyJSON,
    dryRun,
    includeSubpacks,
    subpackRes,
    nameRTX,
    nameVV,
  };
}

// Utilities
async function exists(p: string): Promise<boolean> {
  try { await fs.stat(p); return true; } catch { return false; }
}

// Downscale all textures in-place for a standalone pack at a given resolution
async function downscaleTexturesInPlace(destRP: string, res: number, dryRun: boolean) {
  const texRoot = path.join(destRP, 'textures');
  if (!await exists(texRoot)) {
    console.warn(`[${res}x] No textures/ directory found in ${destRP}; skipping downscale.`);
    return;
  }
  const pngFiles = await globby(['**/*.png'], { cwd: texRoot });
  const tgaFiles = await globby(['**/*.tga'], { cwd: texRoot });
  if (tgaFiles.length) {
    console.warn(`[${res}x] Skipping ${tgaFiles.length} .tga files (sharp cannot read TGA). Consider converting to PNG in source.`);
  }
  if (dryRun) {
    console.log(`[standalone ${res}x][dry-run] Would resize ${pngFiles.length} PNG textures in-place.`);
    return;
  }
  let done = 0; let failed = 0;
  for (const rel of pngFiles) {
    const src = path.join(texRoot, rel);
    try {
      const meta = await sharp(src).metadata();
      const w = meta.width ?? 256; const h = meta.height ?? 256;
      const factor = res / 256;
      const targetW = Math.max(1, Math.round(w * factor));
      const targetH = Math.max(1, Math.round(h * factor));
      // Important: do not write to the same file that sharp reads from
      // Write to a temporary file in the same directory, then rename.
      const tmp = `${src}.tmp`;
      try { await fs.rm(tmp, { force: true }); } catch {}
      await sharp(src)
        .resize(targetW, targetH, { kernel: sharp.kernel.nearest })
        .png()
        .toFile(tmp);
      await fs.rename(tmp, src);
      done++;
    } catch (e) {
      failed++;
      console.warn(`[standalone ${res}x] Failed to resize ${rel}: ${e}`);
      // Cleanup tmp if present
      try { await fs.rm(`${src}.tmp`, { force: true }); } catch {}
    }
  }
  console.log(`[standalone ${res}x] Resized ${done} textures${failed ? `, failed ${failed}` : ''}.`);
}

// Build subpacks by downscaling textures to specified resolutions
async function buildSubpacks(
  destRP: string,
  opts: BuildOptions,
  override?: { resolutions?: number[]; include256?: boolean }
) {
  // If override is provided, allow generation regardless of opts.includeSubpacks
  if (!override && !opts.includeSubpacks) return;

  let resList = override?.resolutions ? [...override.resolutions] : [...(opts.subpackRes ?? [])];
  const add256 = override ? (override.include256 === true) : true;
  if (add256) resList.push(256);
  const uniqueRes = Array.from(new Set(resList))
    .filter(n => typeof n === 'number' && n > 0)
    .sort((a, b) => b - a);
  if (!uniqueRes.length) return;

  const texRoot = path.join(destRP, 'textures');
  const hasTextures = await exists(texRoot);
  if (!hasTextures) {
    console.warn(`[subpacks] No textures/ directory found in ${destRP}; skipping subpack generation.`);
    return;
  }

  const pngFiles = await globby(['**/*.png'], { cwd: texRoot });
  const tgaFiles = await globby(['**/*.tga'], { cwd: texRoot });
  if (tgaFiles.length) {
    console.warn(`[subpacks] Skipping ${tgaFiles.length} .tga files (sharp cannot read TGA). Consider converting to PNG in source.`);
  }

  for (const res of uniqueRes) {
    const folder = `${res}x`;
    const spRoot = path.join(destRP, 'subpacks', folder, 'textures');
    if (opts.dryRun) {
      const action = res === 256 ? 'copy' : 'resize';
      console.log(`[subpacks][dry-run] Would ${action} ${pngFiles.length} PNG textures into subpack '${folder}'.`);
      continue;
    }

    let done = 0; let failed = 0;
    for (const rel of pngFiles) {
      const src = path.join(texRoot, rel);
      const out = path.join(spRoot, rel);
      try {
        await fs.mkdir(path.dirname(out), { recursive: true });
        if (res === 256) {
          // Copy as-is for baseline subpack to avoid unnecessary re-encoding
          await fs.copyFile(src, out);
        } else {
          // Compute scale relative to 256 base while preserving aspect ratio
          const meta = await sharp(src).metadata();
          const w = meta.width ?? 256; const h = meta.height ?? 256;
          const factor = res / 256;
          const targetW = Math.max(1, Math.round(w * factor));
          const targetH = Math.max(1, Math.round(h * factor));
          await sharp(src)
            .resize(targetW, targetH, { kernel: sharp.kernel.nearest })
            .png()
            .toFile(out);
        }
        done++;
      } catch (e) {
        failed++;
        const op = res === 256 ? 'copy' : `resize to ${res}x`;
        console.warn(`[subpacks] Failed to ${op} ${rel}: ${e}`);
      }
    }
    const verb = res === 256 ? 'copied' : 'resized';
    console.log(`[subpacks] '${folder}': ${verb} ${done} textures${failed ? `, failed ${failed}` : ''}.`);
  }
}

function joinNoExt(dir: string, baseNoExt: string, ext: string) {
  return path.join(dir, `${baseNoExt}.${ext}`);
}

async function findAnyExt(dir: string, baseNoExt: string, exts: string[]): Promise<{ exists: boolean; ext?: string; }> {
  for (const ext of exts) {
    const p = joinNoExt(dir, baseNoExt, ext);
    if (await exists(p)) return { exists: true, ext };
  }
  return { exists: false };
}

function toJSON(obj: any, minified: boolean) {
  return minified ? JSON.stringify(obj) : JSON.stringify(obj, null, 2);
}

type Variant = 'RTX' | 'VV';

type BuildOptions = {
  builds: Variant[];
  outBase: string;
  zipPacks: boolean;
  rewriteManifest: boolean;
  updateCapabilities: boolean;
  newUUIDs: boolean;
  fallbackMERSForRTX: boolean;
  fallbackMERForVV: boolean;
  processScope: 'blocksOnly' | 'allTextures';
  minifyJSON: boolean;
  dryRun: boolean;
  includeSubpacks: boolean;
  subpackRes: number[]; // e.g., [128,64,32]
};

async function promptOptions(): Promise<BuildOptions & { nameRTX: string; nameVV: string; }> {
  // Read current manifest for default names
  const manifestPath = path.join(SRC_RP, 'manifest.json');
  const manifestRaw = await fs.readFile(manifestPath, 'utf-8').catch(() => '{}');
  let manifest: any = {};
  try { manifest = JSON.parse(manifestRaw); } catch {}
  const defaultName = manifest?.header?.name ?? 'Resource Pack';

  const ans = await prompts([
    {
      type: 'multiselect',
      name: 'builds',
      message: 'Which builds do you want to create?',
      choices: [
        { title: 'RTX (Ray Traced)', value: 'RTX', selected: true },
        { title: 'Vibrant Visuals (Deferred Rendering)', value: 'VV', selected: true },
      ],
      min: 1,
    },
    {
      type: 'toggle',
      name: 'includeSubpacks',
      message: 'Include subpacks with downscaled textures (128x, 64x, 32x)?',
      initial: true,
      active: 'yes',
      inactive: 'no',
    },
    {
      type: (prev: any, values: any) => values.includeSubpacks ? 'multiselect' : null,
      name: 'subpackRes',
      message: 'Choose subpack resolutions (relative to 256x base)',
      choices: [
        { title: '128x', value: 128, selected: true },
        { title: '64x', value: 64, selected: true },
        { title: '32x', value: 32, selected: true },
      ],
      min: 1,
    },
    {
      type: 'text',
      name: 'outBase',
      message: 'Output base directory',
      initial: 'dist',
    },
    {
      type: 'toggle',
      name: 'zipPacks',
      message: 'Create .mcpack zip for each build?',
      initial: true,
      active: 'yes',
      inactive: 'no',
    },
    {
      type: 'toggle',
      name: 'rewriteManifest',
      message: 'Rewrite manifest.json (names/capabilities) in builds?',
      initial: true,
      active: 'yes',
      inactive: 'no',
    },
    {
      type: (prev: any, values: any) => values.rewriteManifest ? 'text' : null,
      name: 'nameRTX',
      message: 'RTX pack display name',
      initial: `${defaultName} (RTX)`,
    },
    {
      type: (prev: any, values: any) => values.rewriteManifest ? 'text' : null,
      name: 'nameVV',
      message: 'Vibrant Visuals pack display name',
      initial: `${defaultName} (Vibrant Visuals)`,
    },
    {
      type: 'toggle',
      name: 'updateCapabilities',
      message: 'Adjust capabilities (RTX: raytraced, VV: pbr)?',
      initial: true,
      active: 'yes',
      inactive: 'no',
    },
    {
      type: 'toggle',
      name: 'newUUIDs',
      message: 'Generate new UUIDs per build (so both can be installed side-by-side)?',
      initial: true,
      active: 'yes',
      inactive: 'no',
    },
    {
      type: 'toggle',
      name: 'fallbackMERSForRTX',
      message: 'If _mer is missing but _mers exists, use _mers for RTX MER (alpha ignored)?',
      initial: true,
      active: 'yes',
      inactive: 'no',
    },
    {
      type: 'toggle',
      name: 'fallbackMERForVV',
      message: 'If _mers is missing, fall back to MER in VV build?',
      initial: true,
      active: 'yes',
      inactive: 'no',
    },
    {
      type: 'select',
      name: 'processScope',
      message: 'Where to rewrite texture_set.json?',
      choices: [
        { title: 'Blocks only (textures/blocks/**)', value: 'blocksOnly' },
        { title: 'All textures (textures/**)', value: 'allTextures' },
      ],
      initial: 0,
    },
    {
      type: 'toggle',
      name: 'minifyJSON',
      message: 'Minify JSON output?',
      initial: true,
      active: 'min',
      inactive: 'pretty',
    },
    {
      type: 'toggle',
      name: 'dryRun',
      message: 'Dry-run first (no file writes)?',
      initial: true,
      active: 'yes',
      inactive: 'no',
    },
  ], {
    onCancel: () => {
      console.error('Cancelled.');
      process.exit(1);
    }
  });

  return ans as any;
}

async function copyDir(src: string, dest: string) {
  try {
    // Prefer fs.cp if available
    // @ts-ignore
    if (typeof (fs as any).cp === 'function') {
      // @ts-ignore
      await (fs as any).cp(src, dest, { recursive: true });
      return;
    }
  } catch {}

  const files = await globby(['**/*'], { cwd: src, dot: true });
  for (const rel of files) {
    const from = path.join(src, rel);
    const to = path.join(dest, rel);
    const stat = await fs.stat(from);
    if (stat.isDirectory()) {
      await fs.mkdir(to, { recursive: true });
    } else {
      await fs.mkdir(path.dirname(to), { recursive: true });
      await fs.copyFile(from, to);
    }
  }
}

function randomUUID(): string {
  // Prefer crypto.randomUUID when available in runtime, otherwise Node's
  try { return (globalThis as any).crypto?.randomUUID?.() ?? nodeRandomUUID(); } catch { /* noop */ }
  // Fallback poor-man UUID v4
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

type TexInfo = {
  dirRel: string;     // relative to textures/ (or blocks/ when scanning blocks-only)
  base: string;       // base name without extension
  hasNormal: boolean;
  hasHeightmap: boolean;
  hasMER: boolean;
  hasMERS: boolean;
  merExt?: string;
  mersExt?: string;
};

async function scanTextures(scope: 'blocksOnly' | 'allTextures'): Promise<TexInfo[]> {
  const root = scope === 'blocksOnly' ? SRC_BLOCKS : SRC_TEXTURES;
  const colorFiles = await globby(['**/*.{png,tga}'], {
    cwd: root,
    ignore: [
      '**/*_normal.*',
      '**/*_heightmap.*',
      '**/*_mer.*',
      '**/*_mers.*',
      '**/*.texture_set.json',
    ],
  });

  // For referencing JSON, extension is omitted. For conversions, prefer PNG when available.
  const preferProbe = ['png', 'tga'];
  const alsoProbe = ['tga', 'png'];
  const res: TexInfo[] = [];
  for (const rel of colorFiles) {
    const dirRel = path.dirname(rel);
    const base = path.basename(rel).replace(/\.(png|tga)$/i, '');
    const dirAbs = path.join(root, dirRel);

    const normalProbe = await findAnyExt(dirAbs, `${base}_normal`, alsoProbe);
    const heightProbe = await findAnyExt(dirAbs, `${base}_heightmap`, alsoProbe);
    const merProbe = await findAnyExt(dirAbs, `${base}_mer`, alsoProbe);
    const mersProbe = await findAnyExt(dirAbs, `${base}_mers`, preferProbe);

    res.push({
      dirRel,
      base,
      hasNormal: !!normalProbe.exists,
      hasHeightmap: !!heightProbe.exists,
      hasMER: !!merProbe.exists,
      hasMERS: !!mersProbe.exists,
      merExt: merProbe.ext,
      mersExt: mersProbe.ext,
    });
  }
  return res;
}

function buildTextureSetRecord(variant: Variant, t: TexInfo, opts: BuildOptions) {
  const format_version = variant === 'RTX' ? '1.16.100' : '1.21.30';
  const body: Record<string, any> = { color: t.base };

  // Normal vs heightmap: prefer normal by default
  if (t.hasNormal && !t.hasHeightmap) body.normal = `${t.base}_normal`;
  else if (t.hasHeightmap && !t.hasNormal) body.heightmap = `${t.base}_heightmap`;
  else if (t.hasNormal && t.hasHeightmap) {
    // Prefer normal, warn
    body.normal = `${t.base}_normal`;
  }

  if (variant === 'RTX') {
    if (t.hasMER) body.metalness_emissive_roughness = `${t.base}_mer`;
  } else {
    if (t.hasMERS) body.metalness_emissive_roughness_subsurface = `${t.base}_mers`;
    else if (t.hasMER && opts.fallbackMERForVV) body.metalness_emissive_roughness = `${t.base}_mer`;
  }

  return { format_version, 'minecraft:texture_set': body };
}

async function writeTextureSetJSON(destRP: string, t: TexInfo, baseSubdir: string, jsonStr: string) {
  const dir = path.join(destRP, baseSubdir, t.dirRel);
  await fs.mkdir(dir, { recursive: true });
  const outPath = path.join(dir, `${t.base}.texture_set.json`);
  await fs.writeFile(outPath, jsonStr, 'utf-8');
}

async function convertMERS2MER(destRP: string, baseSubdir: string, t: TexInfo): Promise<{ ok: boolean; src?: string; out?: string; error?: any; }> {
  const srcDir = path.join(destRP, baseSubdir, t.dirRel);
  // Prefer PNG for reading; Sharp does not support TGA input.
  const candidateExts = ['png', 'tga'];
  let src: string | null = null;
  let pickedExt: string | null = null;
  for (const ext of candidateExts) {
    const p = path.join(srcDir, `${t.base}_mers.${ext}`);
    if (await exists(p)) { src = p; pickedExt = ext; break; }
  }
  if (!src) return { ok: false, error: new Error('No _mers source found') };
  if (pickedExt === 'tga') {
    return { ok: false, src, error: new Error('TGA _mers conversion is not supported (sharp cannot read TGA). Provide a PNG _mers instead.') };
  }

  const out = path.join(srcDir, `${t.base}_mer.png`);
  try {
    // Remove alpha channel entirely to ensure compatibility with MER expectations
    await sharp(src).removeAlpha().png().toFile(out);
    return { ok: true, src, out };
  } catch (error) {
    return { ok: false, src, out, error };
  }
}

async function updateManifest(
  destRP: string,
  variant: Variant,
  opts: BuildOptions & { nameRTX: string; nameVV: string; },
  overrides?: { subpackRes?: number[]; include256?: boolean }
) {
  const manifestPath = path.join(destRP, 'manifest.json');
  const raw = await fs.readFile(manifestPath, 'utf-8').catch(() => '{}');
  let m: any = {};
  try { m = JSON.parse(raw); } catch {}

  // Do not early-return; individual sections below are gated by options.

  // Update name
  if (!m.header) m.header = {};
  if (opts.rewriteManifest) {
    m.header.name = variant === 'RTX' ? opts.nameRTX : opts.nameVV;
  }

  if (opts.updateCapabilities) {
    // RTX: raytraced, VV: pbr
    m.capabilities = Array.isArray(m.capabilities) ? m.capabilities : [];
    if (variant === 'RTX') {
      m.capabilities = ['raytraced'];
    } else {
      m.capabilities = ['pbr'];
    }
  }

  if (opts.newUUIDs) {
    // New header uuid and each module uuid
    if (!m.header) m.header = {};
    m.header.uuid = randomUUID();
    if (Array.isArray(m.modules)) {
      m.modules = m.modules.map((mod: any) => ({ ...mod, uuid: randomUUID() }));
    }
  }

  // Subpacks entries
  if (overrides && overrides.subpackRes !== undefined) {
    const list = [...overrides.subpackRes];
    if (overrides.include256) list.push(256);
    const uniq = Array.from(new Set(list)).filter((n: number) => typeof n === 'number' && n > 0).sort((a, b) => b - a);
    if (uniq.length) {
      m.subpacks = uniq.map((r: number) => ({ folder_name: `${r}x`, name: `${r}x`, memory_tier: SUBPACK_MEMORY_TIER[r] ?? 0 }));
    } else {
      // Explicitly remove subpacks when override list is empty
      delete m.subpacks;
    }
  } else if (opts.includeSubpacks) {
    const uniqueRes = Array.from(new Set([...(opts.subpackRes ?? []), 256]))
      .filter((n: number) => typeof n === 'number' && n > 0)
      .sort((a: number, b: number) => b - a);
    m.subpacks = uniqueRes.map((r: number) => ({ folder_name: `${r}x`, name: `${r}x`, memory_tier: SUBPACK_MEMORY_TIER[r] ?? 0 }));
  } else {
    delete m.subpacks;
  }

  await fs.writeFile(manifestPath, toJSON(m, opts.minifyJSON), 'utf-8');
}

async function zipPack(folder: string, outFile: string) {
  const zip = new AdmZip();
  zip.addLocalFolder(folder);
  zip.writeZip(outFile);
}

function zipLabel(variant: Variant, opts: Partial<BuildOptions> & { nameRTX?: string; nameVV?: string; }) {
  const raw = variant === 'VV' ? opts.nameVV : opts.nameRTX;
  if (typeof raw === 'string' && raw.trim().length) {
    return raw
      .replace(/\s*\(Vibrant Visuals\)\s*$/i, ' VV')
      .replace(/\s*\(RTX\)\s*$/i, ' RTX')
      .trim();
  }
  // Fallback label
  return variant === 'VV' ? 'JG RTX VV' : 'JG RTX RTX';
}

async function buildVariant(variant: Variant, opts: BuildOptions & { nameRTX: string; nameVV: string; }) {
  const outBaseAbs = path.resolve(CWD, opts.outBase);
  const destBase = path.join(outBaseAbs, variant === 'RTX' ? 'RP-RTX' : 'RP-VV');

  // Prepare baseline working folder (will be reused for variants)
  if (!opts.dryRun) {
    await fs.rm(destBase, { recursive: true, force: true }).catch(() => {});
    await fs.mkdir(destBase, { recursive: true });
    await copyDir(SRC_RP, destBase);
  }

  // Determine scope: VV -> all textures, RTX -> blocks only
  const scope: 'blocksOnly' | 'allTextures' = variant === 'VV' ? 'allTextures' : 'blocksOnly';
  const baseSubdir = scope === 'blocksOnly' ? path.join('textures', 'blocks') : 'textures';
  const items = await scanTextures(scope);

  let count = 0; let warnMER = 0; let warnMERS = 0; let bothNM = 0;
  for (const t of items) {
    // Verbose warnings for normal/heightmap conflict
    if (t.hasNormal && t.hasHeightmap) {
      bothNM++;
      console.warn(`[${variant}] Both normal and heightmap present for textures/${t.dirRel}/${t.base}.*; using normal.`);
    }

    // RTX: ensure MER exists; convert from MERS if allowed
    if (variant === 'RTX') {
      if (!t.hasMER) {
        if (t.hasMERS && opts.fallbackMERSForRTX) {
          if (!opts.dryRun) {
            const conv = await convertMERS2MER(destBase, baseSubdir, t);
            if (conv.ok) {
              console.log(`[RTX] Converted ${path.relative(destBase, conv.src!)} -> ${path.relative(destBase, conv.out!)}`);
              t.hasMER = true; t.merExt = 'png';
            } else {
              warnMER++;
              console.warn(`[RTX] Failed to convert _mers -> _mer for textures/${t.dirRel}/${t.base}: ${conv.error}`);
            }
          } else {
            console.log(`[RTX][dry-run] Would convert textures/${t.dirRel}/${t.base}_mers -> ${t.base}_mer.png`);
            // Assume success in dry-run
            t.hasMER = true; t.merExt = 'png';
          }
        } else {
          warnMER++;
          console.warn(`[RTX] Missing both _mer and convertible _mers for textures/${t.dirRel}/${t.base}`);
        }
      }
    } else {
      // VV warnings when neither _mers nor _mer exists
      if (!t.hasMERS && !t.hasMER) {
        warnMERS++;
        console.warn(`[VV] Missing both _mers and _mer for textures/${t.dirRel}/${t.base}`);
      } else if (!t.hasMERS && t.hasMER && opts.fallbackMERForVV) {
        console.log(`[VV] Falling back to MER for textures/${t.dirRel}/${t.base}`);
      }
    }

    // Build texture set JSON now that conversions are handled
    const rec = buildTextureSetRecord(variant, t, opts);
    const s = rec['minecraft:texture_set'] as any;

    // If RTX conversion failed but _mers exists, last-resort reference _mers to avoid a missing map
    if (variant === 'RTX' && !t.hasMER && t.hasMERS) {
      s.metalness_emissive_roughness = `${t.base}_mers`;
      console.warn(`[RTX] Referencing _mers in texture_set due to missing _mer for textures/${t.dirRel}/${t.base}`);
    }

    const jsonStr = toJSON(rec, opts.minifyJSON);
    if (!opts.dryRun) {
      await writeTextureSetJSON(destBase, t, baseSubdir, jsonStr);
    }
    count++;
  }

  console.log(`\n[${variant}] Generated ${count} texture_set.json files in ${scope === 'blocksOnly' ? 'textures/blocks/' : 'textures/'} `);
  if (variant === 'RTX') {
    if (warnMER) console.warn(`[${variant}] Warning: ${warnMER} items lacked a valid MER.`);
  } else {
    if (warnMERS) console.warn(`[${variant}] Warning: ${warnMERS} items lacked both MERS and MER.`);
  }
  if (bothNM) console.warn(`[${variant}] Warning: ${bothNM} items had both normal and heightmap. Normal chosen.`);

  const label = zipLabel(variant, opts);

  // 1) Baseline 256x pack (no subpacks)
  if (opts.dryRun) {
    console.log(`[build][dry-run] Would create baseline folder: ${destBase}`);
    console.log(`[manifest][dry-run] Would write manifest without subpacks for baseline.`);
    console.log(`[zip][dry-run] Would write: ${path.join(outBaseAbs, `${label} 256x.mcpack`)} `);
  } else {
    await updateManifest(destBase, variant, opts, { subpackRes: [] });
    if (opts.zipPacks) {
      const zipPath = path.join(outBaseAbs, `${label} 256x.mcpack`);
      await zipPack(destBase, zipPath);
      console.log(`[${variant}] Wrote ${zipPath}`);
    }
  }

  // 2) Pack with 128x-32x subpacks (no 256x subpack)
  if ((opts.subpackRes?.length ?? 0) > 0) {
    const destSP = path.join(outBaseAbs, (variant === 'RTX' ? 'RP-RTX-SP' : 'RP-VV-SP'));
    const list = [...(opts.subpackRes || [])].filter(r => r !== 256).sort((a, b) => b - a);
    if (opts.dryRun) {
      console.log(`[build][dry-run] Would create subpack folder: ${destSP}`);
      console.log(`[subpacks][dry-run] Would generate subpacks: ${list.join(', ')}x`);
      console.log(`[manifest][dry-run] Would write manifest with subpacks: ${list.map(r => `${r}x(tier:${SUBPACK_MEMORY_TIER[r] ?? 0})`).join(', ')}`);
      console.log(`[zip][dry-run] Would write: ${path.join(outBaseAbs, `${label} Subpacks.mcpack`)} `);
    } else {
      await fs.rm(destSP, { recursive: true, force: true }).catch(() => {});
      await fs.mkdir(destSP, { recursive: true });
      await copyDir(destBase, destSP);
      await updateManifest(destSP, variant, opts, { subpackRes: list, include256: false });
      await buildSubpacks(destSP, opts, { resolutions: list, include256: false });
      if (opts.zipPacks) {
        const zipPath = path.join(outBaseAbs, `${label} Subpacks.mcpack`);
        await zipPack(destSP, zipPath);
        console.log(`[${variant}] Wrote ${zipPath}`);
      }
    }
  }

  // 3) Standalone smaller-size packs (no subpacks): 128x/64x/32x
  for (const r of (opts.subpackRes || [])) {
    if (r === 256) continue;
    const destR = path.join(outBaseAbs, `${variant === 'RTX' ? 'RP-RTX' : 'RP-VV'}-${r}x`);
    if (opts.dryRun) {
      console.log(`[build][dry-run] Would create standalone ${r}x folder: ${destR}`);
      console.log(`[textures][dry-run] Would downscale all textures in-place to ${r}x`);
      console.log(`[manifest][dry-run] Would write manifest with no subpacks`);
      console.log(`[zip][dry-run] Would write: ${path.join(outBaseAbs, `${label} ${r}x.mcpack`)} `);
      continue;
    }
    await fs.rm(destR, { recursive: true, force: true }).catch(() => {});
    await fs.mkdir(destR, { recursive: true });
    await copyDir(destBase, destR);
    await downscaleTexturesInPlace(destR, r, opts.dryRun);
    await updateManifest(destR, variant, opts, { subpackRes: [] });
    if (opts.zipPacks) {
      const zipPath = path.join(outBaseAbs, `${label} ${r}x.mcpack`);
      await zipPack(destR, zipPath);
      console.log(`[${variant}] Wrote ${zipPath}`);
    }
  }
}

async function main() {
  if (!await exists(SRC_RP)) {
    console.error(`Source pack not found at ${SRC_RP}`);
    process.exit(1);
  }

  const ciMode = process.env.CI === 'true' || process.argv.includes('--ci');
  const opts = ciMode ? await optionsFromArgs() : await promptOptions();

  console.log(`\nSource: ${SRC_RP}`);
  console.log(`Scope: RTX=blocksOnly, VV=allTextures (auto)`);
  console.log(`Builds: ${opts.builds.join(', ')}`);
  console.log(`Output: ${path.resolve(CWD, opts.outBase)}`);
  console.log(opts.dryRun ? '\n-- DRY RUN --\n' : '\n-- BUILDING --\n');

  for (const b of opts.builds as Variant[]) {
    await buildVariant(b, opts);
  }

  if (opts.dryRun) {
    console.log('\nDry run complete. Re-run and disable dry-run to write files.');
  } else {
    console.log('\nDone.');
  }
}

main().catch(err => { console.error(err); process.exit(1); });
