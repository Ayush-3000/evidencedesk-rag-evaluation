import http from "node:http";
import { timingSafeEqual } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";
import { vector } from "@electric-sql/pglite-pgvector";
import pg from "pg";
const token = process.env.EVIDENCE_DB_TOKEN;
if (!token || token.length < 32)
  throw new Error("Set EVIDENCE_DB_TOKEN to at least 32 random characters");
const native = Boolean(process.env.DATABASE_URL);
const pool = native
  ? new pg.Pool({ connectionString: process.env.DATABASE_URL })
  : null;
const local = native
  ? null
  : await PGlite.create({
      dataDir: process.env.EVIDENCE_PGLITE_DIR || "runtime/postgres",
      extensions: { vector },
    });
if (local) await local.exec("CREATE EXTENSION IF NOT EXISTS vector");
if (pool) await pool.query("CREATE EXTENSION IF NOT EXISTS vector");
const normalize = (r) => ({
  rows: r.rows || [],
  affectedRows: r.affectedRows ?? r.rowCount ?? 0,
});
async function batch(queries) {
  if (local)
    return local.transaction(async (tx) => {
      const out = [];
      for (const q of queries)
        out.push(normalize(await tx.query(q.sql, q.params || [])));
      return out;
    });
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const out = [];
    for (const q of queries)
      out.push(normalize(await client.query(q.sql, q.params || [])));
    await client.query("COMMIT");
    return out;
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}
let queue = Promise.resolve();
const authorized = (v) => {
  const a = Buffer.from(v || "");
  const b = Buffer.from(token);
  return a.length === b.length && timingSafeEqual(a, b);
};
const server = http.createServer(async (req, res) => {
  res.setHeader("Content-Type", "application/json");
  if (req.url === "/health" && req.method === "GET") {
    res.end(
      JSON.stringify({
        ok: true,
        engine: native ? "PostgreSQL" : "PGlite PostgreSQL",
        vector: true,
      }),
    );
    return;
  }
  if (req.url !== "/transaction" || req.method !== "POST") {
    res.writeHead(404);
    res.end("{}");
    return;
  }
  if (!authorized(req.headers["x-db-token"])) {
    res.writeHead(401);
    res.end('{"error":"Unauthorized"}');
    return;
  }
  try {
    let body = "";
    for await (const data of req) {
      body += data;
      if (Buffer.byteLength(body) > 16 * 1024 * 1024) {
        res.writeHead(413);
        res.end('{"error":"Too large"}');
        return;
      }
    }
    const payload = JSON.parse(body);
    if (!Array.isArray(payload.queries) || payload.queries.length > 500)
      throw new Error("Invalid batch");
    const op = queue.then(() => batch(payload.queries));
    queue = op.catch(() => {});
    const results = await op;
    res.end(JSON.stringify({ results }));
  } catch (e) {
    res.writeHead(500);
    res.end(JSON.stringify({ error: String(e.message) }));
  }
});
server.listen(
  Number(process.env.EVIDENCE_DB_PORT || 8091),
  process.env.EVIDENCE_DB_HOST || "127.0.0.1",
  () => console.log("EvidenceDesk database bridge ready"),
);
async function stop() {
  server.close();
  await queue;
  if (local) await local.close();
  if (pool) await pool.end();
  process.exit(0);
}
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
