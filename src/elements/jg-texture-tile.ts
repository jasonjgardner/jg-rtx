/**
 * `<jg-texture-tile>` — a 2D preview of a single pack texture.
 *
 * Three things make this more than an `<img>`:
 *
 * - **TGA** cannot go in an `<img>` at all, so those are decoded to pixels.
 * - **Flipbooks** are vertical strips of square frames; the tile shows one
 *   frame at a time and animates at the pack's declared tick rate.
 * - **Lazy loading** matters because an index page can hold hundreds of tiles,
 *   each a 256px texture from the CDN. Loading starts only on first scroll-in.
 */

import { loadBitmap } from "../lib/decode";
import type { TextureExt } from "../lib/types";

/** Real-time duration of one Minecraft tick, in milliseconds. */
const TICK_MS = 50;

/** How far ahead of the viewport to begin loading. */
const ROOT_MARGIN = "200px";

const TEMPLATE = document.createElement("template");
TEMPLATE.innerHTML = `
  <style>
    :host {
      display: block;
      position: relative;
    }

    canvas {
      aspect-ratio: 1;
      background-color: light-dark(#e8e8e8, #1b1b1b);
      block-size: auto;
      border-radius: 0.25rem;
      display: block;
      image-rendering: pixelated;
      inline-size: 100%;
    }

    .badge {
      background-color: light-dark(#000c, #000c);
      border-radius: 0.25rem;
      color: #fff;
      font-size: 0.625rem;
      inset-block-start: 0.25rem;
      inset-inline-end: 0.25rem;
      padding-block: 0.0625rem;
      padding-inline: 0.25rem;
      position: absolute;
    }

    .badge[hidden] { display: none; }

    .error {
      align-items: center;
      color: light-dark(#a33, #f88);
      display: grid;
      font-size: 0.75rem;
      inset: 0;
      padding: 0.5rem;
      place-items: center;
      position: absolute;
      text-align: center;
    }
  </style>
  <canvas part="canvas"></canvas>
  <span class="badge" hidden></span>
`;

/**
 * A lazily-loaded, optionally animated texture preview.
 *
 * @element jg-texture-tile
 * @attr {string} src - Absolute URL of the texture.
 * @attr {"png"|"tga"} ext - Container format; `tga` triggers JS decoding.
 * @attr {number} frames - Flipbook frame count. Omit or `1` for a still image.
 * @attr {number} ticks - Game ticks each frame is held.
 * @attr {string} label - Accessible name for the preview.
 */
export class JgTextureTile extends HTMLElement {
  static readonly observedAttributes = ["src", "ext", "frames", "ticks", "label"];

  #canvas: HTMLCanvasElement | null = null;
  #badge: HTMLElement | null = null;
  #bitmap: ImageBitmap | null = null;
  #observer: IntersectionObserver | null = null;
  #controller: AbortController | null = null;
  #animation = 0;
  #started = false;

  connectedCallback(): void {
    if (!this.shadowRoot) {
      const root = this.attachShadow({ mode: "open" });
      root.append(TEMPLATE.content.cloneNode(true));
      this.#canvas = root.querySelector("canvas");
      this.#badge = root.querySelector(".badge");
    }

    this.#applyLabel();
    this.#observe();
  }

  disconnectedCallback(): void {
    this.#teardown();
  }

  attributeChangedCallback(name: string): void {
    if (name === "label") {
      this.#applyLabel();
      return;
    }

    if (!this.isConnected) return;

    // A changed source invalidates everything already loaded.
    this.#teardown();
    this.#started = false;
    this.#observe();
  }

  /** Frame count, defaulting to a single still frame. */
  get #frames(): number {
    return Math.max(1, Number(this.getAttribute("frames") ?? "1"));
  }

  /** Milliseconds each frame is held. */
  get #frameDuration(): number {
    return Math.max(1, Number(this.getAttribute("ticks") ?? "1")) * TICK_MS;
  }

  #applyLabel(): void {
    const label = this.getAttribute("label");
    if (!this.#canvas || label === null) return;

    this.#canvas.setAttribute("role", "img");
    this.#canvas.setAttribute("aria-label", label);
  }

  /** Begin loading once the tile approaches the viewport. */
  #observe(): void {
    if (this.#started) return;

    // Without IntersectionObserver, fall back to loading immediately.
    if (typeof IntersectionObserver === "undefined") {
      void this.#load();
      return;
    }

    this.#observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return;

        this.#observer?.disconnect();
        this.#observer = null;
        void this.#load();
      },
      { rootMargin: ROOT_MARGIN },
    );

    this.#observer.observe(this);
  }

  async #load(): Promise<void> {
    const src = this.getAttribute("src");
    if (this.#started || src === null || !this.#canvas) return;

    this.#started = true;
    this.#controller = new AbortController();

    const ext = (this.getAttribute("ext") ?? "png") as TextureExt;

    try {
      this.#bitmap = await loadBitmap(src, ext, this.#controller.signal);
      this.#paint();
    } catch (error) {
      // An aborted load is a normal consequence of navigating away.
      if (this.#controller?.signal.aborted) return;

      this.#showError(error);
    }
  }

  /** Draw the first frame, then animate if the texture is a flipbook. */
  #paint(): void {
    const bitmap = this.#bitmap;
    const canvas = this.#canvas;
    if (!bitmap || !canvas) return;

    const frames = this.#frames;
    const frameHeight = Math.max(1, Math.round(bitmap.height / frames));

    canvas.width = bitmap.width;
    canvas.height = frameHeight;

    const context = canvas.getContext("2d");
    if (!context) return;

    context.imageSmoothingEnabled = false;

    /** Blit one frame of the strip into the canvas. */
    const drawFrame = (index: number): void => {
      context.clearRect(0, 0, bitmap.width, frameHeight);
      context.drawImage(
        bitmap,
        0,
        index * frameHeight,
        bitmap.width,
        frameHeight,
        0,
        0,
        bitmap.width,
        frameHeight,
      );
    };

    drawFrame(0);

    if (frames <= 1) return;

    this.#showBadge(`${frames}f`);

    const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced) return;

    const duration = this.#frameDuration;
    let last = performance.now();
    let current = 0;

    const step = (now: number): void => {
      if (now - last >= duration) {
        last = now;
        current = (current + 1) % frames;
        drawFrame(current);
      }

      this.#animation = requestAnimationFrame(step);
    };

    this.#animation = requestAnimationFrame(step);
  }

  #showBadge(text: string): void {
    if (!this.#badge) return;

    this.#badge.textContent = text;
    this.#badge.hidden = false;
  }

  #showError(error: unknown): void {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(`jg-texture-tile: ${message}`);

    const note = document.createElement("span");
    note.className = "error";
    note.textContent = "unavailable";
    this.shadowRoot?.append(note);
  }

  /** Release the bitmap, the animation frame, and any in-flight request. */
  #teardown(): void {
    cancelAnimationFrame(this.#animation);
    this.#animation = 0;

    this.#observer?.disconnect();
    this.#observer = null;

    this.#controller?.abort();
    this.#controller = null;

    this.#bitmap?.close();
    this.#bitmap = null;
  }
}

if (!customElements.get("jg-texture-tile")) {
  customElements.define("jg-texture-tile", JgTextureTile);
}
