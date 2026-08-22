/**
 * Curated material knowledge for the Bedrock to labPBR conversion.
 *
 * These tables exist because the conversion is not decidable from pixels alone:
 *
 * 1. **Metal identity.** labPBR's eight presets are physical F0 reflectances, which
 *    are pale and desaturated. JG RTX authors metal albedo artistically: dark and
 *    saturated. Matching albedo against the presets therefore misfires on
 *    everything except gold (see {@link matchMetalPreset}). Names are the only
 *    reliable signal, so metals are declared, not inferred. Anything undeclared
 *    falls back to `255` ("albedo as F0"), which reproduces Bedrock's own shading
 *    exactly and can never pick the *wrong* metal.
 *
 * 2. **Metalness thresholds.** Bedrock's metalness is a continuous mask; labPBR has
 *    no partial-metal encoding. This pack's authoring is inconsistent, so a single
 *    global threshold is wrong. Every threshold below was read off the actual
 *    histogram of the texture it governs.
 *
 * 3. **Porosity.** Bedrock has no porosity channel at all. labPBR's blue channel
 *    wants one. The values below are authored judgement, and are the main tuning
 *    surface of this converter.
 */

import { MAX_DIELECTRIC_F0 } from "./metals";

/** Where a metal pixel's green-channel value comes from. */
export type MetalTarget =
  /** A labPBR predefined metal id in `230..237`. */
  | number
  /** Emit `255`: the shader reads the albedo as F0. Faithful to Bedrock. */
  | "albedo"
  /** Never metal. Emit the configured dielectric F0 regardless of metalness. */
  | "dielectric";

/** A name-matched rule describing how one family of textures becomes metal. */
export interface IMetalRule {
  /** Tested against the Bedrock texture base name (no `_mer` / `.png` suffix). */
  readonly pattern: RegExp;
  /** What to write into the green channel for pixels that clear {@link threshold}. */
  readonly target: MetalTarget;
  /**
   * Normalised metalness (`mer.r / 255`) at or above which a pixel counts as metal.
   * Omitted means {@link DEFAULT_METAL_THRESHOLD}.
   */
  readonly threshold?: number;
  /** Why this rule exists. Shown in the conversion report. */
  readonly note: string;
}

/** Applied when no {@link IMetalRule} matches. Bedrock authors metalness around 0.5. */
export const DEFAULT_METAL_THRESHOLD = 0.5;

/** F0 of a typical dielectric: 4% reflectance, `round(0.04 * 255)`. */
export const DEFAULT_DIELECTRIC_F0 = 10;

/**
 * Ordered metal rules. **First match wins**, so the chromatic families are listed
 * before the generic iron catch-alls (`oxidized_copper_chain1` must resolve to
 * copper, not to the `chain` rule; `rail_golden` to gold, not to `rail`).
 *
 * Thresholds were derived from the measured metalness histogram of each family:
 * - copper: the dimmest genuine copper pixel in the pack is `77`
 *   (`oxidized_copper_trapdoor`) over a `0` background, and `copper_block` never
 *   exceeds `127`. `0.20` separates them cleanly without promoting ore noise.
 * - anvils: metalness is a `32..102` smear over a `0` background.
 * - lodestone: flat `80` (side) and `67` (top); `0.25` keeps both, `0.30` drops the top.
 */
export const METAL_RULES: readonly IMetalRule[] = [
  // --- Copper. Listed first: many copper items also contain "chain"/"bars"/"door". ---
  {
    pattern: /copper/,
    target: 234,
    threshold: 0.2,
    note: "Copper family. copper_block caps at 127 and oxidized_copper is a flat 100, so 0.5 would erase them.",
  },
  {
    pattern: /^lightning_rod$/,
    target: 234,
    threshold: 0.2,
    note: "Lightning rods are copper.",
  },

  // --- Gold. Before iron so rail_golden does not fall into the rail rule. ---
  {
    pattern: /gold|gilded/,
    target: 231,
    note: "Gold family, incl. gold_ore specks (195..214) and gilded_blackstone (254).",
  },
  {
    pattern: /^rail_golden/,
    target: 231,
    note: "Powered rails are gold-plated.",
  },

  // --- Iron, with per-family thresholds where the authoring is unusually dim. ---
  {
    pattern: /^anvil/,
    target: 230,
    threshold: 0.125,
    note: "Anvils are solid iron but authored as a 32..102 metalness smear.",
  },
  {
    pattern: /^lodestone/,
    target: 230,
    threshold: 0.25,
    note: "Flat metalness: 80 on the side, 67 on the top.",
  },
  {
    pattern: /^grindstone_pivot$|^trip_wire$/,
    target: 230,
    threshold: 0.125,
    note: "Small iron parts authored below 0.34 metalness.",
  },
  {
    pattern: /iron|^cauldron|^hopper|^rail_|^chain\d*$|^bell_/,
    target: 230,
    note: "Iron blocks, bars, doors, ore specks, cauldrons, hoppers, plain rails and chains.",
  },

  // --- Materials Bedrock marks metallic purely for sheen. ---
  {
    pattern: /^honey_/,
    target: "dielectric",
    note: "Honey is a dielectric. Bedrock authors it at ~0.62 metalness, which a 0.5 threshold would promote to solid metal.",
  },
  {
    pattern: /^tinted_glass$/,
    target: "dielectric",
    note: "Glass. Flat 127 metalness with a few 138 pixels that would otherwise become metal.",
  },
  {
    pattern: /^vault_/,
    target: "albedo",
    threshold: 0.75,
    note: "Uniform ~130 sheen across the body; only the genuine trim (up to 252) should read as metal.",
  },
] as const;

/**
 * Resolve the metal rule governing a Bedrock texture.
 *
 * @param bedrockName - Base name, e.g. `cut_copper`, `gold_ore`.
 * @returns The first matching rule, or `null` when the texture has no declared metal.
 */
export function resolveMetalRule(bedrockName: string): IMetalRule | null {
  return METAL_RULES.find((rule) => rule.pattern.test(bedrockName)) ?? null;
}

/**
 * Effective metalness threshold for a texture, in `[0, 1]`.
 *
 * @param rule - Result of {@link resolveMetalRule}, possibly `null`.
 */
export function resolveMetalThreshold(rule: IMetalRule | null): number {
  return rule?.threshold ?? DEFAULT_METAL_THRESHOLD;
}

/**
 * What to write into the green channel for metal pixels.
 *
 * @param rule - Result of {@link resolveMetalRule}, possibly `null`.
 * @returns The rule's target, defaulting to `"albedo"` (labPBR `255`).
 */
export function resolveMetalTarget(rule: IMetalRule | null): MetalTarget {
  return rule?.target ?? "albedo";
}

/** A name-matched porosity assignment. */
export interface IPorosityRule {
  /** Tested against the Bedrock texture base name. */
  readonly pattern: RegExp;
  /** labPBR blue-channel value in `0..64`, where `64` is 100% porous. */
  readonly porosity: number;
}

/** Largest labPBR blue-channel value still interpreted as porosity rather than SSS. */
export const MAX_POROSITY = 64;

/**
 * Ordered porosity rules, **first match wins**.
 *
 * Bedrock supplies no porosity data, so these are authored estimates. Non-porous
 * materials (metal, glass, ice, glazed ceramics) must come first, because they
 * share substrings with porous ones (`glazed_terracotta` vs `terracotta`).
 *
 * The shipped Java pack writes a flat `19` to 747 textures; that blanket value is
 * deliberately not reproduced here.
 */
export const POROSITY_RULES: readonly IPorosityRule[] = [
  // Non-porous. Water beads on these rather than soaking in.
  { pattern: /^glazed_terracotta/, porosity: 0 },
  { pattern: /glass|^ice$|^ice_packed$|^blue_ice$|^frosted_ice/, porosity: 0 },
  { pattern: /^obsidian|^crying_obsidian$|^bedrock$/, porosity: 0 },
  { pattern: /^quartz_block|^amethyst|^budding_amethyst$|^calcite$/, porosity: 0 },
  { pattern: /copper|gold|gilded|iron|^anvil|^cauldron|^hopper|^rail_|^chain\d*$/, porosity: 0 },
  { pattern: /^lodestone|^lightning_rod$|^netherite_block$|^ancient_debris/, porosity: 0 },
  { pattern: /^diamond_block$|^emerald_block$|^lapis_block$|^redstone_block$/, porosity: 0 },
  { pattern: /^slime$|^honey_|^sea_lantern$|^glowstone$|^beacon$|^conduit/, porosity: 0 },

  // Highly absorbent.
  { pattern: /^sponge/, porosity: 64 },
  { pattern: /^wool_colored|_wool$|^carpet/, porosity: 45 },
  { pattern: /^concrete_powder/, porosity: 50 },
  { pattern: /^snow$|^powder_snow/, porosity: 45 },
  { pattern: /^gravel$/, porosity: 45 },

  // Loose granular / organic.
  {
    pattern:
      /^sand$|^red_sand$|^dirt|^coarse_dirt$|^clay$|^mud|^soul_sand$|^soul_soil$|^farmland|^grass_path|^mycelium|^podzol/,
    porosity: 40,
  },
  { pattern: /^hay_block|^dried_kelp|^bone_block/, porosity: 40 },

  // Nether / fungal.
  { pattern: /^netherrack$|nether_wart_block$|^shroomlight$|nylium/, porosity: 30 },

  // Wood and joinery.
  {
    pattern: /^planks_|^log_|^stripped_|_log$|_planks$|^door_|trapdoor$|^bookshelf$|^crafting_table|^barrel/,
    porosity: 20,
  },

  // Fired ceramics and masonry.
  { pattern: /^hardened_clay|terracotta/, porosity: 16 },
  {
    pattern:
      /^stone|^cobblestone|^deepslate|^granite|^diorite|^andesite|^tuff|^basalt|^blackstone|^end_stone|sandstone|^prismarine|^purpur|^brick$|brick_|_brick$|^nether_brick/,
    porosity: 12,
  },
] as const;

/**
 * Porosity for a Bedrock texture, in labPBR's `0..64` blue-channel range.
 *
 * @param bedrockName - Base name, e.g. `stone`, `wool_colored_red`.
 * @returns `0` (non-porous) when no rule matches.
 */
export function resolvePorosity(bedrockName: string): number {
  const rule = POROSITY_RULES.find((entry) => entry.pattern.test(bedrockName));
  if (!rule) return 0;
  return Math.max(0, Math.min(MAX_POROSITY, rule.porosity));
}

/**
 * Validate a caller-supplied dielectric F0 byte.
 *
 * @param value - Intended green-channel value for non-metal pixels.
 * @throws When the value would be misread as a metal.
 */
export function assertDielectricF0(value: number): number {
  if (!Number.isInteger(value) || value < 0 || value > MAX_DIELECTRIC_F0) {
    throw new RangeError(
      `Dielectric F0 must be an integer in 0..${MAX_DIELECTRIC_F0} (got ${value}); ` +
        `values above ${MAX_DIELECTRIC_F0} are interpreted as metals by labPBR.`,
    );
  }
  return value;
}
