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
  BoxGeometry,
  DirectionalLight,
  Mesh,
  NearestFilter,
  PerspectiveCamera,
  PMREMGenerator,
  Scene,
  SRGBColorSpace,
  Texture,
  WebGLRenderer,
} from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { createBedrockMaterial } from "threejs-minecraft-bedrock-rtx-loader";
import { loadBitmap, tintBitmap } from "./decode";
import type { BlockFace, IFlipbook, ITextureFile, ITextureSet } from "./types";
import { fileUrl } from "./cdn";

/**
 * three.js `BoxGeometry` assigns material groups in the order
 * `+X, -X, +Y, -Y, +Z, -Z`. Mapped onto Minecraft's face names, that is:
 */
export const BOX_FACE_ORDER: readonly BlockFace[] = [
  "east",
  "west",
  "up",
  "down",
  "south",
  "north",
] as const;

/** Real-time duration of one Minecraft tick, in milliseconds. */
const TICK_MS = 50;

/** A texture set paired with the face indices that use it. */
export interface IFacePlan {
  readonly set: ITextureSet;
  readonly faces: readonly number[];
  /**
   * Biome tint multiplied over the colour map, or `null`. Grass and foliage are
   * authored greyscale and only look right once this is applied.
   */
  readonly tint?: string | null;
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

/** Default camera placement — a three-quarter view showing three faces. */
const HOME_POSITION: readonly [number, number, number] = [2.1, 1.7, 2.4];

/** How close and how far the viewer may zoom, in block widths. */
const MIN_DISTANCE = 1.35;
const MAX_DISTANCE = 8;

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
 * Load every file in a set and build its material.
 *
 * @param set Texture set to realise.
 * @param tint Biome tint to multiply over the colour map, if any.
 * @param signal Abort signal for the fetches.
 * @param animated Collector for textures needing per-frame advancement.
 */
const buildMaterial = async (
  set: ITextureSet,
  tint: string | null | undefined,
  signal: AbortSignal,
  animated: IAnimated[],
): Promise<Awaited<ReturnType<typeof createBedrockMaterial>>> => {
  const roles = (["color", "mer", "mers", "normal", "heightmap"] as const)
    .map((role) => [role, set[role]] as const)
    .filter((entry): entry is readonly [typeof entry[0], ITextureFile] =>
      entry[1] !== undefined);

  const loaded = await Promise.all(
    roles.map(async ([role, file]) => {
      // Pre-flipped; see toTexture for why Texture.flipY cannot do this.
      const decoded = await loadBitmap(fileUrl(file, set.origin), file.ext, signal, true);

      // Only the colour map is tinted — multiplying a biome colour into a
      // normal or MER map would corrupt the PBR data it encodes.
      const bitmap = role === "color" && typeof tint === "string"
        ? await tintBitmap(decoded, tint)
        : decoded;

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

  return createBedrockMaterial(Object.fromEntries(loaded));
};

/**
 * Mount a rotating, lit preview cube into a container.
 *
 * @param container Element to render into; sized by CSS.
 * @param plan Texture sets and the box face indices each one covers.
 * @param signal Abort signal that cancels texture loading.
 * @param initial View to restore, so swapping a variety does not throw away
 *   the angle the viewer had chosen.
 * @returns A handle for resizing, camera control and disposal.
 * @throws If WebGL is unavailable or any texture fails to load.
 */
export const mountPreview = async (
  container: HTMLElement,
  plan: readonly IFacePlan[],
  signal: AbortSignal,
  initial?: ICameraState,
): Promise<IPreview> => {
  const renderer = new WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.toneMapping = ACESFilmicToneMapping;

  const scene = new Scene();
  const camera = new PerspectiveCamera(35, 1, 0.1, 100);
  camera.position.set(...HOME_POSITION);
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
    plan.map((entry) => buildMaterial(entry.set, entry.tint, signal, animated)),
  );

  // Map each of the six box groups onto the material for the set covering it.
  const byFace = new Map<number, number>();
  plan.forEach((entry, index) => {
    entry.faces.forEach((face) => byFace.set(face, index));
  });

  const geometry = new BoxGeometry(1, 1, 1);
  const ordered = BOX_FACE_ORDER.map((_, index) => materials[byFace.get(index) ?? 0]);

  const mesh = new Mesh(
    geometry,
    ordered.filter((material): material is NonNullable<typeof material> =>
      material !== undefined),
  );
  scene.add(mesh);

  container.append(renderer.domElement);
  renderer.domElement.style.inlineSize = "100%";
  renderer.domElement.style.blockSize = "100%";
  renderer.domElement.style.display = "block";

  const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.minDistance = MIN_DISTANCE;
  controls.maxDistance = MAX_DISTANCE;
  // Panning a single centred block only loses it off-screen.
  controls.enablePan = false;
  controls.autoRotateSpeed = 1.1;

  // `saveState` captures the home framing *before* any restore below, so the
  // reset button always returns to the default view rather than to whatever
  // angle happened to be restored from a previous build.
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
