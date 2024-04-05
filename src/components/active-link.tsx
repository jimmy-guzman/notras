"use client";
import { type RouteType } from "next/dist/lib/load-custom-routes";
import Link, { type LinkProps } from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/cn";

export const ActiveLink = ({
  href,
  children,
}: Pick<LinkProps<RouteType>, "href" | "children">) => {
  const pathname = usePathname();

  return (
    <Link href={href} className={cn(pathname === href ? "dsy-active" : "")}>
      {children}
    </Link>
  );
};
