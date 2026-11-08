import { FailureNotice } from "@/components/failure-notice";

interface WorkspaceErrorProps {
  reason: string | undefined;
  retry: () => void;
}

/** The screen for a failure that stopped the workspace from rendering. */
export function WorkspaceError({ reason, retry }: WorkspaceErrorProps) {
  return (
    <div className="bg-background text-foreground flex h-svh">
      <FailureNotice
        reason={reason}
        retry={retry}
        title="could not load the workspace"
      />
    </div>
  );
}
