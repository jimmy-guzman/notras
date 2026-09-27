import { execFile } from "node:child_process";
import { randomBytes, randomUUID } from "node:crypto";
import {
  cp,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  writeFile,
} from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";

import type { TestProject } from "vitest/node";

import tauriConfig from "../src-tauri/tauri.conf.json";

// oxlint-disable-next-line typescript/strict-void-return -- Node supplies a custom promisify implementation for execFile's ChildProcess return.
const exec = promisify(execFile);

async function verifyProductionBuild(root: string, artifacts: string) {
  const native = await exec(
    "cargo",
    ["tree", "--locked", "-p", "notras", "--edges", "normal"],
    { maxBuffer: 4 * 1024 * 1024 }
  );
  await writeFile(
    path.join(artifacts, "production-dependencies.txt"),
    native.stdout
  );
  if (native.stdout.includes("tauri-plugin-wdio")) {
    throw new Error(
      "The production dependency graph includes smoke instrumentation."
    );
  }
  const output = path.join(root, "production-web");
  const web = await exec("pnpm", ["build:web", "--outDir", output], {
    maxBuffer: 4 * 1024 * 1024,
  });
  await writeFile(
    path.join(artifacts, "production-build.log"),
    web.stdout + web.stderr
  );
  const assets = await readdir(path.join(output, "assets"));
  await Promise.all(
    assets.map(async (entry) => {
      if (!entry.endsWith(".js")) {
        return;
      }
      const source = await readFile(
        path.join(output, "assets", entry),
        "utf-8"
      );
      if (source.includes("wdioTauri") || source.includes("WDIO Tauri")) {
        throw new Error(
          `The production asset ${entry} includes smoke instrumentation.`
        );
      }
    })
  );
}

interface SmokeRun {
  artifacts: string;
  binary: string;
  dataStore: string;
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
    throw new Error("The native smoke test requires macOS 26 or later.");
  }
  const { stdout: version } = await exec("sw_vers", ["-productVersion"]);
  if (Number(version.split(".")[0]) < 26) {
    throw new Error(
      `The native smoke test requires macOS 26, found ${version.trim()}.`
    );
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
  const note = path.join(library, "smoke-note.md");
  const cleanup = async () => {
    await rm(library, { force: true, recursive: true });
    await rm(appData, { force: true, recursive: true });
    await rm(appCache, { force: true, recursive: true });
    await rm(appLogs, { force: true, recursive: true });
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
    await verifyProductionBuild(root, artifacts);
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
                permissions: [
                  "wdio:default",
                  "core:webview:allow-clear-all-browsing-data",
                ],
                windows: ["main"],
              },
            ],
          },
          windows: tauriConfig.app.windows,
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
    project.provide("smoke", {
      artifacts,
      binary: path.join(root, "cargo/debug/notras"),
      dataStore: JSON.stringify([...randomBytes(16)]),
      note,
    });
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
