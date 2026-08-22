/**
 * Minimal Targa decoder.
 *
 * `sharp` cannot read TGA, and JG RTX stores several MERS maps that way
 * (`redstone_block_mers.tga`, `shroomlight_mers.tga`, `hay_block_*_mers.tga`, ...).
 * Their `.texture_set.json` entries look dangling until you notice the extension.
 *
 * Supports the two variants present in the pack: uncompressed true-colour (type 2)
 * and run-length encoded true-colour (type 10), at 24 or 32 bits per pixel.
 * Colour-mapped and greyscale Targas are rejected rather than silently mishandled.
 */

/** A decoded, top-left origin, 8-bit RGBA image. */
export interface IDecodedTga {
  readonly width: number;
  readonly height: number;
  /** `width * height * 4` bytes, RGBA order. */
  readonly data: Uint8Array;
}

const HEADER_BYTES = 18;
const TYPE_TRUECOLOR = 2;
const TYPE_TRUECOLOR_RLE = 10;
/** Image-descriptor bit 5: set when row 0 is the top row. */
const TOP_ORIGIN_BIT = 0x20;

/**
 * Decode a Targa image into top-left origin RGBA.
 *
 * @param bytes - Raw file contents.
 * @returns Decoded pixels.
 * @throws When the file is truncated, colour-mapped, greyscale, or not 24/32bpp.
 */
export function decodeTga(bytes: Uint8Array): IDecodedTga {
  if (bytes.length < HEADER_BYTES) {
    throw new Error(`TGA too short: ${bytes.length} bytes`);
  }

  const idLength = bytes[0] ?? 0;
  const colorMapType = bytes[1] ?? 0;
  const imageType = bytes[2] ?? 0;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const width = view.getUint16(12, true);
  const height = view.getUint16(14, true);
  const bitsPerPixel = bytes[16] ?? 0;
  const descriptor = bytes[17] ?? 0;

  if (colorMapType !== 0) {
    throw new Error("Colour-mapped TGA is not supported");
  }
  if (imageType !== TYPE_TRUECOLOR && imageType !== TYPE_TRUECOLOR_RLE) {
    throw new Error(`Unsupported TGA image type ${imageType}; expected 2 or 10`);
  }
  if (bitsPerPixel !== 24 && bitsPerPixel !== 32) {
    throw new Error(`Unsupported TGA depth ${bitsPerPixel}bpp; expected 24 or 32`);
  }
  if (width <= 0 || height <= 0) {
    throw new Error(`Invalid TGA dimensions ${width}x${height}`);
  }

  const bytesPerPixel = bitsPerPixel / 8;
  const pixelStart = HEADER_BYTES + idLength;
  const pixelCount = width * height;

  const bgra =
    imageType === TYPE_TRUECOLOR
      ? readUncompressed(bytes, pixelStart, pixelCount, bytesPerPixel)
      : readRunLengthEncoded(bytes, pixelStart, pixelCount, bytesPerPixel);

  return {
    width,
    height,
    data: toRgbaTopLeft(bgra, width, height, bytesPerPixel, (descriptor & TOP_ORIGIN_BIT) !== 0),
  };
}

/** Copy a flat run of BGR(A) samples straight out of the file. */
function readUncompressed(
  bytes: Uint8Array,
  start: number,
  pixelCount: number,
  bytesPerPixel: number,
): Uint8Array {
  const needed = pixelCount * bytesPerPixel;
  if (start + needed > bytes.length) {
    throw new Error("Truncated uncompressed TGA pixel data");
  }
  return bytes.subarray(start, start + needed);
}

/**
 * Expand Targa run-length packets.
 *
 * Each packet is a header byte: the low 7 bits are `count - 1`, and the high bit
 * selects a repeated run (one pixel follows) over a literal run (`count` pixels follow).
 * Runs may cross scanline boundaries.
 */
function readRunLengthEncoded(
  bytes: Uint8Array,
  start: number,
  pixelCount: number,
  bytesPerPixel: number,
): Uint8Array {
  const out = new Uint8Array(pixelCount * bytesPerPixel);
  let read = start;
  let written = 0;

  while (written < out.length) {
    if (read >= bytes.length) throw new Error("Truncated RLE TGA packet header");

    const packet = bytes[read] ?? 0;
    read += 1;
    const count = (packet & 0x7f) + 1;
    const isRun = (packet & 0x80) !== 0;
    const span = count * bytesPerPixel;

    if (written + span > out.length) {
      throw new Error("RLE TGA packet overruns the image");
    }

    if (isRun) {
      if (read + bytesPerPixel > bytes.length) throw new Error("Truncated RLE TGA run");
      const pixel = bytes.subarray(read, read + bytesPerPixel);
      read += bytesPerPixel;
      for (let index = 0; index < count; index += 1) {
        out.set(pixel, written + index * bytesPerPixel);
      }
      written += span;
      continue;
    }

    if (read + span > bytes.length) throw new Error("Truncated RLE TGA literal");
    out.set(bytes.subarray(read, read + span), written);
    read += span;
    written += span;
  }

  return out;
}

/**
 * Reorder BGR(A), bottom-origin samples into RGBA, top-origin.
 *
 * @param bottomOriginIsTop - `true` when the descriptor already says row 0 is the top.
 */
function toRgbaTopLeft(
  bgra: Uint8Array,
  width: number,
  height: number,
  bytesPerPixel: number,
  bottomOriginIsTop: boolean,
): Uint8Array {
  const out = new Uint8Array(width * height * 4);
  const hasAlpha = bytesPerPixel === 4;

  for (let row = 0; row < height; row += 1) {
    const sourceRow = bottomOriginIsTop ? row : height - 1 - row;
    let source = sourceRow * width * bytesPerPixel;
    let target = row * width * 4;

    for (let column = 0; column < width; column += 1) {
      out[target] = bgra[source + 2] ?? 0;
      out[target + 1] = bgra[source + 1] ?? 0;
      out[target + 2] = bgra[source] ?? 0;
      out[target + 3] = hasAlpha ? (bgra[source + 3] ?? 255) : 255;
      source += bytesPerPixel;
      target += 4;
    }
  }

  return out;
}
