"use client";

import { useRouter, useSearchParams } from "next/navigation";

import { Input } from "@/components/ui/input";

export function NotesSearchInput() {
  const router = useRouter();
  const searchParams = useSearchParams();

  function handleChange(value: string) {
    const params = new URLSearchParams(searchParams.toString());

    if (value) {
      params.set("q", value);
    } else {
      params.delete("q");
    }
    router.replace(`?${params.toString()}`);
  }

  return (
    <div className="mx-auto w-full max-w-2xl">
      <Input
        className="py-6 text-lg"
        defaultValue={searchParams.get("q") ?? ""}
        onChange={(e) => {
          handleChange(e.target.value);
        }}
        placeholder="Search your thoughts..."
      />
    </div>
  );
}
