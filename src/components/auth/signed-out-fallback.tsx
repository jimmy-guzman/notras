import Link from "next/link";

import { Hero } from "../hero";

export const SignedOutFallback = () => {
  return (
    <section className="mt-4 flex flex-col gap-12 p-4">
      <Hero />
      <p className="text-muted-foreground text-center text-sm italic">
        <Link className="underline underline-offset-4" href="/signin">
          Sign in
        </Link>{" "}
        to make this space yours.
      </p>
    </section>
  );
};
