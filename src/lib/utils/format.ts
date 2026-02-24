import { format } from "date-fns";

export function formatDate(date: Date): string {
  return format(date, "MMM d, yyyy").toLowerCase();
}

export function formatDateTime(date: Date): string {
  return format(date, "MMM d, h:mm a").toLowerCase();
}

export function formatFileSize(bytes: number): string {
  if (bytes <= 0) return "0 B";

  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.min(
    Math.floor(Math.log(bytes) / Math.log(k)),
    sizes.length - 1,
  );

  return `${Math.round((bytes / k ** i) * 10) / 10} ${sizes[i]}`;
}
