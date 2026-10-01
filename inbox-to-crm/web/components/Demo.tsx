"use client";

import { useCallback, useEffect, useState } from "react";
import type { ExtractionResult } from "@/lib/extract";
import type { Lead } from "@/lib/extract/lead";

type Sample = { label: string; file: string; text: string };

const INTENT_LABELS: Record<Lead["intent"], string> = {
  devis: "Demande de devis",
  rendez_vous: "Prise de rendez-vous",
  support: "Support",
  partenariat: "Partenariat",
  candidature: "Candidature",
  spam: "Spam, non enregistré",
  autre: "Autre",
};

const URGENCY_LABELS: Record<Lead["urgency"], string> = { haute: "Haute", normale: "Normale", basse: "Basse" };

const ROWS: { field: keyof Lead; label: string }[] = [
  { field: "contact_name", label: "Contact" },
  { field: "email", label: "Email" },
  { field: "company", label: "Entreprise" },
  { field: "phone", label: "Téléphone" },
  { field: "intent", label: "Demande" },
  { field: "urgency", label: "Urgence" },
  { field: "budget_eur", label: "Budget" },
  { field: "language", label: "Langue" },
  { field: "summary", label: "Résumé" },
];

function renderValue(field: keyof Lead, lead: Lead) {
  const v = lead[field];
  if (v === null || v === "") return <span className="empty">non mentionné</span>;
  switch (field) {
    case "intent":
      return INTENT_LABELS[lead.intent];
    case "urgency":
      return <span className={`pill ${lead.urgency}`}>{URGENCY_LABELS[lead.urgency]}</span>;
    case "budget_eur":
      return `${new Intl.NumberFormat("fr-FR").format(lead.budget_eur!)} €`;
    case "language":
      return lead.language === "fr" ? "Français" : "Anglais";
    default:
      return String(v);
  }
}

function Highlighted({ text, result, active, onHover }: {
  text: string;
  result: ExtractionResult;
  active: keyof Lead | null;
  onHover: (f: keyof Lead | null) => void;
}) {
  const parts: React.ReactNode[] = [];
  let cursor = 0;
  result.spans.forEach((s, i) => {
    if (s.start > cursor) parts.push(text.slice(cursor, s.start));
    parts.push(
      <mark
        key={`${s.field}-${s.start}`}
        className={active === s.field ? "active" : undefined}
        style={{ "--i": i } as React.CSSProperties}
        onMouseEnter={() => onHover(s.field)}
        onMouseLeave={() => onHover(null)}
      >
        {text.slice(s.start, s.end)}
      </mark>,
    );
    cursor = s.end;
  });
  parts.push(text.slice(cursor));
  return <p className="letter-text">{parts}</p>;
}

export default function Demo({ samples }: { samples: Sample[] }) {
  const [selected, setSelected] = useState<number | null>(0);
  const [text, setText] = useState(samples[0]?.text ?? "");
  const [editing, setEditing] = useState(false);
  const [result, setResult] = useState<ExtractionResult | null>(null);
  const [resultText, setResultText] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<"fiche" | "json">("fiche");
  const [active, setActive] = useState<keyof Lead | null>(null);

  const run = useCallback(async (source: string) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/extract", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: source }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `Erreur ${res.status}`);
      setResult(data);
      setResultText(source);
      setEditing(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "L'extraction a échoué. Réessayez.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (samples[0]) run(samples[0].text);
  }, [run, samples]);

  const pickSample = (i: number) => {
    setSelected(i);
    setText(samples[i].text);
    setView("fiche");
    run(samples[i].text);
  };

  const linked = new Set(result?.spans.map((s) => s.field));
  const showHighlights = !editing && result && resultText === text;

  return (
    <>
      <ul className="samples" aria-label="Emails d'exemple">
        {samples.map((s, i) => (
          <li key={s.file}>
            <button type="button" aria-pressed={selected === i} onClick={() => pickSample(i)}>
              {s.label}
            </button>
          </li>
        ))}
      </ul>

      <div className="demo">
        <div className="letter">
          {showHighlights ? (
            <Highlighted text={text} result={result} active={active} onHover={setActive} />
          ) : (
            <textarea
              aria-label="Email à analyser"
              value={text}
              placeholder={"From: Prénom Nom <adresse@entreprise.fr>\nSubject: Objet du message\n\nCollez ici le contenu de l'email…"}
              onChange={(e) => {
                setText(e.target.value);
                setSelected(null);
              }}
              autoFocus={editing}
            />
          )}
          <div className="letter-actions">
            {showHighlights ? (
              <>
                <span className="hint">Surligné : ce qui a été repris dans la fiche.</span>
                <button type="button" className="btn btn-quiet" onClick={() => setEditing(true)}>
                  Modifier l&apos;email
                </button>
              </>
            ) : (
              <>
                <span className="hint">Collez un vrai email ou modifiez l&apos;exemple.</span>
                <button
                  type="button"
                  className="btn btn-primary"
                  disabled={loading || !text.trim()}
                  onClick={() => run(text)}
                >
                  {loading ? "Extraction…" : "Extraire la fiche"}
                </button>
              </>
            )}
          </div>
          {error && <p className="error" role="alert">{error}</p>}
        </div>

        <section className="record" aria-live="polite" aria-busy={loading}>
          <div className="record-head">
            <h2>Fiche CRM</h2>
            <div className="toggle" role="group" aria-label="Affichage">
              <button type="button" aria-pressed={view === "fiche"} onClick={() => setView("fiche")}>Fiche</button>
              <button type="button" aria-pressed={view === "json"} onClick={() => setView("json")}>JSON</button>
            </div>
          </div>

          {!result ? (
            <p className="record-foot">{loading ? "Extraction en cours…" : "La fiche apparaîtra ici."}</p>
          ) : view === "json" ? (
            <pre className="json">{JSON.stringify(result.lead, null, 2)}</pre>
          ) : (
            <dl className="fields">
              {ROWS.map(({ field, label }) => (
                <div
                  key={field}
                  className={`field${linked.has(field) ? " linked" : ""}${active === field ? " active" : ""}`}
                  onMouseEnter={() => linked.has(field) && setActive(field)}
                  onMouseLeave={() => setActive(null)}
                >
                  <dt>{label}</dt>
                  <dd>{renderValue(field, result.lead)}</dd>
                </div>
              ))}
            </dl>
          )}

          {result && result.warnings.length > 0 && (
            <ul className="warnings">
              {result.warnings.map((w) => <li key={w}>{w}</li>)}
            </ul>
          )}

          {result && (
            <p className="record-foot">
              {result.mode === "llm"
                ? `Extrait par le LLM, vérifié par les garde-fous, en ${result.latency_ms} ms.`
                : `Extrait par l'extracteur à règles en ${result.latency_ms} ms.` +
                  (result.warnings.some((w) => w.startsWith("LLM indisponible"))
                    ? ""
                    : " Cette démo tourne sans clé API LLM.")}
            </p>
          )}
        </section>
      </div>
    </>
  );
}
