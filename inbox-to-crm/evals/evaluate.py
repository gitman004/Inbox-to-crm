"""Évaluation de l'extraction sur un jeu d'emails annotés à la main.

    python evals/evaluate.py --mode rules
    OPENAI_API_KEY=... python evals/evaluate.py --mode llm

Mesure, champ par champ, la part d'emails où la valeur extraite est égale à
la valeur attendue (après normalisation : casse, accents, format téléphone).
Le résumé (texte libre) n'est pas évalué.
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "pipeline"))

from inbox_to_crm.email_io import read_email  # noqa: E402
from inbox_to_crm.extract import extract  # noqa: E402
from inbox_to_crm.text_utils import fold, normalize_phone  # noqa: E402

FIELDS = ["contact_name", "email", "company", "phone", "intent", "urgency", "budget_eur", "language"]


def same(field: str, got, expected) -> bool:
    if got is None or expected is None:
        return got is None and expected is None
    if field == "budget_eur":
        return abs(float(got) - float(expected)) < 0.01
    if field == "phone":
        return normalize_phone(got) == normalize_phone(expected)
    return fold(str(got)).strip() == fold(str(expected)).strip()


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--mode", choices=["rules", "llm"], default="rules")
    args = parser.parse_args()

    expected = json.loads((ROOT / "evals" / "expected.json").read_text(encoding="utf-8"))
    hits = {f: 0 for f in FIELDS}
    errors = []
    perfect = 0

    for name, truth in expected.items():
        result = extract(read_email(ROOT / "evals" / "emails" / name), mode=args.mode)
        lead = result.lead.model_dump()
        all_ok = True
        for f in FIELDS:
            if same(f, lead[f], truth[f]):
                hits[f] += 1
            else:
                all_ok = False
                errors.append({"email": name, "field": f, "expected": truth[f], "got": lead[f]})
        perfect += all_ok

    n = len(expected)
    per_field = {f: round(hits[f] / n, 3) for f in FIELDS}
    overall = round(sum(hits.values()) / (n * len(FIELDS)), 3)
    report = {
        "mode": args.mode,
        "emails": n,
        "field_accuracy": overall,
        "fully_correct_emails": perfect,
        "per_field": per_field,
        "errors": errors,
    }
    out = ROOT / "evals" / f"results_{args.mode}.json"
    out.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")

    print(f"Mode {args.mode} — {n} emails, {len(FIELDS)} champs évalués")
    for f in FIELDS:
        print(f"  {f:<13} {per_field[f]:>6.0%}")
    print(f"  {'GLOBAL':<13} {overall:>6.0%}   ({perfect}/{n} emails sans aucune erreur)")
    print(f"\nDétail des erreurs : {out.relative_to(ROOT)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
