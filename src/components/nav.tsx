import Link from "next/link";

import { User } from "./user";

export const Nav = () => {
  return (
    <nav className="dsy-navbar static w-full lg:sticky lg:top-0 lg:z-30 lg:backdrop-blur">
      <div className="flex-1">
        <Link
          href="/"
          className="dsy-btn dsy-btn-ghost bg-gradient-to-r from-primary to-secondary bg-clip-text text-xl text-transparent"
        >
          Next.js Starter
        </Link>
      </div>
      <div className="flex-none">
        <User />
      </div>
    </nav>
  );
};
