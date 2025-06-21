import Link from "next/link";

import {
  NavigationMenu,
  NavigationMenuItem,
  NavigationMenuList,
} from "@/components/ui/navigation-menu";
import { getSession } from "@/lib/auth";

import { UserDropdown } from "./auth/user-dropdown";
import { MobileNav } from "./mobile-nav";
import { NavLink } from "./nav-link";
import { SearchCommand } from "./search-command";
import { ThemeToggle } from "./theme-toggle";
import { Button } from "./ui/button";

export async function SiteNav() {
  const session = await getSession();

  return (
    <div className="flex w-full flex-col">
      <div className="flex items-center justify-between gap-2 px-4 py-2">
        <div className="flex items-center gap-2 md:hidden">
          <MobileNav isAuthenticated={Boolean(session?.user)} />
          <Button asChild size="icon" variant="ghost">
            <Link href="/">🌸</Link>
          </Button>
        </div>

        <div className="hidden items-center gap-2 md:flex">
          <Button asChild size="icon" variant="ghost">
            <Link href="/">🌸</Link>
          </Button>
          <NavigationMenu>
            <NavigationMenuList>
              <NavigationMenuItem>
                <NavLink href="/">Home</NavLink>
              </NavigationMenuItem>
              {session?.user && (
                <>
                  <NavigationMenuItem>
                    <NavLink href="/notes">Browse</NavLink>
                  </NavigationMenuItem>
                  <NavigationMenuItem>
                    <NavLink href="/archives">Archives</NavLink>
                  </NavigationMenuItem>
                </>
              )}
            </NavigationMenuList>
          </NavigationMenu>
        </div>

        <div className="flex items-center gap-1 md:gap-2">
          {session?.user && <SearchCommand />}
          <ThemeToggle />
          <UserDropdown />
        </div>
      </div>
    </div>
  );
}
