beforeEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

async function setupGetBuildInfo() {
  const { getBuildInfo } = await import("./build-info");

  return getBuildInfo;
}

describe("getBuildInfo", () => {
  it("should return all fields when both env vars are set", async () => {
    vi.stubEnv("NEXT_PUBLIC_BUILD_TIME", "2025-06-15T12:00:00.000Z");
    vi.stubEnv(
      "NEXT_PUBLIC_COMMIT_SHA",
      "abc1234def5678901234567890abcdef12345678",
    );
    const getBuildInfo = await setupGetBuildInfo();

    const result = getBuildInfo();

    expect(result).toStrictEqual({
      buildTime: "jun 15, 2025",
      commitUrl:
        "https://github.com/jimmy-guzman/notras/commit/abc1234def5678901234567890abcdef12345678",
      shortSha: "abc1234",
    });
  });

  it("should return undefined buildTime when NEXT_PUBLIC_BUILD_TIME is not set", async () => {
    vi.stubEnv(
      "NEXT_PUBLIC_COMMIT_SHA",
      "abc1234def5678901234567890abcdef12345678",
    );
    const getBuildInfo = await setupGetBuildInfo();

    const result = getBuildInfo();

    expect(result.buildTime).toBeUndefined();
    expect(result.shortSha).toBe("abc1234");
  });

  it("should return undefined shortSha and commitUrl when NEXT_PUBLIC_COMMIT_SHA is not set", async () => {
    vi.stubEnv("NEXT_PUBLIC_BUILD_TIME", "2025-06-15T12:00:00.000Z");
    const getBuildInfo = await setupGetBuildInfo();

    const result = getBuildInfo();

    expect(result.buildTime).toBe("jun 15, 2025");
    expect(result.shortSha).toBeUndefined();
    expect(result.commitUrl).toBeUndefined();
  });

  it("should return all undefined when no env vars are set", async () => {
    const getBuildInfo = await setupGetBuildInfo();

    const result = getBuildInfo();

    expect(result).toStrictEqual({
      buildTime: undefined,
      commitUrl: undefined,
      shortSha: undefined,
    });
  });

  it("should truncate commit SHA to 7 characters", async () => {
    vi.stubEnv(
      "NEXT_PUBLIC_COMMIT_SHA",
      "abcdefghijklmnopqrstuvwxyz1234567890abcd",
    );
    const getBuildInfo = await setupGetBuildInfo();

    const result = getBuildInfo();

    expect(result.shortSha).toBe("abcdefg");
  });

  it("should use the full commit SHA in the commit URL", async () => {
    vi.stubEnv(
      "NEXT_PUBLIC_COMMIT_SHA",
      "abc1234def5678901234567890abcdef12345678",
    );
    const getBuildInfo = await setupGetBuildInfo();

    const result = getBuildInfo();

    expect(result.commitUrl).toBe(
      "https://github.com/jimmy-guzman/notras/commit/abc1234def5678901234567890abcdef12345678",
    );
  });
});
