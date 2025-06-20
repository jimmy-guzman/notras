"use client";

import { ClipboardCheckIcon, ClipboardCopyIcon } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { cn } from "@/lib/ui/utils";

import { Button } from "../ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "../ui/tooltip";

const COPY_RESET_DELAY_MS = 1500;

interface CopyNoteButtonProps {
  content: string;
  resetDelayMs?: number;
}

export const CopyNoteButton = ({
  content,
  resetDelayMs = COPY_RESET_DELAY_MS,
}: CopyNoteButtonProps) => {
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
          onClick={handleCopy}
          size="icon"
          variant="ghost"
        >
          <>
            <ClipboardCheckIcon
              className={cn(
                "transition-opacity duration-300 ease-in-out",
                copied ? "opacity-100 delay-50" : "hidden opacity-0 delay-0",
              )}
            />
            <ClipboardCopyIcon
              className={cn(
                "transition-opacity duration-300 ease-in-out",
                copied ? "hidden opacity-0 delay-0" : "opacity-100 delay-50",
              )}
            />
          </>
        </Button>
      </TooltipTrigger>
      <TooltipContent side="top" sideOffset={4}>
        {copied ? "Copied" : "Copy"}
      </TooltipContent>
    </Tooltip>
  );
};
