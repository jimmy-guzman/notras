"use client";

import { DownloadIcon } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";

export function ExportNotes() {
  const [isExporting, setIsExporting] = useState(false);

  async function handleExport() {
    setIsExporting(true);

    try {
      const response = await fetch("/api/export");

      if (!response.ok) {
        throw new Error("export failed");
      }

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);

      const a = document.createElement("a");

      a.href = url;
      a.download =
        response.headers
          .get("Content-Disposition")
          ?.match(/filename="(.+)"/)?.[1] ?? "notras-export.zip";
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setIsExporting(false);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-muted-foreground">
        export all notes and attachments as a zip file.
      </p>
      <div className="flex justify-end">
        <Button disabled={isExporting} onClick={handleExport}>
          <DownloadIcon className="h-4 w-4" />
          export notes
        </Button>
      </div>
    </div>
  );
}
