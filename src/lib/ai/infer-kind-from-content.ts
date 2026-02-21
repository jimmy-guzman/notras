import { OpenAI } from "openai";
import { z } from "zod";

import { env } from "@/env";
import { KIND_VALUES } from "@/lib/kind";

import { getKindPrompt } from "./get-kind-prompt";

const openai = new OpenAI({ apiKey: env.OPENAI_API_KEY });

const kindSchema = z.object({
  kind: z.enum(KIND_VALUES),
});

export async function inferKindFromContent(content: string) {
  try {
    const res = await openai.chat.completions.create({
      messages: [
        {
          content: getKindPrompt(content),
          role: "user",
        },
      ],
      model: "gpt-3.5-turbo-0125",
      temperature: 0,
      tool_choice: {
        function: { name: "classifyNote" },
        type: "function",
      },
      tools: [
        {
          function: {
            name: "classifyNote",
            parameters: {
              properties: {
                kind: {
                  enum: KIND_VALUES,
                  type: "string",
                },
              },
              required: ["kind"],
              type: "object",
            },
          },
          type: "function",
        },
      ],
    });

    const toolCall = res.choices[0].message.tool_calls?.[0];
    const args =
      toolCall?.type === "function" ? toolCall.function.arguments : undefined;
    const parsed = kindSchema.parse(JSON.parse(args ?? "{}"));

    return parsed.kind;
  } catch {
    return "thought";
  }
}
