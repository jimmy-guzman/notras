import { render, screen } from "@/testing/utils";

import { NotesFilters } from "./notes-filters";

describe("NotesFilters", () => {
  it("should render a time filter with 'all time' selected by default", () => {
    render(<NotesFilters />);

    expect(screen.getByText("all time")).toBeInTheDocument();
  });

  it("should render a sort filter with 'newest first' selected by default", () => {
    render(<NotesFilters />);

    expect(screen.getByText("newest first")).toBeInTheDocument();
  });

  it("should render two select triggers", () => {
    render(<NotesFilters />);

    const triggers = screen.getAllByRole("combobox");

    expect(triggers).toHaveLength(2);
  });
});
