import "dotenv/config";
import path from "node:path";
import express from "express";
import cors from "cors";
import { exec as cpExec } from "node:child_process";
import { getModel, getProvider } from "./config";
import { planner, type Plan } from "./agents/planner";
import { executor } from "./agents/executor";
import { qa } from "./agents/qa";

type RunStatus = "queued" | "running" | "needs_approval" | "done" | "error";

type RoleAssignments = {
  main?: string | string[];
  research?: string | string[];
  executor?: string | string[];
  qa?: string | string[];
  reviewer?: string | string[];
};

type WorkflowStage = {
  id: string;
  type: "research" | "synth" | "plan" | "execute" | "qa" | "review" | "judge";
  agents: string[];
  mergePolicy: "none" | "summary" | "judge" | "vote";
  notes?: string;
};

type RoleDef = {
  id: string;
  name: string;
  prompt: string;
};

type EnforceConfig = {
  evidence_or_citations_delta_min?: number;
  source_diversity_min_domains?: number;
  max_duplicate_ratio?: number;
  facts_count_min?: number;
};

type RunRecord = {
  id: string;
  goal: string;
  createdAt: string;
  status: RunStatus;
  plan: Plan | null;
  logs: string[];
  qa: any | null;
  error: string | null;
  config?: {
    roleAssignments?: RoleAssignments;
    workflowStages?: WorkflowStage[];
    roles?: RoleDef[];
    roleAssignmentsByRole?: Record<string, string>;
    enforce?: EnforceConfig;
    anti_overfitting_applied?: boolean;
  };
  artifacts?: {
    researchOutputs?: Array<{ agent: string; text: string }>;
    researchSummary?: string;
    docxPath?: string | null;
    docxExists?: boolean;
    exportMdPath?: string;
    exportStatus?: string;
    judge_v1?: any;
    judge_v2?: any;
    judge_delta?: Record<string, number> | null;
    top_delta_raw?: { dimension: string | null; delta: number | null };
    top_delta_effective?: { dimension: string | null; delta: number | null };
    gateReasons?: string[];
    revision_report?: any;
    judge_v3?: any;
    repeat_flags?: boolean;
    repeat_details?: any;
    sources_count?: number;
    sources_count_final?: number;
    word_count?: number;
    unique_domains?: number;
    duplicate_ratio?: number;
    facts_count?: number;
  };
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
const publicDir = path.join(process.cwd(), "public");
app.use(express.static(publicDir));
app.get("/", (_req, res) => res.sendFile(path.join(publicDir, "index.html")));

const runs = new Map<string, RunRecord>();

function makeRunId() {
  return `run_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function pushLog(run: RunRecord, line: string) {
  run.logs.push(line);
}

function asArray(v: unknown): string[] {
  if (Array.isArray(v)) return v.map((x) => String(x)).filter(Boolean);
  if (typeof v === "string" && v.trim()) return [v.trim()];
  return [];
}

function normalizeRoleAssignments(input?: RoleAssignments): RoleAssignments | undefined {
  if (!input) return undefined;
  const main = asArray(input.main)[0] ?? "none";
  const executor = asArray(input.executor)[0] ?? "none";
  const research = asArray(input.research);
  const qa = asArray(input.qa);
  const reviewer = asArray(input.reviewer);
  return {
    main,
    executor,
    research,
    qa,
    reviewer,
  };
}

function normalizeWorkflowStages(input: any): WorkflowStage[] | undefined {
  if (!Array.isArray(input)) return undefined;
  const allowedTypes = new Set(["research", "synth", "plan", "execute", "qa", "review", "judge"]);
  const allowedMerge = new Set(["none", "summary", "judge", "vote"]);
  const out: WorkflowStage[] = [];
  for (let i = 0; i < input.length; i++) {
    const s = input[i] ?? {};
    const id = String(s.id ?? `s${i + 1}`);
    const typeRaw = String(s.type ?? "research");
    const mergeRaw = String(s.mergePolicy ?? "none");
    const type = (allowedTypes.has(typeRaw) ? typeRaw : "research") as WorkflowStage["type"];
    const mergePolicy = (allowedMerge.has(mergeRaw) ? mergeRaw : "none") as WorkflowStage["mergePolicy"];
    out.push({
      id,
      type,
      agents: asArray(s.agents),
      mergePolicy,
      notes: s.notes ? String(s.notes) : undefined,
    });
  }
  return out;
}

function buildResearchOutputs(goal: string, researchAgents: string[]): { outputs: Array<{ agent: string; text: string }>; summary: string } {
  const outputs = researchAgents.map((agent, idx) => ({
    agent,
    text: [
      `Agent ${agent} research note ${idx + 1}`,
      `Goal context: ${goal}`,
      `Key observations: focus on feasibility, implementation steps, and risks.`,
      `Assumption: current repo keeps planner/executor/qa split and API-driven runs.`,
      `Risk: provider availability and config drift may impact deterministic output.`,
    ].join("\n"),
  }));

  const bullets = outputs
    .map((o) => `- ${o.agent}: ${o.text.split("\n")[2]} ${o.text.split("\n")[4]}`)
    .join("\n");

  const summary = [
    `Research Summary for goal: ${goal}`,
    `Collected outputs from ${outputs.length} agents.`,
    bullets,
    `Consolidated recommendation: keep execution deterministic, log evidence per step, and gate high-risk actions with approval.`,
    `Next action: use this summary as input for the next planning/refinement step.`
  ].join("\n\n");

  return { outputs, summary };
}

const runIndexPath = path.join(process.cwd(), "docs", "runs_index.jsonl");

function getTopDeltaFromMap(deltaMap: any): { dimension: string | null; delta: number | null } {
  if (!deltaMap || typeof deltaMap !== "object") return { dimension: null, delta: null };
  const entries = Object.entries(deltaMap)
    .map(([k, v]) => [k, Number(v)] as const)
    .filter(([, v]) => Number.isFinite(v))
    .sort((a, b) => b[1] - a[1]);
  if (!entries.length) return { dimension: null, delta: null };
  return { dimension: String(entries[0][0]), delta: Number(entries[0][1]) };
}

function getEffectiveTopDelta(judgeDelta: any, antiOverfittingApplied: boolean): {
  raw: { dimension: string | null; delta: number | null };
  effective: { dimension: string | null; delta: number | null };
} {
  const raw = getTopDeltaFromMap(judgeDelta);
  if (!antiOverfittingApplied) return { raw, effective: raw };

  const weights: Record<string, number> = {
    evidence_specificity: 2,
    citations_integrity: 2,
    counterarguments_nuance: 0.5,
  };
  const weighted = Object.fromEntries(
    Object.entries(judgeDelta || {}).map(([k, v]) => {
      const n = Number(v);
      const w = Number(weights[k] ?? 1);
      return [k, Number.isFinite(n) ? n * w : n];
    })
  );
  const effective = getTopDeltaFromMap(weighted);
  return { raw, effective };
}

function detectRepeatSignals(md: string, goal: string) {
  const lines = md.split(/\n+/).map((x) => x.trim()).filter(Boolean);
  const starters = lines.filter((x) => !x.startsWith("#") && x.length > 30).slice(0, 20).map((x) => x.slice(0, 80).toLowerCase());
  const starterCount = new Map<string, number>();
  for (const s of starters) starterCount.set(s, (starterCount.get(s) ?? 0) + 1);
  const repeatedStarters = Array.from(starterCount.entries()).filter(([, n]) => n >= 2).map(([s]) => s);

  const tokens = md.toLowerCase().replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter(Boolean);
  const n = 10;
  const grams = new Map<string, number>();
  for (let i = 0; i + n <= tokens.length; i++) {
    const g = tokens.slice(i, i + n).join(" ");
    grams.set(g, (grams.get(g) ?? 0) + 1);
  }
  const repeatedGramHits = Array.from(grams.values()).filter((c) => c >= 2).length;
  const ngramRepeatRate = grams.size ? repeatedGramHits / grams.size : 0;

  const goalPhrase = goal.toLowerCase().replace(/[^a-z0-9\s]/g, " ").trim();
  const goalPhraseRepeated = goalPhrase.length > 20 && (md.toLowerCase().match(new RegExp(goalPhrase.replace(/\s+/g, "\\s+"), "g")) || []).length >= 2;

  const repeat_flags = repeatedStarters.length > 0 || ngramRepeatRate > 0.03 || goalPhraseRepeated;
  const reasons = [
    ...(repeatedStarters.length ? ["repeated_paragraph_starters"] : []),
    ...(goalPhraseRepeated ? ["goal_phrase_repeated"] : []),
    ...((repeatedStarters.length > 0 || ngramRepeatRate > 0.03 || goalPhraseRepeated) ? ["repeated_content_detected"] : []),
  ];
  return { repeat_flags, reasons, repeat_details: { repeated_starters: repeatedStarters.slice(0, 5), ngram_repeat_rate: Number(ngramRepeatRate.toFixed(4)), goal_phrase_repeated: goalPhraseRepeated } };
}

function buildJudgeV3FromV2(judgeV2: any, repeatDetected: boolean) {
  const dimension_scores = {
    "Thesis & Answering the Prompt": Number(judgeV2?.dimension_scores?.thesis_prompt?.score ?? 0),
    "Structure & Coherence": Number(judgeV2?.dimension_scores?.structure_coherence?.score ?? 0),
    "Evidence & Specificity": Number(judgeV2?.dimension_scores?.evidence_specificity?.score ?? 0),
    "Counterarguments & Nuance": Number(judgeV2?.dimension_scores?.counterarguments_nuance?.score ?? 0),
    "Clarity & Style": Number(judgeV2?.dimension_scores?.clarity_style?.score ?? 0),
    "Citations & Integrity": Number(judgeV2?.dimension_scores?.citations_integrity?.score ?? 0),
  };
  const items = Object.entries(dimension_scores).sort((a,b)=>Number(a[1])-Number(b[1]));
  return {
    model: "openai:gpt-4o-mini",
    overall_score: Number(judgeV2?.overall_score ?? 0),
    dimension_scores,
    weaknesses_top3: items.slice(0,3).map(([k])=>k),
    revision_instructions: [
      "Use outline-first drafting with distinct section purposes.",
      "Do not reuse the same paragraph opener across sections.",
      "Add at least 6 traceable sources with institution + link.",
      "Add concrete facts (year/number/institution/place) in each main section.",
      "Keep counterarguments concise and evidence-grounded.",
    ],
    must_fix_gate: Boolean(judgeV2?.must_fix_gate),
    repeat_detected: Boolean(repeatDetected),
  };
}

function needsApprovalForStep(_step: Plan["steps"][number]) {
  return false;
}

async function appendRunIndexMeta(run: RunRecord) {
  const fsp = await import("node:fs/promises");
  await fsp.mkdir(path.dirname(runIndexPath), { recursive: true });
  const existing = await fsp.readFile(runIndexPath, "utf8").catch(() => "");
  const exists = existing.split(/\n+/).some((ln) => {
    if (!ln.trim()) return false;
    try { return JSON.parse(ln).runId === run.id; } catch { return false; }
  });
  if (exists) return;
  const topRaw = run.artifacts?.top_delta_raw ?? getTopDeltaFromMap(run.artifacts?.judge_delta);
  const topEffective = run.artifacts?.top_delta_effective ?? topRaw;
  const meta = {
    runId: run.id,
    createdAt: run.createdAt,
    gate: run.artifacts?.judge_v2?.must_fix_gate ?? null,
    v2_score: run.artifacts?.judge_v2?.overall_score ?? null,
    top_delta_dim: topRaw?.dimension ?? null,
    top_delta_val: topRaw?.delta ?? null,
    top_delta_raw_dim: topRaw?.dimension ?? null,
    top_delta_raw_val: topRaw?.delta ?? null,
    top_delta_effective_dim: topEffective?.dimension ?? null,
    top_delta_effective_val: topEffective?.delta ?? null,
    gateReasons: Array.isArray(run.artifacts?.gateReasons) ? run.artifacts.gateReasons : [],
    anti_overfitting_applied: Boolean(run.config?.anti_overfitting_applied),
    sources_count: Number(run.artifacts?.sources_count ?? 0),
    sources_count_final: Number((run.artifacts as any)?.sources_count_final ?? 0),
    word_count: Number((run.artifacts as any)?.word_count ?? 0),
    unique_domains: Number(run.artifacts?.unique_domains ?? 0),
    duplicate_ratio: Number(run.artifacts?.duplicate_ratio ?? 0),
    facts_count: Number(run.artifacts?.facts_count ?? 0),
    repeat_flags: Boolean(run.artifacts?.repeat_flags),
  };
  await fsp.appendFile(runIndexPath, JSON.stringify(meta) + "\n", "utf8");
}

async function continueRun(runId: string) {
  const run = runs.get(runId);
  if (!run) return;
  if (!run.plan) return;
  if (run.isProcessing) return;

  run.isProcessing = true;
  run.status = "running";
  if (run.nextStepIndex === 0 && run.config?.roleAssignments) {
    const cfg = JSON.stringify(run.config.roleAssignments).slice(0, 600);
    pushLog(run, `run_config: roleAssignments=${cfg}`);

    const researchAgents = asArray(run.config.roleAssignments.research);
    if (researchAgents.length >= 2 && !run.artifacts?.researchSummary) {
      const { outputs, summary } = buildResearchOutputs(run.goal, researchAgents);
      run.artifacts = {
        ...(run.artifacts ?? {}),
        researchOutputs: outputs,
        researchSummary: summary,
      };
      pushLog(run, `research_outputs_count=${outputs.length}`);
      pushLog(run, `research_summary_len=${summary.length}`);
    }
  }

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

      if (run.config?.enforce || run.config?.anti_overfitting_applied) {
        step.inputs = {
          ...(step.inputs ?? {}),
          enforce: run.config?.enforce,
          anti_overfitting_applied: Boolean(run.config?.anti_overfitting_applied),
        } as any;
      }
      const result = await executor(step, process.cwd(), run.id);

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

      if (run.goal.toLowerCase().includes("stage 3c") && step.id === "step-2") {
        const full = String(fileReadLog?.output?.content ?? "");
        const needle = `marker=CURSOR_API_${run.id}`;
        const markerFound = full.includes(needle);
        pushLog(run, `cursor_api_markerFound=${markerFound} needle=${needle}`);
        if (!markerFound) {
          run.status = "error";
          run.error = `cursor_api_write_failed: marker not found (${needle})`;
          pushLog(run, "run:error");
          run.isProcessing = false;
          return;
        }
      }

      const cursorActLog = result.logs.find((l) => l.skill === "cursor_act") as any;
      if (cursorActLog?.output) {
        const s = String(cursorActLog.output.summary ?? "cursor_act executed").slice(0, 240);
        const err = cursorActLog.output.error ? ` error=${String(cursorActLog.output.error).slice(0,180)}` : "";
        pushLog(run, `cursor_act: ${s}${err}`);
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

    const expectedDocx = path.join(process.cwd(), `docs/exports/${run.id}.docx`);
    const expectedMd = path.join(process.cwd(), `docs/exports/${run.id}.md`);
    const researchPath = path.join(process.cwd(), `docs/exports/${run.id}.research.md`);
    const fsp = await import("node:fs/promises");
    const researchText = await fsp.readFile(researchPath, "utf8").catch(() => "");
    const finalMdText = await fsp.readFile(expectedMd, "utf8").catch(() => "");
    const urls = (researchText.match(/https?:\/\/[^\s)]+/g) || []).map((u) => u.replace(/[.,]$/, ""));
    const domains = urls.map((u) => { try { return new URL(u).hostname.replace(/^www\./,""); } catch { return ""; } }).filter(Boolean);
    const uniqueDomains = new Set(domains).size;
    const duplicateRatio = domains.length ? (domains.length - uniqueDomains) / domains.length : 1;
    const factLinePattern = /\b(19\d{2}|20\d{2})\b|\b\d{2,}\b|\b(University|Department|Madison|Wisconsin|NOAA|USDA|Census|BLS|HUD|EPA|DOT)\b/i;
    const factsCount = finalMdText.split(/\n+/).map((ln) => ln.trim()).filter((ln) => ln && factLinePattern.test(ln)).length;
    const wordCount = finalMdText.split(/\s+/).filter(Boolean).length;
    const sourceCountFinal = (finalMdText.match(/^-\s+Reference\s+\d+/gmi) || []).length;
    const judge_v1 = await fsp.readFile(path.join(process.cwd(), `docs/exports/${run.id}.judge.v1.json`), "utf8").then(JSON.parse).catch(() => null);
    let judge_v2 = await fsp.readFile(path.join(process.cwd(), `docs/exports/${run.id}.judge.v2.json`), "utf8").then(JSON.parse).catch(() => null);
    const revision_report = await fsp.readFile(path.join(process.cwd(), `docs/exports/${run.id}.revision_report.json`), "utf8").then(JSON.parse).catch(() => null);
    const dims = ["thesis_prompt", "structure_coherence", "evidence_specificity", "counterarguments_nuance", "clarity_style", "citations_integrity"];
    const judge_delta = judge_v1 && judge_v2
      ? Object.fromEntries(dims.map((k) => [k, Number(judge_v2?.dimension_scores?.[k]?.score ?? 0) - Number(judge_v1?.dimension_scores?.[k]?.score ?? 0)]))
      : null;
    const { raw: top_delta_raw, effective: top_delta_effective } = getEffectiveTopDelta(judge_delta, Boolean(run.config?.anti_overfitting_applied));
    const repeat = detectRepeatSignals(finalMdText, run.goal);
    const judge_v3 = buildJudgeV3FromV2(judge_v2, repeat.repeat_flags);
    const gateReasons = (() => {
      const g = judge_v2?.gate_reasons ?? {};
      const out: string[] = [];
      if (g.overall_threshold === false) out.push("overall_v2 below required threshold");
      if (g.overall_improved_by_2 === false) out.push("overall_v2 not >= overall_v1 + 2");
      if (g.lowest_two_improved === false) out.push("weakest dimensions improvement below required");
      if (sourceCountFinal < 6 || g.sources_ok === false) out.push("minSources_not_met");
      if (g.words_ok === false) out.push("minWords_not_met");
      if (g.force_gate_fail === false) out.push("force_gate_fail");
      if (g.evidence_or_citations_improved === false) out.push("insufficient_evidence_or_citations_improvement");
      if (repeat.repeat_flags) out.push(...repeat.reasons);
      if (wordCount < 650) out.push("minWords_not_met");
      if (sourceCountFinal < 6) out.push("minSources_not_met");
      if (Number(judge_v3?.overall_score ?? 0) < 24) out.push("rubric_score_too_low");
      if (Number(judge_v3?.dimension_scores?.["Citations & Integrity"] ?? 0) < 4) out.push("citations_integrity_too_low");
      if (Number(judge_v3?.dimension_scores?.["Evidence & Specificity"] ?? 0) < 4) out.push("evidence_specificity_too_low");
      return Array.from(new Set(out));
    })();
    if (run.config?.enforce) {
      if (uniqueDomains < Number(run.config.enforce.source_diversity_min_domains ?? 1)) gateReasons.push("source_diversity_not_met");
      if (duplicateRatio > Number(run.config.enforce.max_duplicate_ratio ?? 1)) gateReasons.push("duplicate_ratio_too_high");
      const eDelta = Number(judge_delta?.evidence_specificity ?? 0);
      const cDelta = Number(judge_delta?.citations_integrity ?? 0);
      if (Math.max(eDelta, cDelta) < Number(run.config.enforce.evidence_or_citations_delta_min ?? 1)) gateReasons.push("insufficient_evidence_or_citations_improvement");
      if (Boolean(run.config?.anti_overfitting_applied)) {
        const minFacts = Number((run.config?.enforce as any)?.facts_count_min ?? 2);
        if (factsCount < minFacts) gateReasons.push("facts_count_not_met");
      }
      if (gateReasons.length) {
        judge_v2 = { ...(judge_v2 || {}), must_fix_gate: false };
      }
    }
    const gatePassed = Boolean(judge_v2?.must_fix_gate) && gateReasons.length === 0;
    let docxExists = await fsp.stat(expectedDocx).then(() => true).catch(() => false);
    if (!gatePassed && docxExists) {
      await fsp.unlink(expectedDocx).catch(() => undefined);
      docxExists = false;
      pushLog(run, "export:docx_removed_due_to_gate_fail");
    }
    run.artifacts = {
      ...(run.artifacts ?? {}),
      docxPath: gatePassed && docxExists ? expectedDocx : null,
      docxExists: gatePassed && docxExists,
      exportMdPath: expectedMd,
      judge_v1,
      judge_v2,
      judge_delta,
      top_delta_raw,
      top_delta_effective,
      gateReasons,
      revision_report,
      judge_v3,
      repeat_flags: repeat.repeat_flags,
      repeat_details: repeat.repeat_details,
      sources_count: urls.length,
      sources_count_final: sourceCountFinal,
      word_count: wordCount,
      unique_domains: uniqueDomains,
      duplicate_ratio: Number(duplicateRatio.toFixed(4)),
      facts_count: factsCount,
      exportStatus: gatePassed ? "exported" : "draft_only_not_exported",
    };
    pushLog(run, gatePassed && docxExists ? `export:docx_path=${expectedDocx}` : "export:skipped_not_exported_due_to_gate_fail");
    run.qa = await qa(process.cwd(), run.goal, run.id, run.config, run.artifacts);
    pushLog(run, "qa:done");
    pushLog(run, JSON.stringify(run.qa));
    run.status = "done";
    pushLog(run, "run:done");
    await appendRunIndexMeta(run);
  } catch (err) {
    run.status = "error";
    run.error = err instanceof Error ? err.stack || err.message : String(err);
    pushLog(run, "run:error");
    await appendRunIndexMeta(run).catch(() => undefined);
  } finally {
    run.isProcessing = false;
  }
}

app.post("/run", (req, res) => {
  const goal = String(req.body?.goal ?? "").trim();
  if (!goal) {
    return res.status(400).json({ error: "Missing goal in body" });
  }
  const disallowed = /fix\s+bug|feature|ui automation|openclaw_act|cursor ui|click button|refactor code|add endpoint/i;
  if (disallowed.test(goal)) {
    return res.status(400).json({ error: "Paper Mode Only: non-writing engineering/UI goals are disabled." });
  }

  const roleAssignmentsRaw = (req.body?.roleAssignments ?? undefined) as RoleAssignments | undefined;
  const roleAssignments = normalizeRoleAssignments(roleAssignmentsRaw);
  const workflowStages = normalizeWorkflowStages(req.body?.workflowStages);
  const roles = Array.isArray(req.body?.roles)
    ? req.body.roles.map((r: any) => ({ id: String(r?.id ?? ""), name: String(r?.name ?? ""), prompt: String(r?.prompt ?? "") })).filter((r: RoleDef) => r.id)
    : undefined;
  const roleAssignmentsByRole = req.body?.roleAssignmentsByRole && typeof req.body.roleAssignmentsByRole === "object"
    ? Object.fromEntries(Object.entries(req.body.roleAssignmentsByRole).map(([k, v]) => [String(k), String(v ?? "none")]))
    : undefined;
  const enforce = req.body?.enforce && typeof req.body.enforce === "object"
    ? {
        evidence_or_citations_delta_min: Number(req.body.enforce.evidence_or_citations_delta_min ?? 1),
        source_diversity_min_domains: Number(req.body.enforce.source_diversity_min_domains ?? 1),
        max_duplicate_ratio: Number(req.body.enforce.max_duplicate_ratio ?? 1),
        facts_count_min: Number(req.body.enforce.facts_count_min ?? 2),
      }
    : undefined;
  const anti_overfitting_applied = Boolean(req.body?.anti_overfitting_applied);

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
    config: {
      roleAssignments,
      workflowStages,
      roles,
      roleAssignmentsByRole,
      enforce,
      anti_overfitting_applied,
    },
    pendingStepId: null,
    pendingReason: null,
    pendingTool: null,
    nextStepIndex: 0,
    approvedStepIds: [],
    isProcessing: false,
    selfCheck: null,
    cursorEdit: { marker: goal.toLowerCase().includes("test run evidence") ? `TEST_RUN_${runId}` : `CURSOR_UI_EDIT_${runId}`, retryCount: 0 },
    artifacts: {
      researchOutputs: [],
      researchSummary: "",
    },
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
        (run.plan as any).meta = {
          roleAssignments: run.config?.roleAssignments ?? null,
          workflowStages: run.config?.workflowStages ?? null,
        };
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
      roleAssignments: {
        main: r.config?.roleAssignments?.main ?? null,
        research: asArray(r.config?.roleAssignments?.research),
        qa: asArray(r.config?.roleAssignments?.qa),
      },
      researchSummary: r.artifacts?.researchSummary ? String(r.artifacts.researchSummary).slice(0, 180) : null,
      workflowStagesSummary: (() => {
        const stages = r.config?.workflowStages ?? [];
        if (!Array.isArray(stages) || !stages.length) return null;
        const first = stages[0]?.type ?? "?";
        const last = stages[stages.length - 1]?.type ?? "?";
        return `${stages.length} stages: ${first}→${last}`;
      })(),
      roleSummary: {
        count: Array.isArray(r.config?.roles) ? r.config.roles.length : 0,
      },
      docxPath: r.artifacts?.docxPath ?? null,
      v2_score: r.artifacts?.judge_v2?.overall_score ?? null,
      top_delta_raw: r.artifacts?.top_delta_raw ?? getTopDeltaFromMap(r.artifacts?.judge_delta),
      top_delta_effective: r.artifacts?.top_delta_effective ?? (r.artifacts?.top_delta_raw ?? getTopDeltaFromMap(r.artifacts?.judge_delta)),
      top_delta: r.artifacts?.top_delta_effective ?? (r.artifacts?.top_delta_raw ?? getTopDeltaFromMap(r.artifacts?.judge_delta)),
      gate: r.artifacts?.judge_v2?.must_fix_gate ?? null,
      gateReasons: Array.isArray(r.artifacts?.gateReasons) ? r.artifacts.gateReasons.slice(0,2) : [],
      anti_overfitting_applied: Boolean(r.config?.anti_overfitting_applied),
      sources_count: r.artifacts?.sources_count ?? null,
      sources_count_final: (r.artifacts as any)?.sources_count_final ?? null,
      word_count: (r.artifacts as any)?.word_count ?? null,
      unique_domains: r.artifacts?.unique_domains ?? null,
      duplicate_ratio: r.artifacts?.duplicate_ratio ?? null,
      facts_count: r.artifacts?.facts_count ?? null,
      repeat_flags: r.artifacts?.repeat_flags ?? null,
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

app.post("/quality/export-csv", async (req, res) => {
  let rows = Array.isArray(req.body?.rows) ? req.body.rows : [];
  const windowN = Number(req.body?.window ?? rows.length ?? 0);
  const filterType = String(req.body?.filter?.type ?? "");
  const filterValue = String(req.body?.filter?.value ?? "");
  let dataSource = "live runs";

  const fsp = await import("node:fs/promises");
  if (!rows.length) {
    const raw = await fsp.readFile(runIndexPath, "utf8").catch(() => "");
    let parsed = raw.split(/\n+/).filter(Boolean).map((ln) => { try { return JSON.parse(ln); } catch { return null; } }).filter(Boolean) as any[];
    parsed.sort((a,b) => String(b.createdAt||"").localeCompare(String(a.createdAt||"")));
    if (filterType === "gateReason" && filterValue) parsed = parsed.filter((r) => Array.isArray(r.gateReasons) && r.gateReasons.includes(filterValue));
    if (filterType === "topDelta" && filterValue) parsed = parsed.filter((r) => String(r.top_delta_effective_dim ?? r.top_delta_dim ?? "") === filterValue);
    rows = parsed.slice(0, windowN || 50).map((r) => ({
      id: r.runId,
      createdAt: r.createdAt,
      gate: r.gate,
      v2_score: r.v2_score,
      top_delta_raw: { dimension: r.top_delta_raw_dim ?? r.top_delta_dim, delta: r.top_delta_raw_val ?? r.top_delta_val },
      top_delta_effective: { dimension: r.top_delta_effective_dim ?? r.top_delta_dim, delta: r.top_delta_effective_val ?? r.top_delta_val },
      top_delta: { dimension: r.top_delta_effective_dim ?? r.top_delta_dim, delta: r.top_delta_effective_val ?? r.top_delta_val },
      gateReasons: r.gateReasons || [],
      anti_overfitting_applied: r.anti_overfitting_applied ?? false,
      sources_count: r.sources_count ?? "",
      unique_domains: r.unique_domains ?? "",
      duplicate_ratio: r.duplicate_ratio ?? "",
      facts_count: r.facts_count ?? "",
    }));
    dataSource = "persisted index";
  }

  if (!rows.length) return res.status(400).json({ error: "No rows to export. Run at least one paper job or check docs/runs_index.jsonl" });

  const qualityDir = path.join(process.cwd(), "docs/quality");
  await fsp.mkdir(qualityDir, { recursive: true });
  const ts = new Date().toISOString().replace(/[:.]/g, "-");
  const outPath = path.join(qualityDir, `quality_window_${windowN}_${ts}.csv`);
  const esc = (v: any) => `"${String(v ?? "").replaceAll('"','""')}"`;
  const header = ["runId","createdAt","gate","v2_score","top_delta_dim","top_delta_val","top_delta_raw_dim","top_delta_raw_val","top_delta_effective_dim","top_delta_effective_val","gateReasons_joined","anti_overfitting_applied","sources_count","unique_domains","duplicate_ratio","facts_count"].join(",");
  const lines = rows.map((r: any) => [
    esc(r.id), esc(r.createdAt), esc(r.gate), esc(r.v2_score), esc(r.top_delta_raw?.dimension ?? r.top_delta?.dimension ?? ""), esc(r.top_delta_raw?.delta ?? r.top_delta?.delta ?? ""), esc(r.top_delta_raw?.dimension ?? r.top_delta?.dimension ?? ""), esc(r.top_delta_raw?.delta ?? r.top_delta?.delta ?? ""), esc(r.top_delta_effective?.dimension ?? r.top_delta?.dimension ?? ""), esc(r.top_delta_effective?.delta ?? r.top_delta?.delta ?? ""), esc((r.gateReasons||[]).join("|")), esc(r.anti_overfitting_applied ?? ""), esc(r.sources_count ?? ""), esc(r.unique_domains ?? ""), esc(r.duplicate_ratio ?? ""), esc(r.facts_count ?? "")
  ].join(","));
  await fsp.writeFile(outPath, [header, ...lines].join("\n") + "\n", "utf8");
  return res.json({ ok: true, path: outPath, count: rows.length, dataSource });
});

async function resolveWhitelistedOutputPath(run: RunRecord) {
  const target = run.artifacts?.docxPath;
  if (!target) return { error: "No exported docx for this run", code: 400 as const, real: null as string | null };

  const fsp = await import("node:fs/promises");
  const real = await fsp.realpath(target).catch(() => null);
  if (!real) return { error: "File not found", code: 404 as const, real: null as string | null };

  const exportsRoot = path.resolve(process.cwd(), "docs/exports") + path.sep;
  const allowDesktop = String(process.env.ALLOW_OPEN_OUTPUT_DESKTOP ?? "false").toLowerCase() === "true";
  const desktopRoot = path.resolve(process.env.HOME ?? "", "Desktop") + path.sep;
  const inExports = real.startsWith(exportsRoot);
  const inDesktop = allowDesktop && real.startsWith(desktopRoot);
  if (!inExports && !inDesktop) {
    pushLog(run, "open_output: denied (path outside whitelist)");
    return { error: "Open denied by path policy", code: 403 as const, real: null as string | null };
  }

  return { error: null as string | null, code: 200 as const, real };
}

app.get("/runs/:runId/output-file", async (req, res) => {
  const run = runs.get(req.params.runId);
  if (!run) return res.status(404).json({ error: "Run not found" });

  const resolved = await resolveWhitelistedOutputPath(run);
  if (resolved.error || !resolved.real) return res.status(resolved.code).json({ error: resolved.error });
  return res.download(resolved.real, path.basename(resolved.real));
});

app.post("/runs/:runId/open-output", async (req, res) => {
  const run = runs.get(req.params.runId);
  if (!run) return res.status(404).json({ error: "Run not found" });

  const resolved = await resolveWhitelistedOutputPath(run);
  if (resolved.error || !resolved.real) return res.status(resolved.code).json({ error: resolved.error });

  cpExec(`open "${resolved.real.replace(/"/g, '\\"')}"`, (err) => {
    if (err) return res.status(500).json({ error: "Failed to open output" });
    return res.json({ ok: true, path: resolved.real });
  });
});

const PORT = Number(process.env.PORT ?? 8787);
app.listen(PORT, "127.0.0.1", () => {
  console.log(`API listening on http://127.0.0.1:${PORT}`);
  console.log(`[Config] CURSOR_API_KEY exists=${Boolean(process.env.CURSOR_API_KEY)}`);
});
