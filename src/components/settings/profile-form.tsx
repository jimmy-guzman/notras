"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useHookFormAction } from "@next-safe-action/adapter-react-hook-form/hooks";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef } from "react";
import { useHotkeys } from "react-hotkeys-hook";
import { toast } from "sonner";

import type { UserProfile } from "@/server/repositories/user-repository";

import { updateProfile } from "@/actions/update-profile";
import { Button } from "@/components/ui/button";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Kbd } from "@/components/ui/kbd";
import { updateProfileSchema } from "@/server/schemas/user-schemas";

interface ProfileFormProps {
  profile: UserProfile;
}

export function ProfileForm({ profile }: ProfileFormProps) {
  const formRef = useRef<HTMLFormElement>(null);
  const router = useRouter();

  const { action, form, handleSubmitWithAction } = useHookFormAction(
    updateProfile,
    zodResolver(updateProfileSchema),
    {
      actionProps: {
        onError({ error }) {
          toast.error(error.serverError ?? "update failed");
        },
        onSuccess({ data }) {
          toast.success(data.message);
        },
      },
      formProps: {
        defaultValues: {
          email: profile.email,
          name: profile.name,
        },
        mode: "onSubmit",
      },
    },
  );

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
    <form
      className="flex flex-col gap-6"
      onSubmit={handleSubmitWithAction}
      ref={formRef}
    >
      <Field data-invalid={Boolean(form.formState.errors.name) || undefined}>
        <FieldLabel htmlFor="name">name</FieldLabel>
        <Input id="name" placeholder="your name" {...form.register("name")} />
        <FieldError>{form.formState.errors.name?.message}</FieldError>
      </Field>

      <Field data-invalid={Boolean(form.formState.errors.email) || undefined}>
        <FieldLabel htmlFor="email">email</FieldLabel>
        <Input
          id="email"
          placeholder="your@email.com"
          type="email"
          {...form.register("email")}
        />
        <FieldError>{form.formState.errors.email?.message}</FieldError>
      </Field>

      <div className="flex justify-end gap-2 pt-4">
        <Button asChild variant="outline">
          <Link href="/">
            cancel
            <span className="hidden gap-0.5 sm:inline-flex">
              <Kbd>esc</Kbd>
            </span>
          </Link>
        </Button>
        <Button disabled={action.isPending} type="submit">
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
