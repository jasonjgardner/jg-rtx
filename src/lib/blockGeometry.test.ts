/**
 * Geometry tests for the bundled voxel shape presets.
 *
 * The winding test exists because inverted winding is close to invisible in a
 * screenshot: with back-face culling, a wrongly-wound closed box still renders
 * a solid silhouette — it just draws its *far* walls instead of its near ones.
 * Stairs and torches looked correct that way for a whole review pass; only a
 * shallow button gave it away by appearing as a hollow tray.
 */

import { describe, expect, test } from "bun:test";
import { buildShapeGeometry } from "./blockGeometry";
import { BLOCK_SHAPES } from "./blockShapes";
import { SHAPE_PRESETS } from "./shapePresets";

/** Cross product of two 3-vectors. */
const cross = (
  a: readonly number[],
  b: readonly number[],
): [number, number, number] => [
  (a[1] ?? 0) * (b[2] ?? 0) - (a[2] ?? 0) * (b[1] ?? 0),
  (a[2] ?? 0) * (b[0] ?? 0) - (a[0] ?? 0) * (b[2] ?? 0),
  (a[0] ?? 0) * (b[1] ?? 0) - (a[1] ?? 0) * (b[0] ?? 0),
];

/** Component-wise difference of two 3-vectors. */
const sub = (
  a: readonly number[],
  b: readonly number[],
): [number, number, number] => [
  (a[0] ?? 0) - (b[0] ?? 0),
  (a[1] ?? 0) - (b[1] ?? 0),
  (a[2] ?? 0) - (b[2] ?? 0),
];

/** Dot product of two 3-vectors. */
const dot = (a: readonly number[], b: readonly number[]): number =>
  (a[0] ?? 0) * (b[0] ?? 0) + (a[1] ?? 0) * (b[1] ?? 0) + (a[2] ?? 0) * (b[2] ?? 0);

/** Read vertex `index` from a flat, non-indexed attribute of `stride` floats. */
const vertex = (
  array: ArrayLike<number>,
  index: number,
  stride: number,
): number[] =>
  Array.from({ length: stride }, (_, offset) => array[index * stride + offset] ?? 0);

describe("shape geometry", () => {
  test.each(BLOCK_SHAPES.map((shape) => [shape.id] as const))(
    "%s winds every triangle outward",
    (id) => {
      const { geometry } = buildShapeGeometry(SHAPE_PRESETS[id]);
      const positions = geometry.getAttribute("position").array;
      const normals = geometry.getAttribute("normal").array;

      const triangles = positions.length / 9;
      expect(triangles).toBeGreaterThan(0);

      const inverted = Array.from({ length: triangles }, (_, triangle) => {
        const a = vertex(positions, triangle * 3, 3);
        const b = vertex(positions, triangle * 3 + 1, 3);
        const c = vertex(positions, triangle * 3 + 2, 3);

        // A counter-clockwise triangle's geometric normal agrees with the
        // outward normal the preset declares. Disagreement means the face is
        // backfacing and would be culled from outside the shape.
        return dot(cross(sub(b, a), sub(c, a)), vertex(normals, triangle * 3, 3)) <= 0;
      }).filter(Boolean);

      expect(inverted).toHaveLength(0);
    },
  );

  test.each(BLOCK_SHAPES.map((shape) => [shape.id] as const))(
    "%s keeps UVs inside the tile",
    (id) => {
      const { geometry } = buildShapeGeometry(SHAPE_PRESETS[id]);
      const uvs = geometry.getAttribute("uv").array;

      const outOfRange = Array.from(uvs).filter((value) => value < 0 || value > 1);

      expect(outOfRange).toHaveLength(0);
    },
  );

  test("a full block spans the unit cube, centred on the origin", () => {
    const { geometry, faceOrder, flat } = buildShapeGeometry(SHAPE_PRESETS.full_block);

    geometry.computeBoundingBox();
    const box = geometry.boundingBox;

    expect(box?.min.toArray()).toEqual([-0.5, -0.5, -0.5]);
    expect(box?.max.toArray()).toEqual([0.5, 0.5, 0.5]);
    expect([...faceOrder].toSorted()).toEqual(
      ["down", "east", "north", "south", "up", "west"],
    );
    expect(flat).toBe(false);
  });

  test("a slab samples the lower half of its side texture", () => {
    const { geometry, faceOrder } = buildShapeGeometry(SHAPE_PRESETS.slab);
    const uvs = geometry.getAttribute("uv").array;

    const northGroup = geometry.groups.find(
      (group) => faceOrder[group.materialIndex ?? 0] === "north",
    );

    expect(northGroup).toBeDefined();

    const start = northGroup?.start ?? 0;
    const vs = Array.from(
      { length: northGroup?.count ?? 0 },
      (_, offset) => uvs[(start + offset) * 2 + 1] ?? 0,
    );

    // Bedrock's `uv: [0, 8], uv_size: [16, 8]` is the bottom half of the tile
    // once V is flipped into three.js' bottom-up convention.
    expect(Math.min(...vs)).toBeCloseTo(0, 5);
    expect(Math.max(...vs)).toBeCloseTo(0.5, 5);
  });

  test("crossed planes draw only their two visible faces, and are flat", () => {
    const { faceOrder, flat } = buildShapeGeometry(SHAPE_PRESETS.cross);

    expect([...faceOrder].toSorted()).toEqual(["north", "south"]);
    expect(flat).toBe(true);
  });

  test("a torch is slimmer and shorter than a full block", () => {
    const { geometry } = buildShapeGeometry(SHAPE_PRESETS.torch);

    geometry.computeBoundingBox();
    const box = geometry.boundingBox;

    // 2x10x2 of a 16-unit block.
    expect((box?.max.x ?? 0) - (box?.min.x ?? 0)).toBeCloseTo(2 / 16, 5);
    expect((box?.max.y ?? 0) - (box?.min.y ?? 0)).toBeCloseTo(10 / 16, 5);
    expect((box?.max.z ?? 0) - (box?.min.z ?? 0)).toBeCloseTo(2 / 16, 5);
  });
});
