const globalKey = "__openclaw_runs_state__";

function getStore() {
  if (!globalThis[globalKey]) {
    globalThis[globalKey] = {
      runs: [],
    };
  }
  return globalThis[globalKey];
}

export function listRuns(limit = 50) {
  const store = getStore();
  return store.runs.slice(0, Math.max(1, Number(limit) || 50));
}

export function getRun(id) {
  const store = getStore();
  return store.runs.find((r) => r.id === id) || null;
}

export function createRun(goal = "") {
  const store = getStore();
  const run = {
    id: `run_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    goal: String(goal || "").trim() || "Untitled goal",
    createdAt: new Date().toISOString(),
    status: "done",
    logs: ["Vercel lightweight mode active", "No local OpenClaw executor attached in cloud deploy"],
    artifacts: {
      exportStatus: "cloud_stub",
      unsupported_claims_count: 0,
    },
  };
  store.runs.unshift(run);
  return run;
}
