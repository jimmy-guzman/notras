import { redirect, RedirectType } from "next/navigation";

import { LoginForm } from "@/components/login-form";
import { getSession } from "@/lib/auth";

export default async function Page() {
  const session = await getSession();

  if (session?.user) {
    redirect("/", RedirectType.replace);
  }

  return (
    <div className="bg-background flex w-full flex-col items-center justify-center">
      <div className="w-full max-w-sm">
        <LoginForm />
      </div>
    </div>
  );
}
