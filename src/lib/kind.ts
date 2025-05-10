export const KIND_VALUES = [
  "memory",
  "dream",
  "thought",
  "todo",
  "question",
] as const;

export type Kind = (typeof KIND_VALUES)[number];

export const KIND_LABELS = {
  dream: "Dream",
  memory: "Memory",
  question: "Question",
  thought: "Thought",
  todo: "Todo",
} satisfies Record<Kind, string>;

export const KIND_DESCRIPTIONS = {
  dream: "Something from sleep or imagination",
  memory: "Something you want to remember",
  question: "Something you're wondering about",
  thought: "A passing idea or reflection",
  todo: "Something to do or take care of",
} satisfies Record<Kind, string>;
