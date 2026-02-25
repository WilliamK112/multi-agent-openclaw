import "dotenv/config";
import express from "express";
import cors from "cors";
import { getModel, getProvider } from "./config";
import { planner, type Plan } from "./agents/planner";
import { executor } from "./agents/executor";
import { qa } from "./agents/qa";

type RunStatus = "queued" | "running" | "needs_approval" | "done" | "error";

type RunRecord = {
  id: string;
  goal: string;
  createdAt: string;
  status: RunStatus;
  plan: Plan | null;
  logs: string[];
  qa: any | null;
  error: string | null;
  pendingStepId: string | null;
  pendingReason: string | null;
  pendingTool: string | null;
  nextStepIndex: number;
  approvedStepIds: string[];
  isProcessing: boolean;
};

const app = express();
app.use(cors());
app.use(express.json());

const runs = new Map<string, RunRecord>();

function makeRunId() {
  return `run_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function pushLog(run: RunRecord, line: string) {
  run.logs.push(line);
}

function needsApprovalForStep(step: Plan["steps"][number]) {
  return step.tools.includes("openclaw_act");
}

async function continueRun(runId: string) {
  const run = runs.get(runId);
  if (!run) return;
  if (!run.plan) return;
  if (run.isProcessing) return;

  run.isProcessing = true;
  run.status = "running";

  try {
    for (let i = run.nextStepIndex; i < run.plan.steps.length; i++) {
      const step = run.plan.steps[i];

      if (needsApprovalForStep(step) && !run.approvedStepIds.includes(step.id)) {
        run.status = "needs_approval";
        run.pendingStepId = step.id;
        run.pendingTool = "openclaw_act";
        run.pendingReason = "requires user approval";
        run.nextStepIndex = i;
        pushLog(run, `needs_approval: ${step.id} openclaw_act - reason: requires user approval`);
        run.isProcessing = false;
        return;
      }

      pushLog(run, `executor:step ${step.id} start`);
      const result = await executor(step, process.cwd());
      const openclawLog = result.logs.find((l) => l.skill === "openclaw_act") as any;
      if (openclawLog?.output?.output) {
        const summary = String(openclawLog.output.output).slice(0, 220);
        pushLog(run, `openclaw_act: ${summary}`);
      }
      pushLog(run, `executor:step ${step.id} ${result.ok ? "ok" : "fail"}`);
      pushLog(run, `executor:step ${step.id} done`);
      run.nextStepIndex = i + 1;
    }

    run.qa = await qa(process.cwd());
    pushLog(run, "qa:done");
    pushLog(run, JSON.stringify(run.qa));
    run.status = "done";
    pushLog(run, "run:done");
  } catch (err) {
    run.status = "error";
    run.error = err instanceof Error ? err.stack || err.message : String(err);
    pushLog(run, "run:error");
  } finally {
    run.isProcessing = false;
  }
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
    pendingStepId: null,
    pendingReason: null,
    pendingTool: null,
    nextStepIndex: 0,
    approvedStepIds: [],
    isProcessing: false,
  };

  runs.set(runId, record);
  res.json({ runId, status: "queued" });

  void (async () => {
    const run = runs.get(runId);
    if (!run) return;

    try {
      const provider = getProvider();
      const model = getModel(provider);
      const key = process.env.ANTHROPIC_API_KEY;
      if (provider === "claude" && !key) {
        throw new Error("Missing ANTHROPIC_API_KEY. Put it in .env");
      }

      pushLog(run, "planner:start");
      pushLog(run, `[Orchestrator] Goal: ${goal}`);
      pushLog(run, `[Orchestrator] LLM provider=${provider}, model=${model}`);
      pushLog(run, `[Config] ANTHROPIC_API_KEY ${key ? "exists" : "missing"}`);

      run.plan = await planner(goal, provider, model);
      pushLog(run, "planner:done");
      pushLog(run, "[Planner] Plan JSON:");
      pushLog(run, JSON.stringify(run.plan));

      await continueRun(runId);
    } catch (err) {
      run.status = "error";
      run.error = err instanceof Error ? err.stack || err.message : String(err);
      pushLog(run, "run:error");
    }
  })();
});

app.post("/runs/:runId/approve", async (req, res) => {
  const run = runs.get(req.params.runId);
  if (!run) return res.status(404).json({ error: "Run not found" });

  if (run.status !== "needs_approval") {
    return res.status(409).json({ error: `Run is not waiting for approval (status=${run.status})` });
  }

  if (!run.pendingStepId) {
    return res.status(409).json({ error: "No pending step to approve" });
  }

  const approvedStepId = run.pendingStepId;
  run.approvedStepIds.push(approvedStepId);
  run.pendingStepId = null;
  run.pendingReason = null;
  run.pendingTool = null;
  run.status = "running";
  pushLog(run, "approved: by user");

  void continueRun(run.id);
  return res.json({ ok: true, runId: run.id, status: run.status });
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
      pendingReason: r.pendingReason,
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
