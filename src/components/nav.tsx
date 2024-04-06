import Link from "next/link";

import { UserDropdown } from "./user-dropdown";

export const Nav = () => {
  return (
    <nav className="dsy-navbar static w-full lg:sticky lg:top-0 lg:z-30 lg:backdrop-blur">
      <div className="flex-1">
        <Link
          href="/"
          className="dsy-btn dsy-btn-ghost bg-gradient-to-r from-primary via-secondary to-accent bg-clip-text text-xl text-transparent"
        >
          Next.js Starter
        </Link>
      </div>
      <div className="flex-none">
        <UserDropdown />
      </div>
    </nav>
  );
};
