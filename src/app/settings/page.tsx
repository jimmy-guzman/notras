import { getPreferences } from "@/actions/get-preferences";
import { getProfile } from "@/actions/get-profile";
import { BackLink } from "@/components/back-link";
import { ExportNotes } from "@/components/settings/export-notes";
import { ImportNotes } from "@/components/settings/import-notes";
import { PreferencesForm } from "@/components/settings/preferences-form";
import { ProfileForm } from "@/components/settings/profile-form";
import { Separator } from "@/components/ui/separator";

export default async function SettingsPage() {
  const [preferences, profile] = await Promise.all([
    getPreferences(),
    getProfile(),
  ]);

  return (
    <div className="container mx-auto px-4 py-6">
      <div className="mb-6">
        <BackLink href="/" label="home" />
      </div>

      <h1 className="mb-6 text-2xl font-semibold">settings</h1>

      <h2 className="mb-4 text-lg font-medium">profile</h2>

      <ProfileForm profile={profile} />

      <Separator className="my-8" />

      <h2 className="mb-4 text-lg font-medium">preferences</h2>

      <PreferencesForm preferences={preferences} />

      <Separator className="my-8" />

      <h2 className="mb-4 text-lg font-medium">sync</h2>

      <div className="flex flex-col gap-8">
        <ExportNotes />
        <ImportNotes />
      </div>
    </div>
  );
}
