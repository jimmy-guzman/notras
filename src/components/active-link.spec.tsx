import { render, screen } from "@testing-library/react";

import { ActiveLink } from "./active-link";

vi.mock("next/navigation", async (importOriginal) => {
  // eslint-disable-next-line @typescript-eslint/consistent-type-imports -- typeof is needed
  const mod = await importOriginal<typeof import("next/navigation")>();

  return {
    ...mod,
    usePathname: vi.fn().mockReturnValue("/settings"),
  };
});

describe("ActiveLink", () => {
  it("should not have active class when link is not active", () => {
    render(<ActiveLink href="/">home</ActiveLink>);

    expect(screen.getByRole("link", { name: "home" })).not.toHaveClass(
      "dsy-active",
    );
  });

  it("should have active class when link is active", () => {
    render(<ActiveLink href="/settings">settings</ActiveLink>);

    expect(screen.getByRole("link", { name: "settings" })).toHaveClass(
      "dsy-active",
    );
  });
});
