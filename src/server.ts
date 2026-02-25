import "dotenv/config";
import express from "express";
import cors from "cors";
import { run } from "./orchestrator";

type RunStatus = "queued" | "running" | "done" | "error";

type RunRecord = {
  id: string;
  goal: string;
  createdAt: string;
  status: RunStatus;
  plan: any | null;
  logs: string[];
  qa: any | null;
  error: string | null;
};

const app = express();
app.use(cors({
  origin: (origin, cb) => {
    if (!origin || /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) {
      return cb(null, true);
    }
    return cb(null, false);
  },
}));
app.use(express.json());

const runs = new Map<string, RunRecord>();

function makeRunId() {
  return `run_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

app.post("/run", (req, res) => {
  const goal = String(req.body?.goal ?? "").trim();
  if (!goal) {
    return res.status(400).json({ error: "Missing goal in body" });
  }

  const runId = makeRunId();
  const record: RunRecord = {
    id: runId,
    goal,
    createdAt: new Date().toISOString(),
    status: "queued",
    plan: null,
    logs: [],
    qa: null,
    error: null,
  };

  runs.set(runId, record);
  res.json({ runId, status: "queued" });

  void (async () => {
    const current = runs.get(runId);
    if (!current) return;

    current.status = "running";

    try {
      const result = await run(goal, {
        onLog: (line) => {
          const r = runs.get(runId);
          if (!r) return;
          r.logs.push(line);
        },
        onPlan: (plan) => {
          const r = runs.get(runId);
          if (!r) return;
          r.plan = plan;
        },
        onStep: (info) => {
          const r = runs.get(runId);
          if (!r) return;
          r.logs.push(`executor:step ${info.stepId} ${info.ok ? "ok" : "fail"}`);
        },
        onQA: (qaResult) => {
          const r = runs.get(runId);
          if (!r) return;
          r.qa = qaResult;
          r.logs.push("qa:done");
        },
      });

      const done = runs.get(runId);
      if (!done) return;
      done.plan = result.plan;
      done.qa = result.qa;
      done.status = "done";
      done.logs.push("run:done");
    } catch (err) {
      const failed = runs.get(runId);
      if (!failed) return;
      failed.status = "error";
      failed.error = err instanceof Error ? err.stack || err.message : String(err);
      failed.logs.push("run:error");
    }
  })();
});

app.get("/runs", (req, res) => {
  const limit = Math.max(1, Math.min(200, Number(req.query.limit ?? 50)));
  const list = Array.from(runs.values())
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, limit)
    .map((r) => ({
      id: r.id,
      goal: r.goal,
      createdAt: r.createdAt,
      status: r.status,
      qa: { pass: r.qa?.pass ?? null },
      lastLog: r.logs.length ? r.logs[r.logs.length - 1] : null,
    }));

  return res.json(list);
});

app.get("/runs/:runId", (req, res) => {
  const run = runs.get(req.params.runId);
  if (!run) {
    return res.status(404).json({ error: "Run not found" });
  }
  return res.json(run);
});

const PORT = Number(process.env.PORT ?? 8787);
app.listen(PORT, "127.0.0.1", () => {
  console.log(`API listening on http://127.0.0.1:${PORT}`);
});
