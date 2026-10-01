"""inbox-to-crm : transformer des emails entrants en fiches CRM structurées."""

from .email_io import ParsedEmail, parse_text, read_email
from .extract import ExtractionResult, extract
from .schema import Lead

__all__ = ["Lead", "ParsedEmail", "ExtractionResult", "extract", "parse_text", "read_email"]
