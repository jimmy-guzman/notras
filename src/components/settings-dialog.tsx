import {
  queryOptions,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { disable, enable, isEnabled } from "@tauri-apps/plugin-autostart";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import { useCallback, useEffect } from "react";
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
import { setNotesDir } from "@/data/notes-dir";
import { errorMessage } from "@/lib/ui/failure";

interface SettingsDialogProps {
  notesDir: string;
  onOpenChange: (open: boolean) => void;
  open: boolean;
}

/**
 * Launch at login, owned by the OS rather than the index, so it is keyed here
 * rather than in `src/data/queries.ts` alongside the reads that go through the
 * Effect runtime.
 */
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
  const { data: autostart, isError: autostartUnreadable } = useQuery({
    ...autostartQuery,
    enabled: open,
  });

  useEffect(() => {
    if (autostartUnreadable) {
      toast.add({
        title: "could not read the launch at login setting",
        type: "error",
      });
    }
  }, [autostartUnreadable]);

  const changeNotesDir = useCallback(async () => {
    try {
      const selected = await openDialog({
        directory: true,
        title: "choose your notes folder",
      });

      if (typeof selected !== "string") {
        return;
      }

      await setNotesDir(selected);
      // A different folder invalidates every read the old one answered.
      await queryClient.invalidateQueries();
      toast.add({ title: "notes folder updated", type: "success" });
    } catch (error) {
      toast.add({
        title: errorMessage(error, "could not change folder"),
        type: "error",
      });
    }
  }, [queryClient]);

  const { isPending: autostartPending, mutate: writeAutostart } = useMutation({
    mutationFn: (value: boolean) => (value ? enable() : disable()),
    onError: () => {
      // The OS holds the truth, so a failure reverts by re-reading it.
      queryClient.invalidateQueries({ queryKey: autostartQuery.queryKey });
      toast.add({ title: "could not update launch at login", type: "error" });
    },
    onMutate: (value: boolean) => {
      queryClient.setQueryData(autostartQuery.queryKey, value);
    },
    // Two quick toggles must not reach the OS out of order.
    scope: { id: "autostart" },
  });

  // Base UI hands the change handler a second argument, where `mutate` expects
  // its own options.
  const toggleAutostart = useCallback(
    (value: boolean) => {
      writeAutostart(value);
    },
    [writeAutostart]
  );

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>settings</DialogTitle>
          <DialogDescription>
            your notes are plain markdown files -- point any editor or ai agent
            at the folder.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-5 py-2">
          <div className="flex flex-col gap-1.5">
            <Label>notes folder</Label>
            <div className="flex items-center gap-2">
              <code className="min-w-0 flex-1 truncate rounded-md bg-muted px-2 py-1.5 text-xs">
                {notesDir}
              </code>
              <Button onClick={changeNotesDir} size="sm" variant="outline">
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
                autostartUnreadable ||
                autostart === undefined
              }
              id="autostart"
              onCheckedChange={toggleAutostart}
            />
          </div>
          <p className="text-muted-foreground text-xs">
            quick capture from anywhere with <Chord hotkey="Mod+Shift+N" />
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
