"""Extracteur déterministe (sans LLM).

Sert de référence (baseline) pour l'évaluation et de repli quand l'API LLM
est indisponible. Même logique que web/lib/extract/rules.ts.
"""

from __future__ import annotations

import re

from .email_io import ParsedEmail
from .schema import Lead
from .text_utils import PHONE_RE, find_amounts_eur, fold, normalize_phone

EMAIL_RE = re.compile(r"[\w.+\-]+@[\w\-]+(?:\.[\w\-]+)+")

FREE_PROVIDERS = {
    "gmail", "googlemail", "yahoo", "hotmail", "outlook", "live", "msn", "icloud",
    "me", "orange", "free", "sfr", "laposte", "wanadoo", "protonmail", "proton", "gmx", "aol",
}

CLOSINGS = (
    "cordialement", "bien cordialement", "bien a vous", "salutations", "merci", "merci d'avance",
    "a bientot", "bonne journee", "belle journee", "best regards", "kind regards", "regards",
    "best", "thanks", "thank you", "cheers", "sincerely",
)

JOB_WORDS = (
    "responsable", "directeur", "directrice", "manager", "head", "ceo", "cto", "cfo", "coo",
    "fondateur", "fondatrice", "founder", "charge", "chargee", "assistant", "assistante",
    "gerant", "gerante", "consultant", "consultante", "president", "presidente", "lead",
    "ingenieur", "engineer", "acheteur", "acheteuse", "office", "commercial", "commerciale",
    "etudiant", "etudiante", "student", "developpeur", "developer", "rh", "recruteur",
)

NAME_RE = re.compile(r"^[A-ZÀ-Ý][a-zà-ÿ'\-]+(?:[ \-][A-ZÀ-Ý][A-Za-zà-ÿ'\-]+){1,2}$")

# Ordre = priorité en cas d'égalité.
INTENT_KEYWORDS: dict[str, tuple[str, ...]] = {
    "spam": (
        "felicitations", "vous avez gagne", "cliquez ici", "offre exceptionnelle", "crypto",
        "bitcoin", "gagnez", "lottery", "winner", "click here", "100% gratuit", "seo",
        "backlinks", "1ere page de google", "first page of google",
    ),
    "candidature": (
        "candidature", "cv", "alternance", "stage", "poste", "recrutement", "apply", "application",
        "resume", "internship", "position", "lettre de motivation",
    ),
    "support": (
        "bug", "erreur", "probleme", "ne fonctionne", "ne marche", "panne", "bloque", "error",
        "broken", "ticket", "not working", "issue", "plante", "facture en double",
        "rembourse", "acces",
    ),
    "partenariat": (
        "partenariat", "partnership", "partenaire", "partner", "collaboration", "collaborer",
        "co-marketing", "revendeur", "reseller", "affiliation", "integration commune",
    ),
    "devis": (
        "devis", "tarif", "prix", "cotation", "quote", "quotation", "pricing", "combien",
        "budget", "proposition commerciale", "cout", "chiffrage", "chiffrer",
    ),
    "rendez_vous": (
        "rendez-vous", "rendez vous", "rdv", "disponibilite", "disponible", "creneau", "visio",
        "meeting", "call", "rencontrer", "schedule", "appel", "echanger de vive voix",
    ),
}

URGENCY_LOW = (
    "pas urgent", "aucune urgence", "rien d'urgent", "quand vous aurez le temps", "pas presse",
    "no rush", "not urgent", "whenever you have time", "a votre convenance",
)
URGENCY_HIGH = (
    "urgent", "urgence", "asap", "au plus vite", "des que possible", "immediatement", "bloquant",
    "bloque", "critique", "critical", "aujourd'hui", "ce soir", "today", "tonight", "d'ici demain",
    "avant demain", "right away",
)

FR_WORDS = {"le", "la", "les", "de", "des", "et", "est", "pour", "vous", "nous", "je", "une",
            "un", "avec", "sur", "pas", "merci", "bonjour", "votre", "notre", "du", "au"}
EN_WORDS = {"the", "and", "is", "for", "you", "we", "i", "a", "an", "with", "on", "not",
            "thanks", "hello", "hi", "to", "of", "our", "your", "would", "please"}

GREETING_RE = re.compile(r"^(bonjour|bonsoir|hello|hi|dear|madame|monsieur|cher|chere|salut)\b", re.I)


def _has(haystack: str, needle: str) -> bool:
    return re.search(r"(?<![a-z0-9])" + re.escape(needle) + r"(?![a-z0-9])", haystack) is not None


def _signature_lines(body: str) -> list[str]:
    lines = [l.strip() for l in body.split("\n")]
    for i in range(len(lines) - 1, -1, -1):
        f = re.sub(r"[,.!\s]+$", "", fold(lines[i]))
        if f and len(f) < 40 and any(f == c or f.startswith(c + " ") for c in CLOSINGS):
            return [l for l in lines[i + 1:] if l]
    return []


def _name_from_signature(sig: list[str]) -> str | None:
    if sig and NAME_RE.match(sig[0]):
        return sig[0]
    return None


def _company_from_signature(sig: list[str], name: str | None) -> str | None:
    rest = sig[1:] if sig and name and sig[0] == name else sig
    name_tokens = set(fold(name or "").split())
    for line in rest[:3]:
        if fold(line) in name_tokens:  # signature réduite au prénom
            continue
        if EMAIL_RE.search(line) or PHONE_RE.search(line) or re.search(r"https?://|www\.", line):
            continue
        parts = re.split(r"\s+[—–\-|@]\s+|\s+chez\s+|\s+at\s+|,\s+", line)
        candidate = parts[-1].strip()
        if not candidate or len(candidate) > 40:
            continue
        if any(_has(fold(candidate), w) for w in JOB_WORDS):
            continue
        return candidate
    return None


def _company_from_domain(addr: str | None) -> str | None:
    if not addr or "@" not in addr:
        return None
    domain = addr.split("@", 1)[1].lower()
    root = domain.split(".")[0]
    if root in FREE_PROVIDERS:
        return None
    return " ".join(w.capitalize() for w in re.split(r"[-_]", root) if w)


def _intent(subject: str, body: str) -> str:
    fs, fb = fold(subject), fold(body)
    best, best_score = "autre", 0
    for intent, words in INTENT_KEYWORDS.items():
        score = sum(2 for w in words if _has(fs, w)) + sum(1 for w in words if _has(fb, w))
        if intent == "spam" and score >= 2:
            return "spam"
        if score > best_score:
            best, best_score = intent, score
    return best


def _urgency(text: str) -> str:
    f = fold(text)
    if any(_has(f, w) for w in URGENCY_LOW):
        return "basse"
    if any(_has(f, w) for w in URGENCY_HIGH):
        return "haute"
    return "normale"


def _language(text: str) -> str:
    words = re.findall(r"[a-zà-ÿ']+", text.lower())
    fr = sum(w in FR_WORDS for w in words)
    en = sum(w in EN_WORDS for w in words)
    return "en" if en > fr else "fr"


def _summary(subject: str | None, body: str) -> str:
    if subject:
        text = subject
    else:
        lines = [l.strip() for l in body.split("\n") if l.strip() and not GREETING_RE.match(l.strip())]
        text = re.split(r"(?<=[.!?])\s", lines[0])[0] if lines else "Email sans contenu exploitable."
    return text[:200]


def extract_rules(msg: ParsedEmail) -> Lead:
    body = msg.body
    full = f"{msg.subject or ''}\n{body}"
    sig = _signature_lines(body)

    email = msg.from_email
    if not email:
        m = EMAIL_RE.search(body)
        email = m.group(0).lower() if m else None

    name = msg.from_name or _name_from_signature(sig)
    company = _company_from_signature(sig, name) or _company_from_domain(email)

    phone_match = PHONE_RE.search(body)
    amounts = find_amounts_eur(full)

    return Lead(
        contact_name=name,
        email=email,
        company=company,
        phone=normalize_phone(phone_match.group(0)) if phone_match else None,
        intent=_intent(msg.subject or "", body),
        urgency=_urgency(full),
        budget_eur=amounts[0] if amounts else None,
        summary=_summary(msg.subject, body),
        language=_language(full),
    )
