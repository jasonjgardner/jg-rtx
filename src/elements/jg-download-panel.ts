/**
 * `<jg-download-panel>` — drives the in-browser pack build.
 *
 * The element is the UI and lifecycle around `lib/packBuilder.ts`: it resolves
 * the current selection into a size estimate, warns when that estimate is large
 * enough to be a genuine commitment, starts the build, reports progress, and
 * supports cancelling.
 *
 * Catalog data arrives as a JSON payload child rather than attributes, because
 * the inventory is thousands of entries.
 */

import { buildPack, pickDestination } from "../lib/packBuilder";
import type { IBuildProgress, IPackInventory } from "../lib/packBuilder";
import { estimateBytes, formatBytes, RESIZE_STEPS } from "../lib/resize";
import {
  changeCount,
  getState,
  setGlobalSize,
  subscribe,
  type ICustomizationState,
} from "../stores/customization";
import type { ITextureSet, ITextureVersion, IVariety } from "../lib/types";

/** The payload embedded by the download page. */
interface IDownloadData {
  readonly inventory: IPackInventory;
  readonly sets: readonly ITextureSet[];
  readonly varieties: readonly IVariety[];
  readonly history: readonly { readonly id: string; readonly versions: readonly ITextureVersion[] }[];
}

/** Size above which the UI warns before starting a multi-hundred-MB transfer. */
const WARN_BYTES = 150 * 1024 ** 2;

/**
 * Pack build controls and progress.
 *
 * @element jg-download-panel
 */
export class JgDownloadPanel extends HTMLElement {
  #data: IDownloadData | null = null;
  #sets = new Map<string, ITextureSet>();
  #varieties = new Map<string, IVariety>();
  #history = new Map<string, readonly ITextureVersion[]>();
  #controller: AbortController | null = null;
  #unsubscribe: (() => void) | null = null;
  #building = false;

  connectedCallback(): void {
    this.#data = this.#readPayload();
    if (!this.#data) return;

    this.#sets = new Map(this.#data.sets.map((set) => [set.id, set]));
    this.#varieties = new Map(this.#data.varieties.map((variety) => [variety.id, variety]));
    this.#history = new Map(
      (this.#data.history ?? []).map((entry) => [entry.id, entry.versions]),
    );

    this.querySelector("#build")?.addEventListener("click", this.#onBuild);
    this.querySelector("#cancel")?.addEventListener("click", this.#onCancel);
    this.querySelector("#resolution")?.addEventListener("change", this.#onResolution);

    this.#unsubscribe = subscribe((state) => this.#renderEstimate(state));
    this.#renderEstimate(getState());
  }

  disconnectedCallback(): void {
    this.#controller?.abort();
    this.#unsubscribe?.();
    this.#unsubscribe = null;
  }

  #readPayload(): IDownloadData | null {
    const script = this.querySelector('script[type="application/json"]');
    if (!script?.textContent) return null;

    try {
      return JSON.parse(script.textContent) as IDownloadData;
    } catch {
      console.warn("jg-download-panel: could not parse payload");
      return null;
    }
  }

  /** Element lookup that narrows to the expected type. */
  #part<T extends Element>(selector: string): T | null {
    return this.querySelector<T>(selector);
  }

  #onResolution = (event: Event): void => {
    const target = event.target;
    if (!(target instanceof HTMLSelectElement)) return;

    setGlobalSize(target.value === "" ? null : Number(target.value));
  };

  /**
   * Estimate the output size for the current selection.
   *
   * Per-set overrides win over the global setting, mirroring how the builder
   * resolves sizes, so the estimate cannot disagree with what gets produced.
   */
  #estimate(state: ICustomizationState): number {
    const data = this.#data;
    if (!data) return 0;

    // Map each file to its override, if the set it belongs to has one.
    const overrides = new Map<string, number>();

    Object.entries(state.sizes).forEach(([setId, size]) => {
      const set = this.#sets.get(setId);
      if (!set) return;

      (["color", "mer", "mers", "normal", "heightmap"] as const).forEach((role) => {
        const file = set[role];
        if (file) overrides.set(file.file, size);
      });
    });

    // Dimensions are only known for catalogued sets; other textures fall back
    // to assuming the pack's authored 256px width.
    const widths = new Map<string, number>();

    data.sets.forEach((set) => {
      (["color", "mer", "mers", "normal", "heightmap"] as const).forEach((role) => {
        const file = set[role];
        if (file && file.width > 0) widths.set(file.file, file.width);
      });
    });

    const textures = data.inventory.textures.reduce((sum, entry) => {
      const target = overrides.get(entry.file) ?? state.globalSize;
      const width = widths.get(entry.file) ?? 256;

      return sum + estimateBytes(entry.bytes, {
        file: entry.file,
        ext: "png",
        width,
        height: width,
      }, target);
    }, 0);

    const other = data.inventory.other.reduce((sum, entry) => sum + entry.bytes, 0);

    return textures + other;
  }

  /** Update the size estimate, warning, and change count. */
  #renderEstimate(state: ICustomizationState): void {
    const data = this.#data;
    if (!data || this.#building) return;

    const bytes = this.#estimate(state);
    const files = data.inventory.textures.length + data.inventory.other.length;

    const size = this.#part<HTMLElement>("#estimate");
    if (size) size.textContent = formatBytes(bytes);

    const count = this.#part<HTMLElement>("#file-count");
    if (count) count.textContent = String(files);

    const changes = this.#part<HTMLElement>("#changes");
    if (changes) {
      const total = changeCount(state);
      changes.textContent = total === 0
        ? "No customizations yet — this builds the pack as published."
        : `${total} customization${total === 1 ? "" : "s"} applied.`;
    }

    const warning = this.#part<HTMLElement>("#warning");
    if (warning) warning.hidden = bytes < WARN_BYTES;

    const resolution = this.#part<HTMLSelectElement>("#resolution");
    const wanted = state.globalSize === null ? "" : String(state.globalSize);
    if (resolution && resolution.value !== wanted) resolution.value = wanted;
  }

  /** Reflect build progress into the UI. */
  #renderProgress = (progress: IBuildProgress): void => {
    const bar = this.#part<HTMLProgressElement>("#progress");
    if (bar) {
      bar.max = progress.total;
      bar.value = progress.completed;
    }

    const status = this.#part<HTMLElement>("#status");
    if (status) {
      status.textContent =
        `${progress.completed} / ${progress.total} files · ${formatBytes(progress.bytesWritten)} written`;
    }

    const current = this.#part<HTMLElement>("#current");
    if (current) current.textContent = progress.current;

    const failures = this.#part<HTMLElement>("#failures");
    if (failures) {
      failures.hidden = progress.failures.length === 0;
      failures.textContent = progress.failures.length === 0
        ? ""
        : `${progress.failures.length} file(s) failed and were skipped.`;
    }
  };

  /** Toggle between idle and building states. */
  #setBuilding(building: boolean): void {
    this.#building = building;
    this.dataset.state = building ? "building" : "idle";

    const build = this.#part<HTMLButtonElement>("#build");
    if (build) build.disabled = building;

    const cancel = this.#part<HTMLButtonElement>("#cancel");
    if (cancel) cancel.hidden = !building;

    const panel = this.#part<HTMLElement>("#progress-panel");
    if (panel) panel.hidden = !building;
  }

  #onCancel = (): void => {
    this.#controller?.abort();
  };

  #onBuild = async (): Promise<void> => {
    if (this.#building || !this.#data) return;

    const nameInput = this.#part<HTMLInputElement>("#pack-name");
    const packName = (nameInput?.value ?? "").trim() || "JG RTX (Custom)";

    // Collapse anything filename-unsafe to a dash, then trim the dashes that
    // leaves at the ends — "JG RTX (Custom)" would otherwise become
    // "JG-RTX-Custom-.mcpack".
    const slug = packName
      .replace(/[^\w.-]+/g, "-")
      .replace(/^-+|-+$/g, "") || "jg-rtx-custom";

    const fileName = `${slug}.mcpack`;

    const message = this.#part<HTMLElement>("#message");

    /** Show a one-line outcome to the viewer. */
    const say = (text: string, tone: "ok" | "error" | "" = ""): void => {
      if (!message) return;

      message.textContent = text;
      message.dataset.tone = tone;
      message.hidden = text.length === 0;
    };

    say("");

    const destination = await pickDestination(fileName).catch(() => null);

    // An unavailable picker is a fallback; a cancelled picker is a decision.
    if (destination === null && "showSaveFilePicker" in globalThis) {
      say("Save cancelled.");
      return;
    }

    this.#controller = new AbortController();
    this.#setBuilding(true);

    const chunks: Blob[] = [];

    // Without the File System Access API the ZIP has to be held in memory,
    // which is only reasonable for small builds. Each chunk is wrapped in a
    // Blob as it arrives so the browser can spill them to disk rather than
    // pinning the whole archive in the JS heap.
    const writable = destination ?? new WritableStream<Uint8Array>({
      write: (chunk) => {
        const copy = new ArrayBuffer(chunk.byteLength);
        new Uint8Array(copy).set(chunk);
        chunks.push(new Blob([copy]));
      },
    });

    try {
      await buildPack(
        {
          inventory: this.#data.inventory,
          sets: this.#sets,
          varieties: this.#varieties,
          history: this.#history,
          state: getState(),
          packName,
          signal: this.#controller.signal,
          onProgress: this.#renderProgress,
        },
        writable,
      );

      if (destination === null) this.#offerBlob(chunks, fileName);

      say(`Done — ${fileName} is ready.`, "ok");
    } catch (error) {
      const aborted = error instanceof DOMException && error.name === "AbortError";

      say(
        aborted ? "Build cancelled." : `Build failed: ${
          error instanceof Error ? error.message : String(error)
        }`,
        aborted ? "" : "error",
      );
    } finally {
      this.#setBuilding(false);
      this.#controller = null;
    }
  };

  /** Hand the viewer an in-memory ZIP when streaming to disk was unavailable. */
  #offerBlob(chunks: readonly Blob[], fileName: string): void {
    const blob = new Blob([...chunks], { type: "application/zip" });
    const href = URL.createObjectURL(blob);

    const anchor = document.createElement("a");
    anchor.href = href;
    anchor.download = fileName;
    anchor.click();

    // Revoke once the browser has had a chance to start the download.
    setTimeout(() => URL.revokeObjectURL(href), 60_000);
  }
}

if (!customElements.get("jg-download-panel")) {
  customElements.define("jg-download-panel", JgDownloadPanel);
}

/** Re-exported so the page template can render the same option list. */
export { RESIZE_STEPS };
