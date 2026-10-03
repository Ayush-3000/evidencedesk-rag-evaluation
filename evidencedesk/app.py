from __future__ import annotations

import hashlib
import hmac
import json
import os
import secrets
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import Depends, FastAPI, File, Form, HTTPException, Request, Response, UploadFile
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field
from starlette.concurrency import run_in_threadpool

from evidencedesk import core


def clean_document(doc):
    return {key: value for key, value in doc.items() if key not in ("path", "sha")}


class SessionInput(BaseModel):
    role: str = "reviewer"


class QuestionInput(BaseModel):
    question: str = Field(min_length=3, max_length=1200)


class ReviewInput(BaseModel):
    version: int = Field(ge=1)
    draft: str = Field(max_length=6000)
    action: str


class IntegrationInput(BaseModel):
    name: str = Field(min_length=1, max_length=180)
    text: str = Field(min_length=1, max_length=200000)
    visibility: str = "public"
    version: int = Field(default=1, ge=1, le=10000)


@asynccontextmanager
async def lifespan(app):
    if os.getenv("EVIDENCE_MODE", "demo") != "demo":
        raise RuntimeError(
            "This release is a local demo. Add real identity/HTTPS before production deployment."
        )
    core.initialize()
    yield


app = FastAPI(title="EvidenceDesk", version="0.1.0", lifespan=lifespan)


@app.middleware("http")
async def origin_guard(request: Request, call_next):
    origin = request.headers.get("origin")
    allowed = set(
        os.getenv(
            "EVIDENCE_ALLOWED_ORIGINS",
            "http://127.0.0.1:8090,http://localhost:8090,http://127.0.0.1:5174,http://localhost:5174",
        ).split(",")
    )
    if request.method not in ("GET", "HEAD", "OPTIONS") and origin and origin not in allowed:
        return Response("Cross-origin mutation rejected", status_code=403)
    response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["Referrer-Policy"] = "no-referrer"
    return response


def principal(request: Request):
    token = request.cookies.get("evidence_session", "")
    rows = core.sql(
        "SELECT id,role FROM sessions WHERE id=$1 AND expires_at>now()",
        [hashlib.sha256(token.encode()).hexdigest()],
    )
    if not token or not rows:
        raise HTTPException(401, "Choose a demo role to open the workspace")
    return rows[0]


def reviewer(user=Depends(principal)):
    if user["role"] != "reviewer":
        raise HTTPException(403, "Reviewer access is required")
    return user


@app.get("/api/health")
def health():
    core.sql("SELECT 1")
    return {
        "ok": True,
        "mode": "demo",
        "drafting": os.getenv("EVIDENCE_DRAFTER", "extractive"),
        "embeddings": os.getenv("EVIDENCE_EMBEDDINGS", "fastembed"),
    }


@app.post("/api/session")
def session(payload: SessionInput, response: Response):
    if payload.role not in ("viewer", "reviewer"):
        raise HTTPException(400, "Unknown demo role")
    token = secrets.token_urlsafe(32)
    core.sql(
        "INSERT INTO sessions(id,role,expires_at) VALUES($1,$2,now()+interval '8 hours')",
        [hashlib.sha256(token.encode()).hexdigest(), payload.role],
    )
    response.set_cookie("evidence_session", token, httponly=True, samesite="strict", max_age=28800)
    return {"role": payload.role, "mode": "demo"}


@app.get("/api/session")
def current_session(user=Depends(principal)):
    return {"role": user["role"], "mode": "demo"}


@app.get("/api/documents")
def documents(user=Depends(principal)):
    docs = core.sql(
        "SELECT * FROM documents WHERE visibility='public' OR $1='reviewer' ORDER BY created_at DESC",
        [user["role"]],
    )
    for doc in docs:
        jobs = core.sql(
            "SELECT id,status,stage,progress,error FROM jobs WHERE kind='ingest' AND payload->>'document_id'=$1 ORDER BY created_at DESC LIMIT 1",
            [doc["id"]],
        )
        doc["job"] = jobs[0] if jobs else None
    return {"documents": [clean_document(d) for d in docs]}


@app.post("/api/documents")
async def upload(
    file: UploadFile = File(...),
    visibility: str = Form("public"),
    version: int = Form(1),
    user=Depends(principal),
):
    if visibility not in ("public", "staff") or not 1 <= version <= 10000:
        raise HTTPException(400, "Invalid document metadata")
    if visibility == "staff" and user["role"] != "reviewer":
        raise HTTPException(403, "Only reviewers can upload staff documents")
    content = await file.read(10 * 1024 * 1024 + 1)
    try:
        result = await run_in_threadpool(
            core.ingest, file.filename or "document.pdf", content, visibility, version, user["id"]
        )
        result["document"] = clean_document(result["document"])
        return result
    except ValueError as error:
        raise HTTPException(409, str(error)) from error


@app.post("/api/integrations/documents")
def integration(payload: IntegrationInput, request: Request):
    secret = os.environ.get("EVIDENCE_INTEGRATION_TOKEN", "")
    if len(secret) < 32 or not hmac.compare_digest(secret, request.headers.get("x-integration-token", "")):
        raise HTTPException(401, "Invalid integration credential")
    if payload.visibility not in ("public", "staff"):
        raise HTTPException(400, "Invalid visibility")
    try:
        result = core.ingest(payload.name, payload.text.encode(), payload.visibility, payload.version, "n8n")
        result["document"] = clean_document(result["document"])
        return result
    except ValueError as error:
        raise HTTPException(409, str(error)) from error


@app.get("/api/documents/{document_id}/source")
def source(document_id: str, user=Depends(principal)):
    docs = core.sql(
        "SELECT * FROM documents WHERE id=$1 AND (visibility='public' OR $2='reviewer')",
        [document_id, user["role"]],
    )
    if not docs:
        raise HTTPException(404, "Document unavailable")
    doc = docs[0]
    return FileResponse(
        doc["path"],
        filename=doc["name"],
        media_type="application/pdf" if doc["name"].lower().endswith(".pdf") else "text/plain",
    )


@app.post("/api/documents/{document_id}/retry")
def retry_import(document_id: str, user=Depends(principal)):
    jid = core.uid()
    rows = core.sql(
        """WITH retry AS (
        UPDATE documents SET status='queued',error=NULL WHERE id=$1 AND status='failed'
        AND (visibility='public' OR $2='reviewer') RETURNING id)
        INSERT INTO jobs(id,kind,payload) SELECT $3,'ingest',jsonb_build_object('document_id',id)
        FROM retry RETURNING id""",
        [document_id, user["role"], jid],
    )
    if not rows:
        raise HTTPException(409, "Only a failed permitted import can be retried")
    core.audit(user["id"], "document.retried", document_id)
    return {"job_id": jid}


@app.post("/api/questions")
def ask(payload: QuestionInput, user=Depends(principal)):
    return core.store_question(payload.question.strip(), user["id"], user["role"])


@app.get("/api/questions")
def history(user=Depends(principal)):
    return {
        "questions": core.sql(
            "SELECT * FROM questions WHERE owner=$1 ORDER BY created_at DESC LIMIT 30", [user["id"]]
        )
    }


@app.post("/api/questions/{qid}/review")
def request_review(qid: str, user=Depends(principal)):
    questions = core.sql("SELECT * FROM questions WHERE id=$1 AND owner=$2", [qid, user["id"]])
    if not questions:
        raise HTTPException(404, "Question unavailable")
    if questions[0]["status"] != "needs_review":
        raise HTTPException(409, "Only unresolved questions require review")
    rows = core.sql(
        "INSERT INTO reviews(id,question_id,draft) VALUES($1,$2,'A teammate will review this question and check the supporting documents.') ON CONFLICT(question_id) DO UPDATE SET question_id=excluded.question_id RETURNING *",
        [core.uid(), qid],
    )
    core.audit(user["id"], "review.requested", rows[0]["id"])
    return rows[0]


@app.get("/api/reviews")
def reviews(user=Depends(reviewer)):
    return {
        "reviews": core.sql(
            "SELECT r.*,q.question,q.answer,q.reason,q.sources,q.role FROM reviews r JOIN questions q ON q.id=r.question_id ORDER BY r.updated_at DESC LIMIT 100"
        )
    }


@app.post("/api/reviews/{rid}")
def update_review(rid: str, payload: ReviewInput, user=Depends(reviewer)):
    if payload.action not in ("approve", "save"):
        raise HTTPException(400, "Unknown review action")
    if payload.action == "approve" and not payload.draft.strip():
        raise HTTPException(400, "A draft is required")
    rows = core.sql(
        "UPDATE reviews SET draft=$2,status=$3,version=version+1,updated_at=now() WHERE id=$1 AND version=$4 AND status='open' RETURNING *",
        [rid, payload.draft, "approved" if payload.action == "approve" else "open", payload.version],
    )
    if not rows:
        raise HTTPException(409, "The review changed or was already approved. Reload before continuing.")
    core.audit(user["id"], "review." + payload.action, rid, {"version": rows[0]["version"]})
    return rows[0]


@app.post("/api/evaluations")
def start_evaluation(user=Depends(reviewer)):
    running = core.sql("SELECT id FROM evaluation_runs WHERE status IN ('pending','running')")
    if running:
        return {"id": running[0]["id"], "existing": True}
    eid, jid = core.uid(), core.uid()
    core.batch(
        [
            ("INSERT INTO evaluation_runs(id,job_id) VALUES($1,$2) ON CONFLICT DO NOTHING", [eid, jid]),
            (
                "INSERT INTO jobs(id,kind,payload) SELECT $1,'evaluation',$2::jsonb WHERE EXISTS(SELECT 1 FROM evaluation_runs WHERE id=$3)",
                [jid, json.dumps({"run_id": eid}), eid],
            ),
        ]
    )
    running = core.sql("SELECT id FROM evaluation_runs WHERE status IN ('pending','running')")
    if running and running[0]["id"] != eid:
        return {"id": running[0]["id"], "existing": True}
    core.audit(user["id"], "evaluation.started", eid)
    return {"id": eid, "job_id": jid}


@app.get("/api/evaluations")
def evaluations(user=Depends(reviewer)):
    return {"runs": core.sql("SELECT * FROM evaluation_runs ORDER BY created_at DESC LIMIT 12")}


@app.get("/api/audit")
def events(user=Depends(reviewer)):
    return {"events": core.sql("SELECT * FROM audit ORDER BY created_at DESC LIMIT 50")}


@app.post("/api/demo/seed")
def seed(user=Depends(reviewer)):
    docs = json.loads((core.ROOT / "fixtures" / "documents.json").read_text(encoding="utf-8"))
    output = [
        core.ingest(d["name"], d["text"].encode(), d["visibility"], d["version"], user["id"]) for d in docs
    ]
    return {"added": sum(not d["duplicate"] for d in output), "existing": sum(d["duplicate"] for d in output)}


static = Path(__file__).resolve().parents[1] / "web" / "dist"
if static.exists():
    app.mount("/assets", StaticFiles(directory=static / "assets"), name="assets")

    @app.get("/")
    def index():
        return FileResponse(static / "index.html")
