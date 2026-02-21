"use server";

import { redirect } from "next/navigation";

// eslint-disable-next-line @typescript-eslint/require-await -- server actions must be async
export async function searchNotes(formData: FormData) {
  const raw = formData.get("q");
  const query = typeof raw === "string" ? raw.trim() : undefined;

  if (query) {
    redirect(`/notes?q=${encodeURIComponent(query)}`);
  }
}
