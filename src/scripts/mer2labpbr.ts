/**
 * Convert Bedrock MER(S) + normal textures into Java Edition labPBR `_s` and `_n` maps.
 *
 * ```bash
 * bun ./src/scripts/mer2labpbr.ts                       # dry run over the whole pack
 * bun ./src/scripts/mer2labpbr.ts --write               # actually write files
 * bun ./src/scripts/mer2labpbr.ts --filter=copper --write
 * bun ./src/scripts/mer2labpbr.ts --write --report=dist/labpbr-report.json
 * ```
 *
 * Writing is opt-in: without `--write` the converter resolves, encodes and reports, but
 * touches nothing.
 */

import { mkdir, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import minimist from "minimist";
import { MAX_DIELECTRIC_F0 } from "./labpbr/metals";
import {
  convertTextureSet,
  DEFAULT_CONVERT_OPTIONS,
  type IConvertOptions,
} from "./labpbr/pipeline";
import { summarise, type ITextureReport } from "./labpbr/report";
import { readTextureSet } from "./labpbr/textureSet";

const CWD = process.cwd();
const BEDROCK_BLOCKS = path.join(CWD, "bedrock", "pack", "RP", "textures", "blocks");
const JAVA_BLOCKS = path.join(CWD, "java", "pack", "assets", "minecraft", "textures", "block");

/** How many texture sets to process at once. */
const DEFAULT_CONCURRENCY = 8;

function printHelp(): void {
  process.stdout.write(`
Bedrock MER(S) -> Java labPBR converter

Usage: bun ./src/scripts/mer2labpbr.ts [options]

  --write                  Write files. Omit for a dry run (the default).
  --filter=<substring>     Only process texture sets whose Bedrock name contains this.
  --limit=<n>              Stop after n texture sets. Useful with --filter.
  --only=<s|n>             Emit only _s or only _n. Default: both.

  --dielectric-f0=<0..${MAX_DIELECTRIC_F0}>   Green channel for non-metal pixels. Default: 10 (4% F0).
  --no-porosity            Write blue=0 instead of the curated porosity table.
  --no-ao                  Write blue=255 (no occlusion) into _n.
  --no-height              Write alpha=255 (no POM depth) into _n.
  --height-scale=<f>       Scale the recovered relief before clamping. Default: 1.
  --max-slope=<f>          Cap the slope read from a normal map. Default: 4.
  --poisson-lambda=<f>     Damp low-frequency drift in the height solve (fixes "patchy"
                           foliage). 0 = classic Frankot-Chellappa. Default: 0.012.
  --ao-radius=<texels>     AO march distance. Default: 8.
  --ao-strength=<f>        AO strength. Default: 0.25. Higher bakes in more occlusion;
                           on noisy textures (grass, dirt) that reads as splotchy.
  --ao-floor=<0..1>        Minimum visibility. Default: 0.8 (darkening capped at 20%).

  --all                    Also write textures that have no Java albedo yet.
  --out=<dir>              Write somewhere other than the Java block directory.
  --report=<path.json>     Write the full per-texture report.
  --concurrency=<n>        Default: ${DEFAULT_CONCURRENCY}.
  --help

Source: ${BEDROCK_BLOCKS}
Target: ${JAVA_BLOCKS}
`);
}

/** Read a numeric flag, falling back when absent or unparseable. */
function numberFlag(raw: unknown, fallback: number): number {
  const value = Number(raw);
  if (!Number.isFinite(value)) return fallback;
  return value;
}

/** Run `worker` over `items` with at most `limit` in flight. */
async function pooled<T, R>(
  items: readonly T[],
  limit: number,
  worker: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let cursor = 0;

  const runners = Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, async () => {
    for (;;) {
      const index = cursor;
      cursor += 1;
      if (index >= items.length) return;
      results[index] = await worker(items[index] as T, index);
    }
  });

  await Promise.all(runners);
  return results;
}

/** Format a report line for the console. */
function describe(report: ITextureReport): string {
  const targets = report.javaNames.join(", ") || "(no java target)";
  const outputs = [report.wroteSpecular ? "_s" : null, report.wroteNormal ? "_n" : null]
    .filter(Boolean)
    .join("+");
  const metal =
    report.metalValue === null
      ? "dielectric"
      : `G=${report.metalValue} @${(report.metalFraction * 100).toFixed(1)}%`;
  return `${report.bedrockName} -> ${targets} [${outputs || "nothing"}] ${metal}`;
}

async function main(): Promise<void> {
  const argv = minimist(process.argv.slice(2), {
    boolean: ["write", "all", "help", "no-ao", "no-height", "no-porosity"],
  });

  if (argv.help) {
    printHelp();
    return;
  }

  const only = typeof argv.only === "string" ? argv.only : null;
  const options: IConvertOptions = {
    ...DEFAULT_CONVERT_OPTIONS,
    javaDir: JAVA_BLOCKS,
    outDir: typeof argv.out === "string" ? path.resolve(argv.out) : JAVA_BLOCKS,
    dryRun: !argv.write,
    dielectricF0: numberFlag(argv["dielectric-f0"], DEFAULT_CONVERT_OPTIONS.dielectricF0),
    specular: only !== "n",
    normal: only !== "s",
    writeAo: !argv["no-ao"],
    writeHeight: !argv["no-height"],
    porosity: !argv["no-porosity"],
    heightScale: numberFlag(argv["height-scale"], 1),
    maxSlope: numberFlag(argv["max-slope"], DEFAULT_CONVERT_OPTIONS.maxSlope),
    poissonLambda: numberFlag(argv["poisson-lambda"], DEFAULT_CONVERT_OPTIONS.poissonLambda),
    ao: {
      directions: DEFAULT_CONVERT_OPTIONS.ao.directions,
      radius: numberFlag(argv["ao-radius"], DEFAULT_CONVERT_OPTIONS.ao.radius),
      strength: numberFlag(argv["ao-strength"], DEFAULT_CONVERT_OPTIONS.ao.strength),
      floor: numberFlag(argv["ao-floor"], DEFAULT_CONVERT_OPTIONS.ao.floor),
    },
    requireJavaAlbedo: !argv.all,
  };

  const filter = typeof argv.filter === "string" ? argv.filter.toLowerCase() : null;
  const limit = numberFlag(argv.limit, Number.POSITIVE_INFINITY);

  const all = (await readdir(BEDROCK_BLOCKS))
    .filter((entry) => entry.endsWith(".texture_set.json"))
    .toSorted()
    .map((entry) => path.join(BEDROCK_BLOCKS, entry));

  const selected = all
    .filter((file) => !filter || path.basename(file).toLowerCase().includes(filter))
    .slice(0, limit);

  process.stdout.write(
    `${options.dryRun ? "DRY RUN" : "WRITING"}: ${selected.length} of ${all.length} texture sets\n` +
      `  out: ${options.outDir}\n` +
      `  _s: ${options.specular} | _n: ${options.normal} (ao=${options.writeAo}, height=${options.writeHeight})\n` +
      `  dielectric F0: ${options.dielectricF0} | porosity table: ${options.porosity}\n\n`,
  );

  const failures: { file: string; error: string }[] = [];
  const settled = await pooled(selected, numberFlag(argv.concurrency, DEFAULT_CONCURRENCY), async (file) => {
    try {
      return await convertTextureSet(await readTextureSet(file), options);
    } catch (error) {
      failures.push({
        file: path.basename(file),
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
  });

  const reports = settled.filter((report): report is ITextureReport => report !== null);
  const summary = summarise(reports, failures.length);

  if (argv.verbose) {
    reports.filter((r) => r.wroteSpecular || r.wroteNormal).forEach((r) => process.stdout.write(`  ${describe(r)}\n`));
  }

  reports
    .flatMap((report) => report.warnings.map((warning) => `${report.bedrockName}: ${warning}`))
    .forEach((line) => process.stdout.write(`  warn  ${line}\n`));

  failures.forEach((failure) => process.stdout.write(`  ERROR ${failure.file}: ${failure.error}\n`));

  process.stdout.write(
    `\nConverted ${summary.converted} (skipped ${summary.skipped}, failed ${summary.failed})\n` +
      `  _s written: ${summary.specularWritten}\n` +
      `  _n written: ${summary.normalWritten}\n`,
  );

  if (summary.disagreements.length > 0) {
    process.stdout.write(
      `\n${summary.disagreements.length} texture(s) where the curated metal disagrees with the albedo:\n`,
    );
    summary.disagreements.forEach((report) => {
      process.stdout.write(
        `  ${report.bedrockName}: table says G=${report.metalValue}, ` +
          `pixels look like ${report.colorMatch?.presetName} ` +
          `(confidence ${report.colorMatch?.confidence})\n`,
      );
    });
  }

  process.stdout.write(
    `\n${summary.fallbacks.length} metal texture(s) fell back to G=255 (albedo as F0).\n` +
      `  These reproduce Bedrock exactly. Add a rule to labpbr/materials.ts to promote any of them.\n`,
  );

  if (typeof argv.report === "string") {
    await mkdir(path.dirname(argv.report), { recursive: true });
    await writeFile(argv.report, JSON.stringify({ reports, failures }, null, 2));
    process.stdout.write(`\nReport written to ${argv.report}\n`);
  }

  if (options.dryRun) {
    process.stdout.write("\nNothing was written. Re-run with --write.\n");
  }

  if (failures.length > 0) process.exitCode = 1;
}

main().catch((error: unknown) => {
  process.stderr.write(`Fatal: ${error instanceof Error ? error.stack : String(error)}\n`);
  process.exit(1);
});
