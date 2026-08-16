import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * Read from disk rather than importing. The Tailwind plugin owns `.css`
 * resolution, so a `?raw` import of `styles.css` resolves to an empty string.
 */
const projectFile = (...segments: string[]) => {
  return readFileSync(join(process.cwd(), ...segments), "utf8");
};

const source = projectFile("src", "styles.css");

const LIGHT_MARKER = "@media (prefers-color-scheme: light)";

const TOKEN = /--([\w-]+):\s*(#[\da-f]{6})\b/g;

const readTokens = (css: string) => {
  const tokens = new Map<string, string>();

  for (const [, name, value] of css.matchAll(TOKEN)) {
    if (name !== undefined && value !== undefined) {
      tokens.set(name, value);
    }
  }

  return tokens;
};

const markerAt = source.indexOf(LIGHT_MARKER);

const darkTokens = readTokens(source.slice(0, markerAt));
const lightTokens = readTokens(source.slice(markerAt));

const toChannel = (byte: number) => {
  const ratio = byte / 255;

  return ratio <= 0.039_28 ? ratio / 12.92 : ((ratio + 0.055) / 1.055) ** 2.4;
};

const luminance = (hex: string) => {
  const [red, green, blue] = [1, 3, 5].map((offset) => {
    return toChannel(Number.parseInt(hex.slice(offset, offset + 2), 16));
  });

  if (red === undefined || green === undefined || blue === undefined) {
    throw new Error(`${hex} is not a six-digit hex colour`);
  }

  return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
};

const contrast = (foreground: string, background: string) => {
  const lower = Math.min(luminance(foreground), luminance(background));
  const upper = Math.max(luminance(foreground), luminance(background));

  return (upper + 0.05) / (lower + 0.05);
};

const valueOf = (scheme: string, tokens: Map<string, string>, name: string) => {
  const value = tokens.get(name);

  if (value === undefined) {
    throw new Error(`--${name} is missing from the ${scheme} palette`);
  }

  return value;
};

const SYNTAX = [
  "syntax-comment",
  "syntax-function",
  "syntax-keyword",
  "syntax-keyword-control",
  "syntax-keyword-import",
  "syntax-member",
  "syntax-number",
  "syntax-operator",
  "syntax-punctuation",
  "syntax-string",
  "syntax-tag",
  "syntax-type",
];

/**
 * Every pair a reader actually sees, as `[text, surface]`. A code block sits on
 * `--card` while source mode is transparent onto `--background`, so the syntax
 * ramp is painted on both and has to clear the floor on both.
 */
const PAIRS: [text: string, surface: string][] = [
  ["foreground", "background"],
  ["card-foreground", "card"],
  ["popover-foreground", "popover"],
  ["muted-foreground", "background"],
  ["muted-foreground", "card"],
  ["muted-foreground", "popover"],
  ["accent-foreground", "accent"],
  ["secondary-foreground", "secondary"],
  ["primary-foreground", "primary"],
  ["primary", "background"],
  ["destructive", "background"],
  ["destructive", "popover"],
  ["foreground", "selection"],
  ...SYNTAX.flatMap((role): [string, string][] => {
    return [
      [role, "background"],
      [role, "card"],
    ];
  }),
];

const AA = 4.5;

/**
 * The placeholder is guidance rather than content, and it sits under the text a
 * reader is about to type, so it stays below the floor the rest of the palette
 * holds to.
 */
const PLACEHOLDER_FLOOR = 2;

describe.each([
  ["dark", darkTokens, lightTokens],
  ["light", lightTokens, darkTokens],
])("%s palette", (scheme, tokens, other) => {
  it.each(PAIRS)("should clear WCAG AA for %s on %s", (text, surface) => {
    const ratio = contrast(
      valueOf(scheme, tokens, text),
      valueOf(scheme, tokens, surface),
    );

    expect(ratio).toBeGreaterThanOrEqual(AA);
  });

  it("should keep the placeholder readable without competing with the caret", () => {
    const ratio = contrast(
      valueOf(scheme, tokens, "faint"),
      valueOf(scheme, tokens, "background"),
    );

    expect(ratio).toBeGreaterThanOrEqual(PLACEHOLDER_FLOOR);
  });

  it("should define the same token names as the other scheme", () => {
    expect([...tokens.keys()].toSorted()).toStrictEqual(
      [...other.keys()].toSorted(),
    );
  });
});

const firstMatch = (pattern: RegExp, text: string, what: string) => {
  const found = pattern.exec(text);
  const value = found?.[1];

  if (value === undefined) {
    throw new Error(`could not read ${what}`);
  }

  return value;
};

const rustBackground = (rust: string, name: string) => {
  const pattern = new RegExp(
    String.raw`${name}: Color = Color\(\s*0x([\da-f]{2}),\s*0x([\da-f]{2}),\s*0x([\da-f]{2})`,
  );
  const found = pattern.exec(rust);

  if (found === null) {
    throw new Error(`could not read ${name} from src-tauri/src/lib.rs`);
  }

  return `#${found.slice(1, 4).join("")}`;
};

const BACKGROUND = /background-color:\s*(#[\da-f]{6})\b/;

const html = projectFile("index.html");
const htmlMarkerAt = html.indexOf(LIGHT_MARKER);
const rust = projectFile("src-tauri", "src", "lib.rs");
const tauriConfig = projectFile("src-tauri", "tauri.conf.json");

/**
 * The launch background is restated outside the stylesheet, because the window
 * and the webview both paint before it loads. Nothing makes those copies follow
 * `--background`, so they are asserted against it instead.
 */
describe("launch background", () => {
  it("should paint the dark canvas from index.html before styles.css loads", () => {
    expect(
      firstMatch(
        BACKGROUND,
        html.slice(0, htmlMarkerAt),
        "the dark background in index.html",
      ),
    ).toBe(valueOf("dark", darkTokens, "background"));
  });

  it("should paint the light canvas from index.html before styles.css loads", () => {
    expect(
      firstMatch(
        BACKGROUND,
        html.slice(htmlMarkerAt),
        "the light background in index.html",
      ),
    ).toBe(valueOf("light", lightTokens, "background"));
  });

  it("should declare a color-scheme so the canvas is never painted white", () => {
    expect(html).toContain('<meta name="color-scheme" content="dark light" />');
    expect(source).toContain("color-scheme: dark light;");
  });

  it("should give the tauri window the dark background at creation", () => {
    expect(
      firstMatch(
        /"backgroundColor":\s*"(#[\da-f]{6})"/,
        tauriConfig,
        "backgroundColor in tauri.conf.json",
      ),
    ).toBe(valueOf("dark", darkTokens, "background"));
  });

  it("should carry both scheme backgrounds into the rust window layer", () => {
    expect(rustBackground(rust, "BG_DARK")).toBe(
      valueOf("dark", darkTokens, "background"),
    );
    expect(rustBackground(rust, "BG_LIGHT")).toBe(
      valueOf("light", lightTokens, "background"),
    );
  });
});
