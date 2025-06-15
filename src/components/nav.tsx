import Link from "next/link";

import { getSession } from "@/lib/auth";

import { SearchCommand } from "./search-command";
import { ThemeToggle } from "./theme-toggle";
import { UserDropdown } from "./user-dropdown";

export const SiteNav = async () => {
  const session = await getSession();

  return (
    <nav className="flex w-full flex-col">
      <div className="flex items-center px-4">
        <div className="flex items-center">
          <Link
            className="text-foreground hover:text-primary text-2xl font-semibold tracking-tight transition-colors"
            href="/"
          >
            🌸 notras
          </Link>
        </div>
        <div className="ml-auto flex items-center space-x-4">
          {session?.user && <SearchCommand />}
          <ThemeToggle />
          <UserDropdown />
        </div>
      </div>
    </nav>
  );
};
