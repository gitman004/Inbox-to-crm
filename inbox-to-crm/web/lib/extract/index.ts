import { checkAgainstSource, locateSpans, type Span } from "./guards";
import type { Lead } from "./lead";
import { extractLlm } from "./llm";
import { extractRules } from "./rules";
import { parseText } from "./text";

export type ExtractionResult = {
  lead: Lead;
  mode: "llm" | "rules";
  warnings: string[];
  latency_ms: number;
  spans: Span[];
};

/** Même stratégie que le mode « auto » du pipeline Python. */
export async function extract(source: string): Promise<ExtractionResult> {
  const t0 = performance.now();
  const ms = () => Math.round(performance.now() - t0);

  if (process.env.OPENAI_API_KEY) {
    try {
      const raw = await extractLlm(source);
      const { lead, warnings } = checkAgainstSource(raw, source);
      return { lead, mode: "llm", warnings, latency_ms: ms(), spans: locateSpans(lead, source) };
    } catch (e) {
      const lead = extractRules(parseText(source));
      const reason = e instanceof Error ? e.message : "erreur inconnue";
      return {
        lead, mode: "rules", latency_ms: ms(), spans: locateSpans(lead, source),
        warnings: [`LLM indisponible (${reason}) : repli sur l'extracteur à règles`],
      };
    }
  }
  const lead = extractRules(parseText(source));
  return { lead, mode: "rules", warnings: [], latency_ms: ms(), spans: locateSpans(lead, source) };
}
