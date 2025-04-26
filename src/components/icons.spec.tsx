import { render, screen } from "@testing-library/react";

import { Icons } from "./icons";

describe("Icons", () => {
  it("should render daisyUI icon", () => {
    render(<Icons.daisyUI />);

    expect(screen.getByTitle("daisyUI")).toBeInTheDocument();
  });
});
