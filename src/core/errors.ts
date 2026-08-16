import { Schema } from "effect";

export class DatabaseError extends Schema.TaggedError<DatabaseError>()(
  "DatabaseError",
  {
    cause: Schema.Defect(),
  },
) {}

export class FileError extends Schema.TaggedError<FileError>()("FileError", {
  message: Schema.String,
}) {}
