"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { authClient } from "@/lib/auth-client";

import { ContinueWithGitHub } from "./sign-in-button";

const formSchema = z.object({
  email: z.string().email({ message: "Please enter a valid email address." }),
});

export function LoginForm() {
  const form = useForm<z.infer<typeof formSchema>>({
    defaultValues: {
      email: "",
    },
    resolver: zodResolver(formSchema),
  });

  async function onSubmit(values: z.infer<typeof formSchema>) {
    const { error } = await authClient.signIn.magicLink({
      callbackURL: "/",
      email: values.email,
    });

    if (error) {
      form.setError("email", { message: error.message });
    } else {
      form.reset();
      toast.success("Check your email for a magic link.");
    }
  }

  return (
    <Form {...form}>
      <form
        className="flex flex-col gap-6"
        onSubmit={form.handleSubmit(onSubmit)}
      >
        <div className="flex flex-col items-center gap-2">
          <Link
            className="flex flex-col items-center gap-2 font-medium"
            href="/"
          >
            <span className="sr-only">Notras</span>
          </Link>
          <h1 className="text-xl font-bold">Welcome to Notras</h1>
        </div>

        <div className="flex flex-col gap-6">
          <FormField
            control={form.control}
            name="email"
            render={({ field }) => {
              return (
                <FormItem>
                  <FormLabel>Email</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="m@example.com"
                      type="email"
                      {...field}
                      disabled={form.formState.isSubmitting}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              );
            }}
          />

          <Button
            className="w-full"
            disabled={form.formState.isSubmitting}
            type="submit"
          >
            {form.formState.isSubmitting ? "Sending..." : "Login"}
          </Button>

          <div className="after:border-border relative text-center text-sm after:absolute after:inset-0 after:top-1/2 after:z-0 after:flex after:items-center after:border-t">
            <span className="bg-background text-muted-foreground relative z-10 px-2">
              Or
            </span>
          </div>

          <div className="grid gap-4">
            <ContinueWithGitHub />
          </div>
        </div>
      </form>
    </Form>
  );
}
