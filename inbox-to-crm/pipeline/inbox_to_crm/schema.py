"""Modèle de données d'un lead, aligné sur shared/lead.schema.json."""

from __future__ import annotations

import json
from functools import lru_cache
from pathlib import Path
from typing import Literal, Optional

from pydantic import BaseModel, ConfigDict, Field, field_validator

SHARED_DIR = Path(__file__).resolve().parents[2] / "shared"

Intent = Literal["devis", "rendez_vous", "support", "partenariat", "candidature", "spam", "autre"]
Urgency = Literal["haute", "normale", "basse"]
Language = Literal["fr", "en"]


class Lead(BaseModel):
    """Fiche CRM extraite d'un email. Une information absente vaut None."""

    model_config = ConfigDict(extra="forbid")

    contact_name: Optional[str]
    email: Optional[str]
    company: Optional[str]
    phone: Optional[str]
    intent: Intent
    urgency: Urgency
    budget_eur: Optional[float] = Field(default=None, ge=0)
    summary: str = Field(max_length=200)
    language: Language

    @field_validator("contact_name", "email", "company", "phone", mode="before")
    @classmethod
    def _empty_to_none(cls, v):
        if isinstance(v, str) and not v.strip():
            return None
        return v.strip() if isinstance(v, str) else v

    @field_validator("email")
    @classmethod
    def _lower_email(cls, v):
        return v.lower() if v else v


@lru_cache(maxsize=1)
def json_schema() -> dict:
    """Schéma JSON partagé avec le site (utilisé pour les structured outputs)."""
    return json.loads((SHARED_DIR / "lead.schema.json").read_text(encoding="utf-8"))


@lru_cache(maxsize=1)
def system_prompt() -> str:
    """Prompt système versionné, partagé avec le site."""
    return (SHARED_DIR / "extract_prompt.md").read_text(encoding="utf-8")
