"use client";

/**
 * A safe wrapper around `next/link` for use within Radix UI `NavigationMenuLink`.
 *
 * This avoids hydration issues when used inside `asChild` by ensuring
 * the link is rendered as a Client Component.
 *
 * Also sets the `active` prop on `NavigationMenuLink` based on current pathname.
 */
import type { LinkProps } from "next/link";
import type { ReactNode } from "react";

import NextLink from "next/link";
import { usePathname } from "next/navigation";

import {
  NavigationMenuLink,
  navigationMenuTriggerStyle,
} from "./ui/navigation-menu";

export const NavLink = ({
  href,
  ...props
}: LinkProps & { children: ReactNode }) => {
  const pathname = usePathname();
  const isActive = href === pathname;

  return (
    <NavigationMenuLink active={isActive} asChild>
      <NextLink
        className={navigationMenuTriggerStyle()}
        href={href}
        {...props}
      />
    </NavigationMenuLink>
  );
};
