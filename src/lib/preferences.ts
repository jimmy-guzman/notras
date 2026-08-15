import type { Store } from "@tauri-apps/plugin-store";

import { load } from "@tauri-apps/plugin-store";

// Same store file the Rust side uses for `notesDir`.
let storePromise: Promise<Store> | undefined;

function getStore() {
  storePromise ??= load("settings.json");

  return storePromise;
}

export async function getPreference<T>(key: string, fallback: T): Promise<T> {
  const store = await getStore();
  const value = await store.get<T>(key);

  return value ?? fallback;
}

export async function setPreference(key: string, value: unknown) {
  const store = await getStore();

  await store.set(key, value);
}
