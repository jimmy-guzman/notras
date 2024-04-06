import { render, screen } from "@testing-library/react";

import { Icons } from "./icons";

describe("Icons", () => {
  it("daisyUI", () => {
    render(<Icons.daisyUI />);

    expect(screen.getByTitle("daisyUI")).toBeInTheDocument();
  });
});
