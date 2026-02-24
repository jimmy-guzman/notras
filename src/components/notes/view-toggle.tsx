"use client";

import { LayoutGridIcon, ListIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useViewPreference } from "@/lib/use-view-preference";

export const ViewToggle = () => {
  const [view, setView, isHydrated] = useViewPreference();

  return (
    <div
      className={`flex items-center gap-1 transition-opacity duration-300 ${isHydrated ? "opacity-100" : "opacity-0"}`}
      role="group"
    >
      {" "}
      <Button
        aria-label="grid view"
        aria-pressed={view === "grid"}
        onClick={() => {
          setView("grid");
        }}
        size="icon-sm"
        variant={view === "grid" ? "secondary" : "ghost"}
      >
        <LayoutGridIcon />
      </Button>
      <Button
        aria-label="list view"
        aria-pressed={view === "list"}
        onClick={() => {
          setView("list");
        }}
        size="icon-sm"
        variant={view === "list" ? "secondary" : "ghost"}
      >
        <ListIcon />
      </Button>
    </div>
  );
};
