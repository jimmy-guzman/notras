"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useActionState, useEffect, useRef } from "react";
import { useHotkeys } from "react-hotkeys-hook";
import { toast } from "sonner";

import type { UpdateProfileState } from "@/actions/update-profile";
import type { UserProfile } from "@/server/repositories/user-repository";

import { updateProfile } from "@/actions/update-profile";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Kbd } from "@/components/ui/kbd";
import { Label } from "@/components/ui/label";

const initialState: UpdateProfileState = {
  success: false,
};

interface ProfileFormProps {
  profile: UserProfile;
}

export function ProfileForm({ profile }: ProfileFormProps) {
  const [state, formAction, isPending] = useActionState(
    updateProfile,
    initialState,
  );
  const formRef = useRef<HTMLFormElement>(null);
  const router = useRouter();

  useEffect(() => {
    if (state.success && state.message) {
      toast.success(state.message);
    }
  }, [state]);

  useHotkeys(
    "mod+enter",
    () => {
      formRef.current?.requestSubmit();
    },
    { enableOnFormTags: ["INPUT"] },
  );

  useHotkeys(
    "escape",
    () => {
      router.push("/");
    },
    { enableOnFormTags: ["INPUT"] },
  );

  return (
    <form action={formAction} className="flex flex-col gap-6" ref={formRef}>
      <div className="flex flex-col gap-2">
        <Label htmlFor="name">name</Label>
        <Input
          aria-invalid={state.errors?.name ? true : undefined}
          defaultValue={profile.name}
          id="name"
          name="name"
          placeholder="your name"
        />
        {state.errors?.name && (
          <p className="text-sm text-destructive">{state.errors.name[0]}</p>
        )}
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="email">email</Label>
        <Input
          aria-invalid={state.errors?.email ? true : undefined}
          defaultValue={profile.email}
          id="email"
          name="email"
          placeholder="your@email.com"
          type="email"
        />
        {state.errors?.email && (
          <p className="text-sm text-destructive">{state.errors.email[0]}</p>
        )}
      </div>

      <div className="flex justify-end gap-2 pt-4">
        <Button asChild variant="outline">
          <Link href="/">
            cancel
            <span className="hidden gap-0.5 sm:inline-flex">
              <Kbd>esc</Kbd>
            </span>
          </Link>
        </Button>
        <Button disabled={isPending} type="submit">
          save
          <span className="hidden gap-0.5 sm:inline-flex">
            <Kbd>⌘</Kbd>
            <Kbd>⏎</Kbd>
          </span>
        </Button>
      </div>
    </form>
  );
}
