/**
 * Invariants of the generated texture history.
 *
 * The generator reads ~10 GB of git history that CI never sees, so the
 * committed `history.json` is effectively hand-off data: if it is wrong, no
 * later stage will notice. These tests check the properties the UI and the pack
 * builder rely on.
 */

import { describe, expect, test } from "bun:test";
import history from "../data/history.json";
import sets from "../data/sets.json";
import { commitUrl } from "./cdn";
import { versionUrls } from "./versions";
import type { ITextureSet, ITextureVersion } from "./types";

const entries = history as { id: string; versions: ITextureVersion[] }[];
const setsById = new Map((sets as ITextureSet[]).map((set) => [set.id, set]));

describe("generated history", () => {
  test("is not empty", () => {
    expect(entries.length).toBeGreaterThan(0);
  });

  test("every entry names a texture set that exists", () => {
    const orphans = entries.filter((entry) => !setsById.has(entry.id));

    expect(orphans.map((entry) => entry.id)).toEqual([]);
  });

  test("commits are full 40-character SHAs matching their short form", () => {
    const bad = entries.flatMap((entry) =>
      entry.versions
        .filter((version) =>
          !/^[0-9a-f]{40}$/.test(version.commit) ||
          !version.commit.startsWith(version.short))
        .map((version) => `${entry.id} ${version.commit}`),
    );

    expect(bad).toEqual([]);
  });

  test("a texture never lists the same commit twice", () => {
    const duplicated = entries.filter((entry) => {
      const commits = entry.versions.map((version) => version.commit);

      return new Set(commits).size !== commits.length;
    });

    expect(duplicated.map((entry) => entry.id)).toEqual([]);
  });

  test("revisions run newest first", () => {
    const unsorted = entries.filter((entry) =>
      entry.versions.some((version, index) => {
        const previous = entry.versions[index - 1];

        return previous !== undefined && previous.date < version.date;
      }),
    );

    expect(unsorted.map((entry) => entry.id)).toEqual([]);
  });

  test("paths sit under a directory that has held block textures", () => {
    // The 2022 reorganization moved `bedrock/RP/` to `bedrock/pack/RP/`, so a
    // revision's path must be the one from its own era.
    const stray = entries.flatMap((entry) =>
      entry.versions
        .filter((version) =>
          !version.path.startsWith("bedrock/pack/RP/textures/blocks/") &&
          !version.path.startsWith("bedrock/RP/textures/blocks/"))
        .map((version) => version.path),
    );

    expect(stray).toEqual([]);
  });

  test("both path eras are represented", () => {
    // If the pre-reorganization era vanished, `--no-renames` or the key
    // normalisation broke and half the history would be silently missing.
    const paths = entries.flatMap((entry) => entry.versions.map((v) => v.path));

    expect(paths.some((p) => p.startsWith("bedrock/RP/"))).toBe(true);
    expect(paths.some((p) => p.startsWith("bedrock/pack/RP/"))).toBe(true);
  });

  test("brick keeps its three designs and drops the pure rename", () => {
    // `2d241980` moved brick.png without changing a pixel, and `36622328` is
    // what `main` ships today; neither is a *previous design*.
    const brick = entries.find((entry) => entry.id === "textures/blocks/brick");

    expect(brick).toBeDefined();
    expect(brick?.versions.map((version) => version.short)).toEqual([
      "b9913d5a",
      "c10d2a02",
      "798bcbd0",
    ]);
  });
});

describe("versionUrls", () => {
  const set = setsById.get("textures/blocks/brick");
  const version: ITextureVersion = {
    commit: "798bcbd0f364f903f0e73dabe028295c1eae1f72",
    short: "798bcbd0",
    date: 1657289406,
    subject: "upd: Created subpacks for different texture sizes",
    path: "bedrock/RP/textures/blocks/brick.png",
  };

  test("the colour map resolves to the revision, then to today's file", () => {
    const urls = versionUrls(set as ITextureSet, "color", version);

    expect(urls[0]).toBe(commitUrl(version.path, version.commit));
    expect(urls).toHaveLength(2);
    expect(urls[1]).toContain("@main");
  });

  test("a companion is derived from the colour map's stem", () => {
    const urls = versionUrls(set as ITextureSet, "normal", version);

    expect(urls[0]).toContain("bedrock/RP/textures/blocks/brick_normal.png");
    // The current file is always the last resort, because `_mers` companions
    // did not exist before 2022 and legitimately 404 at older commits.
    expect(urls[urls.length - 1]).toContain("@main");
  });

  test("a role the set does not have resolves to nothing", () => {
    expect(versionUrls(set as ITextureSet, "heightmap", version)).toEqual([]);
  });
});
