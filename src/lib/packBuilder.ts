/**
 * Builds a customized `.mcpack` in the browser.
 *
 * The pack is ~542 MB at source resolution, which rules out buffering it in
 * memory. Three pieces make an in-browser build viable:
 *
 * - **A worker pool** fetches and rescales files concurrently, so decode and
 *   PNG re-encode never block the main thread.
 * - **`client-zip`** turns an async iterable of entries into a `ReadableStream`,
 *   so ZIP bytes are produced incrementally instead of all at once.
 * - **The File System Access API** pipes that stream straight to disk, keeping
 *   memory flat regardless of pack size. Browsers without it fall back to an
 *   in-memory `Blob`, which is only safe for small selections.
 *
 * The pool runs ahead of the ZIP writer through a bounded queue: without the
 * bound, workers would race ahead and buffer the whole pack in memory, undoing
 * the point of streaming.
 */

import { makeZip } from "client-zip";
import { repoUrl, textureUrl } from "./cdn";
import type { ITextureJob, WorkerMessage } from "../workers/texture.worker";
import type { ICustomizationState } from "../stores/customization";
import type { ITextureSet, IVariety } from "./types";

/** One file in the source pack. */
export interface IPackFile {
  readonly file: string;
  readonly bytes: number;
}

/** The pack inventory emitted by the catalog generator. */
export interface IPackInventory {
  readonly textures: readonly IPackFile[];
  readonly other: readonly IPackFile[];
}

/** Progress reported as the build runs. */
export interface IBuildProgress {
  /** Files completed so far. */
  readonly completed: number;
  /** Total files in the build. */
  readonly total: number;
  /** Bytes written into the ZIP so far. */
  readonly bytesWritten: number;
  /** Files that failed, by path. */
  readonly failures: readonly string[];
  /** Path most recently completed, for a live status line. */
  readonly current: string;
}

/** Inputs for a build. */
export interface IBuildOptions {
  readonly inventory: IPackInventory;
  /** Texture sets, so a resolution override can reach all of a set's maps. */
  readonly sets: ReadonlyMap<string, ITextureSet>;
  /** Varieties, so a selection can substitute its files. */
  readonly varieties: ReadonlyMap<string, IVariety>;
  readonly state: ICustomizationState;
  /** Name written into the pack manifest. */
  readonly packName: string;
  readonly signal: AbortSignal;
  readonly onProgress: (progress: IBuildProgress) => void;
}

/** How many files may sit decoded in memory ahead of the ZIP writer. */
const QUEUE_LIMIT = 24;

/** Worker pool size, bounded so a many-core machine does not saturate the CDN. */
const poolSize = (): number =>
  Math.max(2, Math.min(8, navigator.hardwareConcurrency ?? 4));

/** A file the build must produce, resolved to its source and target size. */
interface IPlannedFile {
  /** Path inside the generated pack. */
  readonly path: string;
  /** Absolute URL the bytes come from. */
  readonly url: string;
  readonly ext: "png" | "tga";
  readonly target: number | null;
  /** Source size in bytes, for progress estimates. */
  readonly bytes: number;
}

/** Extension of a path, defaulting to PNG for anything unrecognised. */
const extensionOf = (path: string): "png" | "tga" =>
  path.toLowerCase().endsWith(".tga") ? "tga" : "png";

/**
 * Map each texture file to the resolution it should be written at.
 *
 * A per-set override applies to every map in that set — resizing a block's
 * colour map while leaving its normal map at full size would be incoherent —
 * and anything without an override falls back to the global setting.
 */
const buildSizeMap = (
  sets: ReadonlyMap<string, ITextureSet>,
  state: ICustomizationState,
): Map<string, number> => {
  const sizes = new Map<string, number>();

  Object.entries(state.sizes).forEach(([setId, size]) => {
    const set = sets.get(setId);
    if (!set) return;

    (["color", "mer", "mers", "normal", "heightmap"] as const).forEach((role) => {
      const file = set[role];
      if (file) sizes.set(file.file, size);
    });
  });

  return sizes;
};

/**
 * Map pack file paths to variety replacements.
 *
 * A variety substitutes its own image for the pack's. It may carry a different
 * container than the file it replaces, so the replacement keeps the original
 * *stem* and adopts the variety's extension — Bedrock resolves texture
 * references without an extension, so the sidecar keeps working either way.
 * The original file is dropped so the two cannot both match.
 */
const buildReplacements = (
  sets: ReadonlyMap<string, ITextureSet>,
  varieties: ReadonlyMap<string, IVariety>,
  state: ICustomizationState,
): Map<string, IPlannedFile> => {
  const replacements = new Map<string, IPlannedFile>();

  Object.entries(state.varieties).forEach(([setId, varietyId]) => {
    const set = sets.get(setId);
    const variety = varieties.get(varietyId);
    if (!set || !variety) return;

    (["color", "mer", "mers", "normal", "heightmap"] as const).forEach((role) => {
      const target = set[role];
      const source = variety[role];
      if (!target || !source) return;

      const stem = target.file.replace(/\.(png|tga)$/i, "");

      replacements.set(target.file, {
        path: `${stem}.${source.ext}`,
        // Variety files live outside the pack, under the repository root.
        url: repoUrl(source.file),
        ext: source.ext,
        target: null,
        bytes: 0,
      });
    });
  });

  return replacements;
};

/**
 * Rewrite the pack manifest so the build installs as its own pack.
 *
 * Reusing the upstream UUIDs would make Minecraft treat the customized pack as
 * the same pack, so it would replace rather than sit alongside the original.
 * Subpack declarations are dropped too: the generated pack contains exactly one
 * resolution, and advertising resolution subpacks that are not present makes
 * the pack fail to load.
 *
 * @param packName Name to show in the in-game pack list.
 * @param signal Abort signal for the fetch.
 */
const buildManifest = async (
  packName: string,
  signal: AbortSignal,
): Promise<Uint8Array> => {
  // Pack-relative, so this resolves to the resource-pack root manifest.
  const response = await fetch(textureUrl("manifest.json"), { signal });

  if (!response.ok) {
    throw new Error(
      `Could not read the pack manifest: ${response.status} ${response.statusText}`,
    );
  }

  const manifest = (await response.json()) as Record<string, unknown> & {
    header?: Record<string, unknown>;
    modules?: Record<string, unknown>[];
    subpacks?: unknown;
  };

  const header = {
    ...(manifest.header ?? {}),
    name: packName,
    uuid: crypto.randomUUID(),
  };

  const modules = (manifest.modules ?? []).map((module) => ({
    ...module,
    uuid: crypto.randomUUID(),
  }));

  const { subpacks: _dropped, ...rest } = manifest;

  const next = { ...rest, header, modules };

  return new TextEncoder().encode(JSON.stringify(next, null, 2));
};

/**
 * A bounded async queue. Producers block once it is full, which is what keeps
 * the worker pool from running arbitrarily far ahead of the ZIP writer.
 */
class BoundedQueue<T> {
  readonly #items: T[] = [];
  readonly #limit: number;
  #closed = false;
  #onPush: (() => void) | null = null;
  #onPop: (() => void) | null = null;

  constructor(limit: number) {
    this.#limit = limit;
  }

  /** Wait for room, then enqueue. */
  async push(item: T): Promise<void> {
    while (this.#items.length >= this.#limit && !this.#closed) {
      await new Promise<void>((resolve) => {
        this.#onPop = resolve;
      });
    }

    this.#items.push(item);
    this.#onPush?.();
    this.#onPush = null;
  }

  /** Signal that no further items will arrive. */
  close(): void {
    this.#closed = true;
    this.#onPush?.();
    this.#onPush = null;
    this.#onPop?.();
    this.#onPop = null;
  }

  /** Drain in arrival order, ending once closed and empty. */
  async *drain(): AsyncGenerator<T> {
    while (true) {
      if (this.#items.length === 0) {
        if (this.#closed) return;

        await new Promise<void>((resolve) => {
          this.#onPush = resolve;
        });

        continue;
      }

      const item = this.#items.shift();
      this.#onPop?.();
      this.#onPop = null;

      if (item !== undefined) yield item;
    }
  }
}

/** A ZIP entry as `client-zip` wants it. */
interface IZipEntry {
  readonly name: string;
  readonly input: Uint8Array;
  readonly lastModified: Date;
}

/**
 * Resolve the full list of files the build will emit.
 *
 * @returns Planned files, with variety substitutions applied.
 */
const planFiles = (options: IBuildOptions): IPlannedFile[] => {
  const sizes = buildSizeMap(options.sets, options.state);
  const replacements = buildReplacements(options.sets, options.varieties, options.state);
  const global = options.state.globalSize;

  const textures = options.inventory.textures.map((entry) => {
    const replacement = replacements.get(entry.file);

    if (replacement) {
      return { ...replacement, target: sizes.get(entry.file) ?? global, bytes: entry.bytes };
    }

    return {
      path: entry.file,
      url: textureUrl(entry.file),
      ext: extensionOf(entry.file),
      target: sizes.get(entry.file) ?? global,
      bytes: entry.bytes,
    } satisfies IPlannedFile;
  });

  // Configuration files are copied verbatim; the manifest is rewritten later.
  const other = options.inventory.other
    .filter((entry) => entry.file !== "manifest.json")
    .map((entry) => ({
      path: entry.file,
      url: textureUrl(entry.file),
      ext: "png" as const,
      target: null,
      bytes: entry.bytes,
    }));

  return [...textures, ...other];
};

/**
 * Build the pack and stream it into `writable`.
 *
 * @param options Build inputs.
 * @param writable Destination for the ZIP bytes.
 * @throws If the build is aborted or the stream cannot be written.
 */
export const buildPack = async (
  options: IBuildOptions,
  writable: WritableStream<Uint8Array>,
): Promise<void> => {
  const planned = planFiles(options);
  const queue = new BoundedQueue<IZipEntry>(QUEUE_LIMIT);

  const failures: string[] = [];
  const lastModified = new Date();

  let completed = 0;
  let bytesWritten = 0;

  const report = (current: string): void => {
    options.onProgress({
      completed,
      total: planned.length + 1,
      bytesWritten,
      failures: [...failures],
      current,
    });
  };

  /** Spawn the pool and feed it work until the plan is exhausted. */
  const runPool = async (): Promise<void> => {
    let next = 0;

    const workers = Array.from({ length: poolSize() }, () =>
      new Worker(new URL("../workers/texture.worker.ts", import.meta.url), {
        type: "module",
      }));

    /** Drive one worker through jobs until none remain. */
    const drive = (worker: Worker): Promise<void> =>
      new Promise<void>((resolve, reject) => {
        /** Hand the worker its next job, or finish when the plan is done. */
        const pump = (): void => {
          if (options.signal.aborted) {
            reject(new DOMException("Build cancelled", "AbortError"));
            return;
          }

          const index = next;
          next += 1;

          const job = planned[index];

          if (!job) {
            resolve();
            return;
          }

          const message: ITextureJob = {
            id: index,
            url: job.url,
            path: job.path,
            ext: job.ext,
            target: job.target,
          };

          worker.postMessage(message);
        };

        worker.addEventListener("message", (event: MessageEvent<WorkerMessage>) => {
          const data = event.data;

          if (data.type === "error") {
            failures.push(`${data.path}: ${data.error}`);
            completed += 1;
            report(data.path);
            pump();
            return;
          }

          const bytes = new Uint8Array(data.bytes);
          bytesWritten += bytes.byteLength;
          completed += 1;
          report(data.path);

          // `push` resolves only once the ZIP writer has drained enough,
          // which is what applies backpressure to this worker.
          void queue
            .push({ name: data.path, input: bytes, lastModified })
            .then(pump)
            .catch(reject);
        });

        worker.addEventListener("error", (event: ErrorEvent) =>
          reject(new Error(event.message || "texture worker failed")));

        pump();
      });

    try {
      // The manifest is rewritten on the main thread; it is one small file.
      const manifest = await buildManifest(options.packName, options.signal);
      await queue.push({ name: "manifest.json", input: manifest, lastModified });
      completed += 1;
      bytesWritten += manifest.byteLength;
      report("manifest.json");

      await Promise.all(workers.map(drive));
    } finally {
      workers.forEach((worker) => worker.terminate());
      queue.close();
    }
  };

  const pool = runPool();

  await makeZip(queue.drain()).pipeTo(writable, { signal: options.signal });
  await pool;
};

/**
 * Ask the browser for a destination file.
 *
 * @param suggestedName Default filename.
 * @returns A writable stream to disk, or `null` when the API is unavailable
 *   (the caller then falls back to an in-memory download) or the user cancels.
 */
export const pickDestination = async (
  suggestedName: string,
): Promise<WritableStream<Uint8Array> | null> => {
  const picker = (globalThis as { showSaveFilePicker?: unknown }).showSaveFilePicker;

  if (typeof picker !== "function") return null;

  const handle = await (picker as (options: unknown) => Promise<{
    createWritable: () => Promise<WritableStream<Uint8Array>>;
  }>)({
    suggestedName,
    types: [{ description: "Minecraft resource pack", accept: { "application/zip": [".mcpack"] } }],
  });

  return handle.createWritable();
};
