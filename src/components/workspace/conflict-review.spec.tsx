import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ConflictReview } from "./conflict-review";

describe("ConflictReview", () => {
  it("should offer to apply the combined text once nothing overlaps", async () => {
    const user = userEvent.setup();
    const onBack = vi.fn();
    const onResolve = vi.fn();
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
    expect(screen.getByText("every place has a result")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "resolve" }));
    expect(onResolve).toHaveBeenCalledWith("# Chores\n\nbody, mine");
  });
});
