"use client";

import { useRouter } from "next/navigation";

import { authClient } from "@/lib/auth-client";

export const SignOutButton = () => {
  const router = useRouter();

  return (
    <button
      className="flex items-center justify-between"
      onClick={async () => {
        await authClient.signOut({
          fetchOptions: {
            onSuccess: () => {
              router.refresh();
            },
          },
        });
      }}
      type="button"
    >
      <span>Sign Out</span> <span className="icon-[lucide--log-out]" />
    </button>
  );
};
