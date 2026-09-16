import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { ConflictReview } from "./conflict-review";

describe(ConflictReview, () => {
  it("should offer to apply the combined text once nothing overlaps", async () => {
    const user = userEvent.setup();
    const onBack = vi.fn<() => void>();
    const onResolve = vi.fn<(content: string) => void>();
    render(
      <ConflictReview
        base={"# Errands\n\nbody"}
        changedAgain={false}
        onBack={onBack}
        onResolve={onResolve}
        open
        ours={"# Errands\n\nbody, mine"}
        theirs={"# Chores\n\nbody"}
      />
    );
    expect(
      screen.getByText("your edits no longer overlap the change on disk")
    ).toBeInTheDocument();
    expect(screen.getByText("Every place has a result")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "resolve" }));
    expect(onResolve).toHaveBeenCalledWith("# Chores\n\nbody, mine");
  });

  it("should keep a blank line when the used side is one blank line", async () => {
    const user = userEvent.setup();
    const onBack = vi.fn<() => void>();
    const onResolve = vi.fn<(content: string) => void>();
    render(
      <ConflictReview
        base={"a\nbase\nz"}
        changedAgain={false}
        onBack={onBack}
        onResolve={onResolve}
        open
        ours={"a\nmine\nz"}
        theirs={"a\n\nz"}
      />
    );
    await user.click(
      screen.getByRole("button", { name: "use this, the version on disk" })
    );
    expect(screen.getByText("Every place has a result")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "resolve" }));
    expect(onResolve).toHaveBeenCalledWith("a\n\nz");
  });
});
