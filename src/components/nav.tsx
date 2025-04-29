import Link from "next/link";
import { Suspense } from "react";

import { Icons } from "./icons";
import { ModeToggle } from "./mode-toggle";
import { ThemeToggle } from "./theme-toggle";
import { UserDropdown } from "./user-dropdown";

export const SiteNav = () => {
  return (
    <nav className="flex w-full flex-col">
      <div className="flex h-16 items-center px-4">
        <div className="flex items-center">
          <Link href="/">
            <Icons.logo className="h-12 w-auto" />
          </Link>
        </div>

        <div className="ml-auto flex items-center space-x-4">
          <Suspense>
            <ModeToggle />
          </Suspense>
          <ThemeToggle />
          <UserDropdown />
        </div>
      </div>
    </nav>
  );
};
