import {
  detectPlatform,
  formatForDisplay,
  getHotkeyManager,
  type Hotkey,
  type HotkeyCallback,
  type HotkeyRegistrationHandle,
  normalizeRegisterableHotkey,
  useHotkeyRegistrations,
} from "@tanstack/react-hotkeys";
import { useLayoutEffect, useRef } from "react";

interface ShortcutOptions {
  enabled?: boolean;
  meta?: { name?: string };
}

interface ShortcutDefinition {
  callback: HotkeyCallback;
  hotkey: Hotkey;
  options?: ShortcutOptions;
}

interface Registration {
  enabled: boolean;
  handle: HotkeyRegistrationHandle;
  name: string | undefined;
}

/** Register window shortcuts and publish changes only from committed renders. */
export function useHotkeys(
  definitions: ShortcutDefinition[],
  commonOptions: ShortcutOptions = {}
): void {
  const registrations = useRef(new Map<string, Registration>());

  useLayoutEffect(() => {
    const rows = definitions.map((definition, index) => {
      const { enabled = true, meta } = {
        ...commonOptions,
        ...definition.options,
      };
      const hotkey = normalizeRegisterableHotkey(
        definition.hotkey,
        detectPlatform()
      );
      return {
        callback: definition.callback,
        enabled,
        hotkey,
        key: `${index}:${hotkey}`,
        name: meta?.name,
      };
    });
    const nextKeys = new Set(rows.map(({ key }) => key));
    for (const [key, registration] of registrations.current) {
      if (!nextKeys.has(key)) {
        registration.handle.unregister();
        registrations.current.delete(key);
      }
    }

    for (const { callback, enabled, hotkey, key, name } of rows) {
      const previous = registrations.current.get(key);
      const options = { enabled, meta: { name } };
      if (previous === undefined) {
        const handle = getHotkeyManager().register(hotkey, callback, options);
        registrations.current.set(key, { enabled, handle, name });
      } else {
        previous.handle.callback = callback;
        // setOptions publishes even equal values; publishing them here would
        // make a component reading its own bindings keep committing.
        if (previous.enabled !== enabled || previous.name !== name) {
          previous.handle.setOptions(options);
          registrations.current.set(key, {
            enabled,
            handle: previous.handle,
            name,
          });
        }
      }
    }
  });

  useLayoutEffect(
    () => () => {
      for (const { handle } of registrations.current.values()) {
        handle.unregister();
      }
      registrations.current.clear();
    },
    []
  );
}

/** Register one window shortcut with the current committed callback and options. */
export function useHotkey(
  hotkey: Hotkey,
  callback: HotkeyCallback,
  options?: ShortcutOptions
): void {
  useHotkeys([{ callback, hotkey, options }]);
}

/**
 * A chord as the interface prints it, lowercase throughout.
 *
 * The separator follows the platform rather than being dropped: mac renders
 * symbols, which separate themselves, but the word labels everywhere else run
 * together without one, so `Mod+Shift+K` would read `ctrlshiftk`.
 */
export function chordGlyph(hotkey: string) {
  const platform = detectPlatform();

  return formatForDisplay(hotkey, {
    platform,
    separatorToken: platform === "mac" ? "" : "+",
  }).toLowerCase();
}

/**
 * Every live binding, keyed by the action name its `meta` carries, so a
 * surface that already names an action can find its chords without
 * restating them. An action with no binding is simply absent.
 * Registration changes are published after commit, so readers can also
 * register shortcuts without updating themselves during render.
 */
export function useChordsByName() {
  const { hotkeys } = useHotkeyRegistrations();

  return Map.groupBy(hotkeys, ({ options }) => options.meta?.name);
}
