"use client";

import { PencilIcon, PencilOffIcon } from "lucide-react";

import { Button } from "./ui/button";

interface EditNoteButtonProps {
  isEditing: boolean;
  onClick: () => void;
}

export function EditNoteButton({ isEditing, onClick }: EditNoteButtonProps) {
  return (
    <Button onClick={onClick} size="icon" variant="ghost">
      {isEditing ? (
        <PencilOffIcon className="h-4 w-4" />
      ) : (
        <PencilIcon className="h-4 w-4" />
      )}
      <span className="sr-only">
        {isEditing ? "Editing (press Esc to cancel)" : "Edit note"}
      </span>
    </Button>
  );
}
