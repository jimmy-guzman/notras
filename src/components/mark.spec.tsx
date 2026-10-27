import { readFileSync } from "node:fs";
import path from "node:path";

import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { Mark } from "@/components/mark";

const master = readFileSync(
  path.join(process.cwd(), "assets", "icon.svg"),
  "utf-8"
);

/** The script resolves the master's size tokens; its first tier is the large one. */
const generator = readFileSync(
  path.join(process.cwd(), "scripts", "icons.sh"),
  "utf-8"
);

const attribute = (pattern: RegExp, what: string, source = master) => {
  const value = pattern.exec(source)?.groups?.value;

  if (value === undefined) {
    throw new Error(`could not read ${what}`);
  }

  return value;
};

const tier = (token: string) =>
  attribute(
    new RegExp(`local viewbox=[^\\n]*\\b${token}=(?<value>[\\d.]+)`, "u"),
    `the large tier's ${token} from scripts/icons.sh`,
    generator
  );

describe(Mark, () => {
  it("should draw the eyes and the lines from the icon master, with no tile", () => {
    const { container } = render(<Mark size={112} />);

    expect(container.querySelectorAll("path")).toHaveLength(1);
    expect(container.querySelector("path[stroke]")).toHaveAttribute(
      "d",
      attribute(
        /display="var\(--lines3\)" d="(?<value>[^"]+)"/u,
        "the three lines"
      )
    );
    expect(
      [...container.querySelectorAll("circle")].map((eye) =>
        eye.getAttribute("cx")
      )
    ).toStrictEqual(
      [...master.matchAll(/<circle cx="(?<value>\d+)"/gu)].map(
        (eye) => eye.groups?.value
      )
    );
  });

  it("should size the eyes and the lines to the generator's large tier", () => {
    const { container } = render(<Mark size={112} />);

    for (const eye of container.querySelectorAll("circle")) {
      expect(eye).toHaveAttribute("cy", tier("eye_y"));
      expect(eye).toHaveAttribute("r", tier("eye"));
    }

    expect(container.querySelector("path[stroke]")).toHaveAttribute(
      "stroke-width",
      tier("stroke")
    );
  });

  it("should close the eyes to dashes in the lines' stroke when meh", () => {
    const { container } = render(<Mark expression="meh" size={32} />);

    expect(container.querySelector("circle")).toBeNull();

    const [eyes, lines] = container.querySelectorAll("path[stroke]");

    expect(eyes).toHaveAttribute("d", "M36 38H48M88 38H100");
    expect(eyes).toHaveAttribute("stroke-width", tier("stroke"));
    expect(lines).toHaveAttribute("stroke-width", tier("stroke"));
  });

  it("should blink only when asked", () => {
    const still = render(<Mark size={32} />);

    expect(still.container.querySelector(".mark-blinking")).toBeNull();

    const blinking = render(<Mark blinking size={112} />);

    expect(
      blinking.container.querySelectorAll(".mark-blinking circle")
    ).toHaveLength(2);
  });
});
