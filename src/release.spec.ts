import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * Read from disk rather than importing, matching styles.spec.ts: these files
 * live outside `src/` (workflows, the crate, the release config), and none of
 * them are ES modules.
 */
const projectFile = (...segments: string[]) =>
  readFileSync(join(process.cwd(), ...segments), "utf8");

const packageJson = JSON.parse(projectFile("package.json")) as {
  version: string;
};
const tauriConfig = JSON.parse(
  projectFile("src-tauri", "tauri.conf.json")
) as {
  identifier: string;
  productName: string;
  version: string;
};
const releasePleaseConfig = JSON.parse(
  projectFile("release-please-config.json")
) as {
  "bootstrap-sha": string;
  draft: boolean;
  "force-tag-creation": boolean;
  "include-component-in-tag": boolean;
  packages: Record<
    string,
    {
      "bump-minor-pre-major": boolean;
      "bump-patch-for-minor-pre-major": boolean;
      "changelog-sections": { type: string; section: string }[];
      "release-type": string;
    }
  >;
};
const manifest = JSON.parse(
  projectFile(".release-please-manifest.json")
) as Record<string, string>;
const cargoToml = projectFile("src-tauri", "Cargo.toml");
const cargoLock = projectFile("src-tauri", "Cargo.lock");
const ciYaml = projectFile(".github", "workflows", "ci.yml");
const releaseYaml = projectFile(".github", "workflows", "release.yml");
const caskTemplate = projectFile("scripts", "notras.rb.tmpl");
const decisions = projectFile("DECISIONS.md");
const agents = projectFile("AGENTS.md");
const readme = projectFile("README.md");

const SEMVER = /^\d+\.\d+\.\d+$/;

/**
 * `D49`: `package.json` is the only version. `tauri.conf.json` reads it
 * through a path rather than a literal, and both the crate files are frozen
 * at "0.0.0" independently of it.
 */
describe("D49: package.json is the only version", () => {
  it("should hold a semver version", () => {
    expect(packageJson.version).toMatch(SEMVER);
  });

  it("should be the version the release manifest tracks", () => {
    expect(manifest["."]).toBe(packageJson.version);
  });

  it("should be read by tauri.conf.json through a relative path, not a literal", () => {
    expect(tauriConfig.version).toBe("../package.json");
  });

  const cargoTomlVersion = /name = "notras"[\s\S]*?version = "([\d.]+)"/.exec(
    cargoToml
  )?.[1];

  const cargoLockVersion =
    /\[\[package\]\]\nname = "notras"\nversion = "([\d.]+)"/.exec(
      cargoLock
    )?.[1];

  it("should read a version out of Cargo.toml and Cargo.lock", () => {
    expect(cargoTomlVersion).toBeDefined();
    expect(cargoLockVersion).toBeDefined();
  });

  it("should freeze Cargo.toml and Cargo.lock at the same, sentinel version", () => {
    expect(cargoTomlVersion).toBe("0.0.0");
    expect(cargoLockVersion).toBe("0.0.0");
    expect(cargoTomlVersion).toBe(cargoLockVersion);
  });

  // Regression: the frozen crate version and the app version happen to
  // differ today (0.0.0 vs 0.1.0). Nothing keeps them equal, so a future
  // release-please bump must not make them drift back into agreement, and
  // pinning them equal here would fail the moment package.json reaches
  // 0.0.0 again on a hypothetical revert.
  it("should not derive the frozen crate version from package.json", () => {
    expect(cargoToml).toContain('version = "0.0.0"');
    expect(cargoToml).not.toContain(`version = "${packageJson.version}"`);
  });

  it("should document why Cargo.toml is frozen, citing D49", () => {
    expect(cargoToml).toContain("Frozen, and not the app version.");
    expect(cargoToml).toContain("`D49`");
  });
});

describe("release-please-config.json", () => {
  it("should point release-please at a full 40-character bootstrap sha", () => {
    expect(releasePleaseConfig["bootstrap-sha"]).toMatch(/^[\da-f]{40}$/);
  });

  it("should draft releases rather than publishing them immediately", () => {
    expect(releasePleaseConfig.draft).toBe(true);
  });

  it("should force a tag even when the release itself is skipped", () => {
    expect(releasePleaseConfig["force-tag-creation"]).toBe(true);
  });

  it("should tag as vX.Y.Z rather than component@vX.Y.Z for a single package", () => {
    expect(releasePleaseConfig["include-component-in-tag"]).toBe(false);
  });

  const root = releasePleaseConfig.packages["."];

  it("should configure the root package as a node release", () => {
    expect(root).toBeDefined();
    expect(root?.["release-type"]).toBe("node");
  });

  it("should bump the minor (not major) version pre-1.0", () => {
    expect(root?.["bump-minor-pre-major"]).toBe(true);
    expect(root?.["bump-patch-for-minor-pre-major"]).toBe(true);
  });

  it("should surface user-facing sections and hide the internal ones", () => {
    const visible = new Set(
      root?.["changelog-sections"]
        .filter((entry) => !("hidden" in entry) || entry.hidden !== true)
        .map((entry) => entry.type)
    );
    const hidden = new Set(
      root?.["changelog-sections"]
        .filter((entry) => "hidden" in entry && entry.hidden === true)
        .map((entry) => entry.type)
    );

    expect(visible).toEqual(
      new Set(["feat", "fix", "perf", "refactor", "revert"])
    );
    expect(hidden).toEqual(new Set(["docs", "test", "build", "ci", "chore"]));
  });
});

describe(".release-please-manifest.json", () => {
  it("should track exactly the root package", () => {
    expect(Object.keys(manifest)).toStrictEqual(["."]);
  });

  it("should hold a semver version", () => {
    expect(manifest["."]).toMatch(SEMVER);
  });
});

/**
 * `D49`: `cargo test --locked` is the guard against a stale Cargo.lock. A bare
 * `cargo test` repairs the lockfile in place and passes, so the mistake would
 * only surface later. Both workflows must run the locked form.
 */
describe("ci.yml: rust job runs the D49 locked guard", () => {
  it("should run cargo test --locked, not a bare cargo test", () => {
    expect(ciYaml).toContain(
      "      - name: 🧪 Rust Tests\n" +
        "        working-directory: src-tauri\n" +
        "        run: cargo test --locked"
    );
  });

  it("should invoke cargo test exactly once, and only in locked form", () => {
    const invocations = ciYaml.match(/run: cargo test\b.*/g) ?? [];

    expect(invocations).toStrictEqual(["run: cargo test --locked"]);
  });

  it("should explain the --locked guard by citing D49", () => {
    expect(ciYaml).toContain("`D49` guard");
  });
});

describe("release.yml", () => {
  it("should be triggered by a push to main and a manual redrive dispatch", () => {
    expect(releaseYaml).toContain("branches: [main]");
    expect(releaseYaml).toContain("workflow_dispatch:");
  });

  it("should require a tag input for the manual redrive", () => {
    const dispatchBlock = releaseYaml.slice(
      releaseYaml.indexOf("workflow_dispatch:"),
      releaseYaml.indexOf("concurrency:")
    );

    expect(dispatchBlock).toContain("tag:");
    expect(dispatchBlock).toContain("required: true");
    expect(dispatchBlock).toContain("type: string");
  });

  it("should never cancel an in-flight release for a newer push", () => {
    expect(releaseYaml).toContain("group: release");
    expect(releaseYaml).toContain("cancel-in-progress: false");
  });

  it("should run cargo test --locked in the check job, not a bare cargo test", () => {
    expect(releaseYaml).toContain(
      "      - name: 🦀 Rust Tests\n" +
        "        working-directory: src-tauri\n" +
        "        run: cargo test --locked"
    );
  });

  it("should invoke cargo test exactly once, and only in locked form", () => {
    const invocations = releaseYaml.match(/run: cargo test\b.*/g) ?? [];

    expect(invocations).toStrictEqual(["run: cargo test --locked"]);
  });

  it("should gate the check job on release-please not having failed, covering both triggers", () => {
    expect(releaseYaml).toContain(
      "if: ${{ !cancelled() && needs.release-please.result != 'failure' && (github.event_name == 'workflow_dispatch' || needs.release-please.outputs.released == 'true') }}"
    );
  });

  it("should resolve TAG from the dispatch input first, falling back to release-please's output", () => {
    const tagAssignments = releaseYaml.match(
      /TAG: \$\{\{ inputs\.tag \|\| needs\.release-please\.outputs\.tag_name \}\}/g
    );

    // check, build, verify and homebrew each need TAG independently, since
    // env does not propagate across jobs.
    expect(tagAssignments).toHaveLength(4);
  });

  it("should fail loudly rather than silently skip when a release has no tag", () => {
    expect(releaseYaml).toContain(
      "::error::release created but tag_name is empty"
    );
  });

  it.each([
    ["build", "needs: [release-please, check]", "needs.check.result"],
    ["verify", "needs: [release-please, build]", "needs.build.result"],
    ["homebrew", "needs: [release-please, verify]", "needs.verify.result"],
  ])(
    "should gate the %s job on its predecessor succeeding",
    (_job, needs, condition) => {
      expect(releaseYaml).toContain(needs);
      expect(releaseYaml).toContain(`${condition} == 'success'`);
    }
  );

  it("should build exactly the three desktop platforms, serialized", () => {
    expect(releaseYaml).toContain("max-parallel: 1");
    expect(releaseYaml).toContain(
      '          - platform: macos-latest\n            args: "--target universal-apple-darwin"'
    );
    expect(releaseYaml).toContain(
      '          - platform: ubuntu-22.04\n            args: ""'
    );
    expect(releaseYaml).toContain(
      '          - platform: windows-latest\n            args: ""'
    );
  });

  const ASSET_PATTERNS = ["\\.dmg$", "\\.AppImage$", "\\.deb$", "\\.exe$|\\.msi$"];

  it.each(ASSET_PATTERNS)(
    "should verify a release asset matching %s",
    (pattern) => {
      expect(releaseYaml).toContain(`'${pattern}'`);
    }
  );

  it("should never hash a redriven run's own previous checksum file", () => {
    expect(releaseYaml).toContain("rm -f SHA256SUMS.txt");
  });

  it("should publish the release only after assets and checksums are attached", () => {
    const verifyBlock = releaseYaml.slice(
      releaseYaml.indexOf("verify:"),
      releaseYaml.indexOf("homebrew:")
    );
    const assetsAt = verifyBlock.indexOf("Verify Assets");
    const checksumsAt = verifyBlock.indexOf("Write Checksums");
    const publishAt = verifyBlock.indexOf("Publish Release");

    expect(assetsAt).toBeGreaterThan(-1);
    expect(checksumsAt).toBeGreaterThan(assetsAt);
    expect(publishAt).toBeGreaterThan(checksumsAt);
    expect(verifyBlock).toContain("--draft=false");
  });

  /**
   * notarize_auth() (Tauri) treats all six APPLE_* vars as configured the
   * moment they are set, even to an empty string from an unset secret. The
   * step's own guard loop must check exactly the six it forwards; a var
   * added to one list and not the other reintroduces the partial-config bug
   * the comment above the step describes.
   */
  it("should check for exactly the Apple signing vars it forwards, no more and no fewer", () => {
    const stepStart = releaseYaml.indexOf("🔏 Setup Apple Signing");
    const stepEnd = releaseYaml.indexOf("🏗 Build Bundles", stepStart);
    const step = releaseYaml.slice(stepStart, stepEnd);

    const envKeys = [...step.matchAll(/^\s{10}(APPLE_[A-Z_]+):/gm)].map(
      ([, name]) => name
    );
    const namesLine = /names="([^"]+)"/.exec(step)?.[1];

    expect(envKeys).toHaveLength(6);
    expect(namesLine).toBeDefined();
    expect(namesLine?.split(" ").toSorted()).toStrictEqual(
      envKeys.toSorted()
    );
  });

  it("should build unsigned rather than fail when signing is not configured", () => {
    expect(releaseYaml).toContain("building unsigned; not configured:");
  });

  it("should render the cask from scripts/notras.rb.tmpl with sed rules matching every placeholder in it", () => {
    const templatePlaceholders = new Set(
      [...caskTemplate.matchAll(/\{\{(\w+)\}\}/g)].map(([, name]) => name)
    );
    const sedPlaceholders = new Set(
      [...releaseYaml.matchAll(/-e "s\/\{\{(\w+)\}\}\//g)].map(
        ([, name]) => name
      )
    );

    expect(templatePlaceholders).toStrictEqual(new Set(["VERSION", "SHA", "DMG"]));
    expect(sedPlaceholders).toStrictEqual(templatePlaceholders);
  });

  it("should read the DMG's checksum off SHA256SUMS.txt rather than re-hashing the download", () => {
    expect(releaseYaml).toContain(
      "gh release download \"$TAG\" --pattern SHA256SUMS.txt --dir ."
    );
    expect(releaseYaml).not.toContain("shasum -a 256");
    expect(releaseYaml).not.toContain("sha256sum \"$DMG\"");
  });

  it("should push the cask to the tap repo the README's brew command names", () => {
    expect(releaseYaml).toContain(
      "github.com/jimmy-guzman/homebrew-tap.git"
    );
    expect(readme).toContain("jimmy-guzman/tap/notras");
  });

  it("should skip the commit rather than push an empty one when the cask is unchanged", () => {
    expect(releaseYaml).toContain("cask unchanged; skipping commit");
  });
});

describe("scripts/notras.rb.tmpl", () => {
  it("should define a cask block with balanced do/end", () => {
    const opens = caskTemplate.match(/\bdo\b/g) ?? [];
    const ends = caskTemplate.match(/\bend\b/g) ?? [];

    expect(opens.length).toBeGreaterThan(0);
    expect(opens).toHaveLength(ends.length);
  });

  it("should carry exactly the three placeholders the release workflow substitutes", () => {
    const placeholders = [...caskTemplate.matchAll(/\{\{(\w+)\}\}/g)].map(
      ([, name]) => name
    );

    expect(new Set(placeholders)).toStrictEqual(
      new Set(["VERSION", "SHA", "DMG"])
    );
  });

  it("should install the app under the name tauri.conf.json builds", () => {
    expect(caskTemplate).toContain(`app "${tauriConfig.productName}.app"`);
  });

  it("should zap the same bundle identifier tauri.conf.json declares", () => {
    const zapBlock = caskTemplate.slice(caskTemplate.indexOf("zap trash:"));

    expect(zapBlock).toContain(tauriConfig.identifier);
  });

  it("should produce a template-free cask once every placeholder is substituted", () => {
    const rendered = caskTemplate
      .replaceAll("{{VERSION}}", "1.2.3")
      .replaceAll("{{SHA}}", "abc123")
      .replaceAll("{{DMG}}", "notras_1.2.3_universal.dmg");

    expect(rendered).not.toContain("{{");
    expect(rendered).toContain('version "1.2.3"');
    expect(rendered).toContain('sha256 "abc123"');
    expect(rendered).toContain(
      "download/v#{version}/notras_1.2.3_universal.dmg"
    );
  });

  it("should keep the notes folder out of the zap trash list", () => {
    const zapBlock = caskTemplate.slice(caskTemplate.indexOf("zap trash:"));

    expect(zapBlock).not.toContain("~/notras");
  });
});

/**
 * DECISIONS.md numbers its own entries in prose (`D49` here), and states the
 * running total in its own header. A decision added without updating both
 * would desync the header from the entries it describes.
 */
describe("DECISIONS.md numbering", () => {
  const ids = [...decisions.matchAll(/^### D(\d+)\b/gm)].map(([, id]) =>
    Number(id)
  );

  it("should record at least the D49 decision this PR added", () => {
    expect(ids).toContain(49);
  });

  it("should never reuse a decision number", () => {
    expect(ids.length).toBe(new Set(ids).size);
  });

  it("should state a highest-issued number matching the actual highest heading", () => {
    const highest = Math.max(...ids);
    const stated = /number issued so far is (\d+)/.exec(decisions)?.[1];
    const next = /next\nentry takes (\d+)/.exec(decisions)?.[1];

    expect(Number(stated)).toBe(highest);
    expect(Number(next)).toBe(highest + 1);
  });

  it("should title D49 for the release-please version freeze it documents", () => {
    expect(decisions).toContain(
      "### D49 release-please owns the version, and the crate version is frozen"
    );
  });

  it("should tie D49's cargo build --locked constraint to the workflow that enforces it", () => {
    const start = decisions.indexOf(
      "### D49 release-please owns the version"
    );
    const end = decisions.length;
    const section = decisions.slice(start, end);

    expect(section).toContain("cargo build --locked");
  });
});

describe("AGENTS.md verification checklist", () => {
  it("should run the locked cargo test guard, citing D49", () => {
    expect(agents).toContain("cargo test --locked   # 5.");
    expect(agents).toContain("`D49`");
  });

  it("should document release-please as the sole owner of the version", () => {
    expect(agents).toContain(
      "Releases are cut by release-please, and `package.json` holds the only\n  version."
    );
  });

  it("should point a stranded release at the workflow_dispatch redrive", () => {
    expect(agents).toContain("gh workflow run release.yml -f tag=vX.Y.Z");
  });
});

describe("README.md release install instructions", () => {
  it("should reference the checksum file the release workflow actually writes", () => {
    expect(readme).toContain("SHA256SUMS.txt");
    expect(releaseYaml).toContain("sha256sum -- * > SHA256SUMS.txt");
  });

  it("should quarantine-clear the app bundle tauri.conf.json builds", () => {
    expect(readme).toContain(
      `xattr -dr com.apple.quarantine /Applications/${tauriConfig.productName}.app`
    );
  });

  it("should tell readers to ignore missing platforms rather than fail on them", () => {
    expect(readme).toContain("--ignore-missing");
  });
});