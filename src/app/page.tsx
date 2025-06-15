import { getNotesCount } from "@/actions/get-notes";
import { Hero } from "@/components/hero";
import { QuickNoteInput } from "@/components/quick-note-input";
import { SignedOutFallback } from "@/components/signed-out-fallback";
import { SupportNotras } from "@/components/support-notras";
import { WelcomeBack } from "@/components/welcome-back";
import { getSession } from "@/lib/auth";

export default async function Page() {
  const session = await getSession();

  if (!session?.session) return <SignedOutFallback />;

  const count = await getNotesCount();

  return (
    <section className="mt-4 flex w-full flex-1 flex-col items-center justify-center gap-4">
      {count > 0 ? <WelcomeBack name={session.user.name} /> : <Hero />}
      <QuickNoteInput />
      <SupportNotras />
    </section>
  );
}
