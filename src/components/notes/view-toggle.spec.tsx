import { render, screen } from "@/testing/utils";

import { ViewToggle } from "./view-toggle";

describe("ViewToggle", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("should render grid and list view buttons", () => {
    render(<ViewToggle />);

    expect(
      screen.getByRole("button", { name: "grid view" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "list view" }),
    ).toBeInTheDocument();
  });

  it("should mark grid view as pressed by default", () => {
    render(<ViewToggle />);

    expect(screen.getByRole("button", { name: "grid view" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByRole("button", { name: "list view" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
  });

  it("should mark list view as pressed when view is list", () => {
    localStorage.setItem("notras:notes-view", "list");

    render(<ViewToggle />);

    expect(screen.getByRole("button", { name: "grid view" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
    expect(screen.getByRole("button", { name: "list view" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  it("should render buttons within a group", () => {
    render(<ViewToggle />);

    expect(screen.getByRole("group")).toBeInTheDocument();
  });
});
