import { render, screen } from "@/testing/utils";

import { NotesFilters } from "./notes-filters";

describe("NotesFilters", () => {
  it("should render a time filter with 'All time' selected by default", () => {
    render(<NotesFilters />);

    expect(screen.getByText("All time")).toBeInTheDocument();
  });

  it("should render a sort filter with 'Newest first' selected by default", () => {
    render(<NotesFilters />);

    expect(screen.getByText("Newest first")).toBeInTheDocument();
  });

  it("should render a link to create a new note", () => {
    render(<NotesFilters />);

    const link = screen.getByRole("link", { name: /new note/i });

    expect(link).toHaveAttribute("href", "/notes/new");
  });

  it("should render two select triggers", () => {
    render(<NotesFilters />);

    const triggers = screen.getAllByRole("combobox");

    expect(triggers).toHaveLength(2);
  });
});
