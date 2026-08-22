/** Small filesystem helpers shared across the converter. */

import { stat } from "node:fs/promises";

/**
 * Report whether a path exists and is readable.
 *
 * @param filePath - Path to probe.
 */
export async function fileExists(filePath: string): Promise<boolean> {
  try {
    await stat(filePath);
    return true;
  } catch {
    return false;
  }
}
