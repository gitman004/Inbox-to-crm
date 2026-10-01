// Portage de pipeline/inbox_to_crm/guards.py + repérage des passages sources pour le surlignage.
import type { Lead } from "./lead";
import { findAmountsEur, findPhones, fold, normalizePhone } from "./text";

const digits = (s: string) => s.replace(/\D/g, "");

export function checkAgainstSource(lead: Lead, source: string): { lead: Lead; warnings: string[] } {
  const warnings: string[] = [];
  const out = { ...lead };
  const folded = fold(source);

  if (out.email && !source.toLowerCase().includes(out.email.toLowerCase())) {
    warnings.push(`email « ${out.email} » absent de la source : retiré`);
    out.email = null;
  }
  if (out.phone && !digits(source).includes(digits(out.phone).slice(-9))) {
    warnings.push(`téléphone « ${out.phone} » absent de la source : retiré`);
    out.phone = null;
  }
  if (out.budget_eur !== null && !findAmountsEur(source).some((a) => Math.abs(a.value - out.budget_eur!) < 0.01)) {
    warnings.push(`budget ${out.budget_eur} € introuvable dans la source : retiré`);
    out.budget_eur = null;
  }
  if (out.contact_name) {
    const tokens = fold(out.contact_name).split(/[\s\-]+/).filter((t) => t.length > 1);
    if (tokens.length && !tokens.every((t) => folded.includes(t))) {
      warnings.push(`nom « ${out.contact_name} » absent de la source : retiré`);
      out.contact_name = null;
    }
  }
  return { lead: out, warnings };
}

export type Span = { field: keyof Lead; start: number; end: number };

/** Positions, dans le texte source, des valeurs extraites (pour les surligner). */
export function locateSpans(lead: Lead, source: string): Span[] {
  const spans: Span[] = [];
  const lower = source.toLowerCase();

  const findText = (field: keyof Lead, value: string | null) => {
    if (!value) return;
    const i = lower.indexOf(value.toLowerCase());
    if (i >= 0) spans.push({ field, start: i, end: i + value.length });
  };

  findText("contact_name", lead.contact_name);
  findText("email", lead.email);
  findText("company", lead.company);

  if (lead.phone) {
    const p = findPhones(source).find((m) => normalizePhone(m.value) === lead.phone);
    if (p) spans.push({ field: "phone", start: p.start, end: p.end });
  }
  if (lead.budget_eur !== null) {
    const a = findAmountsEur(source).find((m) => Math.abs(m.value - lead.budget_eur!) < 0.01);
    if (a) spans.push({ field: "budget_eur", start: a.start, end: a.end });
  }

  // Supprime les chevauchements (ex. le nom contenu dans l'adresse email).
  spans.sort((a, b) => a.start - b.start);
  return spans.filter((s, i) => i === 0 || s.start >= spans[i - 1].end);
}
