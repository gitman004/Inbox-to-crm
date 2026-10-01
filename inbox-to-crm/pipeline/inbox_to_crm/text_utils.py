"""Fonctions de normalisation partagées par les extracteurs, les garde-fous et l'évaluation."""

from __future__ import annotations

import re
import unicodedata

PHONE_RE = re.compile(
    r"(?:(?:\+|00)\d{2}[\s.\-]?(?:\(0\)[\s.\-]?)?|\b0)[1-9](?:[\s.\-]?\d{2}){4}\b"
)

AMOUNT_RE = re.compile(
    r"(?<![\d.,])(?P<num>\d{1,3}(?:[ \u00a0\u202f.]\d{3})+(?:,\d+)?|\d+(?:[.,]\d+)?)\s*"
    r"(?P<unit>k\s*€|k\s*euros?\b|k\s*eur\b|€|euros?\b|eur\b)",
    re.IGNORECASE,
)
AMOUNT_PREFIX_RE = re.compile(r"€\s*(?P<num>\d{1,3}(?:[ \u00a0\u202f.,]\d{3})+|\d+)(?P<k>\s*k\b)?", re.IGNORECASE)


def fold(text: str) -> str:
    """Minuscules sans accents, pour comparer et chercher des mots-clés."""
    text = unicodedata.normalize("NFKD", text)
    return "".join(c for c in text if not unicodedata.combining(c)).lower()


def normalize_phone(raw: str | None) -> str | None:
    """Convertit un numéro au format E.164 (+33612345678)."""
    if not raw:
        return None
    digits = re.sub(r"[^\d+]", "", raw)
    if digits.startswith("00"):
        digits = "+" + digits[2:]
    if digits.startswith("+330"):
        digits = "+33" + digits[4:]
    if digits.startswith("0") and len(digits) == 10:
        digits = "+33" + digits[1:]
    if not digits.startswith("+"):
        return digits if len(digits) >= 9 else None
    return digits if len(digits) >= 10 else None


def _parse_number(num: str) -> float:
    num = num.replace("\u00a0", " ").replace("\u202f", " ")
    if re.fullmatch(r"\d{1,3}(?:[ .,]\d{3})+", num):
        return float(re.sub(r"[ .,]", "", num))
    if re.fullmatch(r"\d{1,3}(?:[ .]\d{3})+,\d+", num):
        whole, dec = num.rsplit(",", 1)
        return float(re.sub(r"[ .]", "", whole) + "." + dec)
    return float(num.replace(",", "."))


def find_amounts_eur(text: str) -> list[float]:
    """Tous les montants en euros trouvés dans le texte, dans l'ordre d'apparition."""
    found: list[tuple[int, float]] = []
    for m in AMOUNT_RE.finditer(text):
        value = _parse_number(m.group("num"))
        if m.group("unit").lower().startswith("k"):
            value *= 1000
        found.append((m.start(), value))
    for m in AMOUNT_PREFIX_RE.finditer(text):
        value = _parse_number(m.group("num"))
        if m.group("k"):
            value *= 1000
        found.append((m.start(), value))
    found.sort()
    return [v for _, v in found]
