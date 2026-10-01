import { NextResponse } from "next/server";
import { extract } from "@/lib/extract";

export const runtime = "nodejs";

const MAX_CHARS = 6000;
const WINDOW_MS = 60_000;
const MAX_PER_WINDOW = 10;
const hits = new Map<string, number[]>();

// Limite simple par IP (en mémoire, best effort) pour protéger la clé API de la démo publique.
function rateLimited(ip: string): boolean {
  const now = Date.now();
  const recent = (hits.get(ip) ?? []).filter((t) => now - t < WINDOW_MS);
  recent.push(now);
  hits.set(ip, recent);
  return recent.length > MAX_PER_WINDOW;
}

export async function POST(req: Request) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0].trim() ?? "local";
  if (rateLimited(ip)) {
    return NextResponse.json({ error: "Trop de requêtes. Réessayez dans une minute." }, { status: 429 });
  }

  let text: unknown;
  try {
    ({ text } = await req.json());
  } catch {
    return NextResponse.json({ error: "Corps de requête JSON attendu : { \"text\": \"...\" }" }, { status: 400 });
  }
  if (typeof text !== "string" || !text.trim()) {
    return NextResponse.json({ error: "Collez un email avant de lancer l'extraction." }, { status: 400 });
  }
  if (text.length > MAX_CHARS) {
    return NextResponse.json({ error: `Email trop long (${MAX_CHARS} caractères maximum).` }, { status: 413 });
  }

  return NextResponse.json(await extract(text));
}
