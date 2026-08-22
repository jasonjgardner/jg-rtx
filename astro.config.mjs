// @ts-check
import { defineConfig } from "astro/config";

/**
 * GitHub Pages project site. Both values are overridable so the same build
 * works from a fork, a custom domain, or a local preview:
 *   SITE=https://example.com BASE=/ bun run build
 *
 * Empty is treated as unset, because `actions/configure-pages` exports empty
 * strings when it has nothing to report and `??` would happily accept those.
 *
 * @param {string} name Environment variable to read.
 * @param {string} fallback Value to use when unset or blank.
 * @returns {string}
 */
const fromEnv = (name, fallback) => {
  const value = process.env[name];

  return value === undefined || value.trim() === "" ? fallback : value;
};

const site = fromEnv("SITE", "https://jasonjgardner.github.io");
const base = fromEnv("BASE", "/jg-rtx");

// https://astro.build/config
export default defineConfig({
  site,
  base,
  trailingSlash: "ignore",
  build: {
    // Emit `/blocks/stone/index.html` so slugs resolve without an extension.
    format: "directory",
  },
  vite: {
    worker: {
      // The texture worker is an ES module: it uses top-level `import`.
      format: "es",
    },
    optimizeDeps: {
      // Pre-bundle these so Vite does not discover them mid-session and force
      // a page reload. Only targadactyl's browser-safe subpaths are listed:
      // its root and `/loader` pull in skia-canvas, a native Node addon.
      include: [
        "client-zip",
        "targadactyl/reader",
        "targadactyl/writer",
        "three",
        "three-custom-shader-material/vanilla",
        "threejs-minecraft-bedrock-rtx-loader",
      ],
    },
    build: {
      // three.js + the RTX loader are large; keep the warning signal useful.
      chunkSizeWarningLimit: 1200,
    },
  },
});
