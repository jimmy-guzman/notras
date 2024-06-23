import { render, screen } from "@testing-library/react";

import { ThemeOption } from "./theme-option";

describe("ThemeOption", () => {
  it("should not be checked when user's theme is not provided", () => {
    render(<ThemeOption currentTheme="night" />);

    expect(screen.getByRole("radio")).not.toBeChecked();
  });

  it("should be checked when user's theme equals current theme", () => {
    render(<ThemeOption currentTheme="night" userTheme="night" />);

    expect(screen.getByRole("radio")).toBeChecked();
  });

  it("should not be checked when user's theme does not equal current theme", () => {
    render(<ThemeOption currentTheme="night" userTheme="aqua" />);

    expect(screen.getByRole("radio")).not.toBeChecked();
  });
});
