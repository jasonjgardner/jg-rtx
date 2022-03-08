import { join, toFileUrl } from "https://deno.land/std@0.122.0/path/mod.ts";
import { ensureDir } from "https://deno.land/std@0.122.0/fs/mod.ts";
import { Image } from "https://deno.land/x/imagescript/mod.ts";

const DIR_ATLAS = join(Deno.cwd(), "src", "atlases");

export async function getFlipbookFrames() {
  const files: { [key: string]: string[] } = {};
  for await (const dirEntry of Deno.readDir(DIR_ATLAS)) {
    if (!dirEntry.isDirectory) {
      continue;
    }

    if (!files.hasOwnProperty(dirEntry.name) || !Array.isArray(dirEntry.name)) {
      files[dirEntry.name] = [];
    }

    for await (const fileEntry of Deno.readDir(
      join(DIR_ATLAS, dirEntry.name)
    )) {
      if (fileEntry.isFile) {
        files[dirEntry.name].push(fileEntry.name);
      }
    }
  }

  return files;
}

export async function makeAtlases() {
  const size = 256;
  const atlasGroups = await getFlipbookFrames();

  for (const key in atlasGroups) {
    const group = [...atlasGroups[key]].filter((name: string) =>
      name.endsWith(".png")
    );
    let len = group.length;

    if (len < 2) {
      console.warn("Skipping %s", key);
      continue;
    }

    if (len > 25) {
      group.length = 25;
      len = 25;
      console.warn("Truncating group %s", key);
    }

    const atlasOutput = new Image(size, size * len);
    const groupDir = join(DIR_ATLAS, key);

    for (let itr = 0; itr < len; itr++) {
      if (group[itr] === undefined) {
        continue;
      }

      const filepath = join(groupDir, group[itr]);

      const res = await fetch(toFileUrl(filepath).href);

      atlasOutput.composite(
        (await Image.decode(new Uint8Array(await res.arrayBuffer()))).resize(
          256,
          256
        ),
        0,
        itr * size
      );
    }

    const outputDir = join(groupDir, "dist")

    await ensureDir(outputDir);

    await Deno.writeFile(
      join(outputDir, `${key}.png`),
      await atlasOutput.encode(0)
    );
  }
}
