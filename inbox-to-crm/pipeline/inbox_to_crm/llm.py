"""Extraction par LLM avec sortie structurée (JSON Schema strict) et réessai sur erreur."""

from __future__ import annotations

import json
import os
from typing import Any

from pydantic import ValidationError

from .email_io import ParsedEmail
from .schema import Lead, json_schema, system_prompt

DEFAULT_MODEL = "gpt-4o-mini"


class ExtractionError(RuntimeError):
    pass


def _response_format() -> dict:
    schema = {k: v for k, v in json_schema().items() if k not in ("$schema", "title")}
    return {
        "type": "json_schema",
        "json_schema": {"name": "lead", "strict": True, "schema": schema},
    }


def _default_client():
    try:
        from openai import OpenAI
    except ImportError as exc:  # dépendance optionnelle
        raise ExtractionError("Le paquet 'openai' n'est pas installé (pip install openai).") from exc
    return OpenAI()


def extract_llm(
    msg: ParsedEmail,
    client: Any | None = None,
    model: str | None = None,
    max_attempts: int = 2,
) -> Lead:
    """Appelle le LLM puis valide la réponse avec Pydantic.

    Si la sortie est invalide (JSON cassé, champ hors schéma, résumé trop long…),
    l'erreur est renvoyée au modèle pour une seconde tentative.
    """
    client = client or _default_client()
    model = model or os.getenv("OPENAI_MODEL", DEFAULT_MODEL)
    messages: list[dict] = [
        {"role": "system", "content": system_prompt()},
        {"role": "user", "content": f"Email à analyser :\n<<<\n{msg.as_text()}\n>>>"},
    ]
    last_error = ""
    for _ in range(max_attempts):
        response = client.chat.completions.create(
            model=model,
            messages=messages,
            response_format=_response_format(),
            temperature=0,
        )
        content = response.choices[0].message.content or ""
        try:
            return Lead.model_validate(json.loads(content))
        except (json.JSONDecodeError, ValidationError) as exc:
            last_error = str(exc)
            messages += [
                {"role": "assistant", "content": content},
                {
                    "role": "user",
                    "content": f"Ta réponse est invalide : {last_error}\nRenvoie uniquement le JSON corrigé.",
                },
            ]
    raise ExtractionError(f"Sortie LLM invalide après {max_attempts} tentatives : {last_error}")
