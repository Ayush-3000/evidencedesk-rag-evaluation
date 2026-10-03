"""Start a loopback-only demo. No paid model calls or external notifications."""

import argparse
import json
import os
import secrets
import shutil
import socket
import subprocess
import sys
import time
from pathlib import Path

import httpx

ROOT = Path(__file__).resolve().parents[1]


def wait_url(url, process, seconds=45):
    deadline = time.monotonic() + seconds
    while time.monotonic() < deadline:
        if process.poll() is not None:
            raise RuntimeError("A service exited before it became ready")
        try:
            if httpx.get(url, timeout=2).status_code == 200:
                return
        except httpx.HTTPError:
            pass
        time.sleep(0.5)
    raise RuntimeError("Timed out waiting for " + url)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--offline", action="store_true", help="Explicit lexical/hash mode: no embedding model download"
    )
    parser.add_argument("--no-seed", action="store_true")
    args = parser.parse_args()
    os.chdir(ROOT)
    env = os.environ.copy()
    data = Path(
        env.get("EVIDENCE_DATA_DIR", ROOT / "runtime" / ("offline" if args.offline else "semantic"))
    ).resolve()
    data.mkdir(parents=True, exist_ok=True)
    config = data / "local.env"
    if config.exists():
        saved = json.loads(config.read_text())
    else:
        saved = {
            "EVIDENCE_DB_TOKEN": secrets.token_urlsafe(40),
            "EVIDENCE_INTEGRATION_TOKEN": secrets.token_urlsafe(40),
        }
        config.write_text(json.dumps(saved))
    env.update(saved)
    env["EVIDENCE_DATA_DIR"] = str(data)
    env["EVIDENCE_PGLITE_DIR"] = str(data / "postgres")
    env["EVIDENCE_MODE"] = "demo"
    env["EVIDENCE_DRAFTER"] = "extractive"
    env["EVIDENCE_EMBEDDINGS"] = "hash" if args.offline else "fastembed"
    env["EVIDENCE_DB_URL"] = "http://127.0.0.1:8091"
    env["EVIDENCE_DB_PORT"] = "8091"
    env.pop("DATABASE_URL", None)
    env.pop("OPENAI_API_KEY", None)
    for port in (8090, 8091):
        with socket.socket() as probe:
            if probe.connect_ex(("127.0.0.1", port)) == 0:
                raise RuntimeError(f"Port {port} is already occupied; no existing service was stopped")
    node = shutil.which("node")
    if not node:
        raise RuntimeError("Install Node.js 22 or 24 and put node on PATH")
    if not (ROOT / "web" / "dist" / "index.html").exists():
        pnpm = shutil.which("pnpm")
        if not pnpm:
            raise RuntimeError("Build the UI first with pnpm install and pnpm build")
        subprocess.run([pnpm, "build"], check=True, cwd=ROOT)
    services = []

    def start(command):
        process = subprocess.Popen(command, cwd=ROOT, env=env)
        services.append(process)
        return process

    try:
        db = start([node, "db/server.mjs"])
        wait_url("http://127.0.0.1:8091/health", db)
        api = start(
            [sys.executable, "-m", "uvicorn", "evidencedesk.app:app", "--host", "127.0.0.1", "--port", "8090"]
        )
        wait_url("http://127.0.0.1:8090/api/health", api)
        worker = start([sys.executable, "-m", "evidencedesk.worker"])
        with httpx.Client(base_url="http://127.0.0.1:8090", timeout=60) as client:
            client.post("/api/session", json={"role": "reviewer"}).raise_for_status()
            if not args.no_seed:
                client.post("/api/demo/seed").raise_for_status()
                print(
                    "Indexing the fictional document library. First run downloads a local embedding model.",
                    flush=True,
                )
                deadline = time.monotonic() + 900
                while time.monotonic() < deadline:
                    docs = client.get("/api/documents").json()["documents"]
                    if any(d["status"] == "failed" for d in docs):
                        raise RuntimeError("A document import failed; inspect the local worker log")
                    if docs and all(d["status"] == "ready" for d in docs):
                        break
                    if worker.poll() is not None:
                        raise RuntimeError("The worker exited")
                    time.sleep(3)
                else:
                    raise RuntimeError("Document indexing timed out")
                if not client.get("/api/evaluations").json()["runs"]:
                    client.post("/api/evaluations").raise_for_status()
            print("EvidenceDesk ready: http://127.0.0.1:8090", flush=True)
            print("Press Ctrl+C to stop all three local services.", flush=True)
        while all(process.poll() is None for process in services):
            time.sleep(1)
    except KeyboardInterrupt:
        pass
    finally:
        for process in reversed(services):
            if process.poll() is None:
                process.terminate()
        for process in reversed(services):
            try:
                process.wait(timeout=5)
            except subprocess.TimeoutExpired:
                process.kill()


if __name__ == "__main__":
    main()
