import { $, Glob } from "bun";
import { mkdir, rename, stat } from "node:fs/promises";
import path from "node:path";
import posixPath from "node:path/posix";

const cwd = process.cwd();

const bedrockTexturesRoot = path.join(cwd, "bedrock", "pack", "RP", "textures");
const javaTexturesRoot = path.join(cwd, "java", "pack", "assets", "minecraft", "textures");
const sbsarPath = path.join(cwd, "src", "shelf", "Converter.sbsar");
const converterOutputRoot = path.join(cwd, "dist", "converter");

const javaSourceTexturesRoot = process.env.JAVA_SOURCE_TEXTURES_DIR
  ? path.resolve(cwd, process.env.JAVA_SOURCE_TEXTURES_DIR)
  : path.join(cwd, "1.20.4", "assets", "minecraft", "textures");

const bedrockCategoryToJavaCategory: Record<string, string> = {
  blocks: "block",
  items: "item",
  entity: "entity",
  environment: "environment",
  colormap: "colormap",
  painting: "painting",
  particle: "particle",
  ui: "ui",
};

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await stat(filePath);
    return true;
  } catch {
    return false;
  }
}

function isConvertibleBaseTexture(fileRel: string) {
  if (!fileRel.toLowerCase().endsWith(".png")) return false;

  const base = posixPath.basename(fileRel, ".png").toLowerCase();
  if (base.endsWith(".texture_set")) return false;
  if (base.endsWith("_normal")) return false;
  if (base.endsWith("_heightmap")) return false;
  if (base.endsWith("_mer")) return false;
  if (base.endsWith("_mers")) return false;

  return true;
}

function getOutputStem(fileRel: string) {
  return fileRel.replaceAll("\\", "/").replaceAll("/", "__").replace(/\.png$/i, "");
}

function getCategories(fileRel: string) {
  const rel = fileRel.replaceAll("\\", "/");
  const parts = rel.split("/").filter(Boolean);
  const bedrockCategory = parts[0];
  if (!bedrockCategory) return null;

  const javaCategory = bedrockCategoryToJavaCategory[bedrockCategory];
  if (!javaCategory) return null;

  const inner = parts.slice(1).join("/");
  if (!inner) return null;

  return { bedrockCategory, javaCategory, inner };
}

async function convertOneTexture(args: {
  fileRel: string;
  javaSourceAvailable: boolean;
}): Promise<
  | { status: "converted"; javaDest: string }
  | { status: "skipped"; reason: string }
> {
  const { fileRel, javaSourceAvailable } = args;

  const categories = getCategories(fileRel);
  if (!categories) return { status: "skipped", reason: "unsupported category" };

  const { javaCategory, inner } = categories;
  const name = posixPath.basename(inner, ".png");
  const innerDir = posixPath.dirname(inner);
  const innerDirParts = innerDir === "." ? [] : innerDir.split("/").filter(Boolean);

  const baseAbs = path.join(bedrockTexturesRoot, fileRel);
  const baseDirAbs = path.dirname(baseAbs);
  const normalAbs = path.join(baseDirAbs, `${name}_normal.png`);
  const merAbs = path.join(baseDirAbs, `${name}_mer.png`);

  const baseOk = await fileExists(baseAbs);
  if (!baseOk) return { status: "skipped", reason: "missing base texture" };

  const normalOk = await fileExists(normalAbs);
  if (!normalOk) return { status: "skipped", reason: "missing _normal" };

  const merOk = await fileExists(merAbs);
  if (!merOk) return { status: "skipped", reason: "missing _mer" };

  if (javaSourceAvailable) {
    const javaSourceAbs = path.join(javaSourceTexturesRoot, javaCategory, ...innerDirParts, `${name}.png`);
    const srcOk = await fileExists(javaSourceAbs);
    if (!srcOk) return { status: "skipped", reason: "no corresponding Java source texture" };
  }

  const javaDestDirAbs = path.join(javaTexturesRoot, javaCategory, ...innerDirParts);
  const javaColorAbs = path.join(javaDestDirAbs, `${name}.png`);
  const javaSpecAbs = path.join(javaDestDirAbs, `${name}_s.png`);
  const javaNormalAbs = path.join(javaDestDirAbs, `${name}_n.png`);

  const alreadyConverted =
    (await fileExists(javaColorAbs)) || (await fileExists(javaSpecAbs)) || (await fileExists(javaNormalAbs));
  if (alreadyConverted) return { status: "skipped", reason: "Java output already exists" };

  await mkdir(javaDestDirAbs, { recursive: true });

  const outputStem = getOutputStem(fileRel);
  const runOutputDir = path.join(converterOutputRoot, outputStem);
  await mkdir(runOutputDir, { recursive: true });

  try {
    await $`sbsrender.exe --input "${sbsarPath}" render --output-name "${name}_{outputNodeName}" --output-path "${runOutputDir}" --cpu-count 4 --no-report --set-entry base@"${baseAbs}" --set-entry normal@"${normalAbs}" --set-entry mer@"${merAbs}"`;
  } catch {
    return { status: "skipped", reason: "sbsrender failed" };
  }

  const outColorAbs = path.join(runOutputDir, `${name}_color.png`);
  const outSpecAbs = path.join(runOutputDir, `${name}_s.png`);
  const outNormalAbs = path.join(runOutputDir, `${name}_n.png`);

  const outOk = (await fileExists(outColorAbs)) && (await fileExists(outSpecAbs)) && (await fileExists(outNormalAbs));
  if (!outOk) return { status: "skipped", reason: "missing converter outputs" };

  await rename(outColorAbs, javaColorAbs);
  await rename(outSpecAbs, javaSpecAbs);
  await rename(outNormalAbs, javaNormalAbs);

  return { status: "converted", javaDest: javaColorAbs };
}

async function main() {
  const bedrockOk = await fileExists(bedrockTexturesRoot);
  if (!bedrockOk) {
    console.error(`Missing Bedrock textures directory: ${bedrockTexturesRoot}`);
    process.exit(1);
  }

  const javaOk = await fileExists(javaTexturesRoot);
  if (!javaOk) {
    console.error(`Missing Java textures directory: ${javaTexturesRoot}`);
    process.exit(1);
  }

  const converterOk = await fileExists(sbsarPath);
  if (!converterOk) {
    console.error(`Missing Converter.sbsar: ${sbsarPath}`);
    process.exit(1);
  }

  await mkdir(converterOutputRoot, { recursive: true });

  const javaSourceAvailable = await fileExists(javaSourceTexturesRoot);
  if (!javaSourceAvailable) {
    console.warn(`JAVA_SOURCE_TEXTURES_DIR not found; skipping Java source matching: ${javaSourceTexturesRoot}`);
  }

  const glob = new Glob("**/*.png");

  let converted = 0;
  let skipped = 0;

  for await (const fileRelRaw of glob.scan(bedrockTexturesRoot)) {
    const fileRel = fileRelRaw.replaceAll("\\", "/");
    if (!isConvertibleBaseTexture(fileRel)) continue;

    const res = await convertOneTexture({ fileRel, javaSourceAvailable });
    if (res.status === "converted") {
      converted++;
      console.log(`[convert] ${fileRel} -> ${path.relative(cwd, res.javaDest)}`);
      continue;
    }

    skipped++;
    console.log(`[skip] ${fileRel}: ${res.reason}`);
  }

  console.log(`Done. Converted ${converted}. Skipped ${skipped}.`);
}

try {
  await main();
} catch (err) {
  console.error(err);
  process.exit(1);
}