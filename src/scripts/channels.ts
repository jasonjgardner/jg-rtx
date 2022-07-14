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

	for await (const dirEntry of Deno.readDir(currentPath)) {
		const entryPath = join(currentPath, dirEntry.name);
		names.push(entryPath);

		if (dirEntry.isDirectory) {
			names.push(...await processFilePath(entryPath));
		}
	}

	return names;
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
				const dirName = join(
					Deno.cwd(),
					"src",
					"blocks",
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
				return;
			}

			const dirName = join(
				Deno.cwd(),
				"src",
				"blocks",
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

			if (base.endsWith("_mer")) {
				// Split channels
				const merImage = await loadImage(filePath);
				const height = merImage.height();
				const width = merImage.width();

				Object.entries({
					"m": LayerIndex.Metalness,
					"e": LayerIndex.Emissiveness,
					"r": LayerIndex.Roughness,
				}).forEach(async ([channel, layer]) => {
					const canvas = createCanvas(width, height);

					const ctx = canvas.getContext("2d");
					ctx.drawImage(merImage, 0, 0);

					const imageData = ctx.getImageData(0, 0, width, height);
					const data = imageData.data;
					const dataLength = data.length;

					for (let itr = 0; itr < dataLength; itr += 4) {
						if (layer !== LayerIndex.Metalness) {
							data[itr + LayerIndex.Metalness] =
								data[itr + layer];
						}

						if (layer !== LayerIndex.Emissiveness) {
							data[itr + LayerIndex.Emissiveness] =
								data[itr + layer];
						}

						if (layer !== LayerIndex.Roughness) {
							data[itr + LayerIndex.Roughness] =
								data[itr + layer];
						}
					}

					ctx.putImageData(imageData, 0, 0);

					try {
						await Deno.remove(join(
							dirName,
							`${base}_${channel}.png`,
						));
						await Deno.writeFile(
							join(
								dirName,
								`${base.replace("_mer", `_${channel}`)}.png`,
							),
							canvas.toBuffer("image/png"),
						);
					} catch (err) {
						console.error(
							"Failed writing channel to file: %s",
							err,
						);
					}
				});
			}

			try {
				const dest = join(dirName, `${base}${ext}`);

				await ensureDir(dirName);

				// Copy normal map
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
