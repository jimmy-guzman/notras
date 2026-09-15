import { Buffer } from "node:buffer";
import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

/**
 * A bogus `pubkey` is not caught by `tauri build`; the updater plugin only
 * parses it at runtime, so a placeholder would ship and fail in an installed
 * app. Read the shipped config and refuse that here instead.
 */
interface UpdaterConfig {
  bundle: { createUpdaterArtifacts?: boolean };
  plugins: { updater: { endpoints: string[]; pubkey: string } };
}

function isUpdaterConfig(value: unknown): value is UpdaterConfig {
  return (
    typeof value === "object" &&
    value !== null &&
    "bundle" in value &&
    typeof value.bundle === "object" &&
    value.bundle !== null &&
    "plugins" in value &&
    typeof value.plugins === "object" &&
    value.plugins !== null &&
    "updater" in value.plugins &&
    typeof value.plugins.updater === "object" &&
    value.plugins.updater !== null &&
    "pubkey" in value.plugins.updater &&
    typeof value.plugins.updater.pubkey === "string" &&
    "endpoints" in value.plugins.updater &&
    Array.isArray(value.plugins.updater.endpoints)
  );
}

const parsed = JSON.parse(
  readFileSync(
    path.join(process.cwd(), "src-tauri", "tauri.conf.json"),
    "utf-8"
  )
);

if (!isUpdaterConfig(parsed)) {
  throw new Error("src-tauri/tauri.conf.json has no updater configuration");
}

const config = parsed;

/**
 * `tauri signer generate` emits the base64 of a minisign public key file: a
 * comment line, then the base64 of 2 algorithm bytes, an 8-byte key ID, and a
 * 32-byte ed25519 key.
 */
const [comment, key] = Buffer.from(config.plugins.updater.pubkey, "base64")
  .toString("utf-8")
  .trim()
  .split("\n");

const material = Buffer.from(key ?? "", "base64");

describe("updater config", () => {
  it("should carry a whole minisign public key", () => {
    expect(comment?.startsWith("untrusted comment:")).toBeTruthy();
    expect(material).toHaveLength(42);
    expect(material.subarray(0, 2).toString("utf-8")).toBe("Ed");
  });

  it("should carry key material the comment names", () => {
    // minisign writes the ID little-endian in the key and hex in the comment,
    // so a payload swapped for another key or cut short stops agreeing with it.
    const id = Buffer.from(material.subarray(2, 10).toReversed()).toString(
      "hex"
    );

    expect(comment).toContain(id.toUpperCase());
  });

  it("should emit the artifacts the endpoint serves", () => {
    expect(config.bundle.createUpdaterArtifacts).toBeTruthy();
    expect(config.plugins.updater.endpoints).toContain(
      "https://github.com/jimmy-guzman/notras/releases/latest/download/latest.json"
    );
  });
});
