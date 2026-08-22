/**
 * Minimal image dimension probing for PNG and TGA.
 *
 * The catalog needs width/height for ~3000 files to offer per-texture
 * power-of-two resize options and to detect flipbook strips. Both formats put
 * their dimensions in a fixed-offset header, so reading the first 32 bytes is
 * enough — far cheaper than decoding, and it keeps `sharp` out of the build.
 */

import { open } from "node:fs/promises";
import type { TextureExt } from "../../src/lib/types";

/** Bytes needed to cover both header layouts. */
const HEADER_BYTES = 32;

/** PNG magic number: the 8-byte signature every PNG opens with. */
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/** A probed image size. */
export interface IImageSize {
  readonly width: number;
  readonly height: number;
}

/**
 * Read the leading bytes of a file without pulling the whole thing into memory.
 *
 * @param path Absolute path to the image.
 * @returns The first {@link HEADER_BYTES} bytes, or a shorter buffer for tiny files.
 */
const readHeader = async (path: string): Promise<Buffer> => {
  const handle = await open(path, "r");
  try {
    const buffer = Buffer.alloc(HEADER_BYTES);
    const { bytesRead } = await handle.read(buffer, 0, HEADER_BYTES, 0);
    return buffer.subarray(0, bytesRead);
  } finally {
    await handle.close();
  }
};

/**
 * Parse PNG dimensions. The IHDR chunk is always first, putting width at byte
 * 16 and height at byte 20 as big-endian uint32s.
 *
 * @param header At least 24 bytes from the start of the file.
 * @returns The size, or `null` when the signature does not match.
 */
const parsePng = (header: Buffer): IImageSize | null => {
  if (header.length < 24 || !header.subarray(0, 8).equals(PNG_SIGNATURE)) {
    return null;
  }

  return { width: header.readUInt32BE(16), height: header.readUInt32BE(20) };
};

/**
 * Parse TGA dimensions. The 18-byte header stores width at offset 12 and
 * height at offset 14 as little-endian uint16s.
 *
 * @param header At least 18 bytes from the start of the file.
 * @returns The size, or `null` when the header is too short or degenerate.
 */
const parseTga = (header: Buffer): IImageSize | null => {
  if (header.length < 18) return null;

  const width = header.readUInt16LE(12);
  const height = header.readUInt16LE(14);

  if (width === 0 || height === 0) return null;

  return { width, height };
};

/**
 * Probe an image's dimensions from its header.
 *
 * @param path Absolute path to a `.png` or `.tga` file.
 * @param ext Container format, taken from the filename.
 * @returns The size, or `null` if the header could not be parsed.
 */
export const imageSize = async (
  path: string,
  ext: TextureExt,
): Promise<IImageSize | null> => {
  try {
    const header = await readHeader(path);
    return ext === "tga" ? parseTga(header) : parsePng(header);
  } catch {
    return null;
  }
};
