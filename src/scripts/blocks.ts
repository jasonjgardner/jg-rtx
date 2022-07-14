import { join } from "https://deno.land/std@0.147.0/path/mod.ts";
import { readJson } from "./lib.ts";
import { parseTextureSet } from "./texturesList.ts";

type TexturePositions =
	| "up"
	| "down"
	| "side"
	| "north"
	| "south"
	| "east"
	| "west";

type BlocksData = {
	carried_textures?: string;
	isotropic?: boolean | { [k: string]: boolean };
	sound?: string;
	textures?: string | string[] | {
		[k: string]: string | string[];
	};
};

const DIR_SRC = join(Deno.cwd(), "/bedrock/RP");
const DIR_DIST = join(Deno.cwd(), "/dist/RP");

async function getBlocksData(): Promise<BlocksData[]> {
	const blocksPath = join(Deno.cwd(), "src", "vanilla", "blocks.json");
	try {
		const data = await readJson(blocksPath);
		data.format_version = undefined;
		delete data.format_version;

		return data;
	} catch (err) {
		if (err.code === "ENOENT") {
			console.warn(
				"Can not find local copy of blocks.json in %s",
				blocksPath,
			);
		} else {
			console.error("Can not read blocks.json data:\n%s", err);
		}
	}

	// Fallback to fetch
	try {
		const res = await fetch(
			"https://raw.githubusercontent.com/MicrosoftDocs/minecraft-creator/main/creator/Reference/Source/VanillaResourcePack/blocks.json",
		);
		const data = await res.json();
		data.format_version = undefined;
		delete data.format_version;

		return data;
	} catch (err) {
		console.error("Failed fetching remote blocks.json:\n%s", err);
	}

	throw Error("Can not retrieve blocks.json");
}

async function getRequiredTextures(blocks: string[]) {
	// Get texture from terrain textures
	const requiredSets = blocks.map((textureId) =>
		join(
			DIR_SRC,
			"textures",
			"blocks",
			`${textureId}.texture_set.json`,
		)
	);

	return Promise.allSettled(
		requiredSets.map(async (textureSet) =>
			await parseTextureSet(textureSet)
		),
	);
}

async function getTerrainTextures() {
	// Get all the terrain textures
	const data = await readJson(
		join(Deno.cwd(), "src", "vanilla", "terrain_texture.json"),
	);
	const { texture_data } = data;

	const terrainTextures = Object.keys(texture_data).flatMap((texture) =>
		texture_data[texture]
	);

	return terrainTextures;
}

const vanillaBlocks: BlocksData[] = await getBlocksData();
const vanillaTerrain = await readJson(
	join(Deno.cwd(), "src", "vanilla", "terrain_texture.json"),
);

const customTerrain = await readJson(
	join(Deno.cwd(), "bedrock", "RP", "textures", "terrain_texture.json"),
);

const customBlocks = await readJson(
	join(Deno.cwd(), "bedrock", "RP", "blocks.json"),
);

const terrain = {
	...vanillaTerrain.texture_data,
	...customTerrain.texture_data,
};

const blocks = {
	...vanillaBlocks,
	...customBlocks,
};

for (const blockId in blocks) {
	const block = blocks[blockId];
	let textures = block.textures;

	if (typeof block.textures === "string") {
		textures = [`${block.textures}`];
	} else if (block.textures && !Array.isArray(block.textures)) {
		textures = Object.values(block.textures).flat();
	}

	if (!Array.isArray(textures) || textures.length < 1) {
		continue;
	}

	const required = Object.fromEntries(
		await Promise.all(
			textures.map(
				async function getTexturesFromTerrain(textureId: string) {
					if (
						textureId in terrain &&
						terrain[textureId].textures !== undefined
					) {
						const txts: string[] =
							typeof terrain[textureId].textures === "string"
								? [terrain[textureId].textures]
								: Array.isArray(terrain[textureId].textures)
								? terrain[textureId].textures
								: terrain[textureId].textures.path ??
									Object.values(terrain[textureId].textures);

						return [
							textureId,
							await getRequiredTextures(
								txts,
							),
						];
					}

					return [textureId, false];
				},
			),
		),
	);

	console.log(required);
}
