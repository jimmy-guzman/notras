import { ArrowLeftIcon } from "lucide-react";
import Link from "next/link";

import { getProfile } from "@/actions/get-profile";
import { ProfileForm } from "@/components/settings/profile-form";
import { Button } from "@/components/ui/button";

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

      <ProfileForm profile={profile} />
    </div>
  );
}
