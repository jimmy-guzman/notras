"use client";

import { standardSchemaResolver } from "@hookform/resolvers/standard-schema";
import { onErrorDeferred, onSuccessDeferred } from "@orpc/react";
import { useServerAction } from "@orpc/react/hooks";
import { Schema } from "effect";
import { SaveIcon } from "lucide-react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";

import type { UserProfile } from "@/server/repositories/user-repository";

import { updateProfile } from "@/actions/update-profile";
import { Button } from "@/components/ui/button";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { updateProfileSchema } from "@/server/schemas/user-schemas";

interface ProfileFormProps {
  profile: UserProfile;
}

export function ProfileForm({ profile }: ProfileFormProps) {
  const action = useServerAction(updateProfile, {
    interceptors: [
      onSuccessDeferred((result) => {
        toast.success(result.message);
      }),
      onErrorDeferred(() => {
        toast.error("update failed");
      }),
    ],
  });

  const form = useForm({
    defaultValues: {
      email: profile.email,
      name: profile.name,
    },
    mode: "onSubmit",
    resolver: standardSchemaResolver(
      Schema.standardSchemaV1(updateProfileSchema),
    ),
  });

  const handleSubmit = form.handleSubmit(async (data) => {
    await action.execute(data);
  });

  return (
    <form className="flex flex-col gap-6" onSubmit={handleSubmit}>
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

      <div className="flex justify-end pt-4">
        <Button disabled={action.isPending} type="submit">
          <SaveIcon className="h-4 w-4" />
          save
        </Button>
      </div>
    </form>
  );
}
