# Repository guide

Static Astro site for previewing, customizing and downloading the JG RTX
resource pack. No server: previews and pack builds run in the browser against
textures on jsDelivr. See `README.md` for the full picture.

## Development

Start the dev server in background mode:

```
astro dev --background
```

Manage it with `astro dev stop`, `astro dev status`, and `astro dev logs`.

Regenerate the catalog after pack changes:

```
bun run catalog -- --src "../JG RTX"
```

## Layout

- `scripts/` — build-time catalog generation. Node/Bun only.
- `src/data/` — generated and committed. The site's only data source; never
  hand-edit.
- `src/lib/` — shared logic. Used by both the generator and the browser, so it
  must not import Node builtins.
- `src/elements/` — Web Components. All client interactivity lives here.
- `src/workers/` — the texture worker used by the pack builder.

## Rules worth knowing before editing

- **Never import `targadactyl` or `targadactyl/loader` in browser code.** They
  pull in `skia-canvas`, a native Node addon. Use `targadactyl/reader` and
  `targadactyl/writer`, which are browser-safe by design.
- **Controls are server-rendered and enhanced, not client-templated.** Web
  Components attach to existing markup so the page works before hydration.
- **Structured data reaches components via a child
  `<script type="application/json">`,** not attributes — a block carries
  several texture sets and their PBR maps.
- **`hidden` is how panels toggle.** A component rule that sets `display` will
  defeat it unless the global `[hidden]` override stays in place.
- `astro check` requires TypeScript 6.x; the native 7.x compiler does not
  expose the API it needs.

## Documentation

Astro docs: https://docs.astro.build

- [Routing](https://docs.astro.build/en/guides/routing/)
- [Components](https://docs.astro.build/en/basics/astro-components/)
- [Content collections](https://docs.astro.build/en/guides/content-collections/)
- [Styling](https://docs.astro.build/en/guides/styling/)
