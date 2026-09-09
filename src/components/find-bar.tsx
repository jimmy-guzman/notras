import { useSelector } from "@tanstack/react-store";
import { ArrowDownIcon, ArrowUpIcon, XIcon } from "lucide-react";
import { type ChangeEvent, useCallback, useEffect, useRef } from "react";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
  InputGroupText,
} from "@/components/ui/input-group";
import type { createFindController } from "@/lib/ui/find";

function isFindNavigation(event: KeyboardEvent, inInput: boolean) {
  if (event.altKey) {
    return false;
  }
  const command = event.metaKey || event.ctrlKey;
  return command
    ? event.key.toLowerCase() === "g"
    : inInput && event.key === "Enter";
}

interface FindBarProps {
  controller: ReturnType<typeof createFindController>;
}

export function FindBar({ controller }: FindBarProps) {
  const state = useSelector(controller.store);
  const input = useRef<HTMLInputElement>(null);
  const change = useCallback(
    (event: ChangeEvent<HTMLInputElement>) =>
      controller.setQuery(event.target.value),
    [controller]
  );
  const previous = useCallback(() => controller.navigate(-1), [controller]);
  const next = useCallback(() => controller.navigate(1), [controller]);
  useEffect(() => {
    if (state.open && state.available && state.focusRequest > 0) {
      input.current?.focus({ preventScroll: true });
      input.current?.select();
    }
  }, [state.available, state.focusRequest, state.open]);
  useEffect(() => {
    if (!state.available) {
      return;
    }
    const keydown = (event: KeyboardEvent) => {
      if (event.isComposing) {
        return;
      }
      const inInput = event.target === input.current;
      const inSurface =
        event.target instanceof Element &&
        event.target.closest(".ProseMirror, .note-find-bar") !== null;
      if (!inSurface) {
        return;
      }
      const navigation = isFindNavigation(event, inInput);
      const close = state.open && event.key === "Escape";
      if (!(close || navigation)) {
        return;
      }
      event.preventDefault();
      // Capture Escape must end here before quick capture's save binding.
      event.stopImmediatePropagation();
      if (event.key === "Escape") {
        controller.close();
      } else {
        controller.navigate(event.shiftKey ? -1 : 1);
      }
    };
    document.addEventListener("keydown", keydown, true);
    return () => document.removeEventListener("keydown", keydown, true);
  }, [controller, state.available, state.open]);
  if (!(state.open && state.available)) {
    return null;
  }
  return (
    <div className="note-find-bar absolute top-2 right-3 left-3 ml-auto max-w-sm rounded-4xl bg-popover shadow-md">
      <InputGroup aria-label="find in note">
        <InputGroupInput
          aria-label="find text"
          onChange={change}
          placeholder="find in note..."
          ref={input}
          value={state.query}
        />
        <InputGroupAddon align="inline-end">
          <InputGroupText
            aria-live="polite"
            className="whitespace-nowrap tabular-nums"
          >
            {state.current} / {state.total}
          </InputGroupText>
          <InputGroupButton
            aria-label="previous match"
            disabled={state.total === 0}
            onClick={previous}
            size="icon-xs"
          >
            <ArrowUpIcon />
          </InputGroupButton>
          <InputGroupButton
            aria-label="next match"
            disabled={state.total === 0}
            onClick={next}
            size="icon-xs"
          >
            <ArrowDownIcon />
          </InputGroupButton>
          <InputGroupButton
            aria-label="close find"
            onClick={controller.close}
            size="icon-xs"
          >
            <XIcon />
          </InputGroupButton>
        </InputGroupAddon>
      </InputGroup>
    </div>
  );
}
