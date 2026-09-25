import { politeFetchText } from "./http";

export const MIN_DURATION = 20;
export const MAX_DURATION = 240;
const BATCH_SIZE = 60;
const DESCRIPTION_CHARS = 160;

export type DurationRequest = { id: string; name: string; city: string; description: string };

// Asks the language model for typical visit lengths in batches. Returns only the ids the model
// answered with a usable number; callers fall back to category defaults for the rest.
export async function estimateDurations(
  items: DurationRequest[],
  { apiKey, model }: { apiKey: string; model: string },
  log: (message: string) => void,
): Promise<Map<string, number>> {
  const result = new Map<string, number>();
  for (let i = 0; i < items.length; i += BATCH_SIZE) {
    const batch = items.slice(i, i + BATCH_SIZE);
    try {
      const ids = new Set(batch.map((b) => b.id));
      const contentOf = (text: string): string => JSON.parse(text).choices?.[0]?.message?.content ?? "";
      const text = await politeFetchText(
        "https://openrouter.ai/api/v1/chat/completions",
        {
          method: "POST",
          headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
          body: JSON.stringify({ model, messages: [{ role: "user", content: durationPrompt(batch) }] }),
        },
        (text) => parseDurationReply(contentOf(text), ids).size > 0,
      );
      const parsed = parseDurationReply(contentOf(text), ids);
      parsed.forEach((minutes, id) => result.set(id, minutes));
      log(`durations: batch ${i / BATCH_SIZE + 1}, ${parsed.size} of ${batch.length} answered`);
    } catch (error) {
      log(`durations: batch ${i / BATCH_SIZE + 1} failed, using defaults (${(error as Error).message})`);
    }
  }
  return result;
}

export function durationPrompt(batch: DurationRequest[]): string {
  const lines = batch.map(
    (b) => `${b.id} | ${b.name} | ${b.city} | ${b.description.slice(0, DESCRIPTION_CHARS).replaceAll("\n", " ")}`,
  );
  return [
    "For each tourist attraction below, estimate how many minutes a typical visitor spends there,",
    "based on what visitors commonly report. Lines are: id | name | city | description.",
    'Reply with only a JSON object mapping each id to a whole number of minutes, like {"some-id": 90}.',
    "",
    ...lines,
  ].join("\n");
}

export function parseDurationReply(content: string, ids: Set<string>): Map<string, number> {
  const result = new Map<string, number>();
  const json = content.match(/\{[\s\S]*\}/)?.[0];
  if (!json) return result;
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    return result;
  }
  if (typeof parsed !== "object" || parsed === null) return result;
  for (const [id, value] of Object.entries(parsed)) {
    const minutes = typeof value === "number" ? value : Number(value);
    if (!ids.has(id) || !Number.isFinite(minutes) || minutes <= 0) continue;
    result.set(id, Math.round(Math.min(MAX_DURATION, Math.max(MIN_DURATION, minutes))));
  }
  return result;
}
