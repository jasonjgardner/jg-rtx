/**
 * Browser-side image decoding for the two containers Bedrock packs use.
 *
 * PNG decodes natively. TGA does not — no browser can put a `.tga` in an
 * `<img>` — and the pack leans on it heavily: JG RTX ships `grass_side.tga`
 * among others, and Mojang's vanilla pack now ships over 1200 `.tga` files
 * (mostly `_mers`). Those are decoded with `targadactyl`.
 *
 * **Import discipline:** only `targadactyl/reader` and `targadactyl/writer` may
 * be imported here. The package root and `targadactyl/loader` pull in
 * `skia-canvas`, a native Node addon that cannot be bundled for the browser.
 * The two subpaths used below statically import nothing but types and errors.
 */

import { TgaReader } from "targadactyl/reader";
import type { TextureExt } from "./types";

/** Decoded RGBA pixels, independent of any canvas implementation. */
export interface IDecodedImage {
  readonly data: Uint8ClampedArray;
  readonly width: number;
  readonly height: number;
}

/**
 * Wrap RGBA bytes in an `ImageData`.
 *
 * `ImageData` requires its view to be backed by an `ArrayBuffer`, but a decoder
 * returns the looser `Uint8ClampedArray<ArrayBufferLike>` — which could be a
 * `SharedArrayBuffer` and is therefore rejected. Copying into a freshly
 * allocated buffer satisfies that without an unchecked cast. The copy is a few
 * hundred KB and only happens for TGA, the one format browsers cannot decode.
 *
 * @param data RGBA pixel bytes, four per pixel.
 * @param width Image width in pixels.
 * @param height Image height in pixels.
 */
export const toImageData = (
  data: Uint8ClampedArray,
  width: number,
  height: number,
): ImageData => {
  const buffer = new ArrayBuffer(data.byteLength);
  const view = new Uint8ClampedArray(buffer);
  view.set(data);

  return new ImageData(view, width, height);
};

/**
 * Decode TGA bytes to RGBA pixels.
 *
 * @param bytes Raw file contents.
 * @returns Top-down RGBA pixel data.
 * @throws If the bytes are not a readable TGA.
 */
export const decodeTga = (bytes: ArrayBuffer | Uint8Array): IDecodedImage => {
  const clamped = new Uint8ClampedArray(
    bytes instanceof Uint8Array ? bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) : bytes,
  );

  const reader = new TgaReader();
  reader.load(clamped);

  const { data, width, height } = reader.getRGBA();

  return { data, width, height };
};

/**
 * Decode raw bytes of either container into an `ImageBitmap`.
 *
 * `ImageBitmap` is transferable and usable from a worker, which is what the
 * pack builder needs; `createImageBitmap` handles PNG natively and accepts the
 * `ImageData` produced by the TGA path.
 *
 * @param bytes Raw file contents.
 * @param ext Container format.
 * @param flipY Pre-flip the image vertically. Required for WebGL textures:
 *   `UNPACK_FLIP_Y_WEBGL` has no effect on `ImageBitmap` sources, so
 *   `THREE.Texture.flipY` silently does nothing and textures render upside
 *   down. Flipping at decode time is the supported workaround.
 * @returns A decoded bitmap the caller owns and should `close()` when done.
 */
export const bytesToBitmap = async (
  bytes: ArrayBuffer,
  ext: TextureExt,
  flipY = false,
): Promise<ImageBitmap> => {
  const options: ImageBitmapOptions | undefined = flipY
    ? { imageOrientation: "flipY" }
    : undefined;

  if (ext === "tga") {
    const { data, width, height } = decodeTga(bytes);
    const image = toImageData(data, width, height);

    return options ? createImageBitmap(image, options) : createImageBitmap(image);
  }

  const blob = new Blob([bytes]);

  return options ? createImageBitmap(blob, options) : createImageBitmap(blob);
};

/**
 * How a texture's alpha channel should be rendered.
 *
 * These are Bedrock's three render methods. Vanilla `blocks.json` does not
 * declare which one a block uses — it is engine behaviour, and only *custom*
 * blocks state it via `material_instances.render_method` — so it is derived
 * from the texture instead.
 *
 * The tell is **not** whether partial alpha exists: cutout textures are
 * routinely anti-aliased, so their edges carry a thin band of partial values.
 * What separates the two is whether *fully transparent* pixels dominate. A
 * cutout is mostly holes with soft edges; a blended surface has no holes at
 * all, only partial coverage.
 *
 * | texture           | a = 0 | 0 < a < 255 | mode   |
 * | ----------------- | ----- | ----------- | ------ |
 * | `stone`           |     — |           — | opaque |
 * | `leaves_oak`      | 35.6% |          0% | cutout |
 * | `grass_side.tga`  | 40.9% |        0.7% | cutout |
 * | `tallgrass.tga`   | 66.8% |       10.7% | cutout |
 * | `glass`           |    0% |       90.7% | blend  |
 * | `glass_pane_top`  |    0% |        5.0% | blend  |
 */
export type AlphaMode = "opaque" | "cutout" | "blend";

/**
 * Rows examined when classifying. Flipbook strips run to 8192px tall, and every
 * frame of an animation shares the same alpha character, so reading the whole
 * strip would allocate megabytes to learn nothing extra.
 */
const ALPHA_MAX_ROWS = 1024;

/** Upper bound on sampled pixels, for unusually wide textures. */
const ALPHA_SAMPLE_CAP = 1 << 18;

/**
 * Classify a colour texture's transparency.
 *
 * @param bitmap Decoded colour map.
 * @returns `opaque` when nothing is transparent, `cutout` when fully
 *   transparent pixels outnumber partial ones, otherwise `blend`.
 */
export const classifyAlpha = (bitmap: ImageBitmap): AlphaMode => {
  const height = Math.min(bitmap.height, ALPHA_MAX_ROWS);
  const canvas = new OffscreenCanvas(bitmap.width, height);
  const context = canvas.getContext("2d", { willReadFrequently: true });

  // Without a context there is nothing to inspect; opaque is the safe default
  // because it never hides geometry that should be visible.
  if (!context) return "opaque";

  context.imageSmoothingEnabled = false;
  context.drawImage(bitmap, 0, 0);

  const { data } = context.getImageData(0, 0, bitmap.width, height);
  const pixels = data.length / 4;
  const stride = Math.max(1, Math.ceil(pixels / ALPHA_SAMPLE_CAP));

  let holes = 0;
  let partials = 0;

  // An indexed loop rather than an array method: this walks up to 262k pixels
  // per texture, and `filter`/`reduce` over a typed array would allocate an
  // intermediate for every one of them.
  for (let index = 0; index < pixels; index += stride) {
    const alpha = data[index * 4 + 3] ?? 255;

    if (alpha === 255) continue;

    if (alpha === 0) {
      holes += 1;
      continue;
    }

    partials += 1;
  }

  if (holes === 0 && partials === 0) return "opaque";

  return holes > partials ? "cutout" : "blend";
};

/**
 * Multiply a colour over a bitmap, preserving its alpha.
 *
 * Biome tints cannot be applied through the material: the RTX loader's fragment
 * shader assigns `csm_DiffuseColor = texture2D(uColor, uv)` outright, so
 * `material.color` never reaches the output. Baking the tint into the pixels is
 * the only path that survives that shader.
 *
 * The `destination-in` pass is essential — `multiply` drives alpha to 1 across
 * the whole canvas, which would turn cutout textures (grass, leaves, vines)
 * into solid squares. Redrawing the source with `destination-in` restores the
 * original alpha mask.
 *
 * @param bitmap Source image; closed by this function.
 * @param color CSS colour to multiply, e.g. `#79c05a`.
 * @returns A new tinted bitmap.
 */
export const tintBitmap = async (
  bitmap: ImageBitmap,
  color: string,
): Promise<ImageBitmap> => {
  const { width, height } = bitmap;
  const canvas = new OffscreenCanvas(width, height);
  const context = canvas.getContext("2d");

  if (!context) {
    return bitmap;
  }

  context.imageSmoothingEnabled = false;
  context.drawImage(bitmap, 0, 0);

  context.globalCompositeOperation = "multiply";
  context.fillStyle = color;
  context.fillRect(0, 0, width, height);

  context.globalCompositeOperation = "destination-in";
  context.drawImage(bitmap, 0, 0);

  bitmap.close();

  return createImageBitmap(canvas);
};

/**
 * Draw one bitmap over another, producing a single flattened image.
 *
 * This is Bedrock's grass-overlay model. `grass_side` is not a complete
 * texture: it is opaque for its top ~60% and fully transparent below, because
 * the engine composites the tinted grass over the dirt texture rather than
 * shipping a combined one. Rendering it alone cuts the dirt away entirely.
 *
 * Flattening at the bitmap level keeps the result a single opaque texture, so
 * the cube needs no extra geometry and no transparency sorting.
 *
 * @param base Underlying image, e.g. dirt. Closed by this function.
 * @param overlay Image drawn on top, e.g. tinted grass. Closed by this function.
 * @returns A new composited bitmap sized to `base`.
 */
export const compositeBitmaps = async (
  base: ImageBitmap,
  overlay: ImageBitmap,
): Promise<ImageBitmap> => {
  const { width, height } = base;
  const canvas = new OffscreenCanvas(width, height);
  const context = canvas.getContext("2d");

  if (!context) {
    overlay.close();
    return base;
  }

  context.imageSmoothingEnabled = false;
  context.drawImage(base, 0, 0);
  context.drawImage(overlay, 0, 0, width, height);

  base.close();
  overlay.close();

  return createImageBitmap(canvas);
};

/**
 * Fetch and decode an image URL into an `ImageBitmap`.
 *
 * @param url Absolute, CORS-enabled URL.
 * @param ext Container format.
 * @param signal Optional abort signal.
 * @param flipY Pre-flip vertically; see {@link bytesToBitmap}.
 * @throws If the request fails.
 */
export const loadBitmap = async (
  url: string,
  ext: TextureExt,
  signal?: AbortSignal,
  flipY = false,
): Promise<ImageBitmap> => {
  const response = await fetch(url, signal ? { signal } : {});

  if (!response.ok) {
    throw new Error(`Failed to load ${url}: ${response.status} ${response.statusText}`);
  }

  return bytesToBitmap(await response.arrayBuffer(), ext, flipY);
};

/**
 * Produce a browser-displayable object URL for any supported container.
 *
 * PNGs pass through untouched. TGAs are decoded and re-encoded as PNG so they
 * can be shown in an `<img>` or used as a CSS background.
 *
 * @param url Absolute, CORS-enabled URL.
 * @param ext Container format.
 * @param signal Optional abort signal.
 * @returns An object URL the caller must revoke, or the original URL for PNGs.
 */
export const displayableUrl = async (
  url: string,
  ext: TextureExt,
  signal?: AbortSignal,
): Promise<{ href: string; revoke: boolean }> => {
  if (ext !== "tga") return { href: url, revoke: false };

  const bitmap = await loadBitmap(url, ext, signal);
  const canvas = document.createElement("canvas");
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;

  const context = canvas.getContext("2d");

  if (!context) {
    bitmap.close();
    throw new Error("2D canvas context unavailable");
  }

  context.drawImage(bitmap, 0, 0);
  bitmap.close();

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, "image/png"),
  );

  if (!blob) throw new Error(`Could not re-encode ${url} as PNG`);

  return { href: URL.createObjectURL(blob), revoke: true };
};
