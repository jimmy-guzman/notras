import { InfoIcon } from "lucide-react";

import {
  getOverdueReminders,
  getUpcomingReminders,
} from "@/actions/get-reminders";
import { RemindersList } from "@/components/reminders/reminders-list";
import { Alert, AlertDescription } from "@/components/ui/alert";

export default async function RemindersPage() {
  const [overdue, upcoming] = await Promise.all([
    getOverdueReminders(),
    getUpcomingReminders(),
  ]);

  const isEmpty = overdue.length === 0 && upcoming.length === 0;

  return (
    <div className="container mx-auto px-4 py-6">
      {isEmpty ? (
        <Alert className="text-center">
          <InfoIcon className="h-4 w-4" />
          <AlertDescription>
            no reminders set. add a reminder to a note to see it here.
          </AlertDescription>
        </Alert>
      ) : (
        <RemindersList overdue={overdue} upcoming={upcoming} />
      )}
    </div>
  );
}
