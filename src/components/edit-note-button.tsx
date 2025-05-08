"use client";

import { PencilIcon, PencilOffIcon } from "lucide-react";

import { Button } from "./ui/button";

interface EditNoteButtonProps {
  isEditing: boolean;
  onClick: () => void;
}

export function EditNoteButton({ isEditing, onClick }: EditNoteButtonProps) {
  return (
    <Button className="h-6 w-6" onClick={onClick} size="icon" variant="ghost">
      {isEditing ? (
        <PencilOffIcon className="h-3 w-3" />
      ) : (
        <PencilIcon className="h-3 w-3" />
      )}
      <span className="sr-only">
        {isEditing ? "Editing (press Esc to cancel)" : "Edit note"}
      </span>
    </Button>
  );
}
