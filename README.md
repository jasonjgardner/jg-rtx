# JG RTX — customizer site

A static [Astro](https://astro.build) site for previewing, customizing and
downloading the [JG RTX](https://github.com/jasonjgardner/jg-rtx) resource pack
for Minecraft Bedrock. It ships no server: previews and pack builds both run
entirely in the browser against textures served from jsDelivr.

## What it does

- **A page per block.** Blocks that use different textures per face — logs,
  pillars, grass — keep one slug and show each face separately.
- **3D previews** rendered with `threejs-minecraft-bedrock-rtx-loader`, using
  the pack's real MER/MERS and normal maps. Orbit with a drag, zoom with the
  wheel, and reset the framing with a button; the idle spin stops as soon as
  you take hold of the camera, and your angle survives swapping a variety.
- **Real voxel shapes** — torches, stairs, slabs, carpets and crossed plant
  planes rather than a cube for everything. A third of the catalog is not a
  full block.
- **Bedrock alpha modes** derived per texture: opaque, cutout, or blend.
- **Texture varieties** can be swapped in per texture set and are reflected
  live in the preview.
- **Design history** — every previous version of a texture from the pack's git
  history, selectable in place of the current one.
- **Power-of-two resizing**, globally or per texture.
- **In-browser pack builds** that stream a `.mcpack` straight to disk.

## Getting started

```sh
bun install

# Generate the catalog from a checkout of the pack repository.
bun run catalog -- --src "../JG RTX"

bun run dev
```

`bun run catalog` writes `src/data/*.json`. It needs a checkout of the JG RTX
repository because neither jsDelivr nor the GitHub API will enumerate a
repository that large — jsDelivr's data API refuses it outright with
*"Package size exceeded the configured limit of 50 MB"*.

Vanilla data (Mojang's `blocks.json`, `terrain_texture.json`,
`flipbook_textures.json` and the block file listing) is fetched from upstream
and cached in `.cache/`. Pass `--vanilla <path>` to a `Mojang/bedrock-samples`
checkout to read exact vanilla dimensions instead of the API listing.

| Command | Action |
| :-- | :-- |
| `bun install` | Install dependencies |
| `bun run catalog -- --src <path>` | Regenerate `src/data/` from the pack |
| `bun run dev` | Dev server (backgrounds itself; `astro dev stop` to halt) |
| `bun run build` | Production build to `dist/` |
| `bun run check` | Type check (needs TypeScript 6.x — see below) |
| `bun test` | Run the geometry, shape-rule and history tests |

## How it fits together

```
scripts/generate-catalog.ts     reads the pack + vanilla data
   └── src/data/*.json          committed; the site's only data source
          └── src/content.config.ts   validates it as Astro collections
                 └── pages, components, custom elements
```

**Block resolution** is a three-hop chain, and every hop is load-bearing:

```
blocks.json       oak_log  ->  { up: "log_oak_top", side: "log_oak" }
terrain_texture   log_oak  ->  "textures/blocks/log_oak"
texture sets      textures/blocks/log_oak -> { color, mer, normal }
```

`blocks.json` names *texture keys*, not paths, so `terrain_texture.json` — JG
RTX's entries layered over Mojang's — has to be merged before anything resolves
to a file.

## Things that are less obvious than they look

- **TGA is unavoidable.** No browser decodes `.tga`, and the pack relies on it
  (`grass_side.tga` among others; vanilla now ships 1200+). Decoding uses
  [`targadactyl`](https://github.com/jasonjgardner/targadactyl). **Import only
  `targadactyl/reader` and `targadactyl/writer`** — the package root and
  `targadactyl/loader` pull in `skia-canvas`, a native Node addon that cannot
  be bundled for the browser.
- **`Texture.flipY` does nothing for `ImageBitmap`.** WebGL's
  `UNPACK_FLIP_Y_WEBGL` does not apply to bitmap sources, so textures render
  upside down unless the bitmap is flipped at decode time via
  `createImageBitmap(..., { imageOrientation: "flipY" })`.
- **Biome tints can't go through the material.** The RTX loader's fragment
  shader assigns `csm_DiffuseColor = texture2D(uColor, uv)` outright, so
  `material.color` never reaches the output. Grass and foliage are greyscale
  and are tinted by baking the colour into the pixels instead.
- **Leaves are tinted from a colormap, not from `terrain_texture.json`.** Grass
  declares an `overlay_color` there; leaves declare nothing and are coloured by
  the engine from `textures/colormap/*.png`. `leaves_jungle` is *literally*
  greyscale (mean saturation 0.000), so without sampling that colormap it
  previews as a white cube. Whether a tint is applied is decided from the
  texture's own saturation, so `cherry_leaves` (0.288) and `azalea_leaves`
  (0.555) keep the colour they ship with.
- **Cutouts are not "mostly holes".** Alpha classification cannot key off
  whether holes outnumber partially transparent pixels: `leaves_jungle` is
  12.2% holes against 15.1% anti-aliased edge, because its leaf silhouettes
  have an enormous perimeter. What separates cutout from blend is whether the
  texture punches holes *at all*.
- **Flipbooks must scale on both axes.** `fire_0` is a 256×8192 strip of
  thirty-two 256px frames. Downscaling to a square would destroy the animation;
  at 64px it must become 64×2048.
- **Resized TGAs stay TGA.** Bedrock resolves texture references without an
  extension, so emitting a PNG beside the original name makes resolution
  ambiguous.
- **Shape presets carry per-face UVs, not one atlas mapping.** bedrock.graphics'
  `build-geometry.ts` maps a single texture across a whole model; here each
  Minecraft face direction has its own texture set, so `blockGeometry.ts`
  buckets faces into material groups by direction instead. Bedrock measures V
  downward and three.js upward, which is why V is flipped when reading a
  preset's UVs — that is what makes a slab sample the *lower* half of its side
  texture.
- **`astro check` needs TypeScript 6.x.** The native 7.x compiler does not yet
  expose the programmatic API the checker uses.

## Block shapes

The eleven presets are the common vanilla voxel shapes, taken from
[bedrock.graphics](https://bedrock.graphics) and bundled as `.geo.json` under
`src/data/block-shapes/`. All eleven together are ~5 KB, so they are imported
rather than fetched and switching shapes never touches the network.

Winding is covered by tests, because getting it wrong is nearly invisible: a
backwards-wound closed box still renders a solid silhouette under back-face
culling — it just draws its *far* walls instead of its near ones. Stairs and
torches looked right that way through a whole review pass, and only a shallow
button gave it away by appearing as a hollow tray.

A block's shape is resolved from its identifier at catalog time, so the choice
is visible in `src/data/blocks.json` and the rules are testable. Ordering in
`SHAPE_RULES` matters: `acacia_double_slab` is a *full* block and has to be
matched before the `_slab` rule, and `_wall$` deliberately misses
`oak_wall_sign`. Plants are an explicit list because their names share no
common ending. The preview offers a picker to override the guess.

## Design history

Each block texture lists its previous designs, taken from the pack's git log,
and any of them can be selected instead of the current one — in the preview and
in a generated pack. Old files are fetched from jsDelivr by commit SHA, which
serves any path at any commit.

Two details make the data trustworthy:

- **Revisions are deduped by blob hash, not by commit.** `brick.png` appears in
  five commits, but two share a blob because the 2022 "Repo reorganization" was
  a pure move. Brick has three previous designs, not four, and the commit kept
  for each is the one that *introduced* the image.
- **Each revision stores its own path.** That same reorganization moved block
  textures from `bedrock/RP/` to `bedrock/pack/RP/`, so a 2022 revision cannot
  be fetched at today's path.

Only the colour map is substituted in a pack build. The preview also tries the
revision's PBR companions and falls back to today's files, which is safe there
because a 404 is recoverable — `_mers` maps did not exist before 2022.

**History is not regenerated in CI.** The pack's git history is ~10 GB, so the
catalog workflow checks out shallow; the generator detects that and preserves
the committed `history.json` rather than emitting an empty one. Refresh it from
a full local clone.

## Deployment

Two workflows, split by cost:

- **`.github/workflows/pages.yml`** builds and deploys on push to `pages`. It
  reads the committed catalog, so it needs no pack checkout and finishes in
  seconds.
- **`.github/workflows/catalog.yml`** regenerates the catalog. This is the
  expensive half — it sparse-checks-out `bedrock/` from `main` to read every
  texture's dimensions and size — so it runs on demand or weekly, and commits
  only when the content actually changed.

## Pack builds

The builder fetches every file from jsDelivr through a pool of Web Workers,
rescales what needs rescaling off the main thread, and streams the archive with
[`client-zip`](https://github.com/Touffy/client-zip). Where the File System
Access API is available the ZIP is piped straight to disk, so memory stays flat
regardless of pack size; elsewhere it falls back to an in-memory `Blob`, which
is only sensible for small builds.

A bounded queue sits between the pool and the ZIP writer. Without it the
workers would race ahead and buffer the entire pack in memory, defeating the
streaming.

Generated packs get fresh manifest UUIDs so a customized pack installs
alongside the published one rather than replacing it, and subpack declarations
are dropped since the output contains exactly one resolution.

Full-resolution builds are ~542 MB across ~4,640 files. The published
[releases](https://github.com/jasonjgardner/jg-rtx/releases) are far faster if
no customization is needed.
