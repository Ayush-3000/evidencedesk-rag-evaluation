# Configuration

The normal launcher generates local tokens and starts all services itself. It forces demo/extractive mode, removes a inherited paid-model key from child environments, and chooses separate semantic/offline data directories. `.env.example` documents names; the app does not silently load it.

For manual service startup, install dependencies/build the UI, then provide these variables to each required process:

| Variable | Usage |
|---|---|
| `EVIDENCE_DB_TOKEN` | Same random value of at least 32 characters for bridge, API and worker |
| `EVIDENCE_INTEGRATION_TOKEN` | Separate random value of at least 32 characters for API and authorized n8n credential |
| `EVIDENCE_DATA_DIR` | Private shared file/model directory for API and worker |
| `EVIDENCE_PGLITE_DIR` | Embedded PostgreSQL data directory for bridge |
| `EVIDENCE_DB_URL` | API/worker bridge URL; default `http://127.0.0.1:8091` |
| `EVIDENCE_DB_HOST`, `EVIDENCE_DB_PORT` | Bridge binding; default loopback:8091 |
| `DATABASE_URL` | Bridge only: optional native PostgreSQL connection string |
| `EVIDENCE_EMBEDDINGS` | `fastembed` for the local semantic model or `hash` for explicit offline lexical mode |
| `EVIDENCE_DRAFTER` | `extractive` default, optional `openai` |
| `OPENAI_API_KEY`, `OPENAI_MODEL` | Both required for the optional external adapter; never put keys in the frontend or workflow JSON |
| `EVIDENCE_ALLOWED_ORIGINS` | Comma-separated mutation origins; defaults to local API and Vite URLs |
| `EVIDENCE_MODE` | Only `demo` is accepted in this release |

Start the bridge first, API second, worker third:

```sh
node db/server.mjs
python -m uvicorn evidencedesk.app:app --host 127.0.0.1 --port 8090
python -m evidencedesk.worker
```

Run these in separate terminals with the same required environment. `pnpm dev` serves the UI on loopback:5174 and proxies `/api` to 8090. Build output is served by FastAPI on 8090 for the standard demo.

The local launcher stores private tokens as JSON in `runtime/semantic/local.env` or `runtime/offline/local.env`. The Compose generator creates a standard private `.env`. Neither file is committed. Treat the n8n import token as an ingestion credential and store it only in n8n's credential manager. Do not use this self-selected demo session scheme for public hosting.
