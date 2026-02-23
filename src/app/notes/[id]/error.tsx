"use client";

import { ArrowLeftIcon, RotateCcwIcon, TriangleAlertIcon } from "lucide-react";
import Link from "next/link";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

interface ErrorPageProps {
  reset: () => void;
}

export default function NoteDetailError({ reset }: ErrorPageProps) {
  return (
    <div className="container mx-auto px-4 py-6">
      <div className="mb-6">
        <Button asChild size="sm" variant="ghost">
          <Link href="/notes">
            <ArrowLeftIcon className="h-4 w-4" /> notes
          </Link>
        </Button>
      </div>

      <Alert variant="destructive">
        <TriangleAlertIcon className="h-4 w-4" />
        <AlertTitle>something went wrong</AlertTitle>
        <AlertDescription>
          we couldn&apos;t load this note. please try again.
        </AlertDescription>
      </Alert>

      <div className="mt-4 flex justify-start">
        <Button onClick={reset} size="sm" variant="outline">
          <RotateCcwIcon className="h-4 w-4" />
          try again
        </Button>
      </div>
    </div>
  );
}
