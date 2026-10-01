"""Mini-CRM SQLite : insertion des leads avec dédoublonnage par email."""

from __future__ import annotations

import sqlite3
from datetime import datetime, timezone
from pathlib import Path

from .schema import Lead

SCHEMA = """
CREATE TABLE IF NOT EXISTS leads (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    email           TEXT UNIQUE,
    contact_name    TEXT,
    company         TEXT,
    phone           TEXT,
    intent          TEXT NOT NULL,
    urgency         TEXT NOT NULL,
    budget_eur      REAL,
    summary         TEXT NOT NULL,
    language        TEXT NOT NULL,
    messages        INTEGER NOT NULL DEFAULT 1,
    extraction_mode TEXT NOT NULL,
    first_seen      TEXT NOT NULL,
    last_seen       TEXT NOT NULL
);
"""

FIELDS = ("contact_name", "company", "phone", "intent", "urgency", "budget_eur", "summary", "language")


class CRM:
    def __init__(self, path: str | Path = ":memory:"):
        self.conn = sqlite3.connect(str(path))
        self.conn.row_factory = sqlite3.Row
        self.conn.executescript(SCHEMA)

    def upsert(self, lead: Lead, mode: str) -> tuple[int, bool]:
        """Insère un lead ou met à jour la fiche existante (même email).

        Retourne (id, créé). Les champs déjà connus ne sont pas écrasés par un null.
        """
        now = datetime.now(timezone.utc).isoformat(timespec="seconds")
        values = lead.model_dump()
        existing = None
        if lead.email:
            existing = self.conn.execute("SELECT id FROM leads WHERE email = ?", (lead.email,)).fetchone()

        if existing is None:
            cur = self.conn.execute(
                f"INSERT INTO leads (email, {', '.join(FIELDS)}, extraction_mode, first_seen, last_seen) "
                f"VALUES (?, {', '.join('?' for _ in FIELDS)}, ?, ?, ?)",
                (lead.email, *(values[f] for f in FIELDS), mode, now, now),
            )
            self.conn.commit()
            return cur.lastrowid, True

        sets = ", ".join(f"{f} = COALESCE(?, {f})" for f in FIELDS)
        self.conn.execute(
            f"UPDATE leads SET {sets}, messages = messages + 1, extraction_mode = ?, last_seen = ? WHERE id = ?",
            (*(values[f] for f in FIELDS), mode, now, existing["id"]),
        )
        self.conn.commit()
        return existing["id"], False

    def all(self) -> list[dict]:
        rows = self.conn.execute("SELECT * FROM leads ORDER BY urgency = 'haute' DESC, last_seen DESC")
        return [dict(r) for r in rows]

    def close(self) -> None:
        self.conn.close()
