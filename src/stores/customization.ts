/**
 * Customization state, shared across every page of the site.
 *
 * The viewer builds a selection by wandering between block pages, so the state
 * has to outlive navigation. It is persisted to `localStorage` and re-published
 * on a DOM event, which lets independent custom elements stay in sync without a
 * framework runtime or a shared parent.
 *
 * Updates are immutable: every mutator returns a fresh object rather than
 * editing in place, so subscribers can compare by reference.
 */

/** Storage key. Versioned so a shape change can invalidate stale state. */
const STORAGE_KEY = "jg-rtx:customization:v1";

/** Event dispatched on `document` whenever state changes. */
export const CHANGE_EVENT = "jg-rtx:change";

/** The persisted selection. */
export interface ICustomizationState {
  /**
   * Resolution cap applied to every texture, or `null` to keep native sizes.
   * Per-texture entries in {@link sizes} take precedence over this.
   */
  readonly globalSize: number | null;
  /** Per-texture-set resolution overrides, keyed by set id. */
  readonly sizes: Readonly<Record<string, number>>;
  /** Per-texture-set variety selections, keyed by set id. */
  readonly varieties: Readonly<Record<string, string>>;
  /**
   * Per-texture-set historical revisions, keyed by set id, valued by the full
   * commit SHA. Only the commit is stored; the revision's path is looked up
   * from the catalog, so localStorage stays small.
   */
  readonly versions: Readonly<Record<string, string>>;
}

/** The empty selection. */
const EMPTY: ICustomizationState = {
  globalSize: null,
  sizes: {},
  varieties: {},
  versions: {},
};

/**
 * Narrow unknown parsed JSON to a state object, discarding anything malformed.
 * Stale or hand-edited storage must never crash the page.
 */
const coerce = (value: unknown): ICustomizationState => {
  if (typeof value !== "object" || value === null) return EMPTY;

  const raw = value as Partial<Record<keyof ICustomizationState, unknown>>;

  const globalSize = typeof raw.globalSize === "number" ? raw.globalSize : null;

  const sizes = Object.fromEntries(
    Object.entries(raw.sizes ?? {}).filter(
      (entry): entry is [string, number] => typeof entry[1] === "number",
    ),
  );

  const varieties = Object.fromEntries(
    Object.entries(raw.varieties ?? {}).filter(
      (entry): entry is [string, string] => typeof entry[1] === "string",
    ),
  );

  const versions = Object.fromEntries(
    Object.entries(raw.versions ?? {}).filter(
      (entry): entry is [string, string] => typeof entry[1] === "string",
    ),
  );

  return { globalSize, sizes, varieties, versions };
};

/** Read persisted state. Returns the empty selection during SSR. */
const load = (): ICustomizationState => {
  if (typeof localStorage === "undefined") return EMPTY;

  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw === null ? EMPTY : coerce(JSON.parse(raw));
  } catch {
    return EMPTY;
  }
};

let state: ICustomizationState = load();

/** Persist and broadcast. Storage failures (private mode, quota) are non-fatal. */
const commit = (next: ICustomizationState): void => {
  state = next;

  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // A full or unavailable store must not break the interaction.
  }

  document.dispatchEvent(new CustomEvent(CHANGE_EVENT, { detail: next }));
};

/** Read the current selection. */
export const getState = (): ICustomizationState => state;

/**
 * Subscribe to selection changes.
 *
 * @param listener Called with the new state after every change.
 * @returns An unsubscribe function, for `disconnectedCallback`.
 */
export const subscribe = (
  listener: (next: ICustomizationState) => void,
): (() => void) => {
  const handler = (event: Event): void => {
    listener((event as CustomEvent<ICustomizationState>).detail);
  };

  document.addEventListener(CHANGE_EVENT, handler);

  return () => document.removeEventListener(CHANGE_EVENT, handler);
};

/**
 * Set the global resolution cap.
 *
 * @param size Target width in pixels, or `null` for native resolution.
 */
export const setGlobalSize = (size: number | null): void => {
  commit({ ...state, globalSize: size });
};

/**
 * Override the resolution for one texture set.
 *
 * @param setId Texture set id, e.g. `textures/blocks/stone`.
 * @param size Target width, or `null` to fall back to the global setting.
 */
export const setTextureSize = (setId: string, size: number | null): void => {
  const { [setId]: _removed, ...rest } = state.sizes;

  commit({
    ...state,
    sizes: size === null ? rest : { ...rest, [setId]: size },
  });
};

/**
 * Select a variety for one texture set.
 *
 * @param setId Texture set id the variety replaces.
 * @param varietyId Variety id, or `null` to restore the pack default.
 */
export const setVariety = (setId: string, varietyId: string | null): void => {
  const { [setId]: _removed, ...rest } = state.varieties;

  commit({
    ...state,
    varieties: varietyId === null ? rest : { ...rest, [setId]: varietyId },
  });
};

/**
 * Select a historical revision for one texture set.
 *
 * @param setId Texture set id.
 * @param sha Full commit SHA, or `null` to restore the current design.
 */
export const setVersion = (setId: string, sha: string | null): void => {
  const { [setId]: _removed, ...rest } = state.versions;

  commit({
    ...state,
    versions: sha === null ? rest : { ...rest, [setId]: sha },
  });
};

/** Clear every customization. */
export const reset = (): void => commit(EMPTY);

/**
 * Resolve the effective target width for a texture set.
 *
 * @param setId Texture set id.
 * @param next State to read, defaulting to the current state.
 * @returns The target width, or `null` when the texture keeps its native size.
 */
export const effectiveSize = (
  setId: string,
  next: ICustomizationState = state,
): number | null => next.sizes[setId] ?? next.globalSize;

/**
 * Count the customizations a viewer has made, for the header badge.
 *
 * @param next State to read, defaulting to the current state.
 */
export const changeCount = (next: ICustomizationState = state): number =>
  Object.keys(next.sizes).length +
  Object.keys(next.varieties).length +
  Object.keys(next.versions).length +
  (next.globalSize === null ? 0 : 1);
