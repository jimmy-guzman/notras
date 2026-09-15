import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@/components/ui/empty";

interface WorkspaceErrorProps {
  reason: string | undefined;
  retry: () => void;
}

/** The screen for a failure that stopped the workspace from rendering. */
export function WorkspaceError({ reason, retry }: WorkspaceErrorProps) {
  return (
    <div className="bg-background text-foreground flex h-svh">
      <Empty>
        <EmptyHeader>
          <EmptyTitle>could not load the workspace</EmptyTitle>
          {reason === undefined ? null : (
            <EmptyDescription>{reason}</EmptyDescription>
          )}
        </EmptyHeader>
        <EmptyContent>
          <Button onClick={retry} variant="outline">
            try again
          </Button>
        </EmptyContent>
      </Empty>
    </div>
  );
}
