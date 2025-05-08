import { LogIn } from "lucide-react";
import Link from "next/link";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
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

import { SignOutButton } from "./sign-out-button";

export const UserDropdown = async () => {
  const session = await getSession();

  if (!session) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <Button asChild size="icon" variant="outline">
            <Link href="/signin">
              <LogIn />
            </Link>
          </Button>
        </TooltipTrigger>
        <TooltipContent side="bottom">Sign In</TooltipContent>
      </Tooltip>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          className="relative h-8 w-8 rounded-full"
          size="icon"
          variant="ghost"
        >
          <Avatar className="h-8 w-8">
            {session.user.image ? (
              <AvatarImage alt="avatar" src={session.user.image} />
            ) : (
              <AvatarFallback>{session.user.name[0]}</AvatarFallback>
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

        <DropdownMenuItem>
          <SignOutButton />
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};
