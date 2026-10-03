import React, { useEffect, useRef, useState, lazy, Suspense } from "react";
import { createRoot } from "react-dom/client";
import { AnimatePresence, motion, MotionConfig } from "motion/react";
const RunChart = lazy(() => import("./RunChart"));
import {
  ArrowUp,
  ArrowUpRight,
  Check,
  CheckCircle2,
  ChevronRight,
  ClipboardCheck,
  Clock3,
  Copy,
  FileText,
  FolderOpen,
  Layers3,
  LoaderCircle,
  MessageCircle,
  Play,
  Plus,
  Search,
  ShieldCheck,
  Sparkles,
  UploadCloud,
  X,
  BarChart3,
  AlertCircle,
  SlidersHorizontal,
  Eye,
} from "lucide-react";
import "./styles.css";

type Page = "ask" | "library" | "evaluate" | "review";
type Role = "viewer" | "reviewer";
type Source = {
  id: string;
  document_id: string;
  name: string;
  version: number;
  page: number;
  quote: string;
  text: string;
};
type Answer = {
  id: string;
  question: string;
  answer: string;
  status: string;
  reason?: string;
  sources: Source[];
  metrics: {
    latency_ms: number;
    model: string;
    external_cost_usd?: number | null;
  };
};
type Doc = {
  id: string;
  name: string;
  version: number;
  visibility: string;
  status: string;
  active: boolean;
  pages: number;
  chunks: number;
  error?: string;
  created_at: string;
  job?: { progress: number; stage: string; error?: string };
};
type Case = {
  id: string;
  question: string;
  category: string;
  expected: string;
  actual_status: string;
  passed: boolean;
  answer: string;
  sources: Source[];
  latency_ms: number;
  checks: Record<string, boolean>;
};
type Run = {
  id: string;
  status: string;
  results: Case[];
  created_at: string;
  summary: {
    total?: number;
    passed?: number;
    failed?: number;
    pass_rate?: number;
    mean_latency_ms?: number;
    external_cost_usd?: number | null;
    error?: string;
  };
};
type Review = {
  id: string;
  question: string;
  reason: string;
  sources: Source[];
  status: string;
  draft: string;
  version: number;
  updated_at: string;
};
const themes = [
  { id: "graphite", name: "Graphite & Tangerine", color: "#FFB67A" },
  { id: "midnight", name: "Midnight & Mint", color: "#7DE0C3" },
  { id: "ivory", name: "Ivory & Cobalt", color: "#3156D3" },
  { id: "sage", name: "Sage & Forest", color: "#2D6A4F" },
];
const nav = [
  { id: "ask", label: "Ask", icon: MessageCircle },
  { id: "library", label: "Library", icon: FileText },
  { id: "evaluate", label: "Evaluate", icon: BarChart3 },
  { id: "review", label: "Review", icon: ClipboardCheck },
] as const;

async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch("/api" + path, {
    credentials: "same-origin",
    ...init,
  });
  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new Error(
      typeof payload.detail === "string"
        ? payload.detail
        : "The request could not be completed. Please try again.",
    );
  }
  return response.json();
}
const post = <T,>(path: string, body: unknown = {}) =>
  api<T>(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
const date = (value: string) =>
  new Date(value).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
const ms = (value = 0) =>
  value >= 1000 ? `${(value / 1000).toFixed(1)} s` : `${value} ms`;

function App() {
  const [page, setPage] = useState<Page>("evaluate");
  const [role, setRole] = useState<Role>("reviewer");
  const [ready, setReady] = useState(false);
  const [answerMode, setAnswerMode] = useState("extractive");
  const [theme, setTheme] = useState(
    () => localStorage.getItem("evidence-theme") || "graphite",
  );
  const [lowMotion, setLowMotion] = useState(
    () => localStorage.getItem("evidence-motion") === "reduced",
  );
  const [docs, setDocs] = useState<Doc[]>([]);
  const [runs, setRuns] = useState<Run[]>([]);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState<Answer | null>(null);
  const [history, setHistory] = useState<Answer[]>([]);
  const [source, setSource] = useState<Source | null>(null);
  const [selectedCase, setSelectedCase] = useState<Case | null>(null);
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const [selectedReview, setSelectedReview] = useState<Review | null>(null);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [drawer, setDrawer] = useState(false);
  const [visibility, setVisibility] = useState("public");
  const [version, setVersion] = useState(1);
  const [search, setSearch] = useState("");
  const fileInput = useRef<HTMLInputElement>(null);
  const dialogReturn = useRef<HTMLElement | null>(null);
  function inspectSource(value: Source) {
    dialogReturn.current = document.activeElement as HTMLElement;
    setSource(value);
  }
  function openUpload() {
    dialogReturn.current = document.activeElement as HTMLElement;
    setDrawer(true);
  }
  const run = runs.find((r) => r.id === selectedRunId) || runs[0];
  const activeCases = run?.results || [];
  const filteredCases = activeCases.filter((c) =>
    c.question.toLowerCase().includes(search.toLowerCase()),
  );
  const caseView =
    (selectedCase && activeCases.find((c) => c.id === selectedCase.id)) ||
    filteredCases.find((c) => !c.passed) ||
    filteredCases[0];

  async function refresh(currentRole: Role = role) {
    const [d, h] = await Promise.all([
      api<{ documents: Doc[] }>("/documents"),
      api<{ questions: Answer[] }>("/questions"),
    ]);
    setDocs(d.documents);
    setHistory(h.questions);
    if (currentRole === "reviewer") {
      const [r, v] = await Promise.all([
        api<{ runs: Run[] }>("/evaluations"),
        api<{ reviews: Review[] }>("/reviews"),
      ]);
      setRuns(r.runs);
      setReviews(v.reviews);
    } else {
      setRuns([]);
      setReviews([]);
      setSelectedCase(null);
      setSelectedReview(null);
    }
  }
  async function act(name: string, fn: () => Promise<void>) {
    setBusy(name);
    setError("");
    try {
      await fn();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy("");
    }
  }
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem("evidence-theme", theme);
  }, [theme]);
  useEffect(() => {
    localStorage.setItem("evidence-motion", lowMotion ? "reduced" : "system");
    document.documentElement.dataset.motion = lowMotion ? "reduced" : "system";
  }, [lowMotion]);
  useEffect(() => {
    if (!source && !drawer) return;
    const previous = dialogReturn.current;
    const keydown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setSource(null);
        setDrawer(false);
      }
      if (event.key === "Tab") {
        const dialog = document.querySelector('[role="dialog"]');
        const items = Array.from(
          dialog?.querySelectorAll<HTMLElement>(
            "button:not(:disabled),a[href],input:not([hidden]),select,textarea",
          ) || [],
        );
        const first = items[0],
          last = items[items.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last?.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first?.focus();
        }
      }
    };
    document.addEventListener("keydown", keydown);
    return () => {
      document.removeEventListener("keydown", keydown);
      previous?.focus();
    };
  }, [!!source, drawer]);
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        let s;
        try {
          s = await api<{ role: Role }>("/session");
        } catch {
          s = await post<{ role: Role }>("/session", { role: "reviewer" });
        }
        if (alive) {
          setRole(s.role);
          const health = await api<{ drafting: string }>("/health");
          setAnswerMode(health.drafting);
          await refresh(s.role);
          setReady(true);
        }
      } catch (e) {
        if (alive) setError((e as Error).message);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);
  useEffect(() => {
    if (!ready) return;
    const id = setInterval(
      () => refresh().catch((e) => setError(e.message)),
      2500,
    );
    return () => clearInterval(id);
  }, [ready, role]);
  useEffect(() => {
    if (!notice) return;
    const id = setTimeout(() => setNotice(""), 5000);
    return () => clearTimeout(id);
  }, [notice]);
  async function ask(value = question) {
    if (value.trim().length < 3) return;
    setPage("ask");
    await act("ask", async () => {
      const a = await post<Answer>("/questions", { question: value });
      setAnswer(a);
      setSource(null);
      setQuestion("");
      await refresh();
    });
  }
  async function upload(file: File) {
    await act("upload", async () => {
      const body = new FormData();
      body.append("file", file);
      body.append("visibility", visibility);
      body.append("version", String(version));
      const r = await api<{ duplicate: boolean }>("/documents", {
        method: "POST",
        body,
      });
      setDrawer(false);
      setNotice(
        r.duplicate
          ? "This document version is already in your library."
          : "Document received. Indexing has started.",
      );
      await refresh();
    });
  }
  const chartData = [...runs]
    .reverse()
    .filter((r) => r.status === "complete")
    .map((r, i) => ({
      name: `Run ${i + 1}`,
      rate: r.summary.pass_rate,
      id: r.id,
    }));
  const isRunning = runs.some(
    (r) => r.status === "pending" || r.status === "running",
  );
  function navigate(next: Page) {
    window.scrollTo({ top: 0, behavior: "instant" });
    setPage(next);
    setSearch("");
    setDrawer(false);
    setSource(null);
  }
  function inspectReview(r: Review) {
    setSelectedReview(r);
    setDraft(r.draft);
  }

  return (
    <MotionConfig reducedMotion={lowMotion ? "always" : "user"}>
      <div className="app-shell">
        <div className="ambient" aria-hidden="true">
          <i />
          <i />
          <i />
        </div>
        <header className="topbar" inert={!!source || drawer}>
          <a
            href="#"
            className="brand"
            onClick={(e) => {
              e.preventDefault();
              navigate("ask");
            }}
            aria-label="EvidenceDesk home"
          >
            <Layers3 size={28} />
            <span>
              Evidence<span className="brand-accent">Desk</span>
            </span>
          </a>
          <span className="workspace">
            Demo workspace <span className="tiny-dot" /> Fictional documents
          </span>
          <div className="top-actions">
            <div className="theme-picker" aria-label="Color theme">
              {themes.map((t) => (
                <button
                  key={t.id}
                  title={t.name}
                  aria-label={`Use ${t.name} theme`}
                  aria-pressed={theme === t.id}
                  onClick={() => setTheme(t.id)}
                  style={{ "--swatch": t.color } as React.CSSProperties}
                />
              ))}
            </div>
            <button
              className={`icon-button ${lowMotion ? "active" : ""}`}
              title="Toggle reduced motion"
              aria-label="Reduce motion"
              aria-pressed={lowMotion}
              onClick={() => setLowMotion(!lowMotion)}
            >
              <SlidersHorizontal size={18} />
            </button>
            <select
              aria-label="Demo access role"
              value={role}
              disabled={!!busy}
              onChange={(e) =>
                act("role", async () => {
                  const next = e.target.value as Role;
                  await post("/session", { role: next });
                  setRole(next);
                  setAnswer(null);
                  setSource(null);
                  setHistory([]);
                  if (
                    next === "viewer" &&
                    (page === "review" || page === "evaluate")
                  )
                    navigate("ask");
                  await refresh(next);
                })
              }
            >
              <option value="reviewer">Reviewer demo</option>
              <option value="viewer">Reader demo</option>
            </select>
            <span className="avatar">AS</span>
          </div>
        </header>
        <nav
          className="nav-rail"
          aria-label="Workspace navigation"
          inert={!!source || drawer}
        >
          {nav.map((n) => (
            <button
              key={n.id}
              aria-current={page === n.id ? "page" : undefined}
              disabled={
                role === "viewer" && (n.id === "evaluate" || n.id === "review")
              }
              title={
                role === "viewer" && (n.id === "evaluate" || n.id === "review")
                  ? "Switch to Reviewer demo for this workspace"
                  : n.label
              }
              onClick={() => navigate(n.id)}
            >
              <n.icon size={24} />
              <span>{n.label}</span>
              {page === n.id && (
                <motion.i layoutId="nav-active" className="nav-selected" />
              )}
            </button>
          ))}
        </nav>
        <main className="main-content" inert={!!source || drawer}>
          {error && (
            <div className="banner error" role="alert">
              <AlertCircle size={18} />
              {error}
              <button aria-label="Dismiss error" onClick={() => setError("")}>
                <X size={16} />
              </button>
            </div>
          )}
          {!ready ? (
            <div className="loading-page">
              <LoaderCircle className="spin" />
              <h1>Opening your workspace.</h1>
              <p>Connecting to the document index.</p>
            </div>
          ) : (
            <AnimatePresence mode="wait">
              <motion.section
                key={page}
                className={`workspace-page ${page}`}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.18 }}
              >
                {page === "evaluate" && (
                  <>
                    <div className="page-heading">
                      <div>
                        <p className="eyebrow">Evaluation studio</p>
                        <h1>
                          Trust, measured<span>.</span>
                        </h1>
                        <p className="subtitle">
                          {run
                            ? `${activeCases.length} checked cases · ${run.status === "complete" ? "Completed run" : "Evaluation in progress"}`
                            : "Turn convincing answers into evidence you can measure."}
                        </p>
                      </div>
                      <button
                        className="primary"
                        disabled={
                          !!busy ||
                          isRunning ||
                          !docs.some((d) => d.status === "ready")
                        }
                        onClick={() =>
                          act("evaluate", async () => {
                            const r = await post<{ id: string }>(
                              "/evaluations",
                            );
                            setSelectedRunId(r.id);
                            setSelectedCase(null);
                            await refresh();
                          })
                        }
                      >
                        {isRunning ? (
                          <LoaderCircle className="spin" size={17} />
                        ) : (
                          <Play size={17} fill="currentColor" />
                        )}
                        {isRunning ? "Evaluating…" : "Run evaluation"}
                      </button>
                    </div>
                    {!run ? (
                      <div className="empty-state">
                        <BarChart3 size={44} />
                        <h2>Your first quality check starts here.</h2>
                        <p>
                          Run the reviewed question set against your document
                          library. Inspect sources, unsupported questions and
                          access boundaries.
                        </p>
                        {!docs.length && (
                          <button
                            className="secondary"
                            onClick={() =>
                              act("seed", async () => {
                                await post("/demo/seed");
                                setNotice(
                                  "Demo documents added. Indexing will finish shortly.",
                                );
                                await refresh();
                              })
                            }
                          >
                            Load demo documents
                          </button>
                        )}
                      </div>
                    ) : (
                      <div className="split-workspace evaluation-layout">
                        <div className="main-canvas">
                          <div className="score-strip">
                            <div>
                              <strong>
                                {run.summary.passed ??
                                  activeCases.filter((c) => c.passed).length}
                              </strong>
                              <span>
                                <i className="dot success" />
                                passed checks
                              </span>
                            </div>
                            <div>
                              <strong>
                                {
                                  activeCases.filter(
                                    (c) => c.expected === "needs_review",
                                  ).length
                                }
                              </strong>
                              <span>
                                <i className="dot warning" />
                                handoff checks
                              </span>
                            </div>
                            <div>
                              <strong>
                                {run.summary.failed ??
                                  activeCases.filter((c) => !c.passed).length}
                              </strong>
                              <span>
                                <i className="dot danger" />
                                failed checks
                              </span>
                            </div>
                          </div>
                          <div className="chart-heading">
                            <h2>
                              Fixture pass rate{" "}
                              <span title="A pass checks expected status, phrases, source references and exact quotations. It is not an independent semantic accuracy measure.">
                                <AlertCircle size={15} />
                              </span>
                            </h2>
                            <span className="accent">
                              {run.summary.pass_rate != null
                                ? `${run.summary.pass_rate}%`
                                : "Running"}
                            </span>
                          </div>
                          <div
                            className="chart-container"
                            aria-label="Completed evaluation run pass rates"
                          >
                            <Suspense
                              fallback={
                                <p className="quiet-empty">
                                  Opening the chart…
                                </p>
                              }
                            >
                              <RunChart data={chartData} reduced={lowMotion} />
                            </Suspense>
                          </div>
                          <div className="table-heading">
                            <h2>
                              Cases in this run{" "}
                              <span>({activeCases.length})</span>
                            </h2>
                            <label className="search-field">
                              <Search size={16} />
                              <input
                                aria-label="Search evaluation cases"
                                placeholder="Search cases…"
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                              />
                            </label>
                          </div>
                          <div
                            className="case-table"
                            aria-label="Evaluation cases"
                          >
                            <div className="table-labels">
                              <span>Question</span>
                              <span>Result</span>
                              <span>Evidence</span>
                            </div>
                            {filteredCases.map((c) => (
                              <button
                                key={c.id}
                                className={`case-row ${caseView?.id === c.id ? "selected" : ""}`}
                                onClick={() => setSelectedCase(c)}
                              >
                                <span title={c.question}>
                                  {c.question}
                                  <small>{c.category}</small>
                                </span>
                                <span
                                  className={
                                    c.passed ? "success-text" : "danger-text"
                                  }
                                >
                                  <i
                                    className={`dot ${c.passed ? "success" : "danger"}`}
                                  />
                                  {c.passed ? "Passed" : "Failed"}
                                </span>
                                <span>
                                  {c.sources.length
                                    ? `${c.sources.length} source${c.sources.length > 1 ? "s" : ""}`
                                    : "No source"}
                                  <ChevronRight size={15} />
                                </span>
                              </button>
                            ))}
                            {!filteredCases.length && (
                              <p className="quiet-empty">
                                {isRunning
                                  ? "The first cases are being checked…"
                                  : "No cases match your search."}
                              </p>
                            )}
                          </div>
                          <p className="footnote">
                            Handoff checks are included in the total. Results
                            apply to the fictional fixture set and selected
                            answer mode.
                          </p>
                          {runs.length > 1 && (
                            <div className="run-selector">
                              <label htmlFor="run-select">Inspect run</label>
                              <select
                                id="run-select"
                                value={run.id}
                                onChange={(e) => {
                                  setSelectedRunId(e.target.value);
                                  setSelectedCase(null);
                                }}
                              >
                                {runs.map((r, i) => (
                                  <option key={r.id} value={r.id}>
                                    Run {runs.length - i} · {date(r.created_at)}{" "}
                                    · {r.status}
                                  </option>
                                ))}
                              </select>
                            </div>
                          )}
                        </div>
                        <aside className="detail-panel">
                          <div className="panel-heading">
                            <h2>Case inspection</h2>
                            <span>
                              {caseView
                                ? `${activeCases.findIndex((c) => c.id === caseView.id) + 1} / ${activeCases.length}`
                                : "Waiting"}
                            </span>
                          </div>
                          {caseView && (
                            <motion.div
                              key={caseView.id}
                              initial={{ opacity: 0 }}
                              animate={{ opacity: 1 }}
                            >
                              <h3>{caseView.question}</h3>
                              <p className="field-label">Actual answer</p>
                              <div className="answer-excerpt">
                                {caseView.answer}
                              </div>
                              <div
                                className={`status-note ${caseView.passed ? "good" : "attention"}`}
                              >
                                <ShieldCheck size={20} />
                                <div>
                                  <strong>
                                    {caseView.passed
                                      ? "Expected behavior verified"
                                      : "This case needs attention"}
                                  </strong>
                                  <p>
                                    {caseView.expected === "needs_review"
                                      ? "The expected response is an evidence limitation and human review."
                                      : "The answer must include the expected phrase and document source."}
                                  </p>
                                </div>
                              </div>
                              <p className="field-label">Checks</p>
                              <div className="check-list">
                                {Object.entries(caseView.checks).map(
                                  ([key, value]) => (
                                    <span key={key}>
                                      {value ? (
                                        <Check size={14} />
                                      ) : (
                                        <X size={14} />
                                      )}{" "}
                                      {
                                        (
                                          {
                                            state: "Answer / handoff behavior",
                                            content: "Expected answer phrase",
                                            source: "Expected source",
                                            no_forbidden_content:
                                              "No restricted content",
                                            exact_quotes:
                                              "Exact source quotations",
                                          } as Record<string, string>
                                        )[key]
                                      }
                                    </span>
                                  ),
                                )}
                              </div>
                              {caseView.sources.map((s) => (
                                <button
                                  className="source-mini"
                                  key={s.id}
                                  onClick={() => inspectSource(s)}
                                >
                                  <FileText size={17} />
                                  <span>
                                    {s.name}
                                    <small>
                                      Page {s.page} · v{s.version}
                                    </small>
                                  </span>
                                  <ArrowUpRight size={16} />
                                </button>
                              ))}
                              <div className="measurement-strip">
                                <div>
                                  <Clock3 size={17} />
                                  <span>
                                    Case latency
                                    <strong>{ms(caseView.latency_ms)}</strong>
                                  </span>
                                </div>
                                <div>
                                  <Layers3 size={17} />
                                  <span>
                                    Model charges
                                    <strong>
                                      {run.summary.external_cost_usd === 0
                                        ? "$0"
                                        : "Not priced"}
                                    </strong>
                                  </span>
                                </div>
                              </div>
                            </motion.div>
                          )}
                        </aside>
                      </div>
                    )}
                  </>
                )}
                {page === "ask" && (
                  <>
                    <div className="page-heading">
                      <div>
                        <p className="eyebrow">Ask your knowledge</p>
                        <h1>
                          Answers with
                          <br />
                          <span>evidence.</span>
                        </h1>
                        <p className="subtitle">
                          A clear answer. Its original source. Room for your
                          judgment.
                        </p>
                      </div>
                      <span className="mode-badge">
                        <ShieldCheck size={15} />{" "}
                        {answerMode === "openai"
                          ? "AI quotation selection"
                          : "Local evidence mode"}
                      </span>
                    </div>
                    <div className="split-workspace ask-layout">
                      <div className="main-canvas">
                        <AnimatePresence mode="wait">
                          {busy === "ask" ? (
                            <motion.div
                              className="asking-state"
                              key="thinking"
                              initial={{ opacity: 0 }}
                              animate={{ opacity: 1 }}
                            >
                              <LoaderCircle className="spin" />
                              <h2>Finding the supporting passages.</h2>
                              <p>Checking your permitted document versions.</p>
                            </motion.div>
                          ) : answer ? (
                            <motion.div
                              key={answer.id}
                              initial={{ opacity: 0, y: 8 }}
                              animate={{ opacity: 1, y: 0 }}
                            >
                              <p className="asked-question">
                                {answer.question}
                              </p>
                              <div
                                className={`answer-status ${answer.status === "answered" ? "success-text" : "warning-text"}`}
                              >
                                <span
                                  className={`dot ${answer.status === "answered" ? "success" : "warning"}`}
                                />
                                {answer.status === "answered"
                                  ? "Source-backed passages"
                                  : "Human judgment needed"}
                              </div>
                              <div className="answer-body">
                                {answer.answer.split("\n\n").map((p, i) => (
                                  <p key={i}>
                                    {p}
                                    {answer.status === "answered" &&
                                      answer.sources[i] && (
                                        <button
                                          className="citation"
                                          aria-label={`Open source ${i + 1}`}
                                          onClick={() =>
                                            inspectSource(answer.sources[i])
                                          }
                                        >
                                          {i + 1}
                                        </button>
                                      )}
                                  </p>
                                ))}
                              </div>
                              {answer.reason && (
                                <p className="reason-text">{answer.reason}</p>
                              )}
                              <div className="answer-tools">
                                <span>
                                  <FileText size={15} />
                                  {answer.sources.length} source
                                  {answer.sources.length !== 1 ? "s" : ""}
                                </span>
                                <span>
                                  <Clock3 size={15} />
                                  {ms(answer.metrics.latency_ms)}
                                </span>
                                <button
                                  title="Copy answer"
                                  onClick={() =>
                                    act("copy", async () => {
                                      await navigator.clipboard.writeText(
                                        answer.answer,
                                      );
                                      setNotice("Answer copied.");
                                    })
                                  }
                                >
                                  <Copy size={15} />
                                  Copy
                                </button>
                                {answer.status === "needs_review" && (
                                  <button
                                    disabled={!!busy}
                                    onClick={() =>
                                      act("handoff", async () => {
                                        await post(
                                          `/questions/${answer.id}/review`,
                                        );
                                        setNotice(
                                          "Question added to the human review queue.",
                                        );
                                        await refresh();
                                      })
                                    }
                                  >
                                    <ClipboardCheck size={15} />
                                    Request review
                                  </button>
                                )}
                              </div>
                            </motion.div>
                          ) : (
                            <motion.div className="ask-welcome" key="welcome">
                              <span className="large-glyph">
                                <Sparkles size={28} />
                              </span>
                              <h2>What would you like to know?</h2>
                              <p>
                                Start with a policy, a product detail or a team
                                procedure. Every answer stays connected to its
                                evidence.
                              </p>
                            </motion.div>
                          )}
                        </AnimatePresence>
                        <div className="suggestions">
                          <p className="field-label">Try a question</p>
                          {[
                            "What is our customer refund window?",
                            "How long does express shipping take?",
                            "Can I return an item after 45 days?",
                          ].map((q) => (
                            <button
                              key={q}
                              disabled={!!busy}
                              onClick={() => ask(q)}
                            >
                              <Search size={15} />
                              {q}
                              <ArrowUpRight size={15} />
                            </button>
                          ))}
                        </div>
                        <form
                          className="composer"
                          onSubmit={(e) => {
                            e.preventDefault();
                            ask();
                          }}
                        >
                          <button
                            type="button"
                            className="icon-button"
                            aria-label="Open document library"
                            onClick={() => {
                              navigate("library");
                              openUpload();
                            }}
                          >
                            <Plus size={21} />
                          </button>
                          <textarea
                            aria-label="Question"
                            placeholder="Ask your documents…"
                            value={question}
                            maxLength={1200}
                            onChange={(e) => setQuestion(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter" && !e.shiftKey) {
                                e.preventDefault();
                                ask();
                              }
                            }}
                          />
                          <button
                            className="send-button"
                            aria-label="Ask question"
                            disabled={!!busy || question.trim().length < 3}
                          >
                            {busy === "ask" ? (
                              <LoaderCircle className="spin" size={21} />
                            ) : (
                              <ArrowUp size={23} />
                            )}
                          </button>
                        </form>
                        <p className="composer-note">
                          Answers quote retrieved text. An absent answer is a
                          reason to ask a person.
                        </p>
                        {history.length > 0 && (
                          <div className="recent-questions">
                            <p className="field-label">Recent questions</p>
                            {history.slice(0, 4).map((h) => (
                              <button
                                key={h.id}
                                onClick={() => {
                                  setAnswer(h);
                                  setSource(null);
                                }}
                              >
                                {h.question}
                                <ChevronRight size={15} />
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                      <aside className="detail-panel sources-placeholder">
                        <div className="panel-heading">
                          <h2>Evidence</h2>
                          <Eye size={18} />
                        </div>
                        {answer?.sources.length ? (
                          answer.sources.map((s, i) => (
                            <button
                              key={s.id}
                              className="source-preview"
                              onClick={() => inspectSource(s)}
                            >
                              <span className="source-number">{i + 1}</span>
                              <h3>{s.name}</h3>
                              <small>
                                Page {s.page} · Version {s.version}
                              </small>
                              <blockquote>{s.quote}</blockquote>
                              <span className="text-link">
                                Inspect passage <ArrowUpRight size={14} />
                              </span>
                            </button>
                          ))
                        ) : (
                          <div className="panel-empty">
                            <FileText size={30} />
                            <p>Your supporting passages appear here.</p>
                            <small>
                              Only documents available to your demo role can be
                              retrieved.
                            </small>
                          </div>
                        )}
                      </aside>
                    </div>
                  </>
                )}
                {page === "library" && (
                  <>
                    <div className="page-heading">
                      <div>
                        <p className="eyebrow">Document library</p>
                        <h1>
                          A home for
                          <br />
                          <span>your knowledge.</span>
                        </h1>
                        <p className="subtitle">
                          Add your sources. Keep the evidence current.
                        </p>
                      </div>
                      <button className="primary" onClick={openUpload}>
                        <Plus size={19} />
                        Add documents
                      </button>
                    </div>
                    <div className="library-toolbar">
                      <span>
                        {
                          docs.filter((d) => d.active && d.status === "ready")
                            .length
                        }{" "}
                        active documents <i className="tiny-dot" />{" "}
                        {docs.filter((d) => !d.active).length} archived versions
                      </span>
                      <label className="search-field">
                        <Search size={16} />
                        <input
                          aria-label="Search documents"
                          placeholder="Find a document…"
                          value={search}
                          onChange={(e) => setSearch(e.target.value)}
                        />
                      </label>
                    </div>
                    {!docs.length ? (
                      <div className="empty-state">
                        <FolderOpen size={44} />
                        <h2>Your evidence starts with a document.</h2>
                        <p>
                          Upload a text-based PDF or try the fictional policy
                          library.
                        </p>
                        <button
                          className="secondary"
                          onClick={() =>
                            act("seed", async () => {
                              await post("/demo/seed");
                              setNotice("Demo documents added.");
                              await refresh();
                            })
                          }
                          disabled={role !== "reviewer" || !!busy}
                        >
                          Load demo documents
                        </button>
                      </div>
                    ) : (
                      <div className="document-list">
                        {docs
                          .filter((d) =>
                            d.name.toLowerCase().includes(search.toLowerCase()),
                          )
                          .map((d) => (
                            <div className="document-row" key={d.id}>
                              <div className="file-glyph">
                                <FileText size={24} />
                              </div>
                              <div className="document-name">
                                <strong>{d.name}</strong>
                                <span>
                                  {d.pages || "—"} page
                                  {d.pages !== 1 ? "s" : ""} · {d.chunks}{" "}
                                  passages ·{" "}
                                  {d.visibility === "staff"
                                    ? "Staff only"
                                    : "Shared"}
                                </span>
                                {d.error && (
                                  <>
                                    <span className="danger-text">
                                      {d.error}
                                    </span>
                                    <button
                                      disabled={!!busy}
                                      className="text-link"
                                      onClick={() =>
                                        act("retry", async () => {
                                          await post(
                                            `/documents/${d.id}/retry`,
                                          );
                                          setNotice("Import queued again.");
                                          await refresh();
                                        })
                                      }
                                    >
                                      Retry import
                                    </button>
                                  </>
                                )}
                                {d.status === "indexing" ||
                                d.status === "queued" ? (
                                  <div className="index-progress">
                                    <span>{d.job?.stage || "Queued"}</span>
                                    <progress
                                      max={100}
                                      value={d.job?.progress || 0}
                                    />
                                  </div>
                                ) : null}
                              </div>
                              <span className="version">v{d.version}</span>
                              <span
                                className={`status-pill ${d.status === "ready" ? (d.active ? "good" : "archived") : d.status === "failed" ? "attention" : "processing"}`}
                              >
                                {d.status === "ready" ? (
                                  d.active ? (
                                    <CheckCircle2 size={13} />
                                  ) : (
                                    <Layers3 size={13} />
                                  )
                                ) : (
                                  <LoaderCircle
                                    size={13}
                                    className={
                                      d.status === "failed" ? "" : "spin"
                                    }
                                  />
                                )}{" "}
                                {d.status === "ready" && !d.active
                                  ? "Archived"
                                  : d.status}
                              </span>
                              <span className="document-date">
                                {date(d.created_at)}
                              </span>
                              <a
                                className="icon-button"
                                href={`/api/documents/${d.id}/source`}
                                target="_blank"
                                rel="noreferrer"
                                aria-label={`Open ${d.name}`}
                              >
                                <ArrowUpRight size={19} />
                              </a>
                            </div>
                          ))}
                      </div>
                    )}
                    <div className="library-bottom">
                      <ShieldCheck size={20} />
                      <p>
                        Only the newest successfully indexed version is used for
                        answers. Failed imports leave the previous version
                        available.
                      </p>
                    </div>
                  </>
                )}
                {page === "review" && (
                  <>
                    <div className="page-heading">
                      <div>
                        <p className="eyebrow">Human review</p>
                        <h1>
                          A little
                          <br />
                          <span>human judgment.</span>
                        </h1>
                        <p className="subtitle">
                          Check the evidence. Make the decision. Keep a record.
                        </p>
                      </div>
                      <span className="mode-badge">
                        {reviews.filter((r) => r.status === "open").length}{" "}
                        awaiting review
                      </span>
                    </div>
                    {!reviews.length ? (
                      <div className="empty-state">
                        <ClipboardCheck size={44} />
                        <h2>Nothing waiting for a person.</h2>
                        <p>
                          Ask an unsupported question and choose Request review
                          to see the handoff.
                        </p>
                        <button
                          className="secondary"
                          onClick={() =>
                            ask("Can I return an item after 45 days?")
                          }
                        >
                          Try a policy exception <ArrowUpRight size={16} />
                        </button>
                      </div>
                    ) : (
                      <div className="review-layout">
                        <div className="review-queue">
                          <p className="field-label">Review queue</p>
                          {reviews.map((r) => (
                            <button
                              key={r.id}
                              className={
                                selectedReview?.id === r.id ? "selected" : ""
                              }
                              onClick={() => inspectReview(r)}
                            >
                              <MessageCircle size={20} />
                              <span>
                                <strong>{r.question}</strong>
                                <small>
                                  {r.status === "approved"
                                    ? "Approved internally"
                                    : "Needs judgment"}
                                </small>
                              </span>
                              <i
                                className={`dot ${r.status === "approved" ? "success" : "warning"}`}
                              />
                            </button>
                          ))}
                        </div>
                        <div className="review-canvas">
                          {selectedReview ? (
                            <>
                              <p className="field-label">Question</p>
                              <h2>{selectedReview.question}</h2>
                              <p className="field-label">
                                Why this needs a person
                              </p>
                              <p className="review-reason">
                                {selectedReview.reason}
                              </p>
                              {selectedReview.sources.map((s) => (
                                <button
                                  key={s.id}
                                  className="review-source"
                                  onClick={() => inspectSource(s)}
                                >
                                  <span>
                                    <FileText size={15} />
                                    {s.name} · Page {s.page}
                                  </span>
                                  <blockquote>{s.quote}</blockquote>
                                </button>
                              ))}
                              <label className="field-label" htmlFor="draft">
                                Draft for review
                              </label>
                              <textarea
                                id="draft"
                                className="draft-editor"
                                value={draft}
                                disabled={selectedReview.status === "approved"}
                                onChange={(e) => setDraft(e.target.value)}
                                maxLength={6000}
                              />
                              <div className="review-actions">
                                <button
                                  className="primary"
                                  disabled={
                                    !!busy ||
                                    selectedReview.status === "approved" ||
                                    !draft.trim()
                                  }
                                  onClick={() =>
                                    act("approve", async () => {
                                      const r = await post<Review>(
                                        `/reviews/${selectedReview.id}`,
                                        {
                                          version: selectedReview.version,
                                          draft,
                                          action: "approve",
                                        },
                                      );
                                      setSelectedReview({
                                        ...selectedReview,
                                        ...r,
                                      });
                                      setNotice(
                                        "Draft approved and recorded internally.",
                                      );
                                      await refresh();
                                    })
                                  }
                                >
                                  <Check size={17} />
                                  {selectedReview.status === "approved"
                                    ? "Approved"
                                    : "Approve draft"}
                                </button>
                                <button
                                  className="secondary"
                                  disabled={
                                    !!busy ||
                                    selectedReview.status === "approved"
                                  }
                                  onClick={() =>
                                    act("save", async () => {
                                      const r = await post<Review>(
                                        `/reviews/${selectedReview.id}`,
                                        {
                                          version: selectedReview.version,
                                          draft,
                                          action: "save",
                                        },
                                      );
                                      setSelectedReview({
                                        ...selectedReview,
                                        ...r,
                                      });
                                      setNotice("Draft saved for review.");
                                      await refresh();
                                    })
                                  }
                                >
                                  Keep in review
                                </button>
                              </div>
                              <p className="footnote">
                                Approval records an internal decision. No
                                external message is sent.
                              </p>
                            </>
                          ) : (
                            <div className="panel-empty">
                              <ClipboardCheck size={30} />
                              <p>Select a question from the queue.</p>
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </>
                )}
              </motion.section>
            </AnimatePresence>
          )}
          <footer>
            <span>
              <span className="tiny-dot" /> EvidenceDesk · Portfolio
              demonstration
            </span>
            <span>Inspect the source. Keep the judgment.</span>
          </footer>
        </main>
        <AnimatePresence>
          {source && (
            <>
              <motion.div
                className="scrim"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={() => setSource(null)}
              />
              <motion.aside
                className="source-drawer"
                role="dialog"
                aria-modal="true"
                aria-label="Source passage"
                initial={{ x: 40, opacity: 0 }}
                animate={{ x: 0, opacity: 1 }}
                exit={{ x: 40, opacity: 0 }}
                transition={{ duration: 0.22 }}
              >
                <div className="panel-heading">
                  <h2>Original evidence</h2>
                  <button
                    className="icon-button"
                    aria-label="Close source passage"
                    onClick={() => setSource(null)}
                    autoFocus
                  >
                    <X size={20} />
                  </button>
                </div>
                <span className="file-glyph">
                  <FileText size={27} />
                </span>
                <h3>{source.name}</h3>
                <p className="source-meta">
                  Page {source.page} · Version {source.version}
                </p>
                <p className="field-label">Cited passage</p>
                <blockquote className="highlight-quote">
                  {source.quote}
                </blockquote>
                <p className="field-label">Surrounding text</p>
                <div className="full-passage">{source.text}</div>
                <a
                  className="secondary"
                  href={`/api/documents/${source.document_id}/source`}
                  target="_blank"
                  rel="noreferrer"
                >
                  Open original file <ArrowUpRight size={16} />
                </a>
              </motion.aside>
            </>
          )}
        </AnimatePresence>
        <AnimatePresence>
          {drawer && (
            <>
              <motion.div
                className="scrim"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={() => setDrawer(false)}
              />
              <motion.aside
                className="source-drawer"
                role="dialog"
                aria-modal="true"
                aria-label="Add documents"
                initial={{ x: 40, opacity: 0 }}
                animate={{ x: 0, opacity: 1 }}
                exit={{ x: 40, opacity: 0 }}
              >
                <div className="panel-heading">
                  <h2>Add a source</h2>
                  <button
                    className="icon-button"
                    aria-label="Close upload"
                    onClick={() => setDrawer(false)}
                    autoFocus
                  >
                    <X size={20} />
                  </button>
                </div>
                <p className="subtitle">
                  A document becomes part of your evidence after indexing.
                </p>
                <input
                  ref={fileInput}
                  type="file"
                  accept=".pdf,.txt,.md"
                  hidden
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) upload(f);
                    e.target.value = "";
                  }}
                />
                <button
                  className="drop-zone"
                  disabled={!!busy}
                  onClick={() => fileInput.current?.click()}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => {
                    e.preventDefault();
                    if (!busy && e.dataTransfer.files[0])
                      upload(e.dataTransfer.files[0]);
                  }}
                >
                  <UploadCloud size={38} />
                  <strong>
                    {busy === "upload"
                      ? "Receiving document…"
                      : "Drop a document here"}
                  </strong>
                  <span>or click to browse</span>
                  <small>Text PDFs, TXT or Markdown · Up to 10 MB</small>
                </button>
                <label className="form-label">
                  Access
                  <select
                    value={visibility}
                    onChange={(e) => setVisibility(e.target.value)}
                  >
                    <option value="public">Shared with readers</option>
                    {role === "reviewer" && (
                      <option value="staff">Staff only</option>
                    )}
                  </select>
                </label>
                <label className="form-label">
                  Document version
                  <input
                    type="number"
                    min={1}
                    max={10000}
                    value={version}
                    onChange={(e) => setVersion(Number(e.target.value))}
                  />
                </label>
                <div className="status-note">
                  <Layers3 size={20} />
                  <p>
                    Use the same filename and a higher version to update a
                    document. Scanned PDFs need readable text before upload.
                  </p>
                </div>
              </motion.aside>
            </>
          )}
        </AnimatePresence>
        <AnimatePresence>
          {notice && (
            <motion.div
              className="toast"
              role="status"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
            >
              <CheckCircle2 size={18} />
              {notice}
              <button
                aria-label="Dismiss notification"
                onClick={() => setNotice("")}
              >
                <X size={15} />
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </MotionConfig>
  );
}
createRoot(document.getElementById("root")!).render(<App />);
