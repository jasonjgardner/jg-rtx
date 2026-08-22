/**
 * Texture worker — fetches one pack file and optionally downscales it.
 *
 * The pack is ~542 MB across 4600 files, so this work is spread across a pool
 * of workers: each one owns the fetch, the decode, the resize and the re-encode
 * for a single file, keeping all of that off the main thread so the progress UI
 * stays responsive while the ZIP streams to disk.
 *
 * **Import discipline:** only `targadactyl/reader` and `targadactyl/writer` are
 * safe here. The package root and `targadactyl/loader` pull in `skia-canvas`, a
 * native Node addon that cannot be bundled for a browser worker.
 */

import { TgaReader } from "targadactyl/reader";
import { TgaWriter } from "targadactyl/writer";
import { toImageData } from "../lib/decode";

/** A file to fetch and possibly resize. */
export interface ITextureJob {
  /** Correlation id echoed back in the result. */
  readonly id: number;
  /** Absolute CDN URL to fetch. */
  readonly url: string;
  /** Path the bytes should occupy inside the ZIP. */
  readonly path: string;
  /** Container format, which decides the decoder and encoder. */
  readonly ext: "png" | "tga";
  /**
   * Target width in pixels, or `null` to pass the bytes through untouched.
   * A target at or above the source width is ignored — textures are never
   * upscaled, and re-encoding an unchanged image would only lose fidelity.
   */
  readonly target: number | null;
}

/** A completed file, ready for the ZIP. */
export interface ITextureResult {
  readonly id: number;
  readonly path: string;
  readonly bytes: ArrayBuffer;
  /** True when the image was actually rescaled. */
  readonly resized: boolean;
}

/** A failed file. The build continues; the failure is reported. */
export interface ITextureError {
  readonly id: number;
  readonly path: string;
  readonly error: string;
}

/** Messages the worker sends back. */
export type WorkerMessage =
  | ({ readonly type: "done" } & ITextureResult)
  | ({ readonly type: "error" } & ITextureError);

/** Decode bytes into RGBA pixels, whichever container they arrived in. */
const decode = async (
  bytes: ArrayBuffer,
  ext: ITextureJob["ext"],
): Promise<ImageBitmap> => {
  if (ext !== "tga") return createImageBitmap(new Blob([bytes]));

  const reader = new TgaReader();
  reader.load(new Uint8ClampedArray(bytes));

  const { data, width, height } = reader.getRGBA();

  return createImageBitmap(toImageData(data, width, height));
};

/**
 * Downscale a bitmap, scaling both axes by the same factor.
 *
 * The uniform factor is what keeps flipbooks intact: `fire_0` is a 256×8192
 * strip of thirty-two 256px frames, and forcing it square would destroy the
 * animation. At 64px it becomes 64×2048 — still thirty-two frames.
 *
 * Nearest-neighbour sampling preserves the hard pixel edges these textures are
 * authored with; smoothing would blur them into mush at low resolutions.
 */
const resize = (bitmap: ImageBitmap, target: number): OffscreenCanvas => {
  const factor = target / bitmap.width;
  const width = Math.max(1, Math.round(bitmap.width * factor));
  const height = Math.max(1, Math.round(bitmap.height * factor));

  const canvas = new OffscreenCanvas(width, height);
  const context = canvas.getContext("2d");

  if (!context) throw new Error("OffscreenCanvas 2D context unavailable");

  context.imageSmoothingEnabled = false;
  context.drawImage(bitmap, 0, 0, width, height);

  return canvas;
};

/** Re-encode a resized canvas in the container it arrived in. */
const encode = async (
  canvas: OffscreenCanvas,
  ext: ITextureJob["ext"],
): Promise<ArrayBuffer> => {
  const context = canvas.getContext("2d");

  if (!context) throw new Error("OffscreenCanvas 2D context unavailable");

  // TGA stays TGA. Bedrock resolves texture references without an extension,
  // so emitting a PNG beside the original name would make resolution ambiguous.
  if (ext === "tga") {
    const image = context.getImageData(0, 0, canvas.width, canvas.height);
    const encoded = new TgaWriter(image, { bitDepth: 32 }).encode();

    return encoded.buffer.slice(
      encoded.byteOffset,
      encoded.byteOffset + encoded.byteLength,
    ) as ArrayBuffer;
  }

  const blob = await canvas.convertToBlob({ type: "image/png" });

  return blob.arrayBuffer();
};

/** Fetch, optionally resize, and return the bytes for one file. */
const process = async (job: ITextureJob): Promise<ITextureResult> => {
  const response = await fetch(job.url);

  if (!response.ok) {
    throw new Error(`${response.status} ${response.statusText}`);
  }

  const bytes = await response.arrayBuffer();

  if (job.target === null) {
    return { id: job.id, path: job.path, bytes, resized: false };
  }

  const bitmap = await decode(bytes, job.ext);

  // Never upscale, and never re-encode an image that would not change.
  if (job.target >= bitmap.width) {
    bitmap.close();
    return { id: job.id, path: job.path, bytes, resized: false };
  }

  const canvas = resize(bitmap, job.target);
  bitmap.close();

  const encoded = await encode(canvas, job.ext);

  return { id: job.id, path: job.path, bytes: encoded, resized: true };
};

self.addEventListener("message", (event: MessageEvent<ITextureJob>) => {
  const job = event.data;

  process(job)
    .then((result) => {
      const message: WorkerMessage = { type: "done", ...result };

      // Transfer the buffer rather than copying it; at hundreds of megabytes
      // per build, structured-clone copies would dominate the runtime.
      (self as unknown as Worker).postMessage(message, [result.bytes]);
    })
    .catch((error: unknown) => {
      const message: WorkerMessage = {
        type: "error",
        id: job.id,
        path: job.path,
        error: error instanceof Error ? error.message : String(error),
      };

      (self as unknown as Worker).postMessage(message);
    });
});
