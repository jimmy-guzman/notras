import { redirect, RedirectType } from "next/navigation";

import { LoginForm } from "@/components/auth/login-form";
import { getSession } from "@/lib/auth";

export default async function Page() {
  const session = await getSession();

  if (session?.user) {
    redirect("/", RedirectType.replace);
  }

  return (
    <div className="flex w-full flex-col items-center justify-center bg-background">
      <div className="w-full max-w-sm">
        <LoginForm />
      </div>
    </div>
  );
}
