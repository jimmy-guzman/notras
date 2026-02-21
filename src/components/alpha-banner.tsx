"use client";

import { TriangleAlertIcon, XIcon } from "lucide-react";
import { useEffect, useState } from "react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

export function AlphaBanner() {
  const [dismissed, setDismissed] = useState(false);
  const [hasMounted, setHasMounted] = useState(false);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- TODO
    setDismissed(localStorage.getItem("alphaBannerDismissed") === "true");

    setHasMounted(true);
  }, []);

  const handleDismiss = () => {
    localStorage.setItem("alphaBannerDismissed", "true");
    setDismissed(true);
  };

  if (!hasMounted || dismissed) return null;

  return (
    <Alert
      className="bg-muted flex items-center justify-between rounded-none border-0 px-4 py-2"
      variant="default"
    >
      <div className="flex items-center gap-2">
        <TriangleAlertIcon className="text-muted-foreground h-4 w-4" />
        <AlertDescription className="text-muted-foreground text-xs">
          Notras is in early alpha. Expect bugs, missing features, and possible
          data loss.
        </AlertDescription>
      </div>
      <Button
        className="h-6 w-6"
        onClick={handleDismiss}
        size="icon"
        variant="ghost"
      >
        <span className="sr-only">Close Banner</span>
        <XIcon className="h-3 w-3" />
      </Button>
    </Alert>
  );
}
