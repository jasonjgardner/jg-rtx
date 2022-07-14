import {
	basename,
	common,
	dirname,
	join,
} from "https://deno.land/std@0.122.0/path/mod.ts";
import { normalize } from "https://deno.land/std@0.147.0/path/posix.ts";

import JSON5 from "https://deno.land/x/json5/mod.ts";
import getFiles from "https://deno.land/x/getfiles/mod.ts";
import {
	encodeHexColor,
	encodeRGBColor,
	isValidHexNumber,
	readJson,
} from "./lib.ts";

// Generate textures_list.json from texture references found in .texture_set.json files
// Will also generate Mineways output in the process

const extensions = ["tga", "png", "jpg", "jpeg"] as const;
const TEXTURE_SET_EXT = ".texture_set.json";
const MINEWAYS_OUTPUT_EXT = "png";
const BASE_PATH = join(Deno.cwd(), "bedrock", Deno.args[0] ?? "RP");
const MINEWAYS_DIR = join(Deno.cwd(), "mineways", "textures");

const files = getFiles({
	root: Deno.cwd(),
	include: [join(BASE_PATH, "textures")],
});

export async function renderTextureSetLayers(name: string) {
	try {
		const { "minecraft:texture_set": textureSet } = await readJson(
			`${name}`,
		);

		for (const key in textureSet) {
			const entry = textureSet[key];

			if (key === "normal" || key === "heightmap") {
				continue;
			}

			const minewaysOutputFile = join(
				MINEWAYS_DIR,
				dirname(name).includes("blocks") ? "blocks/" : "entity/",
				basename(name, TEXTURE_SET_EXT),
			) +
				(key === "metalness_emissive_roughness"
					? `_mer.${MINEWAYS_OUTPUT_EXT}`
					: `.${MINEWAYS_OUTPUT_EXT}`);

			if (entry.toString().charAt(0) === "#") {
				console.log(
					"Generating Mineways texture for %s from HEX value",
					minewaysOutputFile,
				);
				await Deno.writeFile(
					minewaysOutputFile,
					await encodeHexColor(entry),
				);
			}

			if (
				Array.isArray(entry) &&
				entry.every(isValidHexNumber)
			) {
				console.log(
					"Generating Mineways texture for %s from RGB value",
					minewaysOutputFile,
				);
				await Deno.writeFile(
					minewaysOutputFile,
					await encodeRGBColor(entry),
				);
			}
		}
	} catch (err) {
		console.error("Failed reading texture set:\n%s\n > %s", name, err);
	}
}

export async function parseTextureSet(name: string) {
	try {
		const jsonData = await Deno.readTextFile(`${name}`);

		const collection: string[] = [];

		try {
			const { "minecraft:texture_set": textureSet } = JSON5.parse(
				jsonData,
			);

			for (const key in textureSet) {
				const entry = textureSet[key];

				if (Array.isArray(entry) || entry[0] === "#") {
					continue;
				}
				const find = extensions.map((ext) => `${entry}.${ext}`);
				const found = files.filter(({ name }) => find.includes(name));

				const filesFound = found.length;

				if (filesFound < 1) {
					throw Error(`Failed loading texture for entry "${entry}"`);
				}

				if (filesFound > 1) {
					console.warn(
						'Multiple textures found for entry "%s"',
						name,
					);
				}

				const filePath = normalize(
					found[0].path.replace(
						common([BASE_PATH, found[0].path]),
						"",
					),
				);

				collection.push(filePath);
			}
		} catch (err) {
			console.error("Failed reading texture set:\n%s\n > %s", name, err);
		}

		return collection;
	} catch (err) {
		if (err.kind === Deno.errors.NotFound) {
			throw Error(`Texture set does not exist: ${name}`);
		}

		throw Error(`Failed reading texture set JSON file: ${name}`, err);
	}
}

export async function getTexturesList() {
	const texturesList: string[] = [];

	let itr = files.length;

	while (itr--) {
		if (!files[itr].name.endsWith(TEXTURE_SET_EXT)) {
			continue;
		}

		const filesRequired = await parseTextureSet(
			files[itr].realPath,
		);

		if (filesRequired === undefined) {
			console.warn('No file output for entry "%s"', files[itr].name);
			continue;
		}

		texturesList.push(...filesRequired);
	}

	try {
		const requiredTextures = [
			...new Set(
				texturesList.flat().filter((v: string) => v && v.length > 0),
			),
		];

		return requiredTextures;
	} catch (err) {
		console.error(`Failed writing textures list: ${err}`);
	}
}

const texturesListOutput = join(
	BASE_PATH,
	"textures",
	"textures_list.json",
);

await Deno.writeTextFile(
	texturesListOutput,
	JSON.stringify(await getTexturesList()),
);
console.log("Created file: %s", texturesListOutput);
