import {
	basename,
	extname,
	join,
} from "https://deno.land/std@0.148.0/path/mod.ts";

import { ensureDir } from "https://deno.land/std@0.148.0/fs/mod.ts";
import {
	createCanvas,
	loadImage,
} from "https://deno.land/x/canvas@v1.4.1/mod.ts";

enum LayerIndex {
	Metalness = 0,
	Emissiveness = 1,
	Roughness = 2,
}

async function processFilePath(currentPath: string) {
	const names: string[] = [];

	try {
		for await (const dirEntry of Deno.readDir(currentPath)) {
			const entryPath = join(currentPath, dirEntry.name);

			if (dirEntry.isDirectory) {
				names.push(...await processFilePath(entryPath));
				continue;
			}

			names.push(entryPath);
		}
	} catch (err) {
		console.error(
			'Failed processing file path "%s":\n%s',
			currentPath,
			err,
		);
	}

	return names;
}

async function convertRoughness(filePath: string) {
	const ext = extname(filePath);
	const base = basename(filePath, ext);
	const dirName = join(
		Deno.cwd(),
		"src",
		"assets",
		"minecraft",
		"textures",
		"block",
		base.replace(/\_(normal|mer|heightmap)$/i, ""),
	);
	const roughnessMap = await loadImage(filePath);
	const height = roughnessMap.height();
	const width = roughnessMap.width();

	const canvas = createCanvas(width, height);

	const ctx = canvas.getContext("2d");
	ctx.drawImage(roughnessMap, 0, 0);

	const imageData = ctx.getImageData(0, 0, width, height);
	const data = imageData.data;
	const dataLength = data.length;

	for (let itr = 0; itr < dataLength; itr += 4) {
		// Invert roughness and put in red channel

		// smoothness = 1 - sqrt(roughnesss)

		data[itr] = Math.max(
			0,
			Math.min(
				255,
				255 - data[itr],
			),
		);

		data[itr + 1] = Math.max(
			0,
			Math.min(
				255,
				255 - data[itr + 1],
			),
		);

		data[itr + 2] = Math.max(
			0,
			Math.min(
				255,
				255 - data[itr + 2],
			),
		);

		// Put emissive channel in alpha
		data[itr + 3] = Math.max(
			0,
			Math.min(
				255,
				255 - data[itr + 3],
			),
		);
	}

	ctx.putImageData(imageData, 0, 0);

	try {
		await Deno.writeFile(
			join(
				dirName,
				`${base.replace("_normal", `_n`)}.png`,
			),
			canvas.toBuffer("image/png"),
		);
		return;
	} catch (err) {
		console.error(
			"Failed writing OpenGL normal map to file: %s",
			err,
		);
	}
}

async function convertNormalMap(filePath: string) {
	const ext = extname(filePath);
	const base = basename(filePath, ext);
	const dirName = join(
		Deno.cwd(),
		"src",
		"assets",
		"minecraft",
		"textures",
		"block",
		base.replace(/\_(normal|mer|heightmap)$/i, ""),
	);
	const normalMap = await loadImage(filePath);
	const height = normalMap.height();
	const width = normalMap.width();

	const canvas = createCanvas(width, height);

	const ctx = canvas.getContext("2d");
	ctx.drawImage(normalMap, 0, 0);

	const imageData = ctx.getImageData(0, 0, width, height);
	const data = imageData.data;
	const dataLength = data.length;

	for (let itr = 0; itr < dataLength; itr += 4) {
		// Invert green channel to convert DX to GL
		data[itr + 1] = Math.max(
			0,
			Math.min(
				255,
				255 - data[itr + 1],
			),
		);

		// TODO: Put AO in blue channel and heightmap into alpha
	}

	ctx.putImageData(imageData, 0, 0);

	try {
		await Deno.writeFile(
			join(
				dirName,
				`${base.replace("_normal", `_n`)}.png`,
			),
			canvas.toBuffer("image/png"),
		);
		return;
	} catch (err) {
		console.error(
			"Failed writing OpenGL normal map to file: %s",
			err,
		);
	}
}

// const albedoMap = `${filePath.replace("_mer", "")}`;

// try {
// const albedoMapImage = await loadImage(albedoMap);
// const albedoMapOutput = createCanvas(
// albedoMapImage.width(),
// albedoMapImage.height(),
// );

// const _ctx = albedoMapOutput.getContext("2d");
// _ctx.putImageData(imageData, 0, 0);
// _ctx.globalCompositeOperation = "multiply";
// _ctx.drawImage(albedoMapImage, 0, 0);

// await Deno.writeFile(
// join(
// 	dirName,
// 	`${base.replace("_mer", "_diffuse")}.png`,
// ),
// albedoMapOutput.toBuffer("image/png"),
// );
// } catch (err) {
// console.error("Failed loading albedo map: %s", err);
// }

async function createTextureDirectory(filePath: string) {
	const ext = extname(filePath);
	const base = basename(filePath, ext);
	const dirName = join(
		Deno.cwd(),
		"src",
		"assets",
		"minecraft",
		"textures",
		"block",
		base.replace(/\.texture_set$/i, ""),
	);
	try {
		await Deno.mkdir(dirName);
		console.info('Created block directory "%s"', dirName);
	} catch (err) {
		if (err && err.kind === Deno.errors.PermissionDenied) {
			console.warn(
				'Directory "%s" not created. Permissions error:\n%s',
				err,
			);
		}
	}
}

async function splitChannels(filePath: string) {
	const ext = extname(filePath);
	const base = basename(filePath, ext);
	const dirName = join(
		Deno.cwd(),
		"src",
		"assets",
		"minecraft",
		"textures",
		"block",
		base.replace(/\_(normal|mer|heightmap)$/i, ""),
	);
	// Split channels
	const merImage = await loadImage(filePath);
	const height = merImage.height();
	const width = merImage.width();

	Object.entries({
		"m": LayerIndex.Metalness,
		"e": LayerIndex.Emissiveness,
		"r": LayerIndex.Roughness,
	}).forEach(async ([channel, layer]) => {
		const channelOutput = createCanvas(width, height);

		const ctx = channelOutput.getContext("2d");
		ctx.drawImage(merImage, 0, 0);

		const imageData = ctx.getImageData(0, 0, width, height);
		const data = imageData.data;
		const dataLength = data.length;

		for (let itr = 0; itr < dataLength; itr += 4) {
			// Convert other channels to current channel's value to create grayscale image
			if (layer !== LayerIndex.Metalness) {
				data[itr + LayerIndex.Metalness] = data[itr + layer];
			}

			if (layer !== LayerIndex.Emissiveness) {
				data[itr + LayerIndex.Emissiveness] = data[itr + layer];
			}

			if (layer !== LayerIndex.Roughness) {
				data[itr + LayerIndex.Roughness] = data[itr + layer];
			}
		}

		ctx.putImageData(imageData, 0, 0);

		try {
			await Deno.writeFile(
				join(
					dirName,
					`${base.replace("_mer", `_${channel}`)}.png`,
				),
				channelOutput.toBuffer("image/png"),
			);
			console.info(
				'Created "%s" channel output from image:\n%s\n',
				channel,
				base,
			);
		} catch (err) {
			console.error(
				'Failed writing channel "%s" to file:\n%s\n',
				channel,
				err,
			);
		}
	});
}

try {
	const contents: string[] = [];
	const rpPath = join(
		Deno.cwd(),
		"bedrock",
		"pack",
		"RP",
		"textures",
		"blocks",
	);
	const rpFiles = await processFilePath(rpPath);
	rpFiles.forEach(
		async function processFile(filePath: string) {
			const ext = extname(filePath);
			const base = basename(filePath, ext);

			if (filePath.endsWith(".texture_set.json")) {
				await createTextureDirectory(filePath);
				return;
			}

			const dirName = join(
				Deno.cwd(),
				"src",
				"assets",
				"minecraft",
				"textures",
				"block",
				base.replace(/\_(normal|mer|heightmap)$/i, ""),
			);

			// if (base.endsWith("_heightmap")) {
			// 	try {
			// 		await Deno.copyFile(
			// 			base,
			// 			join(
			// 				dirName,
			// 				`${base}.${ext}`,
			// 			),
			// 		);
			// 		console.info("Copied height map into %s", dirName);
			// 	} catch (err) {
			// 		console.warn('Failed copying "%s":\n %s', base, err);
			// 	}
			// }

			if (base.endsWith("_normal")) {
			}

			if (base.endsWith("_mer")) {
			}

			try {
				const dest = join(dirName, `${base}${ext}`);

				await ensureDir(dirName);
				await Deno.copyFile(filePath, dest);
				console.info("Copied %s\n", dest);
			} catch (err) {
				console.error('Failed copying file %s\n"%s"', filePath, err);
			}

			if (!contents.includes(base)) {
				contents.push(base);
			}
		},
	);

	contents.forEach((filePath) => {
		console.log(filePath);
	});
} catch (err) {
	console.error("Failed splitting channels: %s", err);
}
