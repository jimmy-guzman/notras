import { render, screen } from "@testing-library/react";

import { NoteContent } from "./note-content";

vi.mock("@/actions/update-note", () => {
  return { updateNote: vi.fn() };
});

vi.mock("next/navigation", () => {
  return { useRouter: vi.fn() };
});

describe("<NoteContent />", () => {
  const defaultProps = {
    id: "123",
    isEditing: false,
    onCancelEdit: vi.fn(),
  };

  it("should render content without highlights if query is empty", () => {
    render(<NoteContent content="Hello world" query="" {...defaultProps} />);

    expect(screen.getByText("Hello world")).toBeInTheDocument();
    expect(screen.queryByRole("mark")).not.toBeInTheDocument();
  });

  it("should highlight matching parts when query matches content", () => {
    render(
      <NoteContent content="Hello world" query="hello" {...defaultProps} />,
    );

    const highlighted = screen.getByText("Hello");

    expect(highlighted.tagName.toLowerCase()).toBe("mark");

    expect(
      screen.getByText((content) => {
        return content.includes("world");
      }),
    ).toBeInTheDocument();
  });

  it("should handle case-insensitive matching", () => {
    render(
      <NoteContent content="hello world" query="HELLO" {...defaultProps} />,
    );

    const highlighted = screen.getByText("hello");

    expect(highlighted.tagName.toLowerCase()).toBe("mark");
  });

  it("should not highlight anything if query is not found", () => {
    render(
      <NoteContent content="Hello world" query="notfound" {...defaultProps} />,
    );

    expect(screen.getByText("Hello world")).toBeInTheDocument();
    expect(screen.queryByRole("mark")).not.toBeInTheDocument();
  });

  it("should highlight multiple matches if they exist", () => {
    render(
      <NoteContent
        content="hello world hello"
        query="hello"
        {...defaultProps}
      />,
    );

    const marks = screen.getAllByRole("mark");

    expect(marks).toHaveLength(2);
    expect(marks[0]).toHaveTextContent("hello");
    expect(marks[1]).toHaveTextContent("hello");
  });

  it("should render a textarea when editing", () => {
    render(
      <NoteContent content="Edit me" {...defaultProps} isEditing query="" />,
    );

    expect(screen.getByRole("textbox")).toBeInTheDocument();
  });
});
