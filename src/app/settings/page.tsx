import { getPreferences } from "@/actions/get-preferences";
import { getProfile } from "@/actions/get-profile";
import { BackLink } from "@/components/back-link";
import { ExportNotes } from "@/components/settings/export-notes";
import { ImportNotes } from "@/components/settings/import-notes";
import { PreferencesForm } from "@/components/settings/preferences-form";
import { ProfileForm } from "@/components/settings/profile-form";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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

      <div className="flex flex-col gap-6">
        <Card>
          <CardHeader>
            <CardTitle>profile</CardTitle>
            <CardDescription>your name and email</CardDescription>
          </CardHeader>
          <CardContent>
            <ProfileForm profile={profile} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>preferences</CardTitle>
            <CardDescription>display and rendering</CardDescription>
          </CardHeader>
          <CardContent>
            <PreferencesForm preferences={preferences} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>sync</CardTitle>
            <CardDescription>export and import notes</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-6">
            <ExportNotes />
            <Separator />
            <ImportNotes />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
