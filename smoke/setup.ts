import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { cp, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";

import type { TestProject } from "vitest/node";

import tauriConfig from "../src-tauri/tauri.conf.json";

// oxlint-disable-next-line typescript/strict-void-return -- Node supplies a custom promisify implementation for execFile's ChildProcess return.
const exec = promisify(execFile);

interface SmokeRun {
  artifacts: string;
  binary: string;
  note: string;
}

declare module "vitest" {
  export interface ProvidedContext {
    smoke: SmokeRun;
  }
}

export async function setup(
  project: TestProject
): Promise<() => Promise<void>> {
  if (process.platform !== "darwin") {
    throw new Error("The native smoke test runs on macOS.");
  }

  const root = path.resolve("target/smoke");
  await mkdir(root, { recursive: true });
  const run = await mkdtemp(path.join(root, "run-"));
  const identifier = `codes.jimmy.notras.smoke.r${randomUUID().replaceAll("-", "")}`;
  const library = path.join(run, "notes");
  const artifacts = path.join(run, "artifacts");

  const appData = path.join(
    homedir(),
    "Library/Application Support",
    identifier
  );

  const appCache = path.join(homedir(), "Library/Caches", identifier);
  const appLogs = path.join(homedir(), "Library/Logs", identifier);
  const webKit = path.join(homedir(), "Library/WebKit", identifier);
  const note = path.join(library, "smoke-note.md");

  const cleanup = async () => {
    await rm(library, { force: true, recursive: true });
    await rm(appData, { force: true, recursive: true });
    await rm(appCache, { force: true, recursive: true });
    await rm(appLogs, { force: true, recursive: true });
    await rm(webKit, { force: true, recursive: true });
  };

  try {
    await mkdir(library);
    await mkdir(artifacts);
    await mkdir(appData);
    await writeFile(note, "# Smoke note\n\nOriginal body.\n");
    await writeFile(
      path.join(appData, "settings.json"),
      JSON.stringify({ notesDir: library })
    );
    const config = path.join(run, "tauri.json");
    await writeFile(
      config,
      JSON.stringify({
        app: {
          security: {
            capabilities: [
              "default",
              {
                identifier: "smoke",
                permissions: ["wdio:default"],
                windows: ["main", "capture"],
              },
            ],
          },
          // The README screenshots are dark whatever the system scheme is.
          windows: tauriConfig.app.windows.map((window) => ({
            ...window,
            theme: "Dark",
          })),
          withGlobalTauri: true,
        },
        build: {
          beforeBuildCommand:
            "pnpm exec vite build --mode smoke --outDir target/smoke/web",
          frontendDist: path.join(root, "web"),
        },
        bundle: { active: false },
        identifier,
        productName: "notras smoke",
      })
    );

    const result = await exec(
      "pnpm",
      [
        "tauri",
        "build",
        "--debug",
        "--no-bundle",
        "--ci",
        "--features",
        "smoke",
        "--config",
        config,
        "--",
        "--locked",
      ],
      {
        env: { ...process.env, CARGO_TARGET_DIR: path.join(root, "cargo") },
        maxBuffer: 20 * 1024 * 1024,
        timeout: 1_200_000,
      }
    );

    await writeFile(
      path.join(artifacts, "build.log"),
      result.stdout + result.stderr
    );
    // WebKit keys an unbundled binary's default data store by executable name, so a per-run name keeps both launches on one store that no other run shares.
    const binary = path.join(run, identifier);
    await cp(path.join(root, "cargo/debug/notras"), binary);
    project.provide("smoke", { artifacts, binary, note });

    return async () => {
      try {
        await cp(library, path.join(artifacts, "notes"), { recursive: true });
      } finally {
        await cleanup();
      }
    };
  } catch (error) {
    await writeFile(path.join(artifacts, "setup-error.txt"), String(error));
    await cleanup();
    throw error;
  }
}
