import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, onTestFinished, vi } from "vitest";

import { LinkEditor } from "./link-editor";

describe("link editor", () => {
  it("should not submit on the Enter that confirms an IME candidate after compositionend on WebKit", async () => {
    vi.spyOn(navigator, "vendor", "get").mockReturnValue(
      "Apple Computer, Inc."
    );
    onTestFinished(() => {
      vi.restoreAllMocks();
    });
    const user = userEvent.setup();
    const submitted: [string, string | undefined][] = [];

    render(
      <LinkEditor
        onCancel={() => {}}
        onRemove={() => {}}
        onSubmit={(url, text) => {
          submitted.push([url, text]);
        }}
        state={{ id: 1, kind: "link", left: 0, text: "", top: 0, url: "" }}
      />
    );
    const text = screen.getByRole("textbox", { name: "link text" });

    fireEvent.compositionStart(text);
    fireEvent.compositionEnd(text);
    fireEvent.keyDown(text, { key: "Enter" });

    expect(submitted).toStrictEqual([]);

    await user.keyboard("{Enter}");

    expect(submitted).toStrictEqual([["", ""]]);
  });

  it("should not submit on the confirming Enter marked composing outside WebKit", async () => {
    vi.spyOn(navigator, "vendor", "get").mockReturnValue("Google Inc.");
    onTestFinished(() => {
      vi.restoreAllMocks();
    });
    const user = userEvent.setup();
    const submitted: [string, string | undefined][] = [];

    render(
      <LinkEditor
        onCancel={() => {}}
        onRemove={() => {}}
        onSubmit={(url, text) => {
          submitted.push([url, text]);
        }}
        state={{ id: 1, kind: "link", left: 0, text: "", top: 0, url: "" }}
      />
    );
    const text = screen.getByRole("textbox", { name: "link text" });

    fireEvent.compositionStart(text);
    fireEvent.keyDown(text, { isComposing: true, key: "Enter" });
    fireEvent.compositionEnd(text);

    expect(submitted).toStrictEqual([]);

    await user.keyboard("{Enter}");

    expect(submitted).toStrictEqual([["", ""]]);
  });
});
