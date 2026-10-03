"""Execute the real manual n8n workflow twice and check import idempotency.

Uses an isolated n8n data directory. Temporary credentials are never printed.
"""

import argparse
import json
import os
import shutil
import subprocess
from pathlib import Path

import httpx

ROOT = Path(__file__).resolve().parents[1]


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--n8n-path", type=Path, required=True, help="Path to n8n's bin/n8n file")
    parser.add_argument("--data-dir", type=Path, default=ROOT / "runtime" / "semantic")
    args = parser.parse_args()
    data = args.data_dir.resolve()
    config = json.loads((data / "local.env").read_text())
    private = data / "n8n-check"
    private.mkdir(parents=True, exist_ok=True)
    credentials = private / "credentials.json"
    credentials.write_text(
        json.dumps(
            [
                {
                    "id": "evidencedesk-local-header",
                    "name": "EvidenceDesk integration",
                    "type": "httpHeaderAuth",
                    "data": {"name": "X-Integration-Token", "value": config["EVIDENCE_INTEGRATION_TOKEN"]},
                }
            ]
        )
    )
    env = os.environ.copy()
    env.update(
        {
            "N8N_USER_FOLDER": str(private),
            "N8N_DIAGNOSTICS_ENABLED": "false",
            "N8N_VERSION_NOTIFICATIONS_ENABLED": "false",
            "N8N_TEMPLATES_ENABLED": "false",
        }
    )
    node = shutil.which("node")

    def run(*arguments):
        result = subprocess.run(
            [node, str(args.n8n_path.resolve()), *arguments],
            env=env,
            cwd=ROOT,
            text=True,
            capture_output=True,
            timeout=180,
        )
        if result.returncode:
            # n8n error output may echo headers; sanitize before displaying diagnostics.
            error = (result.stdout + result.stderr).replace(
                config["EVIDENCE_INTEGRATION_TOKEN"], "[redacted]"
            )
            raise RuntimeError(error[-4000:])
        return result.stdout

    try:
        run("import:credentials", "--input=" + str(credentials))
        for file in ("import-document.json", "webhook-document.json"):
            run("import:workflow", "--input=" + str(ROOT / "n8n" / file))
        run("execute", "--id=EvidenceDeskImport")
        run("execute", "--id=EvidenceDeskImport")
        with httpx.Client(base_url="http://127.0.0.1:8090", timeout=30) as client:
            client.post("/api/session", json={"role": "reviewer"}).raise_for_status()
            docs = client.get("/api/documents").json()["documents"]
            matching = [d for d in docs if d["name"] == "Automation guide.txt" and d["version"] == 1]
            assert len(matching) == 1, "Repeated n8n runs must create one document version"
        report = {
            "n8n_version": run("--version").strip(),
            "manual_workflow_executions": 2,
            "imported_versions": len(matching),
            "webhook_imported": True,
            "webhook_executed": False,
        }
        (ROOT / "docs" / "validation").mkdir(parents=True, exist_ok=True)
        (ROOT / "docs" / "validation" / "n8n.json").write_text(json.dumps(report, indent=2) + "\n")
        print(json.dumps(report, indent=2))
    finally:
        credentials.unlink(missing_ok=True)


if __name__ == "__main__":
    main()
