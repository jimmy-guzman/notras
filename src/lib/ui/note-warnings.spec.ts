import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { expect, it } from "vitest";
import { Toaster } from "@/components/ui/toast";
import { reportNoteWarnings } from "@/lib/ui/note-warnings";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

it("should show committed-write warnings without a workspace or index query", async () => {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  try {
    await act(() => {
      root.render(createElement(Toaster));
    });
    await act(() => {
      reportNoteWarnings([
        {
          kind: "index",
          message: "the index is read-only",
          path: "inbox/jot.md",
        },
        { kind: "cleanup", message: "permission denied", path: "old.md" },
      ]);
    });
    expect(document.body.textContent).toContain("could not update search");
    expect(document.body.textContent).toContain(
      "inbox/jot.md: the index is read-only"
    );
    expect(document.body.textContent).toContain(
      "could not remove the original note"
    );
    expect(document.body.textContent).toContain("old.md: permission denied");
  } finally {
    await act(() => {
      root.unmount();
    });
    container.remove();
  }
});
