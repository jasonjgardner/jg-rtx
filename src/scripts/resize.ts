import sharp from "sharp";
import { readdir, copyFile, mkdir, stat } from "node:fs/promises";
import { dirname, basename } from "node:path";

const resize = async (input: string, output: string, size?: number) => {
    try {
        const img = sharp(input);
        const { width } = await img.metadata() ?? { width: size ?? 256 };
        
        await img.resize(size ?? Math.max(0.5 * width!, 16), null).toFile(output);
    } catch (err) {
        console.error(`File ${input} could not be resized: ${err}`);
    }
};

const resizeImages = async (inputDir: string, outputDir: string, width: number) => {
  const files = await readdir(inputDir);
  for (const file of files) {
    const src = `${inputDir}/${file}`;
    const dest = `${outputDir}/${file}`;

    if ((await stat(src)).isDirectory()) {
        await resizeImages(src, dest, width);
        continue;
    }

    try {
        await mkdir(dirname(dest), { recursive: true });
    } catch (err) {
        console.error(`Directory ${dirname(dest)} could not be created: ${err}`);
    }

    if (!file.endsWith(".png")) {
        // try {
        //     await copyFile(src, dest);
        //     console.log(`📋 COPIED ${basename(src)}`);
        // } catch (err) {
        //     console.error(`File ${basename(src)} could not be copied: ${err}`);
        // }
        continue;
    }

    try {
        await resize(src, dest, width);
        console.log(`📏 RESIZED ${basename(src)}`);
    } catch(err) {
        console.error(`File ${basename(src)} could not be resized: ${err}`);
    }
  }
};

await resizeImages("../../bedrock/pack/RP/textures/blocks", "../../dist/64x", 64);
