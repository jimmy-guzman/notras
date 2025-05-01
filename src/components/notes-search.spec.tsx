import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { vi } from "vitest";

import { NotesSearchInput } from "@/components/notes-search";
import { KIND_LABELS, KIND_VALUES } from "@/lib/kind";

const replace = vi.fn();
const mockSearchParams = new URLSearchParams();

vi.mock("next/navigation", async () => {
  const actual = await vi.importActual("next/navigation");

  return {
    ...actual,
    // eslint-disable-next-line @eslint-react/hooks-extra/no-unnecessary-use-prefix -- this is okay
    useRouter: () => {
      return { replace };
    },
    // eslint-disable-next-line @eslint-react/hooks-extra/no-unnecessary-use-prefix -- this is okay
    useSearchParams: () => {
      return mockSearchParams;
    },
  };
});

describe("<NotesSearchInput />", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSearchParams.set("kind", "");
    mockSearchParams.set("q", "");
  });

  it("should update the 'q' query param on input change", async () => {
    render(<NotesSearchInput />);

    const input = screen.getByPlaceholderText(/search your thoughts/i);

    await userEvent.clear(input);
    await userEvent.type(input, "new query");

    expect(replace).toHaveBeenLastCalledWith("?kind=&q=new+query");
  });

  it("should update the 'kind' query param on select change", async () => {
    globalThis.HTMLElement.prototype.hasPointerCapture = vi.fn();

    render(<NotesSearchInput />);

    const trigger = screen.getByRole("combobox", {
      name: /filter by kind/i,
    });

    await userEvent.click(trigger);

    const secondKind = KIND_VALUES[1];

    await userEvent.click(
      screen.getByRole("option", { name: KIND_LABELS[secondKind] }),
    );

    expect(replace).toHaveBeenCalledWith(`?kind=${secondKind}&q=`);
  });

  it("should clear 'kind' query param if 'All kinds' is selected", async () => {
    globalThis.HTMLElement.prototype.hasPointerCapture = vi.fn();

    render(<NotesSearchInput />);

    const trigger = screen.getByRole("combobox");

    await userEvent.click(trigger);
    await userEvent.click(screen.getByRole("option", { name: /all kinds/i }));

    expect(replace).toHaveBeenCalledWith("?q=");
  });
});
