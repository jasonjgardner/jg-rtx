import {
  basename,
  dirname,
  join,
} from "https://deno.land/std@0.122.0/path/mod.ts";
import { Image } from "https://deno.land/x/imagescript/mod.ts";
import JSON5 from "https://deno.land/x/json5/mod.ts";
import getFiles from "https://deno.land/x/getfiles/mod.ts";

const TEXTURE_SIZE = 256;
const TEXTURE_SET_EXT = ".texture_set.json";
const BASE_PATH = "RP/textures";
const MINEWAYS_DIR = "./mineways/textures/";
const MINEWAYS_OUTPUT_EXT = "png";

/**
 * Create images for solid HEX colors in texture sets
 * @param layerValue Texture set layer value
 * @returns Promise<Uint8Array>
 */
const encodeHexColor = async (layerValue: string) => {
  const [r, g, b] =
    (`${layerValue}`.substring(3).match(/[A-Za-z0-9]{2}/g) ?? [])
      .map((v) => parseInt(v, 16));
  const alpha = `${layerValue}`.substring(1, 2).toLowerCase();

  const minewaysOutput = new Image(TEXTURE_SIZE, TEXTURE_SIZE);

  minewaysOutput.fill(
    alpha === "ff"
      ? Image.rgbToColor(r, g, b)
      : Image.rgbaToColor(r, g, b, parseInt(alpha, 16)),
  );

  return await minewaysOutput.encode(0);
};

/**
 * Create images for solid RGB colors in texture sets
 * @param {number[]} layerValue Texture set layer value
 * @returns Promise<Uint8Array>
 */
const encodeRGBColor = async (layerValue: number[]) => {
  const [r, g, b, alpha] = layerValue;
  const minewaysOutput = new Image(TEXTURE_SIZE, TEXTURE_SIZE);

  minewaysOutput.fill(
    alpha !== undefined
      ? Image.rgbaToColor(r, g, b, alpha)
      : Image.rgbToColor(r, g, b),
  );

  return await minewaysOutput.encode(0);
};

const files = getFiles({
  root: ".",
  include: [BASE_PATH],
});

const parseTextureSet = async (name: string) => {
  try {
    const { "minecraft:texture_set": textureSet } = JSON5.parse(
      await Deno.readTextFile(`${name}`),
    );

    const keys = Object.keys(textureSet);

    if (keys.length > 3) {
      keys.length = 3;
    }

    return await Promise.all(keys.map(async (key) => {
      const entry = textureSet[key];

      if (key !== "normal" && key !== "heightmap") {
        const minewaysOutputFile = join(
          MINEWAYS_DIR,
          dirname(name).includes("blocks") ? "blocks/" : "entity/",
          basename(name, TEXTURE_SET_EXT),
        ) +
          (key === "metalness_emissive_roughness"
            ? `_mer.${MINEWAYS_OUTPUT_EXT}`
            : `.${MINEWAYS_OUTPUT_EXT}`);

        if (entry.toString().charAt(0) === "#") {
          await Deno.writeFile(minewaysOutputFile, await encodeHexColor(entry));
          return "";
        }

        if (
          Array.isArray(entry) &&
          entry.every((v) => typeof v === "number" && v >= 0 && v <= 255)
        ) {
          await Deno.writeFile(minewaysOutputFile, await encodeRGBColor(entry));
          return "";
        }
      }

      const find = ["tga", "png", "jpg", "jpeg"].map((ext) =>
        `${entry}.${ext}`
      );
      const found = files.filter(({ name }) => find.includes(name));

      const filesFound = found.length;

      if (filesFound < 1) {
        throw Error(`Failed loading texture for entry "${entry}"`);
      }

      if (filesFound > 1) {
        console.warn('Multiple textures found for entry "%s"', name);
      }

      return found[0].path;
    }));
  } catch (err) {
    console.error("Failed reading texture set: %s %s", name, err);
  }
};

const texturesList: string[] = [];

await Promise.all(files.map(async ({ name, realPath }) => {
  if (!name.endsWith(TEXTURE_SET_EXT)) {
    return;
  }

  const filesRequired = await parseTextureSet(realPath);

  if (filesRequired === undefined) {
    console.warn('No file output for entry "%s"', name);
    return;
  }

  texturesList.push(...filesRequired);
}));

const requiredTextures = [...new Set(texturesList.flat().filter((v) => v && v.length > 0))];

await Deno.writeTextFile(
  "RP/textures/textures_list.json",
  JSON.stringify(requiredTextures),
);
