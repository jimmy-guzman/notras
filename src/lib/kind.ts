export const KIND_VALUES = [
  "memory",
  "dream",
  "idea",
  "thought",
  "todo",
  "observation",
  "question",
] as const;

export type Kind = (typeof KIND_VALUES)[number];

export const KIND_LABELS = {
  dream: "Dream",
  idea: "Idea",
  memory: "Memory",
  observation: "Observation",
  question: "Question",
  thought: "Thought",
  todo: "Todo",
} satisfies Record<Kind, string>;
