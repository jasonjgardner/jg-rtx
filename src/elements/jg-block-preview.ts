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

import {
  mountPreview,
  type ICameraState,
  type IFacePlan,
  type IPreview,
} from "../lib/preview3d";
import { isBlockShape, type BlockShapeId } from "../lib/blockShapes";
import type { ColormapId } from "../lib/colormap";
import { getState, subscribe } from "../stores/customization";
import { BLOCK_FACES, type BlockFace, type ITextureSet, type IVariety } from "../lib/types";

/** The payload embedded by the block page. */
interface IPreviewData {
  readonly faces: Readonly<Record<BlockFace, string | null>>;
  readonly tints: Readonly<Record<BlockFace, string | null>>;
  readonly sets: Readonly<Record<string, ITextureSet>>;
  readonly varieties: Readonly<Record<string, IVariety>>;
  /** Shape resolved for this block at catalog time. */
  readonly shape: BlockShapeId;
  /** Biome colormap that tints this block, when one applies. */
  readonly colormap?: ColormapId;
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
  #reset: HTMLButtonElement | null = null;
  #shapePicker: HTMLSelectElement | null = null;
  #shape: BlockShapeId = "full_block";
  #camera: ICameraState | null = null;
  #pending = false;

  connectedCallback(): void {
    this.#data = this.#readPayload();
    if (!this.#data) return;

    // The stage and controls are server-rendered where possible, so the button
    // is a real button with real keyboard semantics. Fall back to creating a
    // stage when the element is used without that markup.
    this.#stage = this.querySelector<HTMLElement>("[data-preview-stage]");

    if (!this.#stage) {
      this.#stage = document.createElement("div");
      this.#stage.dataset.previewStage = "";
      this.append(this.#stage);
    }

    this.#reset = this.querySelector<HTMLButtonElement>("[data-preview-reset]");
    this.#reset?.addEventListener("click", this.#onReset);

    this.#shape = this.#data.shape;
    this.#shapePicker = this.querySelector<HTMLSelectElement>("[data-preview-shape]");

    if (this.#shapePicker) {
      this.#shapePicker.value = this.#shape;
      this.#shapePicker.addEventListener("change", this.#onShape);
    }

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
    this.#reset?.removeEventListener("click", this.#onReset);
    this.#shapePicker?.removeEventListener("change", this.#onShape);

    this.#observer = null;
    this.#resizeObserver = null;
    this.#unsubscribe = null;
    this.#controller = null;
    this.#preview = null;
  }

  /** Return the camera to its default framing and resume the idle spin. */
  #onReset = (): void => {
    this.#preview?.resetCamera();
    this.#camera = this.#preview?.cameraState() ?? null;
  };

  /**
   * Switch the voxel shape. The catalog's guess is right for most blocks, but
   * it is a guess from the identifier, so the viewer can correct it.
   */
  #onShape = (event: Event): void => {
    const target = event.target;
    if (!(target instanceof HTMLSelectElement) || !isBlockShape(target.value)) return;

    this.#shape = target.value;
    void this.#build();
  };

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
   * Pick the texture a tinted face should be composited over, if any.
   *
   * Bedrock's grass-family blocks ship the tinted overlay alone — `grass_side`
   * is opaque for its top 60% and empty below — and rely on the engine to lay
   * it over the block's base texture. The block's own `down` face is that base
   * (grass, mycelium and podzol all sit on `dirt`).
   *
   * The guard is deliberately tight: only tinted faces qualify, and only when
   * the base is a genuinely different texture. Without that second test a vine,
   * which is tinted and cut out on every face including `down`, would be
   * composited over itself and lose its transparency.
   *
   * @param data The embedded payload.
   * @param setId Texture set of the face being planned.
   * @returns The base texture set, or `undefined` to leave the face alone.
   */
  #underlayFor(data: IPreviewData, setId: string): ITextureSet | undefined {
    const baseId = data.faces.down;

    if (baseId === null || baseId === setId) return undefined;

    return data.sets[baseId];
  }

  /**
   * Resolve the current selection into a face plan: one entry per distinct
   * texture set, listing the block faces it covers.
   */
  #plan(data: IPreviewData): IFacePlan[] {
    const { varieties: selected } = getState();
    const order: string[] = [];
    const bySet = new Map<string, BlockFace[]>();
    const tintBySet = new Map<string, string | null>();

    BLOCK_FACES.forEach((face) => {
      const setId = data.faces[face];
      if (setId === null) return;

      const existing = bySet.get(setId);

      if (!existing) {
        order.push(setId);
        bySet.set(setId, [face]);
        tintBySet.set(setId, data.tints?.[face] ?? null);
        return;
      }

      existing.push(face);
    });

    return order.flatMap((setId) => {
      const base = data.sets[setId];
      if (!base) return [];

      const varietyId = selected[setId];
      const variety = varietyId === undefined ? undefined : data.varieties[varietyId];

      const tint = variety ? null : tintBySet.get(setId) ?? null;

      return [{
        set: applyVariety(base, variety),
        faces: bySet.get(setId) ?? [],
        // A chosen variety brings its own colour, so a biome tint that suited
        // the pack default would wrongly recolour it.
        tint,
        // A variety supplies its own colour, so neither the declared tint nor
        // the colormap should recolour it.
        colormap: variety ? undefined : data.colormap,
        underlay: tint === null ? undefined : this.#underlayFor(data, setId),
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

    // Carry the current view into the rebuild, so choosing a variety swaps the
    // texture without snapping the camera back to its starting angle.
    this.#camera = this.#preview?.cameraState() ?? this.#camera;

    this.#preview?.dispose();
    this.#preview = null;

    const controller = new AbortController();
    this.#controller = controller;

    this.dataset.state = "loading";

    try {
      const preview = await mountPreview(
        stage,
        this.#plan(data),
        this.#shape,
        controller.signal,
        this.#camera ?? undefined,
      );

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
