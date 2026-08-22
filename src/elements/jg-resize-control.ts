/**
 * `<jg-resize-control>` — binds a rendered `<select>` to the customization store.
 *
 * The `<select>` and its options are server-rendered, so the control is present
 * and usable before this module loads; the element only adds persistence and
 * cross-page sync. That keeps the markup accessible and avoids client-side
 * templating for what is fundamentally a form control.
 */

import { effectiveSize, setTextureSize, subscribe } from "../stores/customization";

/**
 * Persists a per-texture resolution override.
 *
 * @element jg-resize-control
 * @attr {string} set-id - Texture set the override applies to.
 */
export class JgResizeControl extends HTMLElement {
  #select: HTMLSelectElement | null = null;
  #unsubscribe: (() => void) | null = null;

  connectedCallback(): void {
    this.#select = this.querySelector("select");
    if (!this.#select) return;

    this.#sync();
    this.#select.addEventListener("change", this.#onChange);
    this.#unsubscribe = subscribe(() => this.#sync());
  }

  disconnectedCallback(): void {
    this.#select?.removeEventListener("change", this.#onChange);
    this.#unsubscribe?.();
    this.#unsubscribe = null;
  }

  /** Texture set this control governs. */
  get #setId(): string {
    return this.getAttribute("set-id") ?? "";
  }

  /** Write the chosen size to the store. An empty value clears the override. */
  #onChange = (): void => {
    const raw = this.#select?.value ?? "";

    setTextureSize(this.#setId, raw === "" ? null : Number(raw));
  };

  /** Reflect store state into the control, without re-firing `change`. */
  #sync(): void {
    if (!this.#select) return;

    const size = effectiveSize(this.#setId);
    const next = size === null ? "" : String(size);

    // Only assign when different, so the user's caret/selection is untouched.
    if (this.#select.value !== next) this.#select.value = next;
  }
}

if (!customElements.get("jg-resize-control")) {
  customElements.define("jg-resize-control", JgResizeControl);
}
