/**
 * Extracts each block texture's revision history from the pack's git log.
 *
 * The point is to let a viewer pick an older design over the current one, so
 * the unit of history is a *distinct image*, not a commit. Two things follow
 * from that:
 *
 * - **Dedupe by blob hash.** `brick.png` appears in five commits, but two of
 *   them share blob `0ef61467` because the 2022 "Repo reorganization" was a
 *   pure move. Offering that as a separate design would be a lie; brick has
 *   three previous designs, not four.
 * - **Track the path per revision.** The same reorganization moved textures
 *   from `bedrock/RP/` to `bedrock/pack/RP/`, so a revision's URL has to use
 *   the path as it was *at that commit*.
 *
 * This is the one part of the catalog that needs real git history, and the
 * pack's history is ~10 GB. CI therefore never generates it — see
 * `generate-catalog.ts`, which preserves the committed file when history is
 * unavailable rather than emitting an empty one.
 */

import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { ITextureVersion } from "../../src/lib/types";

const run = promisify(execFile);

/** Directories that have held block textures, newest scheme first. */
const BLOCK_DIRS = [
  "bedrock/pack/RP/textures/blocks",
  "bedrock/RP/textures/blocks",
] as const;

/** Upper bound on revisions kept per texture, newest first. */
const MAX_VERSIONS = 12;

/** Output buffer ceiling; the raw log for this pack is ~1.5 MB. */
const MAX_BUFFER = 64 * 1024 * 1024;

/** One file revision, before grouping. */
interface IRawRevision {
  readonly commit: string;
  readonly date: number;
  readonly subject: string;
  readonly blob: string;
  readonly path: string;
}

/**
 * Run a git command in the pack repository.
 *
 * @param repoRoot Absolute path to the repository.
 * @param args Arguments after `git`.
 * @returns Standard output, or `null` if git failed.
 */
const git = async (repoRoot: string, args: string[]): Promise<string | null> => {
  try {
    const { stdout } = await run("git", ["-C", repoRoot, ...args], {
      maxBuffer: MAX_BUFFER,
      windowsHide: true,
    });

    return stdout;
  } catch {
    return null;
  }
};

/**
 * Report whether a directory is a git repository with usable history.
 *
 * A shallow clone — what CI checkouts produce by default — can only see the
 * tip, so generating from one would silently produce an empty history.
 *
 * @param repoRoot Absolute path to check.
 */
export const hasGitHistory = async (repoRoot: string): Promise<boolean> => {
  const inside = await git(repoRoot, ["rev-parse", "--is-inside-work-tree"]);

  if (inside?.trim() !== "true") return false;

  const shallow = await git(repoRoot, ["rev-parse", "--is-shallow-repository"]);

  if (shallow?.trim() === "true") {
    console.warn("  ! pack checkout is shallow; texture history cannot be read");
    return false;
  }

  return true;
};

/** Strip whichever known block directory prefixes a path, or `null`. */
const toBlockRelative = (path: string): string | null => {
  const dir = BLOCK_DIRS.find((candidate) => path.startsWith(`${candidate}/`));

  return dir === undefined ? null : path.slice(dir.length + 1);
};

/**
 * Read every add/modify of a block texture across the repository's history.
 *
 * Renames are disabled deliberately: with `--no-renames` the 2022 move shows up
 * as an add at the new path, which keeps each revision's real path intact.
 * Keying by the path *relative to the blocks directory* then reunites the two
 * eras, and the blob dedupe drops the move itself.
 */
const readRevisions = async (repoRoot: string): Promise<Map<string, IRawRevision[]>> => {
  const stdout = await git(repoRoot, [
    "log",
    "--format=C|%H|%at|%s",
    "--raw",
    "--abbrev=40",
    "--no-renames",
    "--diff-filter=AM",
    "HEAD",
    "--",
    ...BLOCK_DIRS,
  ]);

  const byFile = new Map<string, IRawRevision[]>();

  if (stdout === null) return byFile;

  let commit = "";
  let date = 0;
  let subject = "";

  stdout.split("\n").forEach((line) => {
    if (line.startsWith("C|")) {
      const [, sha, at, ...rest] = line.split("|");
      commit = sha ?? "";
      date = Number(at ?? 0);
      subject = rest.join("|");
      return;
    }

    if (!line.startsWith(":")) return;

    // `:<oldmode> <newmode> <oldblob> <newblob> <status>\t<path>`
    const [meta, path] = line.split("\t");
    if (!meta || !path) return;

    const blob = meta.split(" ")[3];
    const key = toBlockRelative(path);

    if (!blob || key === null) return;

    const existing = byFile.get(key);
    const revision: IRawRevision = { commit, date, subject, blob, path };

    if (!existing) {
      byFile.set(key, [revision]);
      return;
    }

    existing.push(revision);
  });

  return byFile;
};

/** Read the blob hash of every block texture at HEAD. */
const readCurrentBlobs = async (repoRoot: string): Promise<Map<string, string>> => {
  const stdout = await git(repoRoot, ["ls-tree", "-r", "HEAD", "--", ...BLOCK_DIRS]);
  const current = new Map<string, string>();

  if (stdout === null) return current;

  stdout.split("\n").forEach((line) => {
    const [meta, path] = line.split("\t");
    if (!meta || !path) return;

    const blob = meta.split(" ")[2];
    const key = toBlockRelative(path);

    if (blob && key !== null) current.set(key, blob);
  });

  return current;
};

/**
 * Collapse a file's revisions into distinct designs, newest first.
 *
 * `git log` emits newest first, so a run of equal blobs is walked from its
 * newest occurrence backwards; the *oldest* commit in each run is the one that
 * introduced that image, and that is the one worth showing.
 *
 * @param revisions Revisions for one file, newest first.
 * @param currentBlob Blob at HEAD, excluded as it is not a *previous* version.
 */
const toVersions = (
  revisions: readonly IRawRevision[],
  currentBlob: string | undefined,
): ITextureVersion[] => {
  const distinct: IRawRevision[] = [];

  revisions.forEach((revision) => {
    const last = distinct[distinct.length - 1];

    // Same image as the entry already recorded: keep the older commit, which
    // is the one that actually introduced it.
    if (last && last.blob === revision.blob) {
      distinct[distinct.length - 1] = revision;
      return;
    }

    distinct.push(revision);
  });

  return distinct
    .filter((revision) => revision.blob !== currentBlob)
    .slice(0, MAX_VERSIONS)
    .map((revision) => ({
      commit: revision.commit,
      short: revision.commit.slice(0, 8),
      date: revision.date,
      subject: revision.subject,
      path: revision.path,
    }));
};

/** A texture's previous designs, keyed by its texture-set id. */
export interface IHistoryEntry {
  /** Texture set id, e.g. `textures/blocks/brick`. */
  readonly id: string;
  /** Previous designs of the set's colour map, newest first. */
  readonly versions: readonly ITextureVersion[];
}

/**
 * Build the revision history for a set of textures.
 *
 * @param repoRoot Absolute path to the pack repository.
 * @param colorFiles Colour-map path per texture-set id, pack-relative
 *   (`textures/blocks/brick.png`).
 * @returns History entries for sets that have at least one previous design.
 */
export const collectHistory = async (
  repoRoot: string,
  colorFiles: ReadonlyMap<string, string>,
): Promise<IHistoryEntry[]> => {
  const [revisions, current] = await Promise.all([
    readRevisions(repoRoot),
    readCurrentBlobs(repoRoot),
  ]);

  const entries: IHistoryEntry[] = [];

  colorFiles.forEach((file, id) => {
    // `textures/blocks/brick.png` -> `brick.png`, the history key.
    const key = file.replace(/^textures\/blocks\//, "");
    const found = revisions.get(key);

    if (!found) return;

    const versions = toVersions(found, current.get(key));

    if (versions.length > 0) entries.push({ id, versions });
  });

  return entries.sort((left, right) => left.id.localeCompare(right.id));
};
