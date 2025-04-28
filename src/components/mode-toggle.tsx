"use client";

import { CompassIcon, PencilIcon } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";

import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/ui/utils";

export function ModeToggle() {
  const searchParams = useSearchParams();
  const mode = searchParams.get("mode") ?? "create";
  const router = useRouter();

  function handleSwitch(newMode: "create" | "search") {
    const params = new URLSearchParams(searchParams.toString());

    params.set("mode", newMode);
    router.replace(`?${params.toString()}`);
  }

  return (
    <TooltipProvider>
      <div className="flex gap-2">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              aria-label="New thought"
              className={cn(
                "text-muted-foreground",
                mode === "create" && "bg-muted text-foreground",
              )}
              onClick={() => {
                handleSwitch("create");
              }}
              size="icon"
              variant="ghost"
            >
              <PencilIcon className="h-4 w-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>New thought</TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              aria-label="Search thoughts"
              className={cn(
                "text-muted-foreground",
                mode === "search" && "bg-muted text-foreground",
              )}
              onClick={() => {
                handleSwitch("search");
              }}
              size="icon"
              variant="ghost"
            >
              <CompassIcon className="h-4 w-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Search thoughts</TooltipContent>
        </Tooltip>
      </div>
    </TooltipProvider>
  );
}
