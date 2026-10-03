"""Verify an already-running demo using real HTTP calls and its background worker."""

import json
import time
from pathlib import Path

import httpx

with httpx.Client(base_url="http://127.0.0.1:8090", timeout=60) as client:
    client.get("/api/health").raise_for_status()
    client.get("/").raise_for_status()
    client.post("/api/session", json={"role": "reviewer"}).raise_for_status()
    client.post("/api/demo/seed").raise_for_status()
    deadline = time.monotonic() + 900
    while time.monotonic() < deadline:
        docs = client.get("/api/documents").json()["documents"]
        assert not any(d["status"] == "failed" for d in docs), "An import failed"
        if docs and all(d["status"] == "ready" for d in docs):
            break
        time.sleep(2)
    else:
        raise AssertionError("Import deadline expired")
    result = client.post("/api/questions", json={"question": "What is the customer refund window?"}).json()
    assert result["status"] == "answered" and "30 days" in result["answer"]
    assert all(s["quote"] in s["text"] for s in result["sources"])
    result = client.post(
        "/api/questions", json={"question": "What is my live order status for order 89127?"}
    ).json()
    assert result["status"] == "needs_review"
    review = client.post(f"/api/questions/{result['id']}/review").json()
    approved = client.post(
        f"/api/reviews/{review['id']}",
        json={
            "version": review["version"],
            "draft": "Check this order in the operational system before responding. This document library has no live order records.",
            "action": "approve",
        },
    )
    assert approved.status_code == 200 and approved.json()["status"] == "approved"
    run_id = client.post("/api/evaluations").json()["id"]
    deadline = time.monotonic() + 180
    while time.monotonic() < deadline:
        run = next(r for r in client.get("/api/evaluations").json()["runs"] if r["id"] == run_id)
        if run["status"] == "complete":
            break
        assert run["status"] != "failed", run.get("summary")
        time.sleep(2)
    else:
        raise AssertionError("Evaluation deadline expired")
    assert run["summary"]["total"] == 44
    assert run["summary"]["passed"] == 44, "Inspect failed fixture cases before publishing"
    report = Path(__file__).resolve().parents[1] / "docs" / "validation"
    report.mkdir(parents=True, exist_ok=True)
    (report / "evaluation.json").write_text(
        json.dumps(run, indent=2, ensure_ascii=False) + "\n", encoding="utf-8"
    )
    client.post("/api/session", json={"role": "viewer"}).raise_for_status()
    assert client.get("/api/reviews").status_code == 403
    result = client.post("/api/questions", json={"question": "What is the internal cost center?"}).json()
    assert result["status"] == "needs_review" and "ORBIT-42" not in result["answer"]
    print(
        json.dumps(
            {
                "health": "ok",
                "documents_ready": len(docs),
                "evaluation": run["summary"],
                "internal_review": "approved",
                "reader_boundary": "passed",
            },
            indent=2,
        )
    )
