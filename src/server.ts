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
  selfCheck?: {
    command: string;
    exitCode: number;
    stdout: string;
    stderr: string;
    timestamp: string;
  } | null;
  cursorEdit?: {
    marker: string;
    retryCount: number;
  } | null;
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
      if (run.goal.toLowerCase().includes("test output demo") && step.tools.includes("file_write") && step.inputs?.path === "docs/TEST_OUTPUT.txt") {
        const sc = run.selfCheck;
        if (sc) {
          step.inputs = {
            ...(step.inputs ?? {}),
            content: [
              `timestamp=${sc.timestamp}`,
              `command=${sc.command}`,
              `exitCode=${sc.exitCode}`,
              `stdout=${sc.stdout.slice(0, 2000)}`,
              `stderr=${sc.stderr.slice(0, 2000)}`,
            ].join("\n") + "\n",
          };
        }
      }

      if (run.goal.toLowerCase().includes("[debug_cursor_ui_write]") && step.inputs?.command === "__DEBUG_POST_WRITE__") {
        step.inputs = {
          ...(step.inputs ?? {}),
          marker: `CURSOR_UI_EDIT_${run.id}`,
        };
      }

      const result = await executor(step, process.cwd());

      const shellLogs = result.logs.filter((l) => l.skill === "shell_run") as any[];
      for (const shellLog of shellLogs) {
        const out = shellLog.output;
        const cmd = shellLog.input?.command ?? "unknown";
        const code = out.ok ? 0 : Number(out.code ?? 1);
        const stdoutShort = String(out.stdout ?? "").split("\n").slice(0, 6).join("\\n");
        const stderrShort = String(out.stderr ?? "").split("\n").slice(0, 6).join("\\n");
        pushLog(run, `shell_run: command=${cmd} exitCode=${code}`);
        if (stdoutShort.trim()) pushLog(run, `shell_stdout:\n${stdoutShort}`);
        if (stderrShort.trim()) pushLog(run, `shell_stderr:\n${stderrShort}`);

        if (run.goal.toLowerCase().includes("test output demo")) {
          run.selfCheck = {
            command: String(cmd),
            exitCode: code,
            stdout: String(out.stdout ?? ""),
            stderr: String(out.stderr ?? ""),
            timestamp: new Date().toISOString(),
          };
          pushLog(run, `self_check: command=${run.selfCheck.command} exitCode=${run.selfCheck.exitCode}`);
          if (!out.ok) {
            run.status = "error";
            run.error = `Self-check command failed: ${run.selfCheck.command} (exitCode=${run.selfCheck.exitCode})\nstdout:\n${run.selfCheck.stdout}\nstderr:\n${run.selfCheck.stderr}`;
            pushLog(run, "run:error");
            run.isProcessing = false;
            return;
          }
        }
      }

      const isCursorReadmeDemo = run.goal.toLowerCase().includes("cursor readme demo");
      const isTestRunEvidence = run.goal.toLowerCase().includes("test run evidence");

      if ((isCursorReadmeDemo && step.id === "step-3") || (isTestRunEvidence && step.id === "step-3")) {
        const expectedMarker = isTestRunEvidence ? `TEST_RUN_${run.id}` : `CURSOR_UI_EDIT_${run.id}`;
        const readmePath = "/Users/William/Projects/multi-agent-openclaw/README.md";
        const content = await import("node:fs/promises").then((m) => m.readFile(readmePath, "utf8")).catch(() => "");
        const okMarker = content.includes(`marker=${expectedMarker}`);
        const okLine = content.includes("Edited inside Cursor UI (not shell).");

        if (!okMarker || !okLine) {
          if ((run.cursorEdit?.retryCount ?? 0) < 1) {
            run.cursorEdit = { marker: expectedMarker, retryCount: 1 };
            run.approvedStepIds = [];
            run.nextStepIndex = 0;
            run.pendingStepId = null;
            run.pendingTool = null;
            run.pendingReason = null;
            pushLog(run, "cursor_ui_edit_retry: marker not found; retrying step-1 and step-2");
            run.isProcessing = false;
            await continueRun(run.id);
            return;
          }

          run.status = "error";
          run.error = "readme_ui_edit_failed: marker not found after retry";
          pushLog(run, "readme_ui_edit_failed: marker not found after retry");
          pushLog(run, "run:error");
          run.isProcessing = false;
          return;
        }

        pushLog(run, `cursor_ui_edit_verified: marker=${expectedMarker}`);
      }

      const fileReadLog = result.logs.find((l) => l.skill === "file_read") as any;
      if (fileReadLog?.output?.content && (run.goal.toLowerCase().includes("[debug_readme_marker]") || run.goal.toLowerCase().includes("[debug_cursor_ui_write]"))) {
        const full = String(fileReadLog.output.content);
        const tailLines = full.split("\n").slice(-80).join("\n");
        const markerNeedle = run.goal.toLowerCase().includes("[debug_cursor_ui_write]")
          ? `marker=CURSOR_UI_EDIT_${run.id}`
          : "marker=CURSOR_UI_EDIT_";
        const markerFound = full.includes(markerNeedle);
        pushLog(run, `file_read_tail:\n${tailLines}`);
        pushLog(run, `markerFound=${markerFound} needle=${markerNeedle}`);
      }

      const openclawLog = result.logs.find((l) => l.skill === "openclaw_act") as any;
      if (openclawLog?.output?.output) {
        const summary = String(openclawLog.output.output).slice(0, 220);
        pushLog(run, `openclaw_act: ${summary}`);
      }
      pushLog(run, `executor:step ${step.id} ${result.ok ? "ok" : "fail"}`);
      pushLog(run, `executor:step ${step.id} done`);
      run.nextStepIndex = i + 1;
    }

    run.qa = await qa(process.cwd(), run.goal, run.id);
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
    selfCheck: null,
    cursorEdit: { marker: goal.toLowerCase().includes("test run evidence") ? `TEST_RUN_${runId}` : `CURSOR_UI_EDIT_${runId}`, retryCount: 0 },
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
      if (run.plan) {
        for (const s of run.plan.steps) {
          if (!s.inputs) continue;
          const replaced: Record<string, string> = {};
          for (const [k, v] of Object.entries(s.inputs)) {
            replaced[k] = String(v).replaceAll("__RUN_ID__", run.id);
          }
          s.inputs = replaced;
        }
      }
      if (run.goal.toLowerCase().includes("cursor readme demo") && run.cursorEdit) {
        pushLog(run, `cursor_marker: ${run.cursorEdit.marker}`);
      }
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
