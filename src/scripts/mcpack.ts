import {
	basename,
	common,
	dirname,
	globToRegExp,
	join,
	joinGlobs,
	toFileUrl,
} from "https://deno.land/std@0.147.0/path/mod.ts";
import { ensureDir, walk } from "https://deno.land/std@0.147.0/fs/mod.ts";
import { parse } from "https://deno.land/std@0.147.0/flags/mod.ts";
import { compress } from "https://deno.land/x/zip@v1.2.3/mod.ts";
import { getTexturesList } from "./texturesList.ts";
import { _c } from "https://deno.land/x/json_file_change@v1.0.1/mod.ts";

async function requireFilesInDir(
	dirGlob: string,
	filesGlob = "/*.{png,tga,texture_set.json}",
): Promise<string[]> {
	const files: string[] = [];

	for await (
		const entry of walk(dirGlob, {
			match: [globToRegExp(joinGlobs([dirGlob, filesGlob]))],
		})
	) {
		if (entry.isFile) {
			files.push(entry.path);
		}
	}

	return files;
}

const options = parse(Deno.args);

const DIR_SRC = join(Deno.cwd(), "/bedrock/RP");
const DIR_DIST = join(Deno.cwd(), "/dist/RP");
const DEST = join(DIR_DIST, "JGRTX");

const requiredFiles: Array<string | string[]> = [
	join(DIR_SRC, "manifest.json"),
	join(DIR_SRC, "pack_icon.png"),
	join(DIR_SRC, "splashes.json"),
	join(DIR_SRC, "textures", "terrain_texture.json"), // Any terrain customization should be rendered before requiring this file
	join(DIR_SRC, "texts", "en_US.lang"),
	join(DIR_SRC, "texts", "languages.json"),
	...terrainTextures.flatMap((texturePath) =>
		join(DIR_SRC, `${texturePath}.texture_set.json`)
	),
];

requiredFiles.push(
	...await requireFilesInDir(join(DIR_SRC, "particles"), "/*.json"),
);

if (options.fogs) {
	// TODO: Parse biomes client for required fogs
	requiredFiles.push(
		join(DIR_SRC, "biomes_client.json"),
		join(DIR_SRC, "fogs", "default_fog.json"),
	);
}

if (options.customBlocks !== false) {
	requiredFiles.push(join(DIR_SRC, "blocks.json"));
	requiredFiles.push(
		...await requireFilesInDir(join(DIR_SRC, "textures/blocks/custom")),
	);
}

// if (options.target === "mineways") {
// 	const candlesDir = join(DIR_SRC, "textures/blocks/candles");
// 	requiredFiles.push(...await requireFilesInDir(candlesDir));
// }

// Inherit required files from textures list
// This includes ONLY texture files (no JSON data)

const textures = await getTexturesList();

if (textures) {
	textures.forEach((texturePath: string) => {
		requiredFiles.push(join(DIR_SRC, texturePath));
	});
}

console.group();

requiredFiles.forEach(async (file: string | string[]) => {
	const [src, dest] = Array.isArray(file)
		? [file[0], file[1].replace(DIR_SRC, DIR_DIST)]
		: [file, file.replace(DIR_SRC, DIR_DIST)];

	try {
		await ensureDir(dirname(dest));
		await Deno.copyFile(src, dest);
		console.info("Copied file:\n %s\n ->\t %s", src, dest);
	} catch (err) {
		if (err.code === "ENOENT") {
			console.warn("Missing: %s\n", src);
			return;
		}

		console.error(
			"Failed copy:\n%s\n ->\t %s\n\n---\n\n%s\n",
			src,
			dest,
			err,
		);
	}
});

console.groupEnd();
