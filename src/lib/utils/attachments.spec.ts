import { describe, expect, it } from "vitest";

import imageNames from "../../../fixtures/image-names.json";
import {
  attachmentDestination,
  attachmentLink,
  decodeAttachmentPath,
  isImageName,
} from "./attachments";

describe(attachmentLink, () => {
  it("should embed an image whose name carries spaces", () => {
    expect(
      attachmentLink(
        "attachments/Screenshot 2026-08-26 at 6.25.40 AM.png",
        "note.md"
      )
    ).toBe(
      "![Screenshot 2026-08-26 at 6.25.40 AM.png](attachments/Screenshot%202026-08-26%20at%206.25.40%20AM.png)"
    );
  });

  it("should link a file that is not an image", () => {
    expect(attachmentLink("attachments/my notes.pdf", "note.md")).toBe(
      "[my notes.pdf](attachments/my%20notes.pdf)"
    );
  });

  it("should escape a bracket that would end the label early", () => {
    expect(attachmentLink("attachments/notes ].png", "note.md")).toBe(
      "![notes \\].png](attachments/notes%20%5D.png)"
    );
  });

  it("should pad a backslash run that would eat the escaped bracket", () => {
    expect(attachmentLink("attachments/back\\].png", "note.md")).toBe(
      "![back\\\\\\].png](attachments/back%5C%5D.png)"
    );
  });

  it("should leave an even backslash run before a bracket as it is", () => {
    expect(attachmentLink("attachments/back\\\\].png", "note.md")).toBe(
      "![back\\\\\\].png](attachments/back%5C%5C%5D.png)"
    );
  });

  it("should leave a backslash in the label alone", () => {
    expect(attachmentLink("attachments/back\\slash.png", "note.md")).toBe(
      "![back\\slash.png](attachments/back%5Cslash.png)"
    );
  });

  it("should climb out of the note's folder to reach attachments", () => {
    expect(attachmentLink("attachments/my notes.pdf", "projects/a.md")).toBe(
      "[my notes.pdf](../attachments/my%20notes.pdf)"
    );
    expect(attachmentLink("attachments/x.png", "projects/q3/a.md")).toBe(
      "![x.png](../../attachments/x.png)"
    );
  });

  it("should encode a name carrying markdown punctuation", () => {
    expect(attachmentLink("attachments/draft (1) #2.png", "note.md")).toBe(
      "![draft (1) #2.png](attachments/draft%20(1)%20%232.png)"
    );
  });

  it.each(["a(b.png", "a)b.png", "a)b(c.png"])(
    "should encode the parens in %s, which would not balance",
    (name) => {
      expect(attachmentDestination(name, "note.md")).toMatch(/%28|%29/u);
      expect(attachmentDestination(name, "note.md")).not.toMatch(/[()]/u);
    }
  );

  it.each(["my%20photo.png", "50%25.png", "a(b.png", "a)b.png"])(
    "should write %s so it decodes back to the name on disk",
    (name) => {
      expect(
        decodeAttachmentPath(attachmentDestination(`img/${name}`, "note.md"))
      ).toBe(`img/${name}`);
    }
  );
});

describe(isImageName, () => {
  it.each(imageNames)(
    "should read $name as image: $image",
    ({ image, name }) => {
      expect(isImageName(name)).toBe(image);
    }
  );
});

describe("attachment paths", () => {
  it("should write a pasted image relative to the note", () => {
    expect(attachmentDestination("attachments/pasted-1.png", "note.md")).toBe(
      "attachments/pasted-1.png"
    );
    expect(
      attachmentDestination("attachments/pasted-1.png", "projects/a.md")
    ).toBe("../attachments/pasted-1.png");
  });

  it("should leave the path separators readable", () => {
    expect(attachmentDestination("attachments/my shot.png", "note.md")).toBe(
      "attachments/my%20shot.png"
    );
  });

  it("should decode back to the name on disk", () => {
    const path = "attachments/Screenshot 2026-08-26 at 6.25.40 AM.png";

    expect(decodeAttachmentPath(attachmentDestination(path, "note.md"))).toBe(
      path
    );
  });

  it("should read a hand-written path with a bare percent as itself", () => {
    expect(decodeAttachmentPath("attachments/100% done.png")).toBe(
      "attachments/100% done.png"
    );
  });

  it("should decode around a bare percent rather than give up on the name", () => {
    expect(decodeAttachmentPath("attachments/100% a%20b.png")).toBe(
      "attachments/100% a b.png"
    );
  });
});
