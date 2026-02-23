"use client";

import { LogOutIcon } from "lucide-react";
import { useRouter } from "next/navigation";

import { authClient } from "@/lib/auth-client";

import { DropdownMenuItem } from "../ui/dropdown-menu";

export const SignOutMenuItem = () => {
  const router = useRouter();

  return (
    <DropdownMenuItem
      onClick={async () => {
        await authClient.signOut({
          fetchOptions: {
            onSuccess: () => {
              router.refresh();
            },
          },
        });
      }}
    >
      <span>sign out</span>
      <LogOutIcon className="ml-auto h-4 w-4" />
    </DropdownMenuItem>
  );
};
