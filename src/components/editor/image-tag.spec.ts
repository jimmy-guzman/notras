import { describe, expect, it } from "vitest";

import cases from "../../../fixtures/image-tags.json";
import { imageTag, imageTagAttrs } from "./image-tag";

describe(imageTagAttrs, () => {
  it.each(cases)("should read $name as image: $image", ({ html, image }) => {
    expect(imageTagAttrs(html) !== null).toBe(image);
  });

  it("should read the attributes with entities decoded and width as a number", () => {
    expect(
      imageTagAttrs(
        '<img src="a%20b.png" alt="a &quot;b&quot; &amp; c" title="t" width="300">'
      )
    ).toStrictEqual({
      alt: 'a "b" & c',
      src: "a%20b.png",
      title: "t",
      width: 300,
    });
  });

  it("should leave an absent alt, title and width at their empty values", () => {
    expect(imageTagAttrs('<img src="a.png">')).toStrictEqual({
      alt: "",
      src: "a.png",
      title: null,
      width: null,
    });
  });
});

describe(imageTag, () => {
  it("should write a tag that reads back to the same image", () => {
    const image = { alt: 'a "b" & <c>', src: "a&b.png", title: "t", width: 42 };
    const html = imageTag(image);

    expect(html).toBe(
      '<img src="a&amp;b.png" alt="a &quot;b&quot; &amp; <c>" title="t" width="42">'
    );
    expect(imageTagAttrs(html)).toStrictEqual(image);
  });

  it("should leave out a missing title and width", () => {
    expect(imageTag({ alt: "", src: "a.png", title: null, width: null })).toBe(
      '<img src="a.png" alt="">'
    );
  });
});
