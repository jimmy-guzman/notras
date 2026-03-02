import { Suspense } from "react";

import { NavLogo } from "./nav-logo";
import { NavNewNote } from "./nav-new-note";
import { NavReminders } from "./nav-reminders";
import { NavSearch } from "./nav-search";
import { NavSettings } from "./nav-settings";

export function SiteNav() {
  return (
    <div className="flex w-full flex-col gap-2 px-4 py-2">
      <div className="flex items-center justify-between gap-2">
        <div className="shrink-0 items-center gap-2 overflow-visible">
          <NavLogo />
        </div>

        <div className="hidden flex-1 items-center justify-center gap-2 sm:flex">
          <Suspense>
            <NavSearch layoutId="search-bar" />
          </Suspense>
          <NavNewNote />
        </div>

        <div className="flex shrink-0 items-center gap-1">
          <div className="sm:hidden">
            <NavNewNote />
          </div>
          <NavReminders />
          <NavSettings />
        </div>
      </div>

      <div className="sm:hidden">
        <Suspense>
          <NavSearch />
        </Suspense>
      </div>
    </div>
  );
}
