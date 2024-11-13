import type { ClassValue } from "clsx/lite";

import { clsx } from "clsx/lite";
import { twMerge } from "tailwind-merge";

export const cn = (...classes: ClassValue[]) => {
  return twMerge(clsx(...classes));
};
