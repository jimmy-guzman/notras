"use client";

import type { ReactNode } from "react";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/cn";

export const ActiveLink = ({
  children,
  href,
}: {
  children: ReactNode;
  href: string;
}) => {
  const pathname = usePathname();

  return (
    <Link className={cn(pathname === href ? "dsy-active" : "")} href={href}>
      {children}
    </Link>
  );
};
