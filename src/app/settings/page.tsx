import { ArrowLeftIcon } from "lucide-react";
import Link from "next/link";

import { getProfile } from "@/actions/get-profile";
import { ExportNotes } from "@/components/settings/export-notes";
import { ImportNotes } from "@/components/settings/import-notes";
import { ProfileForm } from "@/components/settings/profile-form";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";

export default async function SettingsPage() {
  const profile = await getProfile();

  return (
    <div className="container mx-auto px-4 py-6">
      <div className="mb-6">
        <Button asChild size="sm" variant="ghost">
          <Link href="/">
            <ArrowLeftIcon className="h-4 w-4" /> home
          </Link>
        </Button>
      </div>

      <h2 className="mb-4 text-lg font-medium">profile</h2>

      <ProfileForm profile={profile} />

      <Separator className="my-8" />

      <h2 className="mb-4 text-lg font-medium">sync</h2>

      <div className="flex flex-col gap-8">
        <ExportNotes />
        <ImportNotes />
      </div>
    </div>
  );
}
