/**
 * `<jg-variety-picker>` — binds rendered radio inputs to the customization store.
 *
 * Varieties are alternate textures that can stand in for a pack texture: the
 * `variety/pages/textures/blocks/<set>/` directories hold per-set alternatives,
 * and the flat collections (`modern`, `vanilla`, the glass subpacks) each offer
 * one. Selecting one swaps the texture used in the generated pack.
 *
 * The inputs are server-rendered so the group is a real radio group with real
 * keyboard semantics; this element adds persistence and announces the change so
 * the 3D preview can update.
 */

import { getState, setVariety, subscribe } from "../stores/customization";

/** Event announced when a variety selection changes, for previews to observe. */
export const VARIETY_EVENT = "jg-rtx:variety";

/** Detail carried by {@link VARIETY_EVENT}. */
export interface IVarietyChange {
  readonly setId: string;
  readonly varietyId: string | null;
}

/**
 * Persists a per-texture variety selection.
 *
 * @element jg-variety-picker
 * @attr {string} set-id - Texture set the variety replaces.
 * @fires jg-rtx:variety - When the selection changes.
 */
export class JgVarietyPicker extends HTMLElement {
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

    const varietyId = target.value === "" ? null : target.value;

    setVariety(this.#setId, varietyId);

    this.dispatchEvent(
      new CustomEvent<IVarietyChange>(VARIETY_EVENT, {
        bubbles: true,
        composed: true,
        detail: { setId: this.#setId, varietyId },
      }),
    );
  };

  /** Reflect store state into the radio group. */
  #sync(): void {
    const selected = getState().varieties[this.#setId] ?? "";

    this.#inputs.forEach((input) => {
      const shouldCheck = input.value === selected;

      if (input.checked !== shouldCheck) input.checked = shouldCheck;
    });
  }
}

if (!customElements.get("jg-variety-picker")) {
  customElements.define("jg-variety-picker", JgVarietyPicker);
}
