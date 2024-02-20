import sharp from "sharp";
import { mkdir, readdir } from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";

const ROOT_DIR = resolve(import.meta.dirname, "../../../");
const TEXTURES_DIR = join(ROOT_DIR, "bedrock/pack/RP/textures/blocks");
const DIST_DIR = join(ROOT_DIR, "build");
const SIZES: number[] = [64, 128, 256];

const files = await readdir(TEXTURES_DIR, { recursive: true });

for (const size of SIZES) {
  const dir = join(DIST_DIR, `${size}x`, "textures/blocks");
  await mkdir(dir, { recursive: true });

  for (const file of files) {
    if (file.endsWith(".tga")) {
      console.log(`Skipping ${file}`);
      continue;
    }

    const subdir = dirname(file.replace(TEXTURES_DIR, ""));

    if (subdir !== "") {
      await mkdir(join(dir, subdir), { recursive: true });
    }

    const dest = Bun.file(join(dir, subdir, basename(file)));
    const src = Bun.file(join(TEXTURES_DIR, file));

    if (file.endsWith(".json")) {
      await Bun.write(dest, src);
      continue;
    }

    if (file.endsWith(".png")) {
      const buffer = await sharp(await src.arrayBuffer()).resize(size, null)
        .toBuffer();

      await Bun.write(dest, buffer);
      continue;
    }
  }
}
