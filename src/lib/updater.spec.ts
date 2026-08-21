import { Buffer } from "node:buffer";
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

/**
 * `tauri signer generate` emits the base64 of a minisign public key file: a
 * comment line, then the base64 of 2 algorithm bytes, an 8-byte key ID, and a
 * 32-byte ed25519 key.
 */
const [comment, key] = Buffer.from(config.plugins.updater.pubkey, "base64")
  .toString("utf8")
  .trim()
  .split("\n");

const material = Buffer.from(key ?? "", "base64");

describe("updater config", () => {
  it("should carry a whole minisign public key", () => {
    expect(comment?.startsWith("untrusted comment:")).toBe(true);
    expect(material).toHaveLength(42);
    expect(material.subarray(0, 2).toString("utf8")).toBe("Ed");
  });

  it("should carry key material the comment names", () => {
    // minisign writes the ID little-endian in the key and hex in the comment,
    // so a payload swapped for another key or cut short stops agreeing with it.
    const id = Buffer.from(material.subarray(2, 10)).reverse().toString("hex");

    expect(comment).toContain(id.toUpperCase());
  });

  it("should emit the artifacts the endpoint serves", () => {
    expect(config.bundle.createUpdaterArtifacts).toBe(true);
    expect(config.plugins.updater.endpoints).toContain(
      "https://github.com/jimmy-guzman/notras/releases/latest/download/latest.json"
    );
  });
});
