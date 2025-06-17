import { parseAsString } from "nuqs";

export const parsers = {
  kind: parseAsString.withDefault("all"),
  sort: parseAsString.withDefault("newest"),
  time: parseAsString.withDefault("all"),
};
