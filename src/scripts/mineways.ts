/**
 * Mineways Terrain Generator
 *
 * Downloads ChannelMixer and TileMaker tools, processes textures,
 * and generates terrain PNG files for Mineways USD export.
 *
 * Usage:
 *   bun ./src/scripts/mineways.ts [options]
 *
 * Options:
 *   --sizes=256,128,64    Comma-separated list of tile sizes (default: 256,128,64)
 *   --output=dist/mineways Output directory (default: dist/mineways)
 *   --terrain-name=JG-RTX Base name for terrain files (default: JG-RTX)
 *   --dry-run             Preview operations without writing files
 *   --skip-download       Skip downloading binaries (use existing)
 *   --verbose             Show detailed output
 *   --ci                  CI mode (non-interactive, no dry-run)
 */

import path from "path";
import fs from "fs/promises";
import { spawn } from "child_process";
import { globby } from "globby";
import minimist from "minimist";
import AdmZip from "adm-zip";

// Constants
const CWD = process.cwd();
const CACHE_DIR = path.join(CWD, "node_modules", ".cache", "mineways");
const MINEWAYS_ZIP_URL =
  "https://erich.realtimerendering.com/minecraft/public/mineways/mineways.zip";
const REQUIRED_FILES = [
  "ChannelMixer.exe",
  "TileMaker.exe",
  "terrainBase.png",
] as const;

// Source paths
const SRC_RP = path.resolve(CWD, "bedrock/pack/RP");
const SRC_BLOCKS = path.join(SRC_RP, "textures", "blocks");
const MINEWAYS_TEXTURES = path.join(CWD, "mineways", "textures", "blocks");
const TILES_JSON = path.join(CWD, "mineways", "tiles.json");

// Types
interface TilesMapping {
  [minewaysName: string]: string; // minewaysName -> jgRtxName
}

interface ReversedMapping {
  [jgRtxName: string]: string; // jgRtxName -> minewaysName
}

interface Options {
  sizes: number[];
  output: string;
  terrainName: string;
  dryRun: boolean;
  skipDownload: boolean;
  verbose: boolean;
  ci: boolean;
}

// Utility functions
async function exists(p: string): Promise<boolean> {
  try {
    await fs.stat(p);
    return true;
  } catch {
    return false;
  }
}

function log(message: string, verbose = false): void {
  if (!verbose || process.env.VERBOSE === "true") {
    console.log(message);
  }
}

function logVerbose(opts: Options, message: string): void {
  if (opts.verbose) {
    console.log(`  ${message}`);
  }
}

// CLI argument parsing with validation
function parseArgs(): Options {
  const argv = minimist(process.argv.slice(2));
  const ciMode = !!argv.ci || process.env.CI === "true";

  // Validate sizes (must be powers of 2, between 16 and 2048)
  const sizesRaw = argv.sizes ?? process.env.MINEWAYS_SIZES ?? "256,128,64";
  const sizesArg = typeof sizesRaw === "number" ? String(sizesRaw) : sizesRaw;
  const sizes = sizesArg
    .split(",")
    .map((s: string) => parseInt(s.trim(), 10))
    .filter((n: number) => Number.isFinite(n) && n >= 16 && n <= 2048);

  if (sizes.length === 0) {
    throw new Error("At least one valid size (16-2048) must be specified");
  }

  // Validate output path - prevent path traversal
  const rawOutput = argv.output || process.env.MINEWAYS_OUTPUT || "dist/mineways";
  const output = path.resolve(CWD, rawOutput);
  if (!output.startsWith(CWD)) {
    throw new Error("Output path must be within project directory");
  }

  // Validate terrain name - alphanumeric, underscores, and dashes only
  const terrainName =
    argv["terrain-name"] || process.env.MINEWAYS_TERRAIN_NAME || "JG-RTX";
  if (!/^[a-zA-Z0-9_-]+$/.test(terrainName)) {
    throw new Error(
      "Terrain name must contain only alphanumeric characters, underscores, and dashes"
    );
  }

  return {
    sizes,
    output,
    terrainName,
    dryRun: ciMode ? false : argv["dry-run"] ?? false,
    skipDownload: argv["skip-download"] ?? false,
    verbose: argv.verbose ?? false,
    ci: ciMode,
  };
}

// Download a single file with fetch
async function downloadFile(url: string, dest: string): Promise<void> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to download ${url}: ${response.statusText}`);
  }
  const buffer = await response.arrayBuffer();
  await fs.writeFile(dest, Buffer.from(buffer));
}

// Ensure required binaries are downloaded
async function ensureBinaries(opts: Options): Promise<string> {
  const binDir = CACHE_DIR;

  if (opts.skipDownload) {
    // Check if binaries exist
    for (const file of REQUIRED_FILES) {
      const filePath = path.join(binDir, file);
      if (!(await exists(filePath))) {
        throw new Error(
          `File not found: ${filePath}. Run without --skip-download to fetch binaries.`
        );
      }
    }
    log(`[binaries] Using cached binaries from ${binDir}`);
    return binDir;
  }

  // Check if all required files already exist
  let allExist = true;
  for (const file of REQUIRED_FILES) {
    if (!(await exists(path.join(binDir, file)))) {
      allExist = false;
      break;
    }
  }

  if (allExist) {
    log(`[binaries] All binaries already cached`);
    return binDir;
  }

  await fs.mkdir(binDir, { recursive: true });

  if (opts.dryRun) {
    log(`[binaries][dry-run] Would download ${MINEWAYS_ZIP_URL}`);
    log(`[binaries][dry-run] Would extract to ${binDir}`);
    return binDir;
  }

  // Download mineways.zip
  // Security note: Downloads from official Mineways source maintained by Eric Haines
  // https://www.realtimerendering.com/erich/minecraft/public/mineways/
  const zipPath = path.join(binDir, "mineways.zip");
  log(`[binaries] Downloading mineways.zip from official Mineways source...`);

  try {
    await downloadFile(MINEWAYS_ZIP_URL, zipPath);
    log(`[binaries] Downloaded mineways.zip`);
  } catch (err) {
    throw new Error(`Failed to download mineways.zip: ${err}`);
  }

  // Extract required files
  log(`[binaries] Extracting required files...`);
  try {
    const zip = new AdmZip(zipPath);
    const entries = zip.getEntries();

    for (const entry of entries) {
      const entryName = entry.entryName;
      const fileName = path.basename(entryName);

      // Check if this is a required file
      if (REQUIRED_FILES.includes(fileName as (typeof REQUIRED_FILES)[number])) {
        const destPath = path.join(binDir, fileName);
        zip.extractEntryTo(entry, binDir, false, true);
        logVerbose(opts, `[binaries] Extracted ${fileName}`);
      }
    }

    // Verify extraction
    for (const file of REQUIRED_FILES) {
      const filePath = path.join(binDir, file);
      if (!(await exists(filePath))) {
        throw new Error(`Failed to extract ${file} from mineways.zip`);
      }
    }

    log(`[binaries] Extracted all required files`);

    // Cleanup zip file
    await fs.unlink(zipPath);
  } catch (err) {
    throw new Error(`Failed to extract mineways.zip: ${err}`);
  }

  return binDir;
}

// Load and reverse the tiles.json mapping
async function loadTilesMapping(): Promise<{
  original: TilesMapping;
  reversed: ReversedMapping;
}> {
  if (!(await exists(TILES_JSON))) {
    log(`[mapping] tiles.json not found at ${TILES_JSON}, using empty mapping`);
    return { original: {}, reversed: {} };
  }

  let original: TilesMapping;
  try {
    const content = await fs.readFile(TILES_JSON, "utf-8");
    original = JSON.parse(content);

    // Validate structure
    if (typeof original !== "object" || original === null || Array.isArray(original)) {
      throw new Error("tiles.json must be a JSON object");
    }
  } catch (err) {
    if (err instanceof SyntaxError) {
      throw new Error(`Invalid JSON in tiles.json: ${err.message}`);
    }
    throw err;
  }

  // Reverse the mapping: jgRtxName -> minewaysName
  // Only include entries where the value is non-empty
  const reversed: ReversedMapping = {};
  for (const [minewaysName, jgRtxName] of Object.entries(original)) {
    if (typeof jgRtxName === "string" && jgRtxName.length > 0) {
      reversed[jgRtxName] = minewaysName;
    }
  }

  return { original, reversed };
}

// Get the base name without PBR suffix
function getBaseName(filename: string): {
  base: string;
  suffix: string;
  ext: string;
} {
  const ext = path.extname(filename);
  const nameNoExt = path.basename(filename, ext);

  // Check for PBR suffixes
  const pbrSuffixes = ["_mer", "_mers", "_normal", "_n", "_m", "_e", "_r", "_s"];
  for (const suffix of pbrSuffixes) {
    if (nameNoExt.endsWith(suffix)) {
      return {
        base: nameNoExt.slice(0, -suffix.length),
        suffix,
        ext,
      };
    }
  }

  return { base: nameNoExt, suffix: "", ext };
}

// Copy and rename textures to staging directory
async function stageTextures(
  opts: Options,
  reversed: ReversedMapping
): Promise<string> {
  const stagingDir = path.join(opts.output, "staging", "blocks");

  if (opts.dryRun) {
    log(`[staging][dry-run] Would create staging directory: ${stagingDir}`);
  } else {
    await fs.mkdir(stagingDir, { recursive: true });
  }

  // Collect all source textures
  const sources: Array<{ srcDir: string; priority: number }> = [
    { srcDir: SRC_BLOCKS, priority: 1 }, // Main bedrock textures
    { srcDir: MINEWAYS_TEXTURES, priority: 2 }, // Mineways-specific overrides
  ];

  const processedFiles = new Map<string, string>(); // destName -> srcPath
  let copied = 0;
  let renamed = 0;
  let skipped = 0;

  for (const { srcDir, priority } of sources) {
    if (!(await exists(srcDir))) {
      logVerbose(opts, `[staging] Source directory not found: ${srcDir}`);
      continue;
    }

    const files = await globby(["**/*.png"], { cwd: srcDir });
    logVerbose(opts, `[staging] Found ${files.length} textures in ${srcDir}`);

    for (const relPath of files) {
      const srcPath = path.join(srcDir, relPath);
      const filename = path.basename(relPath);
      const { base, suffix, ext } = getBaseName(filename);

      // Determine destination name
      let destBase = base;
      let wasRenamed = false;

      // Check if this texture needs renaming (JG RTX name -> Mineways name)
      if (reversed[base]) {
        destBase = reversed[base];
        wasRenamed = true;
      }

      const destName = `${destBase}${suffix}${ext}`;
      const destPath = path.join(stagingDir, destName);

      // Skip if already processed by higher priority source
      const existingKey = destName.toLowerCase();
      if (
        processedFiles.has(existingKey) &&
        priority <= sources.find((s) => s.srcDir === srcDir)!.priority
      ) {
        skipped++;
        continue;
      }

      processedFiles.set(existingKey, srcPath);

      if (opts.dryRun) {
        if (wasRenamed) {
          logVerbose(opts, `[staging][dry-run] Would rename: ${base} -> ${destBase}`);
        }
      } else {
        await fs.copyFile(srcPath, destPath);
      }

      if (wasRenamed) {
        renamed++;
      } else {
        copied++;
      }
    }
  }

  log(
    `[staging] Staged ${copied + renamed} textures (${renamed} renamed, ${skipped} skipped)`
  );
  return stagingDir;
}

// Validate executable path is within cache directory
function validateExecutablePath(exe: string): void {
  const resolved = path.resolve(exe);
  if (!resolved.startsWith(CACHE_DIR)) {
    throw new Error(`Security: executable path must be within cache directory: ${exe}`);
  }
  if (/[;&|`$]/.test(exe)) {
    throw new Error(`Security: executable path contains invalid characters: ${exe}`);
  }
}

// Run a Windows executable
async function runExecutable(
  exe: string,
  args: string[],
  opts: Options
): Promise<void> {
  return new Promise((resolve, reject) => {
    const name = path.basename(exe);

    // Validate executable path for security
    validateExecutablePath(exe);

    if (opts.dryRun) {
      log(`[${name}][dry-run] Would run: ${exe} ${args.join(" ")}`);
      resolve();
      return;
    }

    log(`[${name}] Running: ${name} ${args.join(" ")}`);

    // Quote executable path for Windows shell (required for paths with spaces)
    const quotedExe = `"${exe}"`;
    const child = spawn(quotedExe, args, {
      stdio: opts.verbose ? "inherit" : "pipe",
      shell: true, // Required on Windows for .exe execution with quoted paths
    });

    let stdout = "";
    let stderr = "";

    if (!opts.verbose && child.stdout && child.stderr) {
      child.stdout.on("data", (data) => {
        stdout += data.toString();
      });
      child.stderr.on("data", (data) => {
        stderr += data.toString();
      });
    }

    child.on("error", (err) => {
      reject(new Error(`Failed to run ${name}: ${err.message}`));
    });

    child.on("close", (code) => {
      if (code === 0) {
        log(`[${name}] Completed successfully`);
        resolve();
      } else {
        const output = stdout + stderr;
        reject(
          new Error(`${name} exited with code ${code}${output ? `:\n${output}` : ""}`)
        );
      }
    });
  });
}

// Run ChannelMixer to process textures
async function runChannelMixer(
  binDir: string,
  inputDir: string,
  outputDir: string,
  opts: Options
): Promise<void> {
  const channelMixer = path.join(binDir, "ChannelMixer.exe");

  if (!opts.dryRun) {
    await fs.mkdir(outputDir, { recursive: true });
  }

  const args = [
    "-v", // Verbose
    "-m", // Output merged MER format
    "-i",
    `"${inputDir}"`,
    "-o",
    `"${outputDir}"`,
  ];

  await runExecutable(channelMixer, args, opts);
}

// Run TileMaker for a specific size
async function runTileMaker(
  binDir: string,
  inputDir: string,
  outputPath: string,
  size: number,
  opts: Options
): Promise<void> {
  const tileMaker = path.join(binDir, "TileMaker.exe");
  const terrainBase = path.join(binDir, "terrainBase.png");

  const args = [
    "-v", // Verbose
    "-m", // Report missing tiles
    "-i",
    `"${terrainBase}"`,
    "-d",
    `"${inputDir}"`,
    "-o",
    `"${outputPath}"`,
    "-t",
    size.toString(),
  ];

  await runExecutable(tileMaker, args, opts);
}

// Generate terrain files for all sizes
async function generateTerrain(
  binDir: string,
  stagingDir: string,
  opts: Options
): Promise<string[]> {
  const channelMixerOutput = path.join(opts.output, "channelMixer");
  const terrainDir = path.join(opts.output, "terrain");

  if (!opts.dryRun) {
    await fs.mkdir(terrainDir, { recursive: true });
  }

  // Step 1: Run ChannelMixer
  log("\n[Step 1/2] Running ChannelMixer...");
  await runChannelMixer(binDir, stagingDir, channelMixerOutput, opts);

  // Step 2: Run TileMaker for each size
  log("\n[Step 2/2] Running TileMaker...");
  const outputFiles: string[] = [];

  for (const size of opts.sizes) {
    const terrainFile = `terrainExt_${opts.terrainName}${size}.png`;
    const outputPath = path.join(terrainDir, terrainFile);

    log(`\n[TileMaker] Generating ${size}px terrain...`);
    await runTileMaker(binDir, channelMixerOutput, outputPath, size, opts);

    outputFiles.push(outputPath);

    // TileMaker generates PBR files with suffixes
    const pbrSuffixes = ["_n", "_m", "_e", "_r"];
    for (const suffix of pbrSuffixes) {
      const pbrFile = `terrainExt_${opts.terrainName}${size}${suffix}.png`;
      outputFiles.push(path.join(terrainDir, pbrFile));
    }
  }

  return outputFiles;
}

// List generated files
async function listOutputFiles(outputDir: string): Promise<void> {
  const terrainDir = path.join(outputDir, "terrain");
  if (!(await exists(terrainDir))) {
    log("[output] No terrain directory found");
    return;
  }

  const files = await globby(["*.png"], { cwd: terrainDir });
  if (files.length === 0) {
    log("[output] No terrain files generated");
    return;
  }

  log("\n[output] Generated terrain files:");
  for (const file of files.sort()) {
    const filePath = path.join(terrainDir, file);
    try {
      const stats = await fs.stat(filePath);
      const sizeMB = (stats.size / (1024 * 1024)).toFixed(2);
      log(`  ${file} (${sizeMB} MB)`);
    } catch {
      log(`  ${file}`);
    }
  }
}

// Main entry point
async function main(): Promise<void> {
  const opts = parseArgs();

  log("=".repeat(60));
  log("Mineways Terrain Generator");
  log("=".repeat(60));
  log(`\nConfiguration:`);
  log(`  Sizes: ${opts.sizes.join(", ")}px`);
  log(`  Output: ${opts.output}`);
  log(`  Terrain name: ${opts.terrainName}`);
  log(`  Dry run: ${opts.dryRun}`);
  log(`  CI mode: ${opts.ci}`);

  try {
    // Step 1: Ensure binaries are available
    log("\n[Step 1/4] Checking binaries...");
    const binDir = await ensureBinaries(opts);

    // Step 2: Load texture mapping
    log("\n[Step 2/4] Loading texture mapping...");
    const { reversed } = await loadTilesMapping();
    log(`[mapping] Loaded ${Object.keys(reversed).length} texture mappings`);

    // Step 3: Stage textures
    log("\n[Step 3/4] Staging textures...");
    const stagingDir = await stageTextures(opts, reversed);

    // Step 4: Generate terrain
    log("\n[Step 4/4] Generating terrain...");
    await generateTerrain(binDir, stagingDir, opts);

    // Show results
    if (!opts.dryRun) {
      await listOutputFiles(opts.output);
    }

    log("\n" + "=".repeat(60));
    log(opts.dryRun ? "Dry run complete!" : "Terrain generation complete!");
    log("=".repeat(60));
  } catch (err) {
    console.error(`\n[error] ${err}`);
    process.exit(1);
  }
}

main();
