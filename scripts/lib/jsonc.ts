/**
 * Tolerant JSON parsing for Minecraft data files.
 *
 * Mojang ships `terrain_texture.json` with a leading `//` disclaimer, and
 * hand-edited pack files routinely carry comments, trailing commas and a UTF-8
 * BOM. `JSON.parse` rejects all three, so input is normalised first.
 *
 * The scanner is string-aware: a `//` inside a quoted value (common in texture
 * paths and URLs) is preserved rather than treated as a comment.
 */

/** Characters that end a line comment. */
const LINE_END = /[\r\n]/;

/**
 * Strip comments from a JSON-ish document, preserving string contents.
 *
 * @param text Raw document text.
 * @returns The text with `//` and block comments replaced by nothing.
 */
const stripComments = (text: string): string => {
  const output: string[] = [];
  let index = 0;
  let inString = false;

  while (index < text.length) {
    const char = text[index] ?? "";
    const next = text[index + 1] ?? "";

    if (inString) {
      // A backslash escapes the next character, including a closing quote.
      if (char === "\\") {
        output.push(char, next);
        index += 2;
        continue;
      }

      if (char === '"') inString = false;

      output.push(char);
      index += 1;
      continue;
    }

    if (char === '"') {
      inString = true;
      output.push(char);
      index += 1;
      continue;
    }

    if (char === "/" && next === "/") {
      while (index < text.length && !LINE_END.test(text[index] ?? "")) index += 1;
      continue;
    }

    if (char === "/" && next === "*") {
      index += 2;
      while (index < text.length && !(text[index] === "*" && text[index + 1] === "/")) {
        index += 1;
      }
      index += 2;
      continue;
    }

    output.push(char);
    index += 1;
  }

  return output.join("");
};

/**
 * Parse a JSON document that may contain a BOM, comments or trailing commas.
 *
 * @param text Raw document text.
 * @returns The parsed value.
 * @throws {SyntaxError} If the document is still invalid after normalisation.
 */
export const parseJsonc = <T>(text: string): T => {
  const normalised = stripComments(text.replace(/^﻿/, ""))
    .replace(/,(\s*[}\]])/g, "$1");

  return JSON.parse(normalised) as T;
};
