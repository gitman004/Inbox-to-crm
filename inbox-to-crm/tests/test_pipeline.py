import json
from pathlib import Path
from types import SimpleNamespace

import pytest

from inbox_to_crm.cli import main as cli_main
from inbox_to_crm.crm import CRM
from inbox_to_crm.email_io import parse_text
from inbox_to_crm.extract import extract
from inbox_to_crm.guards import check_against_source
from inbox_to_crm.llm import ExtractionError, extract_llm
from inbox_to_crm.rules import extract_rules
from inbox_to_crm.schema import Lead
from inbox_to_crm.text_utils import find_amounts_eur, normalize_phone

ROOT = Path(__file__).resolve().parents[1]

EMAIL = """From: Julie Martin <j.martin@transports-leroy.fr>
Subject: Demande de devis

Bonjour, pouvez-vous nous faire un devis ? Budget : 15 000 € HT.

Cordialement,
Julie Martin
Responsable logistique — Transports Leroy
06 39 98 12 45
"""


def make_lead(**overrides) -> Lead:
    base = dict(contact_name="Julie Martin", email="j.martin@transports-leroy.fr", company="Transports Leroy",
                phone="+33639981245", intent="devis", urgency="normale", budget_eur=15000,
                summary="Demande de devis.", language="fr")
    base.update(overrides)
    return Lead(**base)


class FakeClient:
    """Imite client.chat.completions.create en renvoyant des réponses prédéfinies."""

    def __init__(self, *contents):
        self.contents = list(contents)
        self.calls = []
        self.chat = SimpleNamespace(completions=SimpleNamespace(create=self._create))

    def _create(self, **kwargs):
        self.calls.append(kwargs)
        content = self.contents.pop(0)
        if isinstance(content, Exception):
            raise content
        return SimpleNamespace(choices=[SimpleNamespace(message=SimpleNamespace(content=content))])


# --- normalisation -----------------------------------------------------------

@pytest.mark.parametrize("raw,expected", [
    ("06 39 98 12 45", "+33639981245"),
    ("+33 (0)6 39 98 12 45", "+33639981245"),
    ("0033 1 99 00 34 21", "+33199003421"),
])
def test_normalize_phone(raw, expected):
    assert normalize_phone(raw) == expected


@pytest.mark.parametrize("text,expected", [
    ("budget de 15 000 € HT", [15000]),
    ("environ 4k€", [4000]),
    ("2,5 k€", [2500]),
    ("around €12,000", [12000]),
    ("en 2026, 3 000 euros", [3000]),
])
def test_find_amounts(text, expected):
    assert find_amounts_eur(text) == expected


# --- extracteur à règles ------------------------------------------------------

def test_rules_extracts_core_fields():
    lead = extract_rules(parse_text(EMAIL))
    assert lead.contact_name == "Julie Martin"
    assert lead.company == "Transports Leroy"
    assert lead.phone == "+33639981245"
    assert lead.intent == "devis"
    assert lead.budget_eur == 15000
    assert lead.language == "fr"


def test_rules_free_provider_gives_no_company():
    lead = extract_rules(parse_text("From: Lucas <lucas@gmail.com>\nSubject: Candidature\n\nMon CV en PJ."))
    assert lead.company is None
    assert lead.intent == "candidature"


# --- garde-fous -----------------------------------------------------------------

def test_guards_remove_invented_fields():
    lead = make_lead(phone="+33611111111", budget_eur=50000, email="autre@exemple.fr")
    checked, warnings = check_against_source(lead, EMAIL)
    assert checked.phone is None
    assert checked.budget_eur is None
    assert checked.email is None
    assert len(warnings) == 3


def test_guards_keep_fields_present_in_source():
    checked, warnings = check_against_source(make_lead(), EMAIL)
    assert warnings == []
    assert checked == make_lead()


# --- LLM (client simulé) --------------------------------------------------------

def test_llm_uses_strict_json_schema():
    client = FakeClient(json.dumps(make_lead().model_dump()))
    extract_llm(parse_text(EMAIL), client=client)
    fmt = client.calls[0]["response_format"]
    assert fmt["type"] == "json_schema" and fmt["json_schema"]["strict"] is True
    assert "$schema" not in fmt["json_schema"]["schema"]


def test_llm_retries_after_invalid_output():
    valid = json.dumps(make_lead().model_dump())
    client = FakeClient("{pas du json", valid)
    lead = extract_llm(parse_text(EMAIL), client=client)
    assert lead.company == "Transports Leroy"
    assert len(client.calls) == 2
    assert "invalide" in client.calls[1]["messages"][-1]["content"]


def test_llm_gives_up_after_max_attempts():
    bad = json.dumps({**make_lead().model_dump(), "intent": "inconnu"})
    with pytest.raises(ExtractionError):
        extract_llm(parse_text(EMAIL), client=FakeClient(bad, bad))


def test_auto_mode_applies_guards_to_llm_output():
    hallucinated = json.dumps(make_lead(phone="+33600000000").model_dump())
    result = extract(parse_text(EMAIL), mode="auto", client=FakeClient(hallucinated))
    assert result.mode == "llm"
    assert result.lead.phone is None
    assert any("téléphone" in w for w in result.warnings)


def test_auto_mode_falls_back_to_rules_when_api_fails():
    result = extract(parse_text(EMAIL), mode="auto", client=FakeClient(TimeoutError("timeout")))
    assert result.mode == "rules"
    assert result.lead.budget_eur == 15000
    assert result.warnings


# --- CRM ------------------------------------------------------------------------

def test_crm_deduplicates_by_email_and_keeps_known_fields():
    crm = CRM()
    first_id, created = crm.upsert(make_lead(), "rules")
    assert created
    second_id, created = crm.upsert(make_lead(phone=None, budget_eur=None, summary="Relance."), "rules")
    assert not created and second_id == first_id
    row = crm.all()[0]
    assert row["messages"] == 2
    assert row["phone"] == "+33639981245"  # pas écrasé par un null
    assert row["summary"] == "Relance."


def test_cli_run_on_eval_set(tmp_path, capsys):
    db = tmp_path / "crm.sqlite"
    assert cli_main(["run", str(ROOT / "evals" / "emails"), "--db", str(db), "--mode", "rules"]) == 0
    rows = CRM(db).all()
    # 15 emails : 1 spam ignoré, 2 emails du même contact fusionnés -> 13 fiches
    assert len(rows) == 13
    assert "1 spam ignoré" in capsys.readouterr().err
