import { KIND_DESCRIPTIONS, KIND_VALUES } from "@/lib/kind";

export function getKindPrompt(content: string) {
  const descriptions = KIND_VALUES.map(
    (k) => `- ${k}: ${KIND_DESCRIPTIONS[k]}`,
  ).join("\n");

  return `Classify the following note into one of these kinds:\n\n${descriptions}
  
  If you're unsure, choose "thought".
  
  Note: """${content}"""
  
  Respond with only the kind.`;
}
