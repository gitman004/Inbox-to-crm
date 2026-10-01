// Portage TypeScript de pipeline/inbox_to_crm/text_utils.py et email_io.py (parse_text).

export const PHONE_RE =
  /(?:(?:\+|00)\d{2}[\s.\-]?(?:\(0\)[\s.\-]?)?|\b0)[1-9](?:[\s.\-]?\d{2}){4}\b/g;

const AMOUNT_RE =
  /(?<![\d.,])(\d{1,3}(?:[   .]\d{3})+(?:,\d+)?|\d+(?:[.,]\d+)?)\s*(k\s*€|k\s*euros?\b|k\s*eur\b|€|euros?\b|eur\b)/gi;
const AMOUNT_PREFIX_RE = /€\s*(\d{1,3}(?:[   .,]\d{3})+|\d+)(\s*k\b)?/gi;

export const EMAIL_RE = /[\w.+\-]+@[\w\-]+(?:\.[\w\-]+)+/;

export function fold(text: string): string {
  return text.normalize("NFKD").replace(/\p{M}/gu, "").toLowerCase();
}

export function normalizePhone(raw: string | null | undefined): string | null {
  if (!raw) return null;
  let d = raw.replace(/[^\d+]/g, "");
  if (d.startsWith("00")) d = "+" + d.slice(2);
  if (d.startsWith("+330")) d = "+33" + d.slice(4);
  if (d.startsWith("0") && d.length === 10) d = "+33" + d.slice(1);
  if (!d.startsWith("+")) return d.length >= 9 ? d : null;
  return d.length >= 10 ? d : null;
}

function parseNumber(num: string): number {
  num = num.replace(/[  ]/g, " ");
  if (/^\d{1,3}(?:[ .,]\d{3})+$/.test(num)) return Number(num.replace(/[ .,]/g, ""));
  if (/^\d{1,3}(?:[ .]\d{3})+,\d+$/.test(num)) {
    const i = num.lastIndexOf(",");
    return Number(num.slice(0, i).replace(/[ .]/g, "") + "." + num.slice(i + 1));
  }
  return Number(num.replace(",", "."));
}

export type Located<T> = { value: T; start: number; end: number };

/** Montants en euros avec leur position, dans l'ordre d'apparition. */
export function findAmountsEur(text: string): Located<number>[] {
  const found: Located<number>[] = [];
  for (const m of text.matchAll(AMOUNT_RE)) {
    let v = parseNumber(m[1]);
    if (m[2].toLowerCase().startsWith("k")) v *= 1000;
    found.push({ value: v, start: m.index!, end: m.index! + m[0].length });
  }
  for (const m of text.matchAll(AMOUNT_PREFIX_RE)) {
    let v = parseNumber(m[1]);
    if (m[2]) v *= 1000;
    found.push({ value: v, start: m.index!, end: m.index! + m[0].length });
  }
  return found.sort((a, b) => a.start - b.start);
}

export function findPhones(text: string): Located<string>[] {
  return [...text.matchAll(PHONE_RE)].map((m) => ({
    value: m[0],
    start: m.index!,
    end: m.index! + m[0].length,
  }));
}

export type ParsedEmail = {
  fromName: string | null;
  fromEmail: string | null;
  subject: string | null;
  body: string;
};

const HEADER_RE = /^(From|De|Subject|Objet|To|À|A|Date|Cc)\s*:\s*(.*)$/i;

function splitFrom(value: string): [string | null, string | null] {
  const angle = value.match(/^\s*"?([^"<]*?)"?\s*<([^>]*)>\s*$/);
  if (angle) return [angle[1].trim() || null, angle[2].trim().toLowerCase() || null];
  const bare = value.trim();
  return EMAIL_RE.test(bare) ? [null, bare.toLowerCase()] : [bare || null, null];
}

export function parseText(raw: string): ParsedEmail {
  const lines = raw.replace(/\r\n/g, "\n").split("\n");
  const headers: Record<string, string> = {};
  let i = 0;
  for (; i < lines.length; i++) {
    const m = lines[i].trim().match(HEADER_RE);
    if (!m) break;
    let key = m[1].toLowerCase();
    key = ({ de: "from", objet: "subject" } as Record<string, string>)[key] ?? key;
    headers[key] = m[2].trim();
  }
  const body = lines.slice(i).join("\n").trim();
  const [fromName, fromEmail] = headers.from ? splitFrom(headers.from) : [null, null];
  return { fromName, fromEmail, subject: headers.subject || null, body };
}
