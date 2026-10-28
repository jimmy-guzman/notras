import { detectPlatform } from "@tanstack/react-hotkeys";
import {
  queryOptions,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { disable, enable, isEnabled } from "@tauri-apps/plugin-autostart";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import { useEffect } from "react";

import { Chord } from "@/components/chord";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { toast } from "@/components/ui/toast";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { setAppearance } from "@/data/appearance";
import { setNotesDir } from "@/data/notes-dir";
import { appearanceQuery, notesDirQuery } from "@/data/queries";
import { flushPendingWrites } from "@/lib/pending-flush";
import { reclassifyTabs } from "@/lib/tabs/store";
import { reasonOf } from "@/lib/ui/failure";
import { commands } from "@/server/adapters/bindings";
import type { Appearance } from "@/server/adapters/bindings";

interface SettingsDialogProps {
  notesDir: string;
  onOpenChange: (open: boolean) => void;
  open: boolean;
}

// Autostart belongs to the OS and must not be invalidated by index changes.
const autostartQuery = queryOptions({
  queryFn: isEnabled,
  queryKey: ["autostart"] as const,
});

export function SettingsDialog({
  notesDir,
  onOpenChange,
  open,
}: SettingsDialogProps) {
  const queryClient = useQueryClient();

  // Read when the dialog opens, never on launch: nothing else shows it.
  const { data: autostart, error: autostartError } = useQuery({
    ...autostartQuery,
    enabled: open,
  });

  useEffect(() => {
    if (autostartError !== null) {
      toast.add({
        description: reasonOf(autostartError),
        title: "could not read the launch at login setting",
        type: "error",
      });
    }
  }, [autostartError]);

  // The setting exists on macOS alone.
  const appearanceSupported = detectPlatform() === "mac";

  const { data: appearance, error: appearanceError } = useQuery({
    ...appearanceQuery,
    enabled: appearanceSupported,
  });

  // The palette reads it at launch, so a failure waits for the dialog to say so.
  useEffect(() => {
    if (open && appearanceError !== null) {
      toast.add({
        description: reasonOf(appearanceError),
        title: "could not read the appearance",
        type: "error",
      });
    }
  }, [appearanceError, open]);

  const { mutate: writeAppearance } = useMutation({
    mutationFn: setAppearance,
    mutationKey: ["appearance"],
    onError: (error) => {
      toast.add({
        description: reasonOf(error),
        title: "could not change appearance",
        type: "error",
      });
    },
    onMutate: async (value: Appearance) => {
      await queryClient.cancelQueries({ queryKey: appearanceQuery.queryKey });
      queryClient.setQueryData(appearanceQuery.queryKey, value);
    },
    // A later pick is already on screen while an earlier one settles, so only
    // the last pick re-reads what was saved.
    onSettled: async () => {
      if (queryClient.isMutating({ mutationKey: ["appearance"] }) > 1) {
        return;
      }

      await queryClient.invalidateQueries({
        queryKey: appearanceQuery.queryKey,
      });
    },
    // Two quick picks must reach Rust in the order they were made.
    scope: { id: "appearance" },
  });

  const changeNotesDir = async () => {
    try {
      const selected = await openDialog({
        directory: true,
        title: "choose your notes folder",
      });

      if (selected === null) {
        return;
      }

      // A note's save joins onto the current folder, so every buffer lands
      // before the folder moves.
      if (!(await flushPendingWrites())) {
        toast.add({
          description: "An open note could not be saved",
          title: "could not update notes folder",
          type: "error",
        });

        return;
      }

      await setNotesDir(selected);
      // Sessions read the folder from this query, so it refetches before the
      // tabs follow their files.
      await queryClient.invalidateQueries({ queryKey: notesDirQuery.queryKey });
      toast.add({ title: "notes folder updated", type: "success" });
    } catch (error) {
      toast.add({
        description: reasonOf(error),
        title: "could not update notes folder",
        type: "error",
      });

      return;
    }

    try {
      await reclassifyTabs(
        async (paths) => await commands.classifyOpenPaths(paths),
        notesDir
      );
    } catch (error) {
      toast.add({
        description: reasonOf(error),
        title: "could not update open tabs",
        type: "error",
      });
    }

    // A different folder invalidates every read the old one answered.
    await queryClient.invalidateQueries();
  };

  const { isPending: autostartPending, mutate: writeAutostart } = useMutation({
    mutationFn: async (value: boolean) => {
      await (value ? enable() : disable());
    },
    onError: async (error) => {
      toast.add({
        description: reasonOf(error),
        title: "could not update launch at login",
        type: "error",
      });
      // The OS holds the truth, so a failure reverts by re-reading it, and the
      // mutation stays pending until the read lands.
      await queryClient.invalidateQueries({
        queryKey: autostartQuery.queryKey,
      });
    },
    onMutate: (value: boolean) => {
      queryClient.setQueryData(autostartQuery.queryKey, value);
    },
    // Two quick toggles must not reach the OS out of order.
    scope: { id: "autostart" },
  });

  // Base UI hands the change handler a second argument, where `mutate` expects
  // its own options.
  const toggleAutostart = (value: boolean) => {
    writeAutostart(value);
  };

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>settings</DialogTitle>
          <DialogDescription>
            Your notes are plain Markdown files. Point any editor or AI agent at
            the folder.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-5 py-2">
          <div className="flex flex-col gap-1.5">
            <span className="text-sm leading-none font-medium">
              notes folder
            </span>
            <div className="flex items-center gap-2">
              <code className="bg-muted min-w-0 flex-1 truncate rounded-md px-2 py-1.5 text-xs">
                {notesDir}
              </code>
              <Button
                onClick={() => {
                  void changeNotesDir();
                }}
                size="sm"
                variant="outline"
              >
                change...
              </Button>
            </div>
          </div>
          <div className="flex items-center justify-between">
            <Label htmlFor="autostart">launch at login</Label>
            <Switch
              checked={autostart ?? false}
              disabled={
                autostartPending ||
                autostartError !== null ||
                autostart === undefined
              }
              id="autostart"
              onCheckedChange={toggleAutostart}
            />
          </div>
          {appearanceSupported && (
            <div className="flex items-center justify-between">
              <span
                className="text-sm leading-none font-medium"
                id="appearance-label"
              >
                appearance
              </span>
              <ToggleGroup
                aria-labelledby="appearance-label"
                disabled={appearance === undefined}
                onValueChange={([value]) => {
                  // Pressing the chosen item again empties the group.
                  if (value !== undefined) {
                    writeAppearance(value);
                  }
                }}
                size="sm"
                spacing={0}
                value={appearance === undefined ? [] : [appearance]}
                variant="outline"
              >
                <ToggleGroupItem value="auto">auto</ToggleGroupItem>
                <ToggleGroupItem value="light">light</ToggleGroupItem>
                <ToggleGroupItem value="dark">dark</ToggleGroupItem>
              </ToggleGroup>
            </div>
          )}
          <p className="text-muted-foreground text-xs">
            quick capture from anywhere with <Chord hotkey="Mod+Shift+N" />
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
