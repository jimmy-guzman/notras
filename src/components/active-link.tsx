"use client";
import type { RouteType } from "next/dist/lib/load-custom-routes";
import type { LinkProps } from "next/link";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/cn";

export const ActiveLink = ({
  children,
  href,
}: Pick<LinkProps<RouteType>, "children" | "href">) => {
  const pathname = usePathname();

  return (
    <Link className={cn(pathname === href ? "dsy-active" : "")} href={href}>
      {children}
    </Link>
  );
};
