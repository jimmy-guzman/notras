import { LogInIcon } from "lucide-react";
import Link from "next/link";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { getSession } from "@/lib/auth";

import { SignOutMenuItem } from "./sign-out-menu-item";

export const UserDropdown = async () => {
  const session = await getSession();

  if (!session) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <Button asChild size="icon" variant="outline">
            <Link href="/signin">
              <LogInIcon />
            </Link>
          </Button>
        </TooltipTrigger>
        <TooltipContent side="bottom">Sign In</TooltipContent>
      </Tooltip>
    );
  }

  const avatarFallback = (
    session.user.name.trim()
      ? session.user.name
          .trim()
          .split(" ")
          .map(([part]) => part)
          .slice(0, 2)
          .join("")
      : session.user.email.slice(0, 2)
  ).toUpperCase();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          className="relative h-6 w-6 rounded-full"
          size="icon"
          variant="ghost"
        >
          <Avatar className="h-6 w-6">
            {session.user.image ? (
              <AvatarImage alt="avatar" src={session.user.image} />
            ) : (
              <AvatarFallback>{avatarFallback}</AvatarFallback>
            )}
          </Avatar>
        </Button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="w-56" forceMount>
        <DropdownMenuLabel className="font-normal">
          <div className="flex flex-col space-y-1">
            <p className="text-sm leading-none font-medium">
              {session.user.name}
            </p>
            <p className="text-muted-foreground text-xs leading-none">
              {session.user.email}
            </p>
          </div>
        </DropdownMenuLabel>

        <DropdownMenuSeparator />

        <SignOutMenuItem />
      </DropdownMenuContent>
    </DropdownMenu>
  );
};
