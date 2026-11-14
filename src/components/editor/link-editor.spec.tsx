import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { LinkEditor } from "./link-editor";

describe("link editor", () => {
  it("should not submit on the Enter WebKit sends after compositionend to confirm a candidate", async () => {
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
    fireEvent.keyDown(text, { key: "Enter", keyCode: 229 });

    expect(submitted).toStrictEqual([]);

    await user.keyboard("{Enter}");

    expect(submitted).toStrictEqual([["", ""]]);
  });

  it("should not submit on the confirming Enter Chromium marks as composing", async () => {
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

  it("should close on Escape right after a candidate is picked without a key", () => {
    let cancelled = 0;

    render(
      <LinkEditor
        onCancel={() => {
          cancelled += 1;
        }}
        onRemove={() => {}}
        onSubmit={() => {}}
        state={{ id: 1, kind: "link", left: 0, text: "", top: 0, url: "" }}
      />
    );
    const text = screen.getByRole("textbox", { name: "link text" });

    fireEvent.compositionStart(text);
    fireEvent.compositionEnd(text);
    fireEvent.keyDown(text, { key: "Escape", keyCode: 27 });

    expect(cancelled).toBe(1);
  });
});
