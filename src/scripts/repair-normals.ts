/**
 * Repair labPBR `_n` maps whose stored XY falls outside the unit disc.
 *
 * labPBR normal maps do not store Z; a shader rebuilds it as
 * `sqrt(1.0 - dot(normal.xy, normal.xy))`. Wherever the stored XY already exceeds unit
 * length that square root goes imaginary, and the texel renders as `NaN`.
 *
 * `mer2labpbr.ts` guarantees clean output for every texture that has a Bedrock source.
 * This script exists for the rest: `_n` maps already sitting in the Java pack with no
 * Bedrock counterpart (Java-only textures, and orphans left by earlier tooling), which
 * a conversion run can never reach.
 *
 * Repair is self-contained, because an `_n` map already carries its own XY in red and
 * green. The blue channel is deliberately *not* trusted as a Z source: in labPBR blue
 * holds ambient occlusion. So XY is projected back inside the disc, Z is derived from
 * it, and the same height and AO pipeline used by the Bedrock path regenerates blue
 * (AO) and alpha (POM height).
 *
 * ```bash
 * bun ./src/scripts/repair-normals.ts                 # dry run, report only
 * bun ./src/scripts/repair-normals.ts --write         # repair in place
 * bun ./src/scripts/repair-normals.ts --write --dir=<path>
 * ```
 */

import { readdir } from "node:fs/promises";
import path from "node:path";
import minimist from "minimist";
import {
  DEFAULT_AO_OPTIONS,
  DEFAULT_MAX_SLOPE,
  DEFAULT_POISSON_LAMBDA,
  integrateHeight,
  isPowerOfTwo,
  normalToGradients,
} from "./labpbr/height";
import { encodeNormal, hasUnreconstructableZ, reconstructNormal } from "./labpbr/normal";
import { loadRaster, writePng, type IRaster } from "./labpbr/raster";

const CWD = process.cwd();
const JAVA_BLOCKS = path.join(CWD, "java", "pack", "assets", "minecraft", "textures", "block");

/** Outcome for a single `_n` map. */
interface IRepairResult {
  readonly file: string;
  readonly status: "repaired" | "clean" | "skipped" | "failed";
  readonly detail?: string;
}

/** AO settings, shared with `mer2labpbr.ts` so repaired maps match converted ones. */
const AO = DEFAULT_AO_OPTIONS;

/** Darkest AO byte the current settings can legitimately emit. */
const AO_FLOOR_BYTE = Math.floor(AO.floor * 255);

/**
 * Decide whether an `_n` map still meets the standard the converter currently emits.
 *
 * Two things disqualify it:
 *
 * 1. **XY outside the unit disc.** `sqrt(1 - dot(n.xy, n.xy))` goes imaginary and the
 *    texel renders as `NaN`.
 * 2. **AO darker than the current floor.** Such a file was baked by an earlier, harsher
 *    AO setting. Checking only for `NaN` would leave those permanently stale, because
 *    once repaired they pass the first test forever -- which is exactly how 112 textures
 *    kept a 91%-occlusion AO after the floor was introduced.
 *
 * @returns A short reason, or `null` when the map is already conformant.
 */
function needsRepair(normal: IRaster): string | null {
  if (hasUnreconstructableZ(normal)) return "XY outside the unit disc";

  let darkest = 255;
  for (let offset = 2; offset < normal.data.length; offset += 4) {
    const value = normal.data[offset] ?? 255;
    if (value < darkest) darkest = value;
  }
  if (darkest < AO_FLOOR_BYTE) return `AO ${darkest} is below the current floor ${AO_FLOOR_BYTE}`;

  return null;
}

/**
 * Repair one `_n` map if it needs it.
 *
 * @param filePath - Absolute path to a `<name>_n.png`.
 * @param write - Actually overwrite the file.
 */
async function repairFile(filePath: string, write: boolean): Promise<IRepairResult> {
  const file = path.basename(filePath);

  const normal = await loadRaster(filePath).catch((error: unknown) => {
    return error instanceof Error ? error : new Error(String(error));
  });
  if (normal instanceof Error) {
    return { file, status: "failed", detail: normal.message };
  }

  const reason = needsRepair(normal);
  if (!reason) return { file, status: "clean" };

  if (!isPowerOfTwo(normal.width) || !isPowerOfTwo(normal.height)) {
    return {
      file,
      status: "skipped",
      detail: `${normal.width}x${normal.height} is not power-of-two; the FFT height solve needs it`,
    };
  }

  const rebuilt = reconstructNormal(normal);
  const field = integrateHeight(
    normalToGradients(rebuilt, DEFAULT_MAX_SLOPE),
    rebuilt.width,
    rebuilt.height,
    DEFAULT_POISSON_LAMBDA,
  );

  const encoded = encodeNormal(rebuilt, field, {
    ao: AO,
    writeAo: true,
    writeHeight: true,
    heightScale: 1,
  });

  if (needsRepair(encoded)) {
    return { file, status: "failed", detail: "still non-conformant after repair" };
  }

  if (!write) return { file, status: "repaired", detail: `${reason} (dry run)` };

  await writePng(filePath, encoded);
  return { file, status: "repaired", detail: reason };
}

async function main(): Promise<void> {
  const argv = minimist(process.argv.slice(2), { boolean: ["write", "help", "verbose"] });

  if (argv.help) {
    process.stdout.write(
      "\nRepair labPBR _n maps whose XY exceeds unit length (shader NaN risk).\n\n" +
        "  --write     Overwrite the files. Omit for a dry run (the default).\n" +
        "  --dir=<p>   Directory of _n maps. Default: java/…/textures/block\n" +
        "  --verbose   List every repaired file.\n\n",
    );
    return;
  }

  const dir = typeof argv.dir === "string" ? path.resolve(argv.dir) : JAVA_BLOCKS;
  const files = (await readdir(dir))
    .filter((entry) => entry.endsWith("_n.png"))
    .toSorted()
    .map((entry) => path.join(dir, entry));

  process.stdout.write(
    `${argv.write ? "REPAIRING" : "DRY RUN"}: scanning ${files.length} _n maps\n  ${dir}\n\n`,
  );

  const results: IRepairResult[] = [];
  for (const file of files) {
    results.push(await repairFile(file, Boolean(argv.write)));
  }

  const repaired = results.filter((r) => r.status === "repaired");
  const skipped = results.filter((r) => r.status === "skipped");
  const failed = results.filter((r) => r.status === "failed");

  if (argv.verbose) {
    repaired.forEach((r) => process.stdout.write(`  repaired  ${r.file}\n`));
  }
  skipped.forEach((r) => process.stdout.write(`  skipped   ${r.file}: ${r.detail}\n`));
  failed.forEach((r) => process.stdout.write(`  FAILED    ${r.file}: ${r.detail}\n`));

  process.stdout.write(
    `\nclean:    ${results.filter((r) => r.status === "clean").length}\n` +
      `repaired: ${repaired.length}\n` +
      `skipped:  ${skipped.length}\n` +
      `failed:   ${failed.length}\n`,
  );

  if (!argv.write && repaired.length > 0) {
    process.stdout.write("\nNothing was written. Re-run with --write.\n");
  }

  if (failed.length > 0) process.exitCode = 1;
}

main().catch((error: unknown) => {
  process.stderr.write(`Fatal: ${error instanceof Error ? error.stack : String(error)}\n`);
  process.exit(1);
});
