import {
  addDays,
  addHours,
  addMinutes,
  setHours,
  setMinutes,
  setSeconds,
} from "date-fns";

export type ReminderPreset =
  | "in-1-hour"
  | "in-3-days"
  | "in-3-hours"
  | "in-30-minutes"
  | "next-week"
  | "tomorrow-evening"
  | "tomorrow-morning";

interface PresetConfig {
  key: ReminderPreset;
  label: string;
  resolve: (now: Date) => Date;
}

function atTime(date: Date, hours: number): Date {
  return setSeconds(setMinutes(setHours(date, hours), 0), 0);
}

export const REMINDER_PRESETS: PresetConfig[] = [
  {
    key: "in-30-minutes",
    label: "in 30 minutes",
    resolve: (now) => addMinutes(now, 30),
  },
  {
    key: "in-1-hour",
    label: "in 1 hour",
    resolve: (now) => addHours(now, 1),
  },
  {
    key: "in-3-hours",
    label: "in 3 hours",
    resolve: (now) => addHours(now, 3),
  },
  {
    key: "tomorrow-morning",
    label: "tomorrow morning",
    resolve: (now) => atTime(addDays(now, 1), 9),
  },
  {
    key: "tomorrow-evening",
    label: "tomorrow evening",
    resolve: (now) => atTime(addDays(now, 1), 18),
  },
  {
    key: "in-3-days",
    label: "in 3 days",
    resolve: (now) => atTime(addDays(now, 3), 9),
  },
  {
    key: "next-week",
    label: "next week",
    resolve: (now) => atTime(addDays(now, 7), 9),
  },
];

export function resolvePreset(key: ReminderPreset): Date {
  const now = new Date();
  const preset = REMINDER_PRESETS.find((p) => p.key === key);

  if (!preset) {
    throw new Error(`unknown reminder preset: ${key}`);
  }

  return preset.resolve(now);
}
