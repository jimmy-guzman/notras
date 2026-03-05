import { z } from "zod";

export const createFolderSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "name is required")
    .max(100, "name is too long"),
});

export const renameFolderSchema = z.object({
  folderId: z.string().min(1, "folder id is required"),
  name: z
    .string()
    .trim()
    .min(1, "name is required")
    .max(100, "name is too long"),
});
