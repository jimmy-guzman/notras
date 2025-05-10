import { OpenAI } from "openai";

import { env } from "@/env";

const openai = new OpenAI({ apiKey: env.OPENAI_API_KEY });

export async function generateEmbedding(input: string): Promise<number[]> {
  const res = await openai.embeddings.create({
    input,
    model: "text-embedding-3-small",
  });

  return res.data[0].embedding;
}
