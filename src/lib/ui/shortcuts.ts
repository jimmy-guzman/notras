import {
  detectPlatform,
  formatForDisplay,
  useHotkeyRegistrations,
} from "@tanstack/react-hotkeys";

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
 *
 * Never call this from a component that also registers a hotkey. `useHotkey`
 * syncs its options on every render and that write always builds a new
 * registration map, so a component doing both wakes itself and never settles.
 */
export function useChordsByName() {
  const { hotkeys } = useHotkeyRegistrations();

  return Map.groupBy(hotkeys, ({ options }) => options.meta?.name);
}
