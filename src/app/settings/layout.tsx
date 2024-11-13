import type { ReactNode } from "react";

import { ActiveLink } from "@/components/active-link";

export default function Layout({
  children,
}: Readonly<{ children: ReactNode }>) {
  return (
    <div className="mt-16 px-4 md:container md:mx-auto">
      <div className="grid gap-4 sm:grid-cols-12">
        <ul className="dsy-menu dsy-menu-horizontal sm:dsy-menu-vertical sm:col-span-2">
          <li>
            <ActiveLink href="/settings/profile">Profile</ActiveLink>
          </li>
          <li>
            <ActiveLink href="/settings/theme">Theme</ActiveLink>
          </li>
        </ul>
        <div className="grid gap-8 sm:col-span-10">
          <div className="prose dsy-prose ">
            <h1>Settings</h1>
          </div>
          <div className="rounded-box border border-neutral p-4">
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}
