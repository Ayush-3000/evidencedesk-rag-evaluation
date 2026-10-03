import os
import secrets
import shutil
import socket
import subprocess
import time

import httpx
import pytest
from fastapi.testclient import TestClient


@pytest.fixture(scope="session", autouse=True)
def database(tmp_path_factory):
    data = tmp_path_factory.mktemp("evidence-test")
    with socket.socket() as probe:
        probe.bind(("127.0.0.1", 0))
        port = probe.getsockname()[1]
    settings = {
        "EVIDENCE_DB_TOKEN": secrets.token_urlsafe(40),
        "EVIDENCE_INTEGRATION_TOKEN": secrets.token_urlsafe(40),
        "EVIDENCE_DATA_DIR": str(data),
        "EVIDENCE_PGLITE_DIR": str(data / "postgres"),
        "EVIDENCE_DB_PORT": str(port),
        "EVIDENCE_DB_URL": f"http://127.0.0.1:{port}",
        "EVIDENCE_EMBEDDINGS": "hash",
        "EVIDENCE_DRAFTER": "extractive",
        "EVIDENCE_MODE": "demo",
    }
    settings["DATABASE_URL"] = os.getenv("EVIDENCE_TEST_DATABASE_URL", "")
    previous = {key: os.environ.get(key) for key in settings}
    os.environ.update(settings)
    process = None

    def start():
        nonlocal process
        process = subprocess.Popen(
            [shutil.which("node"), "db/server.mjs"], stdout=subprocess.DEVNULL, stderr=subprocess.PIPE
        )
        for _ in range(100):
            if process.poll() is not None:
                raise RuntimeError(process.stderr.read().decode())
            try:
                if httpx.get(settings["EVIDENCE_DB_URL"] + "/health", timeout=1).status_code == 200:
                    return
            except httpx.HTTPError:
                pass
            time.sleep(0.2)
        raise RuntimeError("Test database startup timeout")

    start()
    yield {"restart": lambda: (process.terminate(), process.wait(timeout=10), start())}
    if process.poll() is None:
        process.terminate()
        process.wait(timeout=10)
    for key, value in previous.items():
        if value is None:
            os.environ.pop(key, None)
        else:
            os.environ[key] = value


@pytest.fixture()
def client(database):
    from evidencedesk.app import app
    from evidencedesk import core

    core.initialize()
    core.batch(
        [
            (f"TRUNCATE {table} CASCADE", [])
            for table in (
                "chunks",
                "documents",
                "jobs",
                "reviews",
                "questions",
                "evaluation_runs",
                "sessions",
                "audit",
            )
        ]
    )
    core.embed.cache_clear()
    with TestClient(app) as client:
        client.post("/api/session", json={"role": "reviewer"})
        yield client


@pytest.fixture()
def core():
    from evidencedesk import core

    return core


@pytest.fixture()
def uploaded(client, core):
    result = client.post(
        "/api/documents",
        files={
            "file": (
                "Policy.txt",
                b"Customers can request a refund within 30 days of delivery. Refunds are issued to the original payment method.",
                "text/plain",
            )
        },
    ).json()
    assert core.work_once()
    return result["document"]
