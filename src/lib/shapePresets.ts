/**
 * The bundled `.geo.json` shape presets, imported rather than fetched.
 *
 * All eleven together are about 5 KB of JSON, so bundling them costs less than
 * the round-trips a lazy fetch would need and keeps shape switching instant —
 * the picker changes the mesh without touching the network.
 */

import button from "../data/block-shapes/button.geo.json";
import carpet from "../data/block-shapes/carpet.geo.json";
import cross from "../data/block-shapes/cross.geo.json";
import fence from "../data/block-shapes/fence.geo.json";
import fullBlock from "../data/block-shapes/full_block.geo.json";
import pressurePlate from "../data/block-shapes/pressure_plate.geo.json";
import slab from "../data/block-shapes/slab.geo.json";
import stairs from "../data/block-shapes/stairs.geo.json";
import torch from "../data/block-shapes/torch.geo.json";
import trapdoor from "../data/block-shapes/trapdoor.geo.json";
import wall from "../data/block-shapes/wall.geo.json";
import type { IGeoPreset } from "./blockGeometry";
import type { BlockShapeId } from "./blockShapes";

/** Every shape preset, keyed by its id. */
export const SHAPE_PRESETS: Readonly<Record<BlockShapeId, IGeoPreset>> = {
  full_block: fullBlock as IGeoPreset,
  cross: cross as IGeoPreset,
  slab: slab as IGeoPreset,
  stairs: stairs as IGeoPreset,
  carpet: carpet as IGeoPreset,
  pressure_plate: pressurePlate as IGeoPreset,
  button: button as IGeoPreset,
  fence: fence as IGeoPreset,
  wall: wall as IGeoPreset,
  trapdoor: trapdoor as IGeoPreset,
  torch: torch as IGeoPreset,
};
