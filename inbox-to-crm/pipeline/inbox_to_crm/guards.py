"""Garde-fous anti-hallucination appliqués à la sortie du LLM.

Les champs « critiques » (email, téléphone, budget, nom) doivent être
retrouvables dans l'email source. Sinon ils sont remis à null et un
avertissement est remonté : on préfère une donnée manquante à une donnée
inventée qui partirait dans le CRM.
"""

from __future__ import annotations

import re

from .schema import Lead
from .text_utils import find_amounts_eur, fold


def _digits(s: str) -> str:
    return re.sub(r"\D", "", s)


def check_against_source(lead: Lead, source: str) -> tuple[Lead, list[str]]:
    warnings: list[str] = []
    updates: dict = {}
    folded = fold(source)

    if lead.email and lead.email.lower() not in source.lower():
        updates["email"] = None
        warnings.append(f"email « {lead.email} » absent de la source : retiré")

    if lead.phone:
        national = _digits(lead.phone)[-9:]
        if national not in _digits(source):
            updates["phone"] = None
            warnings.append(f"téléphone « {lead.phone} » absent de la source : retiré")

    if lead.budget_eur is not None:
        amounts = find_amounts_eur(source)
        if not any(abs(a - lead.budget_eur) < 0.01 for a in amounts):
            updates["budget_eur"] = None
            warnings.append(f"budget {lead.budget_eur:g} € introuvable dans la source : retiré")

    if lead.contact_name:
        tokens = [t for t in re.split(r"[\s\-]+", fold(lead.contact_name)) if len(t) > 1]
        if tokens and not all(t in folded for t in tokens):
            updates["contact_name"] = None
            warnings.append(f"nom « {lead.contact_name} » absent de la source : retiré")

    return (lead.model_copy(update=updates) if updates else lead), warnings
