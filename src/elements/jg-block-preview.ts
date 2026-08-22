/**
 * `<jg-block-preview>` — a lit, rotating 3D preview of one block.
 *
 * The element owns lifecycle only: it defers WebGL setup until the canvas is
 * near the viewport, rebuilds when the viewer picks a different variety, and
 * disposes GPU resources on disconnect. The scene itself lives in
 * `lib/preview3d.ts`.
 *
 * Its data arrives as a JSON payload in a child `<script type="application/json">`
 * rather than as attributes, because a block carries several texture sets and
 * their PBR maps — far more structure than attributes should hold.
 */

import { mountPreview, BOX_FACE_ORDER, type IFacePlan, type IPreview } from "../lib/preview3d";
import { getState, subscribe } from "../stores/customization";
import type { BlockFace, ITextureSet, IVariety } from "../lib/types";

/** The payload embedded by the block page. */
interface IPreviewData {
  readonly faces: Readonly<Record<BlockFace, string | null>>;
  readonly tints: Readonly<Record<BlockFace, string | null>>;
  readonly sets: Readonly<Record<string, ITextureSet>>;
  readonly varieties: Readonly<Record<string, IVariety>>;
}

/**
 * Overlay a variety's textures onto its base set.
 *
 * A variety may ship only a colour map, in which case the base set's PBR maps
 * still apply — dropping them would make the block render flat.
 *
 * @param set The pack's texture set.
 * @param variety The selected variety, if any.
 */
const applyVariety = (set: ITextureSet, variety: IVariety | undefined): ITextureSet => {
  if (!variety) return set;

  return {
    ...set,
    color: variety.color,
    ...(variety.mer ? { mer: variety.mer } : {}),
    ...(variety.mers ? { mers: variety.mers } : {}),
    ...(variety.normal ? { normal: variety.normal } : {}),
    ...(variety.heightmap ? { heightmap: variety.heightmap } : {}),
  };
};

/**
 * A deferred, self-disposing 3D block preview.
 *
 * @element jg-block-preview
 */
export class JgBlockPreview extends HTMLElement {
  #data: IPreviewData | null = null;
  #preview: IPreview | null = null;
  #controller: AbortController | null = null;
  #observer: IntersectionObserver | null = null;
  #resizeObserver: ResizeObserver | null = null;
  #unsubscribe: (() => void) | null = null;
  #stage: HTMLElement | null = null;
  #pending = false;

  connectedCallback(): void {
    this.#data = this.#readPayload();
    if (!this.#data) return;

    this.#stage = document.createElement("div");
    this.#stage.className = "jg-block-preview__stage";
    this.append(this.#stage);

    this.#observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return;

        this.#observer?.disconnect();
        this.#observer = null;
        void this.#build();
      },
      { rootMargin: "100px" },
    );

    this.#observer.observe(this);

    // A variety swap changes which textures the cube shows.
    this.#unsubscribe = subscribe(() => {
      if (this.#preview || this.#pending) void this.#build();
    });
  }

  disconnectedCallback(): void {
    this.#observer?.disconnect();
    this.#resizeObserver?.disconnect();
    this.#unsubscribe?.();
    this.#controller?.abort();
    this.#preview?.dispose();

    this.#observer = null;
    this.#resizeObserver = null;
    this.#unsubscribe = null;
    this.#controller = null;
    this.#preview = null;
  }

  /** Parse the embedded JSON payload, tolerating a missing or malformed one. */
  #readPayload(): IPreviewData | null {
    const script = this.querySelector('script[type="application/json"]');
    if (!script?.textContent) return null;

    try {
      return JSON.parse(script.textContent) as IPreviewData;
    } catch {
      console.warn("jg-block-preview: could not parse payload");
      return null;
    }
  }

  /**
   * Resolve the current selection into a face plan: one entry per distinct
   * texture set, listing the box face indices it covers.
   */
  #plan(data: IPreviewData): IFacePlan[] {
    const { varieties: selected } = getState();
    const order: string[] = [];
    const bySet = new Map<string, number[]>();
    const tintBySet = new Map<string, string | null>();

    BOX_FACE_ORDER.forEach((face, index) => {
      const setId = data.faces[face];
      if (setId === null) return;

      const existing = bySet.get(setId);

      if (!existing) {
        order.push(setId);
        bySet.set(setId, [index]);
        tintBySet.set(setId, data.tints?.[face] ?? null);
        return;
      }

      existing.push(index);
    });

    return order.flatMap((setId) => {
      const base = data.sets[setId];
      if (!base) return [];

      const varietyId = selected[setId];
      const variety = varietyId === undefined ? undefined : data.varieties[varietyId];

      return [{
        set: applyVariety(base, variety),
        faces: bySet.get(setId) ?? [],
        // A chosen variety brings its own colour, so a biome tint that suited
        // the pack default would wrongly recolour it.
        tint: variety ? null : tintBySet.get(setId) ?? null,
      }];
    });
  }

  /** Tear down any existing scene and build a fresh one. */
  async #build(): Promise<void> {
    const data = this.#data;
    const stage = this.#stage;
    if (!data || !stage || this.#pending) return;

    this.#pending = true;

    this.#controller?.abort();
    this.#preview?.dispose();
    this.#preview = null;

    const controller = new AbortController();
    this.#controller = controller;

    this.dataset.state = "loading";

    try {
      const preview = await mountPreview(stage, this.#plan(data), controller.signal);

      // A newer build may have started while this one awaited.
      if (controller.signal.aborted) {
        preview.dispose();
        return;
      }

      this.#preview = preview;
      this.dataset.state = "ready";

      this.#resizeObserver?.disconnect();
      this.#resizeObserver = new ResizeObserver(() => preview.resize());
      this.#resizeObserver.observe(stage);
    } catch (error) {
      if (controller.signal.aborted) return;

      console.warn("jg-block-preview:", error);
      this.dataset.state = "error";
    } finally {
      this.#pending = false;
    }
  }
}

if (!customElements.get("jg-block-preview")) {
  customElements.define("jg-block-preview", JgBlockPreview);
}
