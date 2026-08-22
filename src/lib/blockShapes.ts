/**
 * Voxel shape presets and the rules that pick one for a block.
 *
 * A cube is the wrong preview for a third of the catalog: a torch, a slab and a
 * sapling all rendered as full blocks tell you nothing about how the texture
 * actually sits in the world. The presets are the common vanilla voxel shapes
 * (wiki.bedrock.dev/blocks/vanilla-voxel-shapes), authored as `.geo.json` with
 * vanilla-style per-face UV projection so a tiling block texture maps naturally.
 *
 * Shapes are resolved from the block identifier at catalog time, so the result
 * is inspectable in `src/data/blocks.json` rather than being re-derived in the
 * browser. Viewers can still override the choice per block in the preview.
 */

import type { ColormapId } from "./colormap";

/** Identifier of a bundled shape preset, matching its `.geo.json` file stem. */
export type BlockShapeId =
  | "full_block"
  | "cross"
  | "slab"
  | "stairs"
  | "carpet"
  | "pressure_plate"
  | "button"
  | "fence"
  | "wall"
  | "trapdoor"
  | "torch";

/** A selectable shape preset. */
export interface IBlockShape {
  readonly id: BlockShapeId;
  readonly label: string;
}

/** Every preset, full block first since it is the default. */
export const BLOCK_SHAPES: readonly IBlockShape[] = [
  { id: "full_block", label: "Full block" },
  { id: "cross", label: "Cross (plants)" },
  { id: "slab", label: "Slab" },
  { id: "stairs", label: "Stairs" },
  { id: "carpet", label: "Carpet" },
  { id: "pressure_plate", label: "Pressure plate" },
  { id: "button", label: "Button" },
  { id: "fence", label: "Fence post" },
  { id: "wall", label: "Wall post" },
  { id: "trapdoor", label: "Trapdoor" },
  { id: "torch", label: "Torch" },
] as const;

/**
 * Suffix rules, evaluated in order — the first match wins, so more specific
 * patterns must come first.
 *
 * The ordering carries real weight. `acacia_double_slab` is a *full* block (two
 * slabs occupying one cube), so it has to be caught before the `_slab` rule.
 * Likewise `_wall$` deliberately does not match `oak_wall_sign` or
 * `white_wall_banner`, which are signs and banners rather than wall posts.
 */
const SHAPE_RULES: readonly (readonly [RegExp, BlockShapeId])[] = [
  [/_double_slab$/, "full_block"],
  [/_stairs$/, "stairs"],
  [/_slab$/, "slab"],
  [/_carpet$/, "carpet"],
  [/_button$/, "button"],
  [/_pressure_plate$/, "pressure_plate"],
  [/_fence_gate$/, "fence"],
  [/(^|_)fence$/, "fence"],
  [/(^|_)wall$/, "wall"],
  [/_trapdoor$/, "trapdoor"],
  [/torch$/, "torch"],
  [/_sapling$/, "cross"],
  [/_mushroom$/, "cross"],
  [/_roots$/, "cross"],
  [/_tulip$/, "cross"],
] as const;

/**
 * Blocks drawn as crossed planes that no suffix rule catches — flowers, crops,
 * grasses and the various vines. Listed explicitly because their names share no
 * common ending, and guessing from substrings would sweep in solid blocks like
 * `mushroom_block` or `bamboo_block`.
 */
const CROSS_BLOCKS: ReadonlySet<string> = new Set([
  "allium",
  "azure_bluet",
  "bamboo",
  "bamboo_sapling",
  "blue_orchid",
  "bush",
  "cactus_flower",
  "cave_vines",
  "closed_eyeblossom",
  "cocoa",
  "cornflower",
  "crimson_fungus",
  "dandelion",
  "dead_bush",
  "deadbush",
  "dry_short_grass",
  "dry_tall_grass",
  "fern",
  "firefly_bush",
  "hanging_roots",
  "kelp",
  "large_fern",
  "leaf_litter",
  "lilac",
  "lily_of_the_valley",
  "nether_sprouts",
  "nether_wart",
  "open_eyeblossom",
  "oxeye_daisy",
  "peony",
  "pink_petals",
  "pitcher_crop",
  "pitcher_plant",
  "poppy",
  "reeds",
  "rose_bush",
  "seagrass",
  "short_grass",
  "spore_blossom",
  "sugar_cane",
  "sunflower",
  "sweet_berry_bush",
  "tall_grass",
  "tall_seagrass",
  "tallgrass",
  "torchflower",
  "torchflower_crop",
  "twisting_vines",
  "vine",
  "warped_fungus",
  "weeping_vines",
  "wheat",
  "wildflowers",
  "wither_rose",
  "beetroot",
  "carrots",
  "potatoes",
]);

/**
 * Choose the shape preset that best represents a block.
 *
 * @param id Block identifier without its `minecraft:` prefix, e.g. `oak_stairs`.
 * @returns The preset id, defaulting to `full_block`.
 */
export const shapeForBlock = (id: string): BlockShapeId => {
  if (CROSS_BLOCKS.has(id)) return "cross";

  const rule = SHAPE_RULES.find(([pattern]) => pattern.test(id));

  return rule?.[1] ?? "full_block";
};

/** Whether a shape id names a bundled preset. */
export const isBlockShape = (value: string): value is BlockShapeId =>
  BLOCK_SHAPES.some((shape) => shape.id === value);

/**
 * Which biome colormap tints a block, if any.
 *
 * `terrain_texture.json` declares an `overlay_color` for grass but says nothing
 * about leaves — Bedrock colours those from `textures/colormap/*.png`, and the
 * textures are authored greyscale in expectation of it. Birch and spruce read
 * from their own near-constant maps rather than the shared foliage one, which
 * is why they are named separately here.
 *
 * This only says which map *would* apply. Whether it is actually used is
 * decided from the texture: a colour map that already carries its own colour —
 * cherry blossom, azalea — is left alone. See `isGreyscale`.
 *
 * @param id Block identifier without its `minecraft:` prefix.
 * @returns The colormap name, or `undefined` when the block is not tinted.
 */
export const colormapForBlock = (id: string): ColormapId | undefined => {
  if (id === "birch_leaves") return "birch";
  if (id === "spruce_leaves") return "evergreen";
  if (id.endsWith("_leaves") || id === "leaves" || id === "leaves2") return "foliage";
  if (id === "vine" || id === "weeping_vines" || id === "cave_vines") return "foliage";

  return undefined;
};
