"use client";

import { Check, Copy } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { cn } from "@/lib/ui/utils";

import { Button } from "./ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "./ui/tooltip";

const COPY_RESET_DELAY_MS = 1500;

interface CopyNoteProps {
  content: string;
  resetDelayMs?: number;
}

export const CopyNote = ({
  content,
  resetDelayMs = COPY_RESET_DELAY_MS,
}: CopyNoteProps) => {
  const [copied, setCopied] = useState(false);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(content);

      setCopied(true);

      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }

      timeoutRef.current = setTimeout(() => {
        setCopied(false);
      }, resetDelayMs);
    } catch {
      toast.error("Failed to copy to clipboard. Please try again.");
    }
  }

  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          aria-label={copied ? "Copied" : "Copy"}
          className="h-6 w-6"
          onClick={handleCopy}
          size="icon"
          variant="ghost"
        >
          <span className="relative inline-block h-4 w-4">
            <Check
              className={cn(
                "absolute inset-0 transition-opacity duration-300 ease-in-out",
                copied ? "opacity-100 delay-50" : "opacity-0 delay-0",
              )}
            />
            <Copy
              className={cn(
                "absolute inset-0 transition-opacity duration-300 ease-in-out",
                copied ? "opacity-0 delay-0" : "opacity-100 delay-50",
              )}
            />
          </span>
        </Button>
      </TooltipTrigger>
      <TooltipContent side="top" sideOffset={4}>
        {copied ? "Copied" : "Copy"}
      </TooltipContent>
    </Tooltip>
  );
};
