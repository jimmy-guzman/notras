"use client";

import { ArrowLeftIcon } from "lucide-react";
import { useRouter } from "next/navigation";

import { Button } from "./ui/button";

export const BackButton = () => {
  const router = useRouter();

  return (
    <Button
      onClick={() => {
        router.back();
      }}
      size="sm"
      variant="ghost"
    >
      <ArrowLeftIcon className="h-4 w-4" /> Back
    </Button>
  );
};
