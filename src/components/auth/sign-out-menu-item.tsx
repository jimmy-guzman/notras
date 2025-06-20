"use client";

import { LogOut } from "lucide-react";
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
      <span>Sign Out</span>
      <LogOut className="ml-auto h-4 w-4" />
    </DropdownMenuItem>
  );
};
