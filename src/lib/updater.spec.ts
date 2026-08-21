import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * A bogus `pubkey` is not caught by `tauri build`; the updater plugin only
 * parses it at runtime, so a placeholder would ship and fail in an installed
 * app. Read the shipped config and refuse that here instead.
 */
const config = JSON.parse(
  readFileSync(join(process.cwd(), "src-tauri", "tauri.conf.json"), "utf8")
) as {
  bundle: { createUpdaterArtifacts?: boolean };
  plugins: { updater: { endpoints: string[]; pubkey: string } };
};

describe("updater config", () => {
  it("should carry a real minisign public key", () => {
    const { pubkey } = config.plugins.updater;

    // `tauri signer generate` emits the base64 of a minisign public key file,
    // which always opens with its "untrusted comment:" header.
    expect(pubkey.startsWith("dW50cnVzdGVkIGNvbW1lbnQ6")).toBe(true);
  });

  it("should emit the artifacts the endpoint serves", () => {
    expect(config.bundle.createUpdaterArtifacts).toBe(true);
    expect(config.plugins.updater.endpoints).toContain(
      "https://github.com/jimmy-guzman/notras/releases/latest/download/latest.json"
    );
  });
});
