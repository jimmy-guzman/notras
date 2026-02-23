import Link from "next/link";

import { Hero } from "../hero";

export const SignedOutFallback = () => {
  return (
    <section className="mt-4 flex flex-col gap-12 p-4">
      <Hero />
      <p className="text-center text-sm text-muted-foreground italic">
        <Link className="underline underline-offset-4" href="/signin">
          sign in
        </Link>{" "}
        to make this space yours.
      </p>
    </section>
  );
};
