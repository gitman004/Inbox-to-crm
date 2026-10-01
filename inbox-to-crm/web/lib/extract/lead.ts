import schema from "../shared/lead.schema.json";

export const INTENTS = ["devis", "rendez_vous", "support", "partenariat", "candidature", "spam", "autre"] as const;
export const URGENCIES = ["haute", "normale", "basse"] as const;

export type Lead = {
  contact_name: string | null;
  email: string | null;
  company: string | null;
  phone: string | null;
  intent: (typeof INTENTS)[number];
  urgency: (typeof URGENCIES)[number];
  budget_eur: number | null;
  summary: string;
  language: "fr" | "en";
};

export const LEAD_SCHEMA = schema;

const NULLABLE_STRINGS = ["contact_name", "email", "company", "phone"] as const;

/** Validation équivalente au modèle Pydantic. Retourne la liste des erreurs (vide si valide). */
export function validateLead(obj: unknown): { lead?: Lead; errors: string[] } {
  const errors: string[] = [];
  if (typeof obj !== "object" || obj === null || Array.isArray(obj)) return { errors: ["la racine doit être un objet"] };
  const o = obj as Record<string, unknown>;
  const allowed = new Set(Object.keys(schema.properties));
  for (const k of Object.keys(o)) if (!allowed.has(k)) errors.push(`champ inattendu : ${k}`);
  for (const k of allowed) if (!(k in o)) errors.push(`champ manquant : ${k}`);
  for (const k of NULLABLE_STRINGS) {
    if (o[k] !== null && typeof o[k] !== "string") errors.push(`${k} doit être une chaîne ou null`);
  }
  if (!INTENTS.includes(o.intent as Lead["intent"])) errors.push(`intent invalide : ${String(o.intent)}`);
  if (!URGENCIES.includes(o.urgency as Lead["urgency"])) errors.push(`urgency invalide : ${String(o.urgency)}`);
  if (o.budget_eur !== null && (typeof o.budget_eur !== "number" || o.budget_eur < 0))
    errors.push("budget_eur doit être un nombre positif ou null");
  if (typeof o.summary !== "string" || o.summary.length > 200) errors.push("summary : chaîne de 200 caractères max");
  if (o.language !== "fr" && o.language !== "en") errors.push("language doit valoir fr ou en");
  if (errors.length) return { errors };

  const lead = { ...o } as Lead;
  for (const k of NULLABLE_STRINGS) {
    const v = lead[k];
    lead[k] = typeof v === "string" && v.trim() ? v.trim() : null;
  }
  if (lead.email) lead.email = lead.email.toLowerCase();
  return { lead, errors: [] };
}
