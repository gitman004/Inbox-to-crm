"""Point d'entrée de l'extraction : choisit le mode, applique les garde-fous."""

from __future__ import annotations

import os
import time
from dataclasses import dataclass, field
from typing import Any, Literal

from .email_io import ParsedEmail
from .guards import check_against_source
from .llm import ExtractionError, extract_llm
from .rules import extract_rules
from .schema import Lead

Mode = Literal["auto", "llm", "rules"]


@dataclass
class ExtractionResult:
    lead: Lead
    mode: Literal["llm", "rules"]
    warnings: list[str] = field(default_factory=list)
    latency_ms: int = 0


def extract(msg: ParsedEmail, mode: Mode = "auto", client: Any | None = None) -> ExtractionResult:
    """Extrait un lead d'un email.

    - ``rules`` : extracteur déterministe, sans appel réseau ;
    - ``llm``   : LLM + validation + garde-fous ; lève une erreur si l'API échoue ;
    - ``auto``  : LLM si une clé est configurée, avec repli sur les règles en cas d'échec.
    """
    start = time.perf_counter()
    use_llm = mode == "llm" or (mode == "auto" and (client is not None or os.getenv("OPENAI_API_KEY")))

    if not use_llm:
        lead = extract_rules(msg)
        return ExtractionResult(lead, "rules", [], int((time.perf_counter() - start) * 1000))

    try:
        lead = extract_llm(msg, client=client)
    except Exception as exc:  # erreur réseau, quota, sortie invalide…
        if mode == "llm":
            raise ExtractionError(str(exc)) from exc
        lead = extract_rules(msg)
        return ExtractionResult(
            lead, "rules", [f"LLM indisponible, repli sur les règles ({exc.__class__.__name__})"],
            int((time.perf_counter() - start) * 1000),
        )

    lead, warnings = check_against_source(lead, msg.as_text())
    return ExtractionResult(lead, "llm", warnings, int((time.perf_counter() - start) * 1000))
