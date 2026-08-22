/**
 * `<jg-version-picker>` — binds rendered radio inputs to the version store.
 *
 * Structurally the same as the variety picker: the inputs are server-rendered
 * so the group has real radio semantics, and this element adds persistence and
 * announces the change so the preview rebuilds.
 *
 * The two are mutually exclusive in effect — a variety replaces the texture
 * outright, so a previous *design of the pack's own texture* no longer means
 * anything for it. That precedence lives in the preview's plan rather than
 * here, so the store keeps both selections and neither silently erases the
 * other.
 */

import { getState, setVersion, subscribe } from "../stores/customization";

/** Event announced when a revision selection changes. */
export const VERSION_EVENT = "jg-rtx:version";

/** Detail carried by {@link VERSION_EVENT}. */
export interface IVersionChange {
  readonly setId: string;
  /** Full commit SHA, or `null` for the current design. */
  readonly commit: string | null;
}

/**
 * Persists a per-texture historical revision selection.
 *
 * @element jg-version-picker
 * @attr {string} set-id - Texture set the revision applies to.
 * @fires jg-rtx:version - When the selection changes.
 */
export class JgVersionPicker extends HTMLElement {
  #unsubscribe: (() => void) | null = null;

  connectedCallback(): void {
    this.#sync();
    this.addEventListener("change", this.#onChange);
    this.#unsubscribe = subscribe(() => this.#sync());
  }

  disconnectedCallback(): void {
    this.removeEventListener("change", this.#onChange);
    this.#unsubscribe?.();
    this.#unsubscribe = null;
  }

  /** Texture set this picker governs. */
  get #setId(): string {
    return this.getAttribute("set-id") ?? "";
  }

  /** All radio inputs in the group. */
  get #inputs(): HTMLInputElement[] {
    return [...this.querySelectorAll<HTMLInputElement>('input[type="radio"]')];
  }

  #onChange = (event: Event): void => {
    const target = event.target;
    if (!(target instanceof HTMLInputElement) || target.type !== "radio") return;

    const commit = target.value === "" ? null : target.value;

    setVersion(this.#setId, commit);

    this.dispatchEvent(
      new CustomEvent<IVersionChange>(VERSION_EVENT, {
        bubbles: true,
        composed: true,
        detail: { setId: this.#setId, commit },
      }),
    );
  };

  /** Reflect store state into the radio group. */
  #sync(): void {
    const selected = getState().versions[this.#setId] ?? "";

    this.#inputs.forEach((input) => {
      const shouldCheck = input.value === selected;

      if (input.checked !== shouldCheck) input.checked = shouldCheck;
    });
  }
}

if (!customElements.get("jg-version-picker")) {
  customElements.define("jg-version-picker", JgVersionPicker);
}
