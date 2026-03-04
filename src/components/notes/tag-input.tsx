"use client";

import { XIcon } from "lucide-react";
import { useMemo, useRef, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/ui/utils";

interface TagInputProps {
  allTags?: string[];
  className?: string;
  defaultValue?: string[];
  name?: string;
}

const EMPTY_ALL_TAGS: string[] = [];
const EMPTY_DEFAULT: string[] = [];

function normalize(val: string) {
  return val.trim().toLowerCase();
}

export const TagInput = ({
  allTags = EMPTY_ALL_TAGS,
  className,
  defaultValue = EMPTY_DEFAULT,
  name = "tags",
}: TagInputProps) => {
  const [tags, setTags] = useState<string[]>(() => {
    const seen = new Set<string>();
    const result: string[] = [];

    for (const t of defaultValue) {
      const n = normalize(t);

      if (n && !seen.has(n)) {
        seen.add(n);
        result.push(n);
      }
    }

    return result;
  });
  const [inputValue, setInputValue] = useState("");
  const [showSuggestions, setShowSuggestions] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const addTag = (raw: string) => {
    const normalized = normalize(raw);

    if (!normalized || tags.includes(normalized)) return;

    setTags((prev) => [...prev, normalized]);
    setInputValue("");
    setShowSuggestions(false);
  };

  const removeTag = (index: number) => {
    setTags((prev) => prev.filter((_, i) => i !== index));
  };

  const suggestions = useMemo(() => {
    return allTags
      .map(normalize)
      .filter((t) => {
        return (
          t.includes(normalize(inputValue)) &&
          !tags.includes(t) &&
          inputValue.length > 0
        );
      })
      .slice(0, 6);
  }, [allTags, inputValue, tags]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      addTag(inputValue);
    } else if (e.key === "Backspace" && inputValue === "" && tags.length > 0) {
      removeTag(tags.length - 1);
    } else if (e.key === "Escape") {
      setShowSuggestions(false);
    }
  };

  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      {/* Hidden input syncs tag list to FormData */}
      <input name={name} type="hidden" value={tags.join(",")} />

      {/* eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions -- click-to-focus-input pattern; keyboard access is via the input itself */}
      <div
        className="flex min-h-9 flex-wrap items-center gap-1.5 rounded-md border border-input bg-transparent px-3 py-1.5 text-sm shadow-xs transition-colors focus-within:ring-1 focus-within:ring-ring"
        onClick={() => {
          inputRef.current?.focus();
        }}
      >
        {tags.map((t, i) => {
          return (
            <Badge className="gap-1 pr-1" key={t} variant="secondary">
              {t}
              <button
                aria-label={`remove tag ${t}`}
                className="rounded-full opacity-60 hover:opacity-100 focus-visible:ring-1 focus-visible:ring-ring focus-visible:outline-none"
                onClick={(e) => {
                  e.stopPropagation();
                  removeTag(i);
                }}
                type="button"
              >
                <XIcon className="h-2.5 w-2.5" />
              </button>
            </Badge>
          );
        })}

        <input
          className="min-w-20 flex-1 bg-transparent outline-none placeholder:text-muted-foreground"
          onBlur={() => {
            // Delay to allow suggestion click to register
            setTimeout(() => {
              setShowSuggestions(false);
            }, 150);
          }}
          onChange={(e) => {
            setInputValue(e.target.value.replaceAll(",", ""));
            setShowSuggestions(true);
          }}
          onFocus={() => {
            setShowSuggestions(true);
          }}
          onKeyDown={handleKeyDown}
          placeholder={tags.length === 0 ? "add tags..." : ""}
          ref={inputRef}
          type="text"
          value={inputValue}
        />
      </div>

      {showSuggestions && suggestions.length > 0 && (
        <div className="z-10 flex flex-wrap gap-1.5 rounded-md border border-border bg-popover p-2 shadow-md">
          {suggestions.map((s) => {
            return (
              <button
                className="rounded-sm text-xs text-muted-foreground hover:text-foreground focus-visible:ring-1 focus-visible:ring-ring focus-visible:outline-none"
                key={s}
                onMouseDown={(e) => {
                  e.preventDefault();
                  addTag(s);
                }}
                type="button"
              >
                <Badge variant="outline">{s}</Badge>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};
