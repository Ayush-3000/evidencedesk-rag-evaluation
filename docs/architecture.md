# Architecture and tradeoffs

## Data flow

Uploads are validated for file extension, size, version, and access scope. The original file is stored under a generated identifier. A database transaction inserts document metadata, an indexing job, and an audit record. Identical filename/version/access and bytes return the existing document; changed bytes at an existing version are rejected.

The worker claims jobs using `FOR UPDATE SKIP LOCKED`, updates a lease while running, extracts page text, splits it into overlapping 700-character passages, and computes 384-dimensional BGE embeddings. Chunk replacement and document activation are one transaction. A failed replacement leaves the older ready version active. An older version finishing later cannot replace a newer ready version. Interrupted jobs are recovered after an expired 120-second lease, with at most three claims. Failed imports can be explicitly retried from Library.

Retrieval filters active, ready documents by access **before** calculating similarity and ranking. It combines pgvector cosine distance, PostgreSQL text ranking, and lightweight normalized term overlap. The no-key answer mode picks one supporting sentence from the top passage. A semantic match alone is insufficient. Unknown evidence, live-record requests, policy exceptions, and detected instruction-like content create a handoff. These heuristics are intentionally limited and can still miss or select an irrelevant passage on unseen documents.

The optional OpenAI path chooses exact quotations from the retrieved set using a strict response schema. Returned source IDs must belong to that set, and quotations must be substrings of their source. Failed calls or validation failures produce a handoff. Exact citation validity does not prove that a quotation fully answers the question. The current API contract is tested with a mock; live model quality has not been measured.

Reviews use explicit user handoff and a monotonically increasing revision. Saving/approving requires the current revision and an open review. Approval does not invoke an external sender. Audit records capture document upload/retry, review actions, and evaluation start.

## Storage and services

- **FastAPI:** HTTP API, file access, demo sessions and built UI.
- **Worker:** separate process for indexing and fixture evaluations.
- **SQL bridge:** internal HTTP transport to PGlite or `pg`. Bound parameters, serialized transactions, random token, 16 MB body limit, 500 statements per transaction.
- **PostgreSQL:** documents, vector passages, jobs, questions, reviews, evaluation runs, hashed sessions and audit records. Semantic and offline embedding modes cannot share a database.
- **Private files:** original uploads and local embedding cache, excluded from Git. In Compose, API and worker share a named volume; PostgreSQL has its own persistent volume.
- **n8n:** import-only integration credential. It can ingest shared or staff text but cannot query private document files, questions or approval queues.

The bridge simplifies a Windows demo with no Docker installation. A larger deployment should give API/worker a normal database driver/pool directly and use migrations and a more durable queue. Native PostgreSQL compatibility and container startup are separate CI checks. The local default uses embedded PostgreSQL, not a JSON file pretending to be a database.

## Explicit limits

- Local demo roles can be selected by anyone with access to the local application. They demonstrate authorization paths, not identity assurance or tenant isolation.
- Only PDF/TXT/Markdown files, up to 10 MB, 250 PDF pages and 400 generated passages per document. No OCR, spreadsheet parsing or image understanding.
- Vector retrieval currently scans candidates; this is suitable for the small demo library, not a large production corpus. Add a pgvector ANN index and measure recall at scale.
- Scores check known fictional cases and exact phrases. They are not calibrated confidence, independent factual accuracy, or model-judge scores.
- The app records measured request latency and $0 external model charges for extractive mode. It does not claim local infrastructure is free. OpenAI cost is unpriced.
- Instruction detection is an illustrative defense, not a complete prompt-injection defense. There are no model tool actions or external sends.
- No Google Drive/Slack connection, production hosting, multitenancy, SSO, scheduled connector sync, or automatic proposal submission is claimed.
- HTTPS, rate limiting, file retention/deletion, authenticated production users, backups, telemetry, migrations, resource isolation and held-out evaluation are required before hosting real client data.
