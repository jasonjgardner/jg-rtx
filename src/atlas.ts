import { join, toFileUrl } from "https://deno.land/std@0.122.0/path/mod.ts";
import { ensureDir } from "https://deno.land/std@0.122.0/fs/mod.ts";
import { Image } from "https://deno.land/x/imagescript/mod.ts";

const DIR_ATLAS = join(Deno.cwd(), "src", "atlases");
const DIR_FLIPBOOKS = join(DIR_ATLAS, "flipbooks");
const DIR_PARTICLES = join(DIR_ATLAS, "particles");

export async function getAtlasImages(dir: string) {
  const files: { [key: string]: string[] } = {};
  for await (const dirEntry of Deno.readDir(dir)) {
    if (!dirEntry.isDirectory) {
      continue;
    }

    if (!files.hasOwnProperty(dirEntry.name) || !Array.isArray(dirEntry.name)) {
      files[dirEntry.name] = [];
    }

    for await (const fileEntry of Deno.readDir(
      join(dir, dirEntry.name)
    )) {
      if (fileEntry.isFile) {
        files[dirEntry.name].push(fileEntry.name);
      }
    }
  }

  return files;
}

/**
 * Stitch together atlas textures
 * @param {string} [parentDir] Parent directory path
 * @param {boolean} [ltr=false] Make atlas left-to-right layout
 * @param {number} [size=256] Texture size
 */
export async function makeAtlases(
  parentDir?: string,
  ltr: boolean = false,
  size: number = 256
): Promise<void> {
  const atlasGroups = await getAtlasImages(parentDir ?? DIR_ATLAS)

  for (const key in atlasGroups) {
    const group = [...atlasGroups[key]].filter((name: string) =>
      name.endsWith(".png")
    );
    let len = group.length;

    if (len < 2) {
      console.warn("Skipping %s", key);
      continue;
    }

    // FIXME: Truncating frames does not make correctly-sized canvas
    if (len > 25) {
      group.length = 25;
      len = 25;
      console.warn("Truncating group %s", key);
    }

    const atlasOutput = ltr ? new Image(size * len, size) : new Image(size, size * len);
    const groupDir = join(parentDir ?? DIR_ATLAS, key);

    for (let itr = 0; itr < len; itr++) {
      if (group[itr] === undefined) {
        continue;
      }

      const filepath = join(groupDir, group[itr]);

      const res = await fetch(toFileUrl(filepath).href);

      const offset = itr * size;

      atlasOutput.composite(
        (await Image.decode(new Uint8Array(await res.arrayBuffer()))).resize(
          size,
          size
        ),
        ltr ? offset : 0,
        ltr ? 0 : offset
      );
    }

    const outputDir = join(groupDir, "dist");

    await ensureDir(outputDir);

    await Deno.writeFile(
      join(outputDir, `${key}.png`),
      await atlasOutput.encode(0)
    );
  }
}

export async function makeFlipbooks() {
  await makeAtlases(DIR_FLIPBOOKS, false);
}

export async function makeParticles() {
  await makeAtlases(DIR_PARTICLES, true);
}
