import { Data } from "effect";

export class DatabaseError extends Data.TaggedError("DatabaseError")<{
  cause: unknown;
}> {}

export class FileError extends Data.TaggedError("FileError")<{
  message: string;
}> {}
