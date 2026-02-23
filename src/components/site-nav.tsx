import { UserDropdown } from "./auth/user-dropdown";
import { NavLogo } from "./nav-logo";
import { NavNewNote } from "./nav-new-note";
import { NavSearch } from "./nav-search";

export function SiteNav() {
  return (
    <div className="flex w-full flex-col">
      <div className="flex items-center justify-between gap-2 px-4 py-2">
        <div className="shrink-0 items-center gap-2 overflow-visible">
          <NavLogo />
        </div>

        <div className="flex flex-1 items-center justify-center gap-2">
          <NavSearch />
          <NavNewNote />
        </div>

        <div className="flex shrink-0 items-center gap-1 md:gap-2">
          <UserDropdown />
        </div>
      </div>
    </div>
  );
}
