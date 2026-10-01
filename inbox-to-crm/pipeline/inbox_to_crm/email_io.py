"""Lecture des emails entrants (.eml ou texte brut avec en-têtes From/Subject)."""

from __future__ import annotations

import email
import re
from dataclasses import dataclass
from email import policy
from email.utils import parseaddr
from pathlib import Path

HEADER_RE = re.compile(r"^(From|De|Subject|Objet|To|À|A|Date|Cc)\s*:\s*(.*)$", re.IGNORECASE)


@dataclass
class ParsedEmail:
    from_name: str | None
    from_email: str | None
    subject: str | None
    body: str

    def as_text(self) -> str:
        """Représentation texte envoyée au LLM."""
        head = []
        if self.from_email or self.from_name:
            name = f"{self.from_name} " if self.from_name else ""
            head.append(f"From: {name}<{self.from_email or ''}>")
        if self.subject:
            head.append(f"Subject: {self.subject}")
        return ("\n".join(head) + "\n\n" + self.body).strip()


def _split_from(value: str) -> tuple[str | None, str | None]:
    name, addr = parseaddr(value)
    return (name.strip() or None), (addr.strip().lower() or None)


def parse_text(raw: str) -> ParsedEmail:
    """Parse un email collé en texte : en-têtes optionnels, ligne vide, corps."""
    lines = raw.replace("\r\n", "\n").split("\n")
    headers: dict[str, str] = {}
    i = 0
    while i < len(lines):
        m = HEADER_RE.match(lines[i].strip())
        if not m:
            break
        key = m.group(1).lower()
        key = {"de": "from", "objet": "subject"}.get(key, key)
        headers[key] = m.group(2).strip()
        i += 1
    body = "\n".join(lines[i:]).strip()
    from_name, from_email = _split_from(headers["from"]) if "from" in headers else (None, None)
    return ParsedEmail(from_name, from_email, headers.get("subject") or None, body)


def parse_eml(raw: bytes) -> ParsedEmail:
    msg = email.message_from_bytes(raw, policy=policy.default)
    from_name, from_email = _split_from(str(msg.get("From", "")))
    part = msg.get_body(preferencelist=("plain", "html"))
    body = part.get_content() if part is not None else ""
    if part is not None and part.get_content_type() == "text/html":
        body = re.sub(r"<[^>]+>", " ", body)
    return ParsedEmail(from_name, from_email, str(msg.get("Subject", "")) or None, body.strip())


def read_email(path: Path) -> ParsedEmail:
    if path.suffix.lower() == ".eml":
        return parse_eml(path.read_bytes())
    return parse_text(path.read_text(encoding="utf-8"))
