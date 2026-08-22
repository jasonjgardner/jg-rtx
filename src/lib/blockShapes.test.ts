/**
 * Rules that map a block identifier onto a shape preset and a biome colormap.
 *
 * Both are ordered/­exception-heavy enough that a plausible-looking edit can
 * quietly reclassify hundreds of blocks, so the awkward cases are pinned here.
 */

import { describe, expect, test } from "bun:test";
import { colormapForBlock, isBlockShape, shapeForBlock } from "./blockShapes";

describe("shapeForBlock", () => {
  test.each([
    ["stone", "full_block"],
    ["oak_stairs", "stairs"],
    ["stone_slab", "slab"],
    ["white_carpet", "carpet"],
    ["stone_button", "button"],
    ["oak_pressure_plate", "pressure_plate"],
    ["oak_fence", "fence"],
    ["oak_fence_gate", "fence"],
    ["cobblestone_wall", "wall"],
    ["oak_trapdoor", "trapdoor"],
    ["torch", "torch"],
    ["soul_torch", "torch"],
    ["oak_sapling", "cross"],
    ["dandelion", "cross"],
    ["tallgrass", "cross"],
    ["vine", "cross"],
  ] as const)("%s -> %s", (id, shape) => {
    expect(shapeForBlock(id)).toBe(shape);
  });

  test("a double slab is a full block, not a slab", () => {
    // Two slabs fill a whole cube. The rule order is what gets this right.
    expect(shapeForBlock("acacia_double_slab")).toBe("full_block");
    expect(shapeForBlock("stone_double_slab")).toBe("full_block");
  });

  test("signs, banners and coral fans are not wall posts", () => {
    expect(shapeForBlock("oak_wall_sign")).toBe("full_block");
    expect(shapeForBlock("white_wall_banner")).toBe("full_block");
    expect(shapeForBlock("brain_coral_wall_fan")).toBe("full_block");
  });

  test("solid blocks that merely mention a plant are not crosses", () => {
    expect(shapeForBlock("mushroom_block")).toBe("full_block");
    expect(shapeForBlock("bamboo_block")).toBe("full_block");
    expect(shapeForBlock("hay_block")).toBe("full_block");
  });

  test("isBlockShape accepts only bundled presets", () => {
    expect(isBlockShape("torch")).toBe(true);
    expect(isBlockShape("nonsense")).toBe(false);
  });
});

describe("colormapForBlock", () => {
  test.each([
    ["jungle_leaves", "foliage"],
    ["oak_leaves", "foliage"],
    ["acacia_leaves", "foliage"],
    ["vine", "foliage"],
  ] as const)("%s -> %s", (id, colormap) => {
    expect(colormapForBlock(id)).toBe(colormap);
  });

  test("birch and spruce read their own near-constant colormaps", () => {
    expect(colormapForBlock("birch_leaves")).toBe("birch");
    expect(colormapForBlock("spruce_leaves")).toBe("evergreen");
  });

  test("blocks with no colormap get none", () => {
    expect(colormapForBlock("stone")).toBeUndefined();
    expect(colormapForBlock("oak_log")).toBeUndefined();
  });

  test("assigning a colormap does not by itself tint", () => {
    // Cherry and azalea are assigned `foliage` here, but ship their own colour;
    // `isGreyscale` is what stops them being repainted green at render time.
    expect(colormapForBlock("cherry_leaves")).toBe("foliage");
    expect(colormapForBlock("azalea_leaves")).toBe("foliage");
  });
});
