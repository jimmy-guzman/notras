import { cn } from "cn";

import { FailureNotice } from "@/components/failure-notice";
import { tabButtonId, tabPanelId } from "@/lib/tabs/tab";

interface UnreadableFileProps {
  active: boolean;
  id: string;
  reason: string;
  retry: () => void;
  title: string;
}

/** The pane for a tab with no content to protect: it says why the read failed. */
export function UnreadableFile({
  active,
  id,
  reason,
  retry,
  title,
}: UnreadableFileProps) {
  return (
    <div
      aria-labelledby={tabButtonId(id)}
      className={cn("absolute inset-0 flex flex-col", !active && "opacity-0")}
      id={tabPanelId(id)}
      inert={!active}
      role="tabpanel"
    >
      <FailureNotice reason={reason} retry={retry} title={title} />
    </div>
  );
}
