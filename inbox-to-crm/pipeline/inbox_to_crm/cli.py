"""Ligne de commande.

    python -m inbox_to_crm run evals/emails --db crm.sqlite
    python -m inbox_to_crm list --db crm.sqlite
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

from .crm import CRM
from .email_io import read_email
from .extract import extract

INTENT_SKIPPED = {"spam"}


def _iter_files(path: Path):
    if path.is_file():
        yield path
        return
    for p in sorted(path.iterdir()):
        if p.suffix.lower() in {".txt", ".eml"}:
            yield p


def cmd_run(args) -> int:
    crm = CRM(args.db)
    created = updated = skipped = 0
    for path in _iter_files(Path(args.path)):
        result = extract(read_email(path), mode=args.mode)
        lead = result.lead
        if lead.intent in INTENT_SKIPPED:
            skipped += 1
            status = "ignoré (spam)"
        else:
            _, is_new = crm.upsert(lead, result.mode)
            created += is_new
            updated += not is_new
            status = "créé" if is_new else "mis à jour"
        if args.json:
            print(json.dumps({"file": path.name, "status": status, "mode": result.mode,
                              "warnings": result.warnings, "lead": lead.model_dump()}, ensure_ascii=False))
        else:
            budget = f"{lead.budget_eur:,.0f} €".replace(",", " ") if lead.budget_eur else "-"
            print(f"{path.name:<28} {status:<14} {lead.intent:<12} {lead.urgency:<8} "
                  f"{(lead.company or '-')[:22]:<22} {budget:>10}  [{result.mode}]")
            for w in result.warnings:
                print(f"    ! {w}")
    print(f"\n{created} lead(s) créé(s), {updated} mis à jour, {skipped} spam ignoré(s) -> {args.db}",
          file=sys.stderr)
    crm.close()
    return 0


def cmd_list(args) -> int:
    crm = CRM(args.db)
    for row in crm.all():
        print(json.dumps(row, ensure_ascii=False))
    crm.close()
    return 0


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="inbox_to_crm", description="Emails entrants -> fiches CRM")
    sub = parser.add_subparsers(dest="command", required=True)

    run = sub.add_parser("run", help="Traiter un email ou un dossier d'emails (.txt/.eml)")
    run.add_argument("path")
    run.add_argument("--db", default="crm.sqlite")
    run.add_argument("--mode", choices=["auto", "llm", "rules"], default="auto")
    run.add_argument("--json", action="store_true", help="Sortie JSON ligne par ligne")
    run.set_defaults(func=cmd_run)

    lst = sub.add_parser("list", help="Afficher le contenu du CRM")
    lst.add_argument("--db", default="crm.sqlite")
    lst.set_defaults(func=cmd_list)

    args = parser.parse_args(argv)
    return args.func(args)
