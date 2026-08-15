import {
  startOfDay,
  startOfMonth,
  startOfWeek,
  startOfYear,
  subDays,
} from "date-fns";

export type SortOption = "newest" | "oldest" | "updated";
export type TimeFilter = "month" | "today" | "week" | "year" | "yesterday";

export function getStartDateForFilter(time: TimeFilter): Date {
  const now = new Date();

  if (time === "month") {
    return startOfMonth(now);
  }

  if (time === "week") {
    return startOfWeek(now);
  }

  if (time === "year") {
    return startOfYear(now);
  }

  if (time === "yesterday") {
    return startOfDay(subDays(now, 1));
  }

  return startOfDay(now);
}
