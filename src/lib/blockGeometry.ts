/**
 * Builds three.js geometry from a Bedrock `.geo.json` voxel shape preset.
 *
 * This deliberately does **not** mirror bedrock.graphics' `build-geometry.ts`.
 * That builder maps one atlas texture across a whole model and exists to bake
 * mesh maps. Here each Minecraft *face direction* carries its own texture set —
 * a log's top differs from its sides — so faces are bucketed into material
 * groups by direction, and the caller supplies one material per direction.
 *
 * Scope is the bundled presets: a single bone, cubes with per-face UVs, and an
 * optional per-cube Y rotation (the crossed planes). Arbitrary Bedrock models
 * with bone hierarchies, box UVs, inflate or mirror are not handled — if those
 * are ever needed, port `parse-geo.ts` from bedrock.graphics rather than
 * growing this.
 */

import { BufferAttribute, BufferGeometry } from "three";
import type { BlockFace } from "./types";

/** Bedrock model space: 16 units to a block, Y up, origin at the block centre. */
const UNITS_PER_BLOCK = 16;

/** Face directions in the order the geometry emits material groups. */
const FACE_ORDER: readonly BlockFace[] = [
  "up",
  "down",
  "north",
  "south",
  "east",
  "west",
] as const;

/**
 * One face of a cube in a `.geo.json` preset.
 *
 * Vectors are plain number arrays rather than fixed tuples because that is what
 * an imported JSON module is typed as, and because these files are data: a
 * malformed one should be read defensively, not asserted into a tuple.
 */
interface IGeoFace {
  readonly uv: readonly number[];
  readonly uv_size?: readonly number[];
}

/** One cube in a `.geo.json` preset. */
interface IGeoCube {
  readonly origin: readonly number[];
  readonly size: readonly number[];
  readonly rotation?: readonly number[];
  readonly pivot?: readonly number[];
  readonly uv: Partial<Record<BlockFace, IGeoFace>>;
}

/** Read a 3-vector, substituting zero for anything missing or non-numeric. */
const vec3 = (values: readonly number[] | undefined): [number, number, number] => [
  values?.[0] ?? 0,
  values?.[1] ?? 0,
  values?.[2] ?? 0,
];

/** Read a 2-vector with an explicit fallback for each component. */
const vec2 = (
  values: readonly number[] | undefined,
  fallback: readonly [number, number],
): [number, number] => [values?.[0] ?? fallback[0], values?.[1] ?? fallback[1]];

/** A parsed `.geo.json` document, narrowed to what the presets use. */
export interface IGeoPreset {
  readonly "minecraft:geometry": readonly {
    readonly description: {
      readonly identifier: string;
      readonly texture_width: number;
      readonly texture_height: number;
    };
    readonly bones: readonly { readonly cubes?: readonly IGeoCube[] }[];
  }[];
}

/**
 * Corner offsets and the outward normal for each face of a unit cube, in
 * Bedrock's axis convention (north is -Z, up is +Y).
 *
 * Corners are ordered so the two triangles wind counter-clockwise when viewed
 * from outside, and so corner 0 is the face's top-left in *texture* space —
 * which is what lets the UV block below stay uniform across all six faces.
 */
const FACE_GEOMETRY: Readonly<Record<BlockFace, {
  readonly normal: readonly [number, number, number];
  readonly corners: readonly (readonly [number, number, number])[];
}>> = {
  // Top-left..bottom-right as seen looking at the face from outside.
  up: {
    normal: [0, 1, 0],
    corners: [[0, 1, 0], [1, 1, 0], [1, 1, 1], [0, 1, 1]],
  },
  down: {
    normal: [0, -1, 0],
    corners: [[0, 0, 1], [1, 0, 1], [1, 0, 0], [0, 0, 0]],
  },
  north: {
    normal: [0, 0, -1],
    corners: [[1, 1, 0], [0, 1, 0], [0, 0, 0], [1, 0, 0]],
  },
  south: {
    normal: [0, 0, 1],
    corners: [[0, 1, 1], [1, 1, 1], [1, 0, 1], [0, 0, 1]],
  },
  east: {
    normal: [1, 0, 0],
    corners: [[1, 1, 1], [1, 1, 0], [1, 0, 0], [1, 0, 1]],
  },
  west: {
    normal: [-1, 0, 0],
    corners: [[0, 1, 0], [0, 1, 1], [0, 0, 1], [0, 0, 0]],
  },
};

/** Vertex buckets for one material group. */
interface IBucket {
  readonly positions: number[];
  readonly normals: number[];
  readonly uvs: number[];
}

/** Rotate a point about the Y axis around a pivot, in degrees. */
const rotateY = (
  point: readonly [number, number, number],
  pivot: readonly [number, number, number],
  degrees: number,
): [number, number, number] => {
  if (degrees === 0) return [point[0], point[1], point[2]];

  const radians = (degrees * Math.PI) / 180;
  const sin = Math.sin(radians);
  const cos = Math.cos(radians);

  const x = point[0] - pivot[0];
  const z = point[2] - pivot[2];

  return [
    pivot[0] + x * cos + z * sin,
    point[1],
    pivot[2] - x * sin + z * cos,
  ];
};

/**
 * Emit one face's two triangles into its material bucket.
 *
 * UVs come straight from the preset. Bedrock measures V downward from the top
 * of the texture while three.js measures it upward from the bottom, so V is
 * flipped here — that is what makes a slab sample the *lower* half of its side
 * texture rather than the upper.
 */
const emitFace = (
  bucket: IBucket,
  face: BlockFace,
  cube: IGeoCube,
  entry: IGeoFace,
  texWidth: number,
  texHeight: number,
): void => {
  const { normal, corners } = FACE_GEOMETRY[face];
  const [ox, oy, oz] = vec3(cube.origin);
  const [sx, sy, sz] = vec3(cube.size);

  const rotation = cube.rotation?.[1] ?? 0;
  const pivot = vec3(cube.pivot);

  // Model units -> block units, then centre the block on the origin so it
  // rotates about its middle like the BoxGeometry it replaces.
  const toWorld = (corner: readonly [number, number, number]): [number, number, number] => {
    const point: [number, number, number] = [
      ox + corner[0] * sx,
      oy + corner[1] * sy,
      oz + corner[2] * sz,
    ];

    const [rx, ry, rz] = rotateY(point, pivot, rotation);

    return [rx / UNITS_PER_BLOCK, ry / UNITS_PER_BLOCK - 0.5, rz / UNITS_PER_BLOCK];
  };

  const rotatedNormal = rotateY(normal, [0, 0, 0], rotation);

  const [uvX, uvY] = vec2(entry.uv, [0, 0]);
  const [sizeU, sizeV] = vec2(entry.uv_size, [sx, sy]);

  const u0 = uvX / texWidth;
  const u1 = (uvX + sizeU) / texWidth;
  const v0 = 1 - uvY / texHeight;
  const v1 = 1 - (uvY + sizeV) / texHeight;

  // Matches the corner order above: top-left, top-right, bottom-right, bottom-left.
  const cornerUvs: readonly (readonly [number, number])[] = [
    [u0, v0],
    [u1, v0],
    [u1, v1],
    [u0, v1],
  ];

  // Two triangles: 0-1-2 and 0-2-3.
  [0, 1, 2, 0, 2, 3].forEach((index) => {
    const corner = corners[index];
    const uv = cornerUvs[index];
    if (!corner || !uv) return;

    const [x, y, z] = toWorld(corner);

    bucket.positions.push(x, y, z);
    bucket.normals.push(rotatedNormal[0], rotatedNormal[1], rotatedNormal[2]);
    bucket.uvs.push(uv[0], uv[1]);
  });
};

/**
 * Build geometry for a shape preset.
 *
 * @param preset Parsed `.geo.json` contents.
 * @returns The geometry, the face directions behind each material group, and
 *   whether the shape is flat. Groups are emitted in `faceOrder` order, and
 *   directions the shape never draws produce no group at all — which is why
 *   the caller must map materials through `faceOrder` rather than assuming six.
 *   `flat` is set when any cube has zero thickness on an axis (the crossed
 *   planes); such faces vanish from behind unless rendered double-sided.
 */
export const buildShapeGeometry = (preset: IGeoPreset): {
  geometry: BufferGeometry;
  faceOrder: readonly BlockFace[];
  flat: boolean;
} => {
  const model = preset["minecraft:geometry"][0];

  if (!model) throw new Error("Shape preset contains no geometry");

  const texWidth = model.description.texture_width || UNITS_PER_BLOCK;
  const texHeight = model.description.texture_height || UNITS_PER_BLOCK;

  const buckets = new Map<BlockFace, IBucket>();
  let flat = false;

  model.bones.forEach((bone) => {
    (bone.cubes ?? []).forEach((cube) => {
      // A zero extent means a plane rather than a box.
      if (vec3(cube.size).some((component) => component === 0)) flat = true;

      FACE_ORDER.forEach((face) => {
        const entry = cube.uv[face];

        // An omitted face is not drawn — this is how the crossed planes end up
        // with two visible quads each instead of six.
        if (!entry) return;

        const bucket = buckets.get(face)
          ?? { positions: [], normals: [], uvs: [] };

        buckets.set(face, bucket);
        emitFace(bucket, face, cube, entry, texWidth, texHeight);
      });
    });
  });

  const present = FACE_ORDER.filter((face) => buckets.has(face));

  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];

  const geometry = new BufferGeometry();

  present.forEach((face, groupIndex) => {
    const bucket = buckets.get(face);
    if (!bucket) return;

    const start = positions.length / 3;

    positions.push(...bucket.positions);
    normals.push(...bucket.normals);
    uvs.push(...bucket.uvs);

    geometry.addGroup(start, bucket.positions.length / 3, groupIndex);
  });

  geometry.setAttribute("position", new BufferAttribute(new Float32Array(positions), 3));
  geometry.setAttribute("normal", new BufferAttribute(new Float32Array(normals), 3));
  geometry.setAttribute("uv", new BufferAttribute(new Float32Array(uvs), 2));
  geometry.computeBoundingSphere();

  return { geometry, faceOrder: present, flat };
};
