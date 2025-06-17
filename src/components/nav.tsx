import Link from "next/link";

import {
  NavigationMenu,
  NavigationMenuItem,
  NavigationMenuLink,
  NavigationMenuList,
  navigationMenuTriggerStyle,
} from "@/components/ui/navigation-menu";
import { getSession } from "@/lib/auth";

import { SearchCommand } from "./search-command";
import { ThemeToggle } from "./theme-toggle";
import { Button } from "./ui/button";
import { UserDropdown } from "./user-dropdown";

export const SiteNav = async () => {
  const session = await getSession();

  return (
    <div className="flex w-full flex-col">
      <div className="flex items-center px-4">
        <div className="flex items-center space-x-6">
          <Button asChild size="lg" variant="ghost">
            <Link className="text-xl" href="/">
              🌸 notras
            </Link>
          </Button>
          {session?.user && (
            <NavigationMenu>
              <NavigationMenuList>
                <NavigationMenuItem>
                  <NavigationMenuLink asChild>
                    <Link
                      className={navigationMenuTriggerStyle()}
                      href="/notes"
                    >
                      Browse
                    </Link>
                  </NavigationMenuLink>
                </NavigationMenuItem>
              </NavigationMenuList>
            </NavigationMenu>
          )}
        </div>
        <div className="ml-auto flex items-center space-x-4">
          {session?.user && <SearchCommand />}
          <ThemeToggle />
          <UserDropdown />
        </div>
      </div>
    </div>
  );
};
