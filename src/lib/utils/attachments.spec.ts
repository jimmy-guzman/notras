import { describe, expect, it } from "vitest";

import {
  attachmentLink,
  decodeAttachmentPath,
  encodeAttachmentPath,
} from "./attachments";

describe("attachmentLink", () => {
  it("should embed an image whose name carries spaces", () => {
    expect(
      attachmentLink("attachments/Screenshot 2026-08-26 at 6.25.40 AM.png")
    ).toBe(
      "![Screenshot 2026-08-26 at 6.25.40 AM.png](attachments/Screenshot%202026-08-26%20at%206.25.40%20AM.png)"
    );
  });

  it("should link a file that is not an image", () => {
    expect(attachmentLink("attachments/my notes.pdf")).toBe(
      "[my notes.pdf](attachments/my%20notes.pdf)"
    );
  });

  it("should escape a bracket that would end the label early", () => {
    expect(attachmentLink("attachments/notes ].png")).toBe(
      "![notes \\].png](attachments/notes%20%5D.png)"
    );
  });

  it("should leave a backslash in the label alone", () => {
    expect(attachmentLink("attachments/back\\slash.png")).toBe(
      "![back\\slash.png](attachments/back%5Cslash.png)"
    );
  });

  it("should encode a name carrying markdown punctuation", () => {
    expect(attachmentLink("attachments/draft (1) #2.png")).toBe(
      "![draft (1) #2.png](attachments/draft%20(1)%20%232.png)"
    );
  });
});

describe("attachment paths", () => {
  it("should leave the path separators readable", () => {
    expect(encodeAttachmentPath("attachments/my shot.png")).toBe(
      "attachments/my%20shot.png"
    );
  });

  it("should decode back to the name on disk", () => {
    const path = "attachments/Screenshot 2026-08-26 at 6.25.40 AM.png";

    expect(decodeAttachmentPath(encodeAttachmentPath(path))).toBe(path);
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

  it("should encode an already encoded path to itself", () => {
    const encoded = encodeAttachmentPath("attachments/my shot.png");

    expect(encodeAttachmentPath(encoded)).toBe(encoded);
  });
});
