"use client";

import { ArrowLeftIcon } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useHotkeys } from "react-hotkeys-hook";

import { Button } from "@/components/ui/button";
import { Kbd } from "@/components/ui/kbd";

interface BackLinkProps {
  href: string;
  label: string;
}

export function BackLink({ href, label }: BackLinkProps) {
  const router = useRouter();

  useHotkeys("escape", () => {
    router.push(href);
  });

  return (
    <Button asChild size="sm" variant="ghost">
      <Link href={href}>
        <ArrowLeftIcon className="h-4 w-4" /> {label}
        <span className="hidden sm:inline-flex">
          <Kbd>esc</Kbd>
        </span>
      </Link>
    </Button>
  );
}
