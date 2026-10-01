// Portage de pipeline/inbox_to_crm/llm.py : sortie structurée stricte + un réessai si la réponse est invalide.
import prompt from "../shared/prompt.json";
import { LEAD_SCHEMA, validateLead, type Lead } from "./lead";

// L'API n'accepte pas les clés « $schema » et « title » à la racine du schéma strict.
const schema = Object.fromEntries(
  Object.entries(LEAD_SCHEMA as Record<string, unknown>).filter(([k]) => k !== "$schema" && k !== "title"),
);

type Message = { role: "system" | "user" | "assistant"; content: string };

export async function extractLlm(source: string, maxAttempts = 2): Promise<Lead> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY absente");
  const model = process.env.OPENAI_MODEL || "gpt-4o-mini";

  const messages: Message[] = [
    { role: "system", content: prompt.system },
    { role: "user", content: `Email à analyser :\n<<<\n${source}\n>>>` },
  ];
  let lastError = "";

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model,
        messages,
        temperature: 0,
        response_format: { type: "json_schema", json_schema: { name: "lead", strict: true, schema } },
      }),
      signal: AbortSignal.timeout(20_000),
    });
    if (!res.ok) throw new Error(`API ${res.status}`);
    const data = await res.json();
    const content: string = data.choices?.[0]?.message?.content ?? "";

    let parsed: unknown;
    try {
      parsed = JSON.parse(content);
    } catch {
      lastError = "JSON illisible";
    }
    if (parsed !== undefined) {
      const { lead, errors } = validateLead(parsed);
      if (lead) return lead;
      lastError = errors.join("; ");
    }
    messages.push(
      { role: "assistant", content },
      { role: "user", content: `Ta réponse est invalide : ${lastError}\nRenvoie uniquement le JSON corrigé.` },
    );
  }
  throw new Error(`Sortie LLM invalide après ${maxAttempts} tentatives : ${lastError}`);
}
