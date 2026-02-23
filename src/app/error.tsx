"use client";

import { RotateCcwIcon, TriangleAlertIcon } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

interface ErrorPageProps {
  reset: () => void;
}

export default function HomeError({ reset }: ErrorPageProps) {
  return (
    <section className="flex w-full flex-1 flex-col items-center justify-center px-4">
      <div className="w-full max-w-md">
        <Alert variant="destructive">
          <TriangleAlertIcon className="h-4 w-4" />
          <AlertTitle>something went wrong</AlertTitle>
          <AlertDescription>
            we couldn&apos;t load this page. please try again.
          </AlertDescription>
        </Alert>

        <div className="mt-4 flex justify-center">
          <Button onClick={reset} size="sm" variant="outline">
            <RotateCcwIcon className="h-4 w-4" />
            try again
          </Button>
        </div>
      </div>
    </section>
  );
}
