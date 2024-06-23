import Link from "next/link";

import { links } from "@/constants/links";

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
      <div className="dsy-navbar-end">
        <a
          href={links.github}
          target="_blank"
          rel="noreferrer"
          className="dsy-btn dsy-btn-circle dsy-btn-ghost"
        >
          <span className="icon-[simple-icons--github] h-8 w-8 text-white" />
        </a>
        <UserDropdown />
      </div>
    </nav>
  );
};
