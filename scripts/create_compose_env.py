"""Generate private local Compose credentials without overwriting an existing file."""

import secrets
from pathlib import Path

target = Path(__file__).resolve().parents[1] / ".env"
with target.open("x", encoding="utf-8") as output:
    for key in ("EVIDENCE_POSTGRES_PASSWORD", "EVIDENCE_DB_TOKEN", "EVIDENCE_INTEGRATION_TOKEN"):
        output.write(f"{key}={secrets.token_urlsafe(40)}\n")
print("Private .env created. It is excluded from Git.")
