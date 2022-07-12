import JSON5 from "https://deno.land/x/json5@v1.0.0/mod.ts";
import { Image } from "https://deno.land/x/imagescript@1.2.9/mod.ts";
//import { Canvas, loadImage } from "https://deno.land/x/neko/canvas/mod.ts";

const TEXTURE_SIZE = 256;

//loadImage(await Deno.readFile())

export async function readJson(filePath: string) {
	return JSON5.parse(await Deno.readTextFile(filePath));
}

export function isValidHexNumber(v: number) {
	return typeof v === "number" && v >= 0 && v <= 255 && Number.isInteger(v);
}

/**
 * Create images for solid HEX colors in texture sets
 * @param layerValue Texture set layer value
 * @returns Promise<Uint8Array>
 */
export async function encodeHexColor(layerValue: string) {
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

	return minewaysOutput.encode(0);
}

/**
 * Create images for solid RGB colors in texture sets
 * @param {number[]} layerValue Texture set layer value
 * @returns Promise<Uint8Array>
 */
export async function encodeRGBColor(
	layerValue: number[],
): Promise<Uint8Array> {
	const [r, g, b, alpha] = layerValue;
	const minewaysOutput = new Image(TEXTURE_SIZE, TEXTURE_SIZE);

	minewaysOutput.fill(
		alpha !== undefined
			? Image.rgbaToColor(r, g, b, alpha)
			: Image.rgbToColor(r, g, b),
	);

	return minewaysOutput.encode(0);
}
