import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * Read from disk rather than importing. The Tailwind plugin owns `.css`
 * resolution, so a `?raw` import of `styles.css` resolves to an empty string.
 */
const projectFile = (...segments: string[]) =>
  readFileSync(join(process.cwd(), ...segments), "utf8");

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
  const [red, green, blue] = [1, 3, 5].map((offset) =>
    toChannel(Number.parseInt(hex.slice(offset, offset + 2), 16))
  );

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

const tokenValue = (
  scheme: string,
  tokens: Map<string, string>,
  name: string
) => {
  const value = tokens.get(name);

  if (value === undefined) {
    throw new Error(`--${name} is missing from the ${scheme} palette`);
  }

  return value;
};

const firstMatch = (pattern: RegExp, text: string, what: string) => {
  const found = pattern.exec(text);
  // biome-ignore lint/suspicious/noUnnecessaryConditions: RegExp.exec returns RegExpExecArray | null
  const value = found?.[1];

  if (value === undefined) {
    throw new Error(`could not read ${what}`);
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
 * ramp is painted on both and has to clear the floor on both. `--muted` carries
 * the inline-code chip Typeset paints (`D40`), which body text and a muted
 * heading both sit inside.
 */
const PAIRS: [text: string, surface: string][] = [
  ["foreground", "background"],
  ["card-foreground", "card"],
  ["popover-foreground", "popover"],
  ["foreground", "muted"],
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
  ...SYNTAX.flatMap((role): [string, string][] => [
    [role, "background"],
    [role, "card"],
  ]),
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
      tokenValue(scheme, tokens, text),
      tokenValue(scheme, tokens, surface)
    );

    expect(ratio).toBeGreaterThanOrEqual(AA);
  });

  it("should keep the placeholder readable without competing with the caret", () => {
    const ratio = contrast(
      tokenValue(scheme, tokens, "faint"),
      tokenValue(scheme, tokens, "background")
    );

    expect(ratio).toBeGreaterThanOrEqual(PLACEHOLDER_FLOOR);
  });

  it("should define the same token names as the other scheme", () => {
    expect([...tokens.keys()].toSorted()).toStrictEqual(
      [...other.keys()].toSorted()
    );
  });
});

const COMMENT = /\/\*[\s\S]*?\*\//g;
const URL_VALUE = /url\([^)]*\)/g;

/**
 * Rule preludes in source order, whitespace collapsed so a selector the
 * formatter wrapped across lines reads as one string. Tracks brace depth rather than
 * splitting on braces, so a rule nested in an at-rule is still seen, and drops
 * comments and `url()` values first because either can carry a brace.
 */
const preludesOf = (css: string) => {
  const preludes: string[] = [];

  let buffer = "";

  for (const character of css
    .replaceAll(COMMENT, "")
    .replaceAll(URL_VALUE, "")) {
    if (character === "{") {
      preludes.push(buffer.trim().replaceAll(/\s+/g, " "));
      buffer = "";
    } else if (character === "}" || character === ";") {
      buffer = "";
    } else {
      buffer += character;
    }
  }

  return preludes.filter((prelude) => prelude !== "");
};

const TASK_LIST = 'ul[data-type="taskList"]';

const LIST_ITEM = /\bli\b/;

const taskRowSelectors = preludesOf(source).filter(
  (prelude) => prelude.includes(TASK_LIST) && LIST_ITEM.test(prelude)
);

/**
 * A prelude is a whole selector list, so one comma-separated rule can hold a
 * child-combinator selector and a descendant one at once. Requiring `> li`
 * somewhere in the prelude would pass on the safe half alone, which is why the
 * descendant form is rejected outright rather than left to the positive check.
 */
const DESCENDANT_ROW = /ul\[data-type="taskList"\]\s+li\b/;

/**
 * A task item holds `paragraph block*`, so a list nested inside one renders as
 * an ordinary `ul` of plain `li`. The row recipe sets `display: flex`, which is
 * not `list-item` and generates no marker box, so reaching a row through a
 * descendant `li` deletes the markers of every list a task carries (`D39`).
 */
describe("task list styling", () => {
  it("should reach a task row as a child of its own list", () => {
    expect(taskRowSelectors).not.toStrictEqual([]);
    expect(
      taskRowSelectors.filter((prelude) =>
        prelude.includes(`${TASK_LIST} > li`)
      )
    ).toStrictEqual(taskRowSelectors);
    expect(
      taskRowSelectors.filter((prelude) => DESCENDANT_ROW.test(prelude))
    ).toStrictEqual([]);
  });
});

const typeset = projectFile("src", "typeset.css");

const TEXT_TONES = ["destructive", "faint", "foreground", "muted-foreground"];

/**
 * Typeset takes no colour of its own. It derives two paint roles from theme
 * tokens, and every colour it draws comes from one of those two or from
 * `--color-foreground` (`D40`). Reading them out of the vendored file is what
 * catches an upgrade that repoints one, since nothing else would.
 */
const typesetRole = (role: string) => {
  const found = new RegExp(
    String.raw`--typeset-${role}:\s*var\(\s*--color-([\w-]+)`
  ).exec(typeset);
  // biome-ignore lint/suspicious/noUnnecessaryConditions: RegExp.exec returns RegExpExecArray | null
  const token = found?.[1];

  if (token === undefined) {
    throw new Error(`--typeset-${role} does not read a --color-* token`);
  }

  return token;
};

const MARKER_COLOUR = /::marker\s*\{\s*color:\s*var\(--typeset-([\w-]+)\)/g;

const INLINE_CODE_COLOUR =
  /\.typeset-note :not\(pre\) > code \{\s*color: var\(--([\w-]+)\)/;

const markerRoles = [...typeset.matchAll(MARKER_COLOUR)].map(
  ([, role]) => role
);

/**
 * A `::marker` is a painted glyph, and pointing one at `--border` put a bullet
 * on the dark background at 1.27:1 before `D39`. Typeset paints every marker
 * from `--typeset-muted`, which is the conclusion `D39` reached, so the gate
 * asserts it still arrives that way rather than trusting the file.
 */
describe("note surface colours", () => {
  it("should paint every muted glyph in a text tone", () => {
    expect(TEXT_TONES).toContain(typesetRole("muted"));
  });

  it("should paint every rule in the border tone", () => {
    expect(typesetRole("rule")).toBe("border");
  });

  it("should paint every marker in the muted role", () => {
    expect(markerRoles).not.toStrictEqual([]);
    expect([...new Set(markerRoles)]).toStrictEqual(["muted"]);
  });

  it("should pin the inline-code chip rather than let it inherit a muted tone", () => {
    expect(
      firstMatch(INLINE_CODE_COLOUR, source, "the inline-code colour")
    ).toBe("foreground");
  });
});

const blockOf = (css: string, selector: string) => {
  const at = css.indexOf(`${selector} {`);

  if (at === -1) {
    throw new Error(`${selector} is missing from src/styles.css`);
  }

  return css.slice(at, css.indexOf("}", at));
};

const notePreset = blockOf(source, ".typeset-note");

/**
 * The three controls plus the three faces are the whole tuning surface, so a
 * dropped line falls back to a Typeset default in silence: `--typeset-size`
 * would follow the container instead of the base size, and
 * `--typeset-font-heading` would resolve `var(--font-heading)`, which this app
 * does not define, making the `font-family` declaration invalid (`D40`).
 */
const TYPESET_CONTROLS = [
  "flow",
  "font-body",
  "font-heading",
  "font-mono",
  "leading",
  "size",
];

describe("the note preset", () => {
  it.each(TYPESET_CONTROLS)("should set --typeset-%s", (control) => {
    expect(notePreset).toContain(`--typeset-${control}:`);
  });

  it("should keep the optical sizing Literata's opsz axis asks for", () => {
    expect(notePreset).toContain("font-optical-sizing: auto");
  });
});

/**
 * `D39` logged the row's pull-back drifting out of step with the checkbox and
 * the flex gap as unenforced, and `D40` moved all three onto `em` so the ladder
 * survives the size Typeset uses below 768px. Both are readable from the
 * stylesheet, so neither has to stay unenforced: the pull-back has to cancel
 * exactly the box and the gap, or the marker column moves with nothing failing.
 */
const CHECKBOX_WIDTH = /> label > input \{[^}]*?width:\s*([\d.]+)em/;

const TASK_ROW_GAP = /taskList"\] > li \{[^}]*?gap:\s*([\d.]+)em/;

const TASK_LIST_PADDING =
  /taskList"\] \{[^}]*?padding-inline-start:\s*([\d.]+)em/;

describe("task list ladder", () => {
  it("should cancel exactly the checkbox and the gap beside it", () => {
    const box = firstMatch(CHECKBOX_WIDTH, source, "the checkbox width");
    const gap = firstMatch(TASK_ROW_GAP, source, "the task row gap");

    expect(source).toContain(
      `margin-inline-start: calc(-${box}em - ${gap}em);`
    );
  });

  it("should pad a task list like the lists it shares a ladder with", () => {
    expect(typeset).toContain("padding-inline-start: 1.5em;");
    expect(firstMatch(TASK_LIST_PADDING, source, "the task list padding")).toBe(
      "1.5"
    );
  });
});

const rustBackground = (rustSource: string, name: string) => {
  const pattern = new RegExp(
    String.raw`${name}: Color = Color\(\s*0x([\da-f]{2}),\s*0x([\da-f]{2}),\s*0x([\da-f]{2})`
  );
  const found = pattern.exec(rustSource);

  // biome-ignore lint/suspicious/noUnnecessaryConditions: RegExp.exec returns RegExpExecArray | null
  if (found === null) {
    throw new Error(`could not read ${name} from src-tauri/src/lib.rs`);
  }

  return `#${found.slice(1, 4).join("")}`;
};

const BACKGROUND = /background-color:\s*(#[\da-f]{6})\b/;

const TAURI_BACKGROUND = /"backgroundColor":\s*"(#[\da-f]{6})"/;

/** Attribute order is the formatter's business, so the tag is found by name. */
const COLOR_SCHEME_META =
  /<meta(?=[^>]*name="color-scheme")[^>]*content="([^"]+)"/;

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
        "the dark background in index.html"
      )
    ).toBe(tokenValue("dark", darkTokens, "background"));
  });

  it("should paint the light canvas from index.html before styles.css loads", () => {
    expect(
      firstMatch(
        BACKGROUND,
        html.slice(htmlMarkerAt),
        "the light background in index.html"
      )
    ).toBe(tokenValue("light", lightTokens, "background"));
  });

  it("should declare a color-scheme so the canvas is never painted white", () => {
    expect(
      firstMatch(COLOR_SCHEME_META, html, "the color-scheme meta in index.html")
    ).toBe("dark light");
    expect(source).toContain("color-scheme: dark light;");
  });

  it("should give the tauri window the dark background at creation", () => {
    expect(
      firstMatch(
        TAURI_BACKGROUND,
        tauriConfig,
        "backgroundColor in tauri.conf.json"
      )
    ).toBe(tokenValue("dark", darkTokens, "background"));
  });

  it("should carry both scheme backgrounds into the rust window layer", () => {
    expect(rustBackground(rust, "BG_DARK")).toBe(
      tokenValue("dark", darkTokens, "background")
    );
    expect(rustBackground(rust, "BG_LIGHT")).toBe(
      tokenValue("light", lightTokens, "background")
    );
  });
});

/** The selector list that opts elements out of the titlebar's drag region. */
const DRAG_REGION_OPT_OUT =
  /((?:\.titlebar-drag-region[^,{]*,\s*)+\.titlebar-drag-region[^,{]*)\{\s*-webkit-app-region:\s*no-drag/;

/** The first `cn()` class list in a component, which is its root element's. */
const FIRST_CLASS_LIST = /className=\{cn\(\s*"([^"]+)"/;

const WHITESPACE = /\s+/;

const saveIndicator = projectFile(
  "src",
  "components",
  "notes",
  "save-indicator.tsx"
);

/**
 * The titlebar is a drag region, so macOS swallows the pointer inside it unless
 * an element opts out. `D38` moved the save glyph in there and the tooltip stops
 * opening the moment the opt-out is dropped, which nothing else catches.
 */
describe("titlebar drag region", () => {
  it("should exempt the no-drag class alongside buttons and inputs", () => {
    const selectors = firstMatch(
      DRAG_REGION_OPT_OUT,
      source,
      "the drag-region opt-out rule in styles.css"
    );

    expect(selectors).toContain("button");
    expect(selectors).toContain("input");
    expect(selectors).toContain(".no-drag");
  });

  it("should give the save indicator's span trigger the opt-out", () => {
    const classes = firstMatch(
      FIRST_CLASS_LIST,
      saveIndicator,
      "the trigger class list in save-indicator.tsx"
    );

    expect(classes.split(WHITESPACE)).toContain("no-drag");
  });
});
