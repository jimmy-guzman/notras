import { useRouter } from "@tanstack/react-router";
import { disable, enable, isEnabled } from "@tauri-apps/plugin-autostart";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Kbd } from "@/components/ui/kbd";
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

export function SettingsDialog({
  notesDir,
  onOpenChange,
  open,
}: SettingsDialogProps) {
  const router = useRouter();
  const [autostart, setAutostart] = useState(false);
  // The switch cannot claim "off" when the real state is unknown.
  const [autostartReadable, setAutostartReadable] = useState(true);

  useEffect(() => {
    if (open) {
      isEnabled()
        .then((enabled) => {
          setAutostart(enabled);
          setAutostartReadable(true);
        })
        .catch(() => {
          setAutostartReadable(false);
          toast.add({
            title: "could not read the launch at login setting",
            type: "error",
          });
        });
    }
  }, [open]);

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
      await router.invalidate();
      toast.add({ title: "notes folder updated", type: "success" });
    } catch (error) {
      toast.add({
        title: errorMessage(error, "could not change folder"),
        type: "error",
      });
    }
  }, [router]);

  const toggleAutostart = useCallback(async (value: boolean) => {
    setAutostart(value);

    try {
      await (value ? enable() : disable());
    } catch {
      setAutostart(!value);
      toast.add({ title: "could not update launch at login", type: "error" });
    }
  }, []);

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
              checked={autostart}
              disabled={!autostartReadable}
              id="autostart"
              onCheckedChange={toggleAutostart}
            />
          </div>
          <p className="text-muted-foreground text-xs">
            quick capture from anywhere with <Kbd>⌘⇧n</Kbd>
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
