# JG RTX — customizer site

A static [Astro](https://astro.build) site for previewing, customizing and
downloading the [JG RTX](https://github.com/jasonjgardner/jg-rtx) resource pack
for Minecraft Bedrock. It ships no server: previews and pack builds both run
entirely in the browser against textures served from jsDelivr.

## What it does

- **A page per block.** Blocks that use different textures per face — logs,
  pillars, grass — keep one slug and show each face separately.
- **3D previews** rendered with `threejs-minecraft-bedrock-rtx-loader`, using
  the pack's real MER/MERS and normal maps.
- **Texture varieties** can be swapped in per texture set and are reflected
  live in the preview.
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
  and are tinted by baking `overlay_color` into the pixels instead.
- **Flipbooks must scale on both axes.** `fire_0` is a 256×8192 strip of
  thirty-two 256px frames. Downscaling to a square would destroy the animation;
  at 64px it must become 64×2048.
- **Resized TGAs stay TGA.** Bedrock resolves texture references without an
  extension, so emitting a PNG beside the original name makes resolution
  ambiguous.
- **`astro check` needs TypeScript 6.x.** The native 7.x compiler does not yet
  expose the programmatic API the checker uses.

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
