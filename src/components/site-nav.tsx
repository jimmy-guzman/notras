import { NotebookPenIcon } from "lucide-react";
import Link from "next/link";

import { UserDropdown } from "./auth/user-dropdown";
import { NavSearch } from "./nav-search";
import { Button } from "./ui/button";

export function SiteNav() {
  return (
    <div className="flex w-full flex-col">
      <div className="flex items-center justify-between gap-2 px-4 py-2">
        <div className="shrink-0 items-center gap-2">
          <Button asChild size="icon" variant="ghost">
            <Link href="/">
              <NotebookPenIcon />
            </Link>
          </Button>
        </div>

        <NavSearch />

        <div className="flex shrink-0 items-center gap-1 md:gap-2">
          <UserDropdown />
        </div>
      </div>
    </div>
  );
}
