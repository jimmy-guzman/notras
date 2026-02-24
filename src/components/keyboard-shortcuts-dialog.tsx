"use client";

import type { ReactNode } from "react";

import { useState } from "react";
import { useHotkeys } from "react-hotkeys-hook";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Kbd } from "@/components/ui/kbd";

interface Shortcut {
  description: string;
  keys: string[];
}

interface ShortcutGroup {
  label: string;
  shortcuts: Shortcut[];
}

const groups: ShortcutGroup[] = [
  {
    label: "navigation",
    shortcuts: [
      { description: "go home", keys: ["h"] },
      { description: "all notes", keys: ["a"] },
      { description: "new note", keys: ["n"] },
      { description: "settings", keys: ["s"] },
      { description: "reminders", keys: [","] },
      { description: "focus search", keys: ["/"] },
      { description: "go back", keys: ["esc"] },
    ],
  },
  {
    label: "note detail",
    shortcuts: [
      { description: "edit note", keys: ["e"] },
      { description: "pin / unpin", keys: ["p"] },
      { description: "toggle reminder", keys: ["r"] },
      { description: "copy note", keys: ["c"] },
      { description: "delete note", keys: ["d"] },
    ],
  },
  {
    label: "forms",
    shortcuts: [{ description: "submit form", keys: ["\u2318", "\u23CE"] }],
  },
];

function ShortcutRow({ description, keys }: Shortcut) {
  return (
    <div className="flex items-center gap-3">
      <span className="flex items-center gap-1">
        {keys.map((key) => {
          return <Kbd key={key}>{key}</Kbd>;
        })}
      </span>
      <span className="text-sm text-muted-foreground">{description}</span>
    </div>
  );
}

function ShortcutSection({ group }: { group: ShortcutGroup }) {
  return (
    <div className="flex flex-col gap-2">
      <h3 className="text-xs font-medium text-muted-foreground">
        {group.label}
      </h3>
      <div className="flex flex-col gap-1.5">
        {group.shortcuts.map((shortcut) => {
          return <ShortcutRow key={shortcut.description} {...shortcut} />;
        })}
      </div>
    </div>
  );
}

export function KeyboardShortcutsDialog({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);

  useHotkeys("shift+/", () => {
    setOpen(true);
  });

  return (
    <Dialog onOpenChange={setOpen} open={open}>
      <button
        className="cursor-pointer underline underline-offset-4"
        onClick={() => {
          setOpen(true);
        }}
        type="button"
      >
        {children}
      </button>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>keyboard shortcuts</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-5">
          {groups.map((group) => {
            return <ShortcutSection group={group} key={group.label} />;
          })}
        </div>
      </DialogContent>
    </Dialog>
  );
}
