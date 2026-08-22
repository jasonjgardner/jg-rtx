/**
 * three.js scene plumbing for the block preview.
 *
 * Kept separate from the custom element so the element stays about lifecycle
 * and this module stays about rendering. The important detail here is that
 * textures are built from `ImageBitmap`s rather than URLs: `BedrockRtxLoader`'s
 * URL API goes through `THREE.TextureLoader`, which cannot decode the pack's
 * `.tga` files, so the bitmaps are decoded first and handed to
 * `createBedrockMaterial` instead.
 */

import {
  ACESFilmicToneMapping,
  AmbientLight,
  DirectionalLight,
  DoubleSide,
  Mesh,
  NearestFilter,
  PerspectiveCamera,
  PMREMGenerator,
  Scene,
  SRGBColorSpace,
  Texture,
  Vector3,
  WebGLRenderer,
} from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { createBedrockMaterial } from "threejs-minecraft-bedrock-rtx-loader";
import {
  classifyAlpha,
  compositeBitmaps,
  loadBitmap,
  tintBitmap,
  type AlphaMode,
} from "./decode";
import type { BlockFace, IFlipbook, ITextureFile, ITextureSet } from "./types";
import { buildShapeGeometry } from "./blockGeometry";
import type { BlockShapeId } from "./blockShapes";
import { SHAPE_PRESETS } from "./shapePresets";
import { fileUrl } from "./cdn";

/** Real-time duration of one Minecraft tick, in milliseconds. */
const TICK_MS = 50;

/** A texture set paired with the block faces that use it. */
export interface IFacePlan {
  readonly set: ITextureSet;
  /**
   * Minecraft face directions this set covers. Named rather than indexed
   * because a shape preset draws whichever faces it likes — a carpet has no
   * north face, crossed planes have only north and south — so the mapping from
   * direction to material has to survive geometry that is not a cube.
   */
  readonly faces: readonly BlockFace[];
  /**
   * Biome tint multiplied over the colour map, or `null`. Grass and foliage are
   * authored greyscale and only look right once this is applied.
   */
  readonly tint?: string | null;
  /**
   * Texture to composite this face over when it turns out to be a tinted
   * cutout overlay rather than a complete texture — see `compositeBitmaps`.
   * Supplying it is not enough on its own; the overlay test still has to pass.
   */
  readonly underlay?: ITextureSet | undefined;
}

/** Camera placement, so a view survives being rebuilt. */
export interface ICameraState {
  /** Camera position in world space. */
  readonly position: readonly [number, number, number];
  /** Point the camera orbits and looks at. */
  readonly target: readonly [number, number, number];
  /** Whether idle auto-rotation is still running. */
  readonly autoRotate: boolean;
}

/** Handle for driving and disposing a preview. */
export interface IPreview {
  /** Resize the renderer to the container's current box. */
  resize: () => void;
  /** Return the camera to its framing and resume auto-rotation. */
  resetCamera: () => void;
  /** Capture the current view so a rebuild can restore it. */
  cameraState: () => ICameraState;
  /** Release GPU resources and stop the render loop. */
  dispose: () => void;
}

/**
 * Default camera direction — a three-quarter view showing three faces. Scaled
 * to the shape's size by {@link frameDistance}, so a torch is not previewed
 * from the distance a full block needs.
 */
const HOME_POSITION: readonly [number, number, number] = [2.1, 1.7, 2.4];

/** Fraction of the viewport the shape should occupy. */
const FRAMING_MARGIN = 1.25;

/**
 * Scale the home camera direction so a shape of the given radius fills the view.
 *
 * Presets vary enormously — a full block spans the whole cube while a button is
 * a few pixels tall — so a fixed camera distance either shrinks small shapes to
 * specks or clips large ones.
 *
 * @param radius Bounding-sphere radius of the geometry, in block units.
 * @param fovDegrees Vertical field of view.
 * @returns The camera position for that shape.
 */
const frameDistance = (
  radius: number,
  fovDegrees: number,
): [number, number, number] => {
  const safeRadius = radius > 0 ? radius : 0.87;
  const fitDistance = (safeRadius * FRAMING_MARGIN) /
    Math.sin((fovDegrees / 2) * (Math.PI / 180));

  // HOME_POSITION is a direction plus a length tuned for a full block; rescale
  // it to the distance this shape actually needs, keeping the same angle.
  const homeLength = Math.hypot(...HOME_POSITION);
  const scale = fitDistance / homeLength;

  return [
    HOME_POSITION[0] * scale,
    HOME_POSITION[1] * scale,
    HOME_POSITION[2] * scale,
  ];
};

/** Zoom limits, as multiples of the shape's framing distance. */
const MIN_DISTANCE_FACTOR = 0.45;
const MAX_DISTANCE_FACTOR = 4;

/** Textures that animate, with the data needed to advance them. */
interface IAnimated {
  readonly texture: Texture;
  readonly frames: number;
  readonly frameDuration: number;
}

/**
 * Wrap an `ImageBitmap` in a texture configured for pixel art.
 *
 * The bitmap must already be vertically flipped (see `bytesToBitmap`), because
 * `Texture.flipY` has no effect on `ImageBitmap` sources — WebGL's
 * `UNPACK_FLIP_Y_WEBGL` does not apply to them, so a texture that relied on it
 * renders upside down. `flipY` is set `false` here so three.js does not assume
 * an orientation it cannot deliver.
 *
 * Flipbook strips are cropped to one frame via `repeat`/`offset`, so the cube
 * shows a single frame rather than the whole vertical strip. Because the bitmap
 * is pre-flipped, frame 0 — the top of the original strip — sits at V offset 0.
 *
 * @param bitmap Decoded, pre-flipped image.
 * @param flipbook Animation metadata, when the texture is a strip.
 * @param srgb Whether the texture carries colour (rather than PBR data).
 */
const toTexture = (
  bitmap: ImageBitmap,
  flipbook: IFlipbook | undefined,
  srgb: boolean,
): Texture => {
  const texture = new Texture(bitmap);
  texture.magFilter = NearestFilter;
  texture.minFilter = NearestFilter;
  texture.generateMipmaps = false;
  texture.flipY = false;

  if (srgb) texture.colorSpace = SRGBColorSpace;

  if (flipbook && flipbook.frames > 1) {
    texture.repeat.set(1, 1 / flipbook.frames);
    texture.offset.set(0, 0);
  }

  texture.needsUpdate = true;

  return texture;
};

/**
 * Configure a material for the transparency its colour map calls for.
 *
 * Both non-opaque modes get `DoubleSide` so the block's far interior is visible
 * through the near face, which is how Minecraft renders glass and leaves — with
 * back-face culling you would see straight through to the background instead,
 * and a glass block would lose its opposite frame entirely.
 *
 * Blend also disables depth writes. Otherwise the near face would occlude the
 * far one, and the glass would show the background through it rather than the
 * rest of the block.
 *
 * @param material Material to configure, mutated in place.
 * @param mode Transparency classification of the colour map.
 */
const applyAlphaMode = (
  material: { transparent: boolean; depthWrite: boolean; alphaTest: number; side: number; needsUpdate: boolean },
  mode: AlphaMode,
): void => {
  if (mode === "opaque") return;

  material.side = DoubleSide;

  // A hard on/off mask: discard the transparent texels and stay in the opaque
  // pass, which keeps depth sorting exact and costs nothing.
  if (mode === "cutout") {
    material.alphaTest = 0.5;
    material.needsUpdate = true;
    return;
  }

  material.transparent = true;
  material.depthWrite = false;
  material.needsUpdate = true;
};

/**
 * Load every file in a set and build its material.
 *
 * @param set Texture set to realise.
 * @param tint Biome tint to multiply over the colour map, if any.
 * @param underlay Texture to composite beneath a tinted cutout overlay.
 * @param signal Abort signal for the fetches.
 * @param animated Collector for textures needing per-frame advancement.
 */
const buildMaterial = async (
  set: ITextureSet,
  tint: string | null | undefined,
  underlay: ITextureSet | undefined,
  signal: AbortSignal,
  animated: IAnimated[],
): Promise<Awaited<ReturnType<typeof createBedrockMaterial>>> => {
  const roles = (["color", "mer", "mers", "normal", "heightmap"] as const)
    .map((role) => [role, set[role]] as const)
    .filter((entry): entry is readonly [typeof entry[0], ITextureFile] =>
      entry[1] !== undefined);

  // Set by the colour map as it loads; the other maps do not affect blending.
  let alphaMode: AlphaMode = "opaque";

  const loaded = await Promise.all(
    roles.map(async ([role, file]) => {
      // Pre-flipped; see toTexture for why Texture.flipY cannot do this.
      const decoded = await loadBitmap(fileUrl(file, set.origin), file.ext, signal, true);

      if (role === "color") alphaMode = classifyAlpha(decoded);

      // Only the colour map is tinted — multiplying a biome colour into a
      // normal or MER map would corrupt the PBR data it encodes.
      const tinted = role === "color" && typeof tint === "string"
        ? await tintBitmap(decoded, tint)
        : decoded;

      // A tinted cutout is the signature of Bedrock's overlay textures: grass
      // ships the tinted grass alone and expects the engine to lay it over
      // dirt. Flatten the two so the face reads as one opaque texture.
      const overlaid = role === "color" && alphaMode === "cutout" && underlay
        ? await compositeBitmaps(
            await loadBitmap(
              fileUrl(underlay.color, underlay.origin),
              underlay.color.ext,
              signal,
              true,
            ),
            tinted,
          )
        : tinted;

      if (role === "color" && overlaid !== tinted) alphaMode = "opaque";

      const bitmap = overlaid;

      const texture = toTexture(bitmap, set.flipbook, role === "color");

      if (set.flipbook && set.flipbook.frames > 1) {
        animated.push({
          texture,
          frames: set.flipbook.frames,
          frameDuration: set.flipbook.ticksPerFrame * TICK_MS,
        });
      }

      return [role, texture] as const;
    }),
  );

  const material = createBedrockMaterial(Object.fromEntries(loaded));
  applyAlphaMode(material, alphaMode);

  return material;
};

/**
 * Mount a rotating, lit preview cube into a container.
 *
 * @param container Element to render into; sized by CSS.
 * @param plan Texture sets and the block faces each one covers.
 * @param shape Voxel shape preset to render.
 * @param signal Abort signal that cancels texture loading.
 * @param initial View to restore, so swapping a variety does not throw away
 *   the angle the viewer had chosen.
 * @returns A handle for resizing, camera control and disposal.
 * @throws If WebGL is unavailable or any texture fails to load.
 */
export const mountPreview = async (
  container: HTMLElement,
  plan: readonly IFacePlan[],
  shape: BlockShapeId,
  signal: AbortSignal,
  initial?: ICameraState,
): Promise<IPreview> => {
  const renderer = new WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.toneMapping = ACESFilmicToneMapping;

  const fov = 35;
  const scene = new Scene();
  const camera = new PerspectiveCamera(fov, 1, 0.1, 100);
  camera.lookAt(0, 0, 0);

  // A neutral indoor environment gives metals and rough surfaces something to
  // reflect; without it a physical material renders nearly black.
  const pmrem = new PMREMGenerator(renderer);
  const environment = pmrem.fromScene(new RoomEnvironment(), 0.04);
  scene.environment = environment.texture;

  scene.add(new AmbientLight(0xffffff, 0.6));

  const key = new DirectionalLight(0xffffff, 2.2);
  key.position.set(3, 4, 2);
  scene.add(key);

  const animated: IAnimated[] = [];

  const materials = await Promise.all(
    plan.map((entry) =>
      buildMaterial(entry.set, entry.tint, entry.underlay, signal, animated)),
  );

  const planIndexByFace = new Map<BlockFace, number>();
  plan.forEach((entry, index) => {
    entry.faces.forEach((face) => planIndexByFace.set(face, index));
  });

  // The preset decides which faces exist; `faceOrder` reports the directions
  // behind each material group, in group order.
  const { geometry, faceOrder, flat } = buildShapeGeometry(SHAPE_PRESETS[shape]);

  // Planes have no back face to cull to, so they would disappear from behind
  // whenever the texture is opaque enough to stay single-sided.
  if (flat) {
    materials.forEach((material) => {
      material.side = DoubleSide;
      material.needsUpdate = true;
    });
  }

  const ordered = faceOrder
    .map((face) => materials[planIndexByFace.get(face) ?? 0])
    .filter((material): material is NonNullable<typeof material> => material !== undefined);

  const mesh = new Mesh(geometry, ordered);
  scene.add(mesh);

  // Frame to the shape that was actually built, not to a nominal block, so a
  // torch or a button is not previewed as a speck in the middle of the canvas.
  //
  // Shapes keep their real placement within the block — a button sits on the
  // ground, a torch stands up from it — so the orbit centre is the shape's own
  // centre rather than the block origin. Aiming at the origin would push a
  // button to the bottom edge of the canvas.
  const sphere = geometry.boundingSphere;
  const focus = sphere?.center ?? new Vector3(0, 0, 0);
  const offset = frameDistance(sphere?.radius ?? 0, fov);

  camera.position.set(
    focus.x + offset[0],
    focus.y + offset[1],
    focus.z + offset[2],
  );

  container.append(renderer.domElement);
  renderer.domElement.style.inlineSize = "100%";
  renderer.domElement.style.blockSize = "100%";
  renderer.domElement.style.display = "block";

  const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;

  // Zoom limits are relative to the framing distance rather than absolute:
  // a fixed floor tuned for a full block would forbid getting anywhere near a
  // torch, which is already framed closer than that floor.
  const homeDistance = Math.hypot(...offset);
  controls.minDistance = homeDistance * MIN_DISTANCE_FACTOR;
  controls.maxDistance = homeDistance * MAX_DISTANCE_FACTOR;

  // Panning a single centred shape only loses it off-screen.
  controls.enablePan = false;
  controls.autoRotateSpeed = 1.1;

  controls.target.copy(focus);
  controls.update();

  // `saveState` captures the home framing — including the target just set —
  // *before* any restore below, so the reset button always returns to the
  // default view rather than to whatever angle a previous build left behind.
  controls.saveState();

  controls.autoRotate = !reduced && (initial?.autoRotate ?? true);

  if (initial) {
    camera.position.set(...initial.position);
    controls.target.set(...initial.target);
  }

  controls.update();

  // Any deliberate interaction ends the idle spin; fighting the camera while
  // dragging it is the single most irritating thing an auto-rotating preview
  // can do.
  const stopAutoRotate = (): void => {
    controls.autoRotate = false;
  };

  controls.addEventListener("start", stopAutoRotate);

  const resize = (): void => {
    const { clientWidth, clientHeight } = container;
    if (clientWidth === 0 || clientHeight === 0) return;

    renderer.setSize(clientWidth, clientHeight, false);
    camera.aspect = clientWidth / clientHeight;
    camera.updateProjectionMatrix();
  };

  resize();

  let frame = 0;
  let last = performance.now();
  let elapsed = 0;

  const tick = (now: number): void => {
    const delta = now - last;
    last = now;

    // Flipbook timing follows the same reduced-motion rule as the 2D tiles:
    // hold frame zero rather than animate.
    if (!reduced) elapsed += delta;

    animated.forEach(({ texture, frames, frameDuration }) => {
      const index = Math.floor(elapsed / frameDuration) % frames;
      texture.offset.setY(index / frames);
    });

    // Drives both damping and auto-rotation, so it must run every frame.
    // Seconds, not milliseconds — auto-rotate speed is defined per second.
    controls.update(delta / 1000);

    renderer.render(scene, camera);
    frame = requestAnimationFrame(tick);
  };

  frame = requestAnimationFrame(tick);

  return {
    resize,

    resetCamera: () => {
      controls.reset();
      controls.autoRotate = !reduced;
    },

    cameraState: () => ({
      position: [camera.position.x, camera.position.y, camera.position.z],
      target: [controls.target.x, controls.target.y, controls.target.z],
      autoRotate: controls.autoRotate,
    }),

    dispose: () => {
      cancelAnimationFrame(frame);
      controls.removeEventListener("start", stopAutoRotate);
      controls.dispose();
      geometry.dispose();
      materials.forEach((material) => material?.dispose());
      animated.forEach(({ texture }) => texture.dispose());
      environment.texture.dispose();
      pmrem.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    },
  };
};
