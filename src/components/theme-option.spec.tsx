import { render, screen } from "@testing-library/react";

import { ThemeOption } from "./theme-option";

describe("ThemeOption", () => {
  it("should NOT be checked when user's theme is NOT provided", () => {
    render(<ThemeOption theme="night" />);

    expect(screen.getByRole("radio")).not.toBeChecked();
  });

  it("should be checked when user's theme equals theme", () => {
    render(<ThemeOption theme="night" userTheme="night" />);

    expect(screen.getByRole("radio")).toBeChecked();
  });

  it("should NOT be checked when user's theme does NOT equal theme", () => {
    render(<ThemeOption theme="night" userTheme="aqua" />);

    expect(screen.getByRole("radio")).not.toBeChecked();
  });
});
