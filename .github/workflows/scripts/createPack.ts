#!/usr/bin/env -S deno run --allow-write --allow-read --allow-net --allow-env
import { join } from "https://deno.land/std@0.215.0/path/mod.ts";
import JSZip from "https://esm.sh/jszip@3.10.1";
import { Image } from "https://deno.land/x/imagescript@1.2.15/mod.ts";

async function recursiveReaddir(path: string) {
	const files: string[] = [];
	const getFiles = async (path: string) => {
		for await (const dirEntry of Deno.readDir(path)) {
			if (dirEntry.isDirectory) {
				await getFiles(join(path, dirEntry.name));
			} else if (dirEntry.isFile) {
				files.push(join(path, dirEntry.name));
			}
		}
	};
	await getFiles(path);
	return files;
}

const RP_DIR = join(Deno.cwd(), "bedrock", "pack", "RP");

const rp = new JSZip();

const subpacksDir = rp.folder("subpacks");
const packDir = subpacksDir.folder("256x");
const smolPackDir = subpacksDir.folder("128x");

rp.file(
	"manifest.json",
	await Deno.readTextFile(join(RP_DIR, "manifest.json")),
);
rp.file("pack_icon.png", await Deno.readFile(join(RP_DIR, "pack_icon.png")));
rp.file(
	"splashes.json",
	await Deno.readTextFile(join(RP_DIR, "splashes.json")),
);
rp.folder("texts").file(
	"en_US.lang",
	await Deno.readTextFile(join(RP_DIR, "texts", "en_US.lang")),
);
rp.folder("texts").file(
	"languages.json",
	await Deno.readTextFile(join(RP_DIR, "texts", "languages.json")),
);
rp.folder("particles").file(
	"campfire_smoke_tall.json",
	await Deno.readTextFile(
		join(RP_DIR, "particles", "campfire_smoke_tall.json"),
	),
);
rp.folder("particles").file(
	"campfire_smoke.json",
	await Deno.readTextFile(join(RP_DIR, "particles", "campfire_smoke.json")),
);
rp.folder("particles").file(
	"cherry_petal_atlas.png",
	await Deno.readFile(join(RP_DIR, "particles", "cherry_petal_atlas.png")),
);

const texturesSrc = join(RP_DIR, "textures");
const texturesDirContents = await recursiveReaddir(texturesSrc);

const texturesFolder = packDir.folder("textures");
const smolTexturesFolder = smolPackDir.folder("textures");

for (const file of texturesDirContents) {
	const fileName = file.replace(
		texturesSrc,
		"",
	).replace(/^[\/\\]+/, "");
	texturesFolder.file(
		fileName,
		await Deno.readFile(file),
	);

	if (file.endsWith(".png") && fileName.startsWith("blocks")) {
		try {
			const image = await Image.decode(await Deno.readFile(file));
			const smolImage = image.resize(128, 128);
			smolTexturesFolder.file(
				fileName,
				await smolImage.encode(),
			);
		} catch (e) {
			console.error(`Failed to resize ${file}: ${e}`);
			smolTexturesFolder.file(
				fileName,
				await Deno.readFile(file),
			);
		}
		continue;
	}

	smolPackDir.file(
		fileName,
		await Deno.readFile(file),
	);
}

await Deno.writeFile(
	join(Deno.cwd(), "JG-RTX.mcpack"),
	await rp.generateAsync({ type: "uint8array" }),
);


Deno.exit(0);
