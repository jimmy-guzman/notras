import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@/components/ui/empty";

interface FailureNoticeProps {
  reason: string | undefined;
  retry: () => void;
  title: string;
}

/** What failed, why when there is a reason, and the way to try again. */
export function FailureNotice({ reason, retry, title }: FailureNoticeProps) {
  return (
    <Empty>
      <EmptyHeader>
        <EmptyTitle>{title}</EmptyTitle>
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
  );
}
