import { render, screen } from "@testing-library/react";

import { NoteContent } from "./note-content";

describe("<NoteContent />", () => {
  it("should render content without highlights if query is empty", () => {
    render(<NoteContent content="Hello world" query="" />);

    expect(screen.getByText("Hello world")).toBeInTheDocument();
    expect(screen.queryByRole("mark")).not.toBeInTheDocument();
  });

  it("should highlight matching parts when query matches content", () => {
    render(<NoteContent content="Hello world" query="hello" />);

    const highlighted = screen.getByText("Hello");

    expect(highlighted.tagName.toLowerCase()).toBe("mark");

    expect(
      screen.getByText((content) => {
        return content.includes("world");
      }),
    ).toBeInTheDocument();
  });

  it("should handle case-insensitive matching", () => {
    render(<NoteContent content="hello world" query="HELLO" />);

    const highlighted = screen.getByText("hello");

    expect(highlighted.tagName.toLowerCase()).toBe("mark");
  });

  it("should not highlight anything if query is not found", () => {
    render(<NoteContent content="Hello world" query="notfound" />);

    expect(screen.getByText("Hello world")).toBeInTheDocument();
    expect(screen.queryByRole("mark")).not.toBeInTheDocument();
  });

  it("should highlight multiple matches if they exist", () => {
    render(<NoteContent content="hello world hello" query="hello" />);

    const marks = screen.getAllByRole("mark");

    expect(marks).toHaveLength(2);
    expect(marks[0]).toHaveTextContent("hello");
    expect(marks[1]).toHaveTextContent("hello");
  });
});
