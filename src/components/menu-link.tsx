"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { type ReactNode } from "react";

import { cn } from "@/lib/cn";

export const MenuLink = ({
  to,
  children,
}: {
  to: string;
  children: ReactNode;
}) => {
  const pathname = usePathname();

  return (
    <Link href={to} className={cn(pathname === to ? "dsy-active" : "")}>
      {children}
    </Link>
  );
};
