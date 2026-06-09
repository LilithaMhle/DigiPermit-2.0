import { generateText } from "ai";
import { z } from "zod";

function extractJson(text: string): string {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const raw = (fenced ? fenced[1] : text).trim();
  const first = raw.indexOf("{");
  const firstArr = raw.indexOf("[");
  const start =
    first === -1 ? firstArr : firstArr === -1 ? first : Math.min(first, firstArr);
  if (start === -1) return raw;
  const last = Math.max(raw.lastIndexOf("}"), raw.lastIndexOf("]"));
  return raw.slice(start, last === -1 ? raw.length : last + 1);
}

export async function generateStructured<T>(opts: {
  model: Parameters<typeof generateText>[0]["model"];
  system: string;
  prompt: string;
  schema: z.ZodType<T>;
}): Promise<T> {
  const { model, system, prompt, schema } = opts;
  let schemaText = "";
  try {
    schemaText = JSON.stringify(z.toJSONSchema(schema));
  } catch {
    schemaText = "";
  }
  const jsonSystem =
    system +
    "\n\nYou MUST respond with ONLY a single valid minified JSON object — no prose, no markdown fences, no commentary." +
    "\nThe JSON MUST conform exactly to this JSON Schema (use these exact property names, types, and enum values):" +
    `\n${schemaText}` +
    "\nDo NOT wrap the object in another key (e.g. no {\"data\":...}, no {\"output\":...}). Return the object itself. If a value is unknown, choose the most reasonable default that satisfies the schema.";

  let lastErr: unknown;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const { text } = await generateText({ model, system: jsonSystem, prompt });
      const json = extractJson(text);
      let parsed = JSON.parse(json);
      // Unwrap common wrappers the model sometimes adds
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        const keys = Object.keys(parsed);
        if (keys.length === 1 && ["data", "output", "result", "response"].includes(keys[0])) {
          parsed = (parsed as Record<string, unknown>)[keys[0]];
        }
      }
      return schema.parse(parsed);
    } catch (err) {
      lastErr = err;
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
}