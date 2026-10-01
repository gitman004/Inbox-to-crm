// Portage TypeScript de pipeline/inbox_to_crm/rules.py (même logique, mêmes listes).
import type { Lead } from "./lead";
import { EMAIL_RE, PHONE_RE, findAmountsEur, fold, normalizePhone, type ParsedEmail } from "./text";

const FREE_PROVIDERS = new Set([
  "gmail", "googlemail", "yahoo", "hotmail", "outlook", "live", "msn", "icloud",
  "me", "orange", "free", "sfr", "laposte", "wanadoo", "protonmail", "proton", "gmx", "aol",
]);

const CLOSINGS = [
  "cordialement", "bien cordialement", "bien a vous", "salutations", "merci", "merci d'avance",
  "a bientot", "bonne journee", "belle journee", "best regards", "kind regards", "regards",
  "best", "thanks", "thank you", "cheers", "sincerely",
];

const JOB_WORDS = [
  "responsable", "directeur", "directrice", "manager", "head", "ceo", "cto", "cfo", "coo",
  "fondateur", "fondatrice", "founder", "charge", "chargee", "assistant", "assistante",
  "gerant", "gerante", "consultant", "consultante", "president", "presidente", "lead",
  "ingenieur", "engineer", "acheteur", "acheteuse", "office", "commercial", "commerciale",
  "etudiant", "etudiante", "student", "developpeur", "developer", "rh", "recruteur",
];

const NAME_RE = /^[A-ZÀ-Ý][a-zà-ÿ'\-]+(?:[ \-][A-ZÀ-Ý][A-Za-zà-ÿ'\-]+){1,2}$/u;

const INTENT_KEYWORDS: [Lead["intent"], string[]][] = [
  ["spam", ["felicitations", "vous avez gagne", "cliquez ici", "offre exceptionnelle", "crypto",
    "bitcoin", "gagnez", "lottery", "winner", "click here", "100% gratuit", "seo",
    "backlinks", "1ere page de google", "first page of google"]],
  ["candidature", ["candidature", "cv", "alternance", "stage", "poste", "recrutement", "apply", "application",
    "resume", "internship", "position", "lettre de motivation"]],
  ["support", ["bug", "erreur", "probleme", "ne fonctionne", "ne marche", "panne", "bloque", "error",
    "broken", "ticket", "not working", "issue", "plante", "facture en double", "rembourse", "acces"]],
  ["partenariat", ["partenariat", "partnership", "partenaire", "partner", "collaboration", "collaborer",
    "co-marketing", "revendeur", "reseller", "affiliation", "integration commune"]],
  ["devis", ["devis", "tarif", "prix", "cotation", "quote", "quotation", "pricing", "combien",
    "budget", "proposition commerciale", "cout", "chiffrage", "chiffrer"]],
  ["rendez_vous", ["rendez-vous", "rendez vous", "rdv", "disponibilite", "disponible", "creneau", "visio",
    "meeting", "call", "rencontrer", "schedule", "appel", "echanger de vive voix"]],
];

const URGENCY_LOW = ["pas urgent", "aucune urgence", "rien d'urgent", "quand vous aurez le temps", "pas presse",
  "no rush", "not urgent", "whenever you have time", "a votre convenance"];
const URGENCY_HIGH = ["urgent", "urgence", "asap", "au plus vite", "des que possible", "immediatement", "bloquant",
  "bloque", "critique", "critical", "aujourd'hui", "ce soir", "today", "tonight", "d'ici demain",
  "avant demain", "right away"];

const FR_WORDS = new Set(["le", "la", "les", "de", "des", "et", "est", "pour", "vous", "nous", "je", "une",
  "un", "avec", "sur", "pas", "merci", "bonjour", "votre", "notre", "du", "au"]);
const EN_WORDS = new Set(["the", "and", "is", "for", "you", "we", "i", "a", "an", "with", "on", "not",
  "thanks", "hello", "hi", "to", "of", "our", "your", "would", "please"]);

const GREETING_RE = /^(bonjour|bonsoir|hello|hi|dear|madame|monsieur|cher|chere|salut)\b/i;

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const has = (hay: string, needle: string) => new RegExp(`(?<![a-z0-9])${escape(needle)}(?![a-z0-9])`).test(hay);

function signatureLines(body: string): string[] {
  const lines = body.split("\n").map((l) => l.trim());
  for (let i = lines.length - 1; i >= 0; i--) {
    const f = fold(lines[i]).replace(/[,.!\s]+$/, "");
    if (f && f.length < 40 && CLOSINGS.some((c) => f === c || f.startsWith(c + " "))) {
      return lines.slice(i + 1).filter(Boolean);
    }
  }
  return [];
}

function companyFromSignature(sig: string[], name: string | null): string | null {
  const rest = sig.length && name && sig[0] === name ? sig.slice(1) : sig;
  const nameTokens = new Set(fold(name ?? "").split(/\s+/).filter(Boolean));
  for (const line of rest.slice(0, 3)) {
    if (nameTokens.has(fold(line))) continue;
    if (EMAIL_RE.test(line) || new RegExp(PHONE_RE.source).test(line) || /https?:\/\/|www\./.test(line)) continue;
    const parts = line.split(/\s+[—–\-|@]\s+|\s+chez\s+|\s+at\s+|,\s+/);
    const candidate = parts[parts.length - 1].trim();
    if (!candidate || candidate.length > 40) continue;
    if (JOB_WORDS.some((w) => has(fold(candidate), w))) continue;
    return candidate;
  }
  return null;
}

function companyFromDomain(addr: string | null): string | null {
  if (!addr || !addr.includes("@")) return null;
  const root = addr.split("@")[1].toLowerCase().split(".")[0];
  if (FREE_PROVIDERS.has(root)) return null;
  return root.split(/[-_]/).filter(Boolean).map((w) => w[0].toUpperCase() + w.slice(1)).join(" ");
}

function intentOf(subject: string, body: string): Lead["intent"] {
  const fs = fold(subject), fb = fold(body);
  let best: Lead["intent"] = "autre", bestScore = 0;
  for (const [intent, words] of INTENT_KEYWORDS) {
    const score = words.reduce((s, w) => s + (has(fs, w) ? 2 : 0) + (has(fb, w) ? 1 : 0), 0);
    if (intent === "spam" && score >= 2) return "spam";
    if (score > bestScore) { best = intent; bestScore = score; }
  }
  return best;
}

function urgencyOf(text: string): Lead["urgency"] {
  const f = fold(text);
  if (URGENCY_LOW.some((w) => has(f, w))) return "basse";
  if (URGENCY_HIGH.some((w) => has(f, w))) return "haute";
  return "normale";
}

function languageOf(text: string): Lead["language"] {
  const words = text.toLowerCase().match(/[a-zà-ÿ']+/g) ?? [];
  const fr = words.filter((w) => FR_WORDS.has(w)).length;
  const en = words.filter((w) => EN_WORDS.has(w)).length;
  return en > fr ? "en" : "fr";
}

function summaryOf(subject: string | null, body: string): string {
  let text: string;
  if (subject) text = subject;
  else {
    const lines = body.split("\n").map((l) => l.trim()).filter((l) => l && !GREETING_RE.test(l));
    text = lines.length ? lines[0].split(/(?<=[.!?])\s/)[0] : "Email sans contenu exploitable.";
  }
  return text.slice(0, 200);
}

export function extractRules(msg: ParsedEmail): Lead {
  const { body } = msg;
  const full = `${msg.subject ?? ""}\n${body}`;
  const sig = signatureLines(body);

  let email = msg.fromEmail;
  if (!email) {
    const m = body.match(EMAIL_RE);
    email = m ? m[0].toLowerCase() : null;
  }
  const name = msg.fromName ?? (sig.length && NAME_RE.test(sig[0]) ? sig[0] : null);
  const company = companyFromSignature(sig, name) ?? companyFromDomain(email);
  const phone = body.match(new RegExp(PHONE_RE.source));
  const amounts = findAmountsEur(full);

  return {
    contact_name: name,
    email,
    company,
    phone: phone ? normalizePhone(phone[0]) : null,
    intent: intentOf(msg.subject ?? "", body),
    urgency: urgencyOf(full),
    budget_eur: amounts.length ? amounts[0].value : null,
    summary: summaryOf(msg.subject, body),
    language: languageOf(full),
  };
}
