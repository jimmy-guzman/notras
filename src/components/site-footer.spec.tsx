import { render, screen } from "@/testing/utils";

vi.mock("react-hotkeys-hook", () => ({ useHotkeys: vi.fn() }));

beforeEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

async function setupSiteFooter() {
  const { SiteFooter } = await import("./site-footer");

  return SiteFooter;
}

describe("SiteFooter", () => {
  it("should render the tagline", async () => {
    const SiteFooter = await setupSiteFooter();

    render(<SiteFooter />);

    expect(screen.getByText("just write, otra vez.")).toBeInTheDocument();
  });

  it("should render the keyboard shortcuts button", async () => {
    const SiteFooter = await setupSiteFooter();

    render(<SiteFooter />);

    expect(
      screen.getByRole("button", { name: "keyboard shortcuts" }),
    ).toBeInTheDocument();
  });

  it("should render the api docs link", async () => {
    const SiteFooter = await setupSiteFooter();

    render(<SiteFooter />);

    const link = screen.getByRole("link", { name: "api docs" });

    expect(link).toHaveAttribute("href", "/api/docs");
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
  });

  it("should render the copyright with the current year", async () => {
    const SiteFooter = await setupSiteFooter();

    render(<SiteFooter />);

    expect(
      screen.getByText(new Date().getFullYear().toString(), { exact: false }),
    ).toBeInTheDocument();
  });

  it("should render the author link", async () => {
    const SiteFooter = await setupSiteFooter();

    render(<SiteFooter />);

    const link = screen.getByRole("link", { name: "jimmy guzman moreno" });

    expect(link).toHaveAttribute("href", "https://www.jimmy.codes/");
    expect(link).toHaveAttribute("target", "_blank");
  });

  it("should render build time when available", async () => {
    vi.stubEnv("NEXT_PUBLIC_BUILD_TIME", "2025-06-15T12:00:00.000Z");
    const SiteFooter = await setupSiteFooter();

    render(<SiteFooter />);

    expect(screen.getByText("built jun 15, 2025")).toBeInTheDocument();
  });

  it("should render commit SHA as a link when available", async () => {
    vi.stubEnv(
      "NEXT_PUBLIC_COMMIT_SHA",
      "abc1234def5678901234567890abcdef12345678",
    );
    const SiteFooter = await setupSiteFooter();

    render(<SiteFooter />);

    const link = screen.getByRole("link", { name: "abc1234" });

    expect(link).toHaveAttribute(
      "href",
      "https://github.com/jimmy-guzman/notras/commit/abc1234def5678901234567890abcdef12345678",
    );
    expect(link).toHaveAttribute("target", "_blank");
  });

  it("should render both build time and commit SHA with separators", async () => {
    vi.stubEnv("NEXT_PUBLIC_BUILD_TIME", "2025-06-15T12:00:00.000Z");
    vi.stubEnv(
      "NEXT_PUBLIC_COMMIT_SHA",
      "abc1234def5678901234567890abcdef12345678",
    );
    const SiteFooter = await setupSiteFooter();

    render(<SiteFooter />);

    expect(screen.getByText("built jun 15, 2025")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "abc1234" })).toBeInTheDocument();
    expect(screen.getAllByText("·")).toHaveLength(2);
  });

  it("should not render separators when no build data is available", async () => {
    const SiteFooter = await setupSiteFooter();

    render(<SiteFooter />);

    expect(screen.queryByText(/built/)).not.toBeInTheDocument();
    expect(screen.queryByText("·")).not.toBeInTheDocument();
  });

  it("should render one separator when only build time is available", async () => {
    vi.stubEnv("NEXT_PUBLIC_BUILD_TIME", "2025-06-15T12:00:00.000Z");
    const SiteFooter = await setupSiteFooter();

    render(<SiteFooter />);

    expect(screen.getByText("built jun 15, 2025")).toBeInTheDocument();
    expect(screen.getAllByText("·")).toHaveLength(1);
  });

  it("should render one separator when only commit SHA is available", async () => {
    vi.stubEnv(
      "NEXT_PUBLIC_COMMIT_SHA",
      "abc1234def5678901234567890abcdef12345678",
    );
    const SiteFooter = await setupSiteFooter();

    render(<SiteFooter />);

    expect(screen.getByRole("link", { name: "abc1234" })).toBeInTheDocument();
    expect(screen.getAllByText("·")).toHaveLength(1);
  });
});
