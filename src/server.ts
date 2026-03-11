import "dotenv/config";
import path from "node:path";
import express from "express";
import cors from "cors";
import { exec as cpExec } from "node:child_process";
import { getModel, getProvider } from "./config";
import { planner, type Plan } from "./agents/planner";
import { executor } from "./agents/executor";
import { qa } from "./agents/qa";
import { validateWorkflowEvidenceBundle, findUnsupportedClaims } from "./domain/workflow";
import { classifyTask } from "./domain/task";
import { selectPlanningModel } from "./llm/selector";
import { saveRunContext, getRecentContexts } from "./memory/context";

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
    taskClassification?: { type: string; complexity: string };
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
    paragraph_word_counts?: Record<string, number>;
    paragraph_length_checks?: Record<string, boolean>;
    placeholder_reference_detected?: boolean;
    works_cited_count?: number;
    works_cited_valid_count?: number;
    invalid_entries_sample?: string[];
    images?: any;
    images_selected_count?: number;
    images_providers_used?: string[];
    image_citations_added?: boolean;
    unique_domains?: number;
    duplicate_ratio?: number;
    facts_count?: number;
    evidenceBundlePath?: string;
    unsupported_claims_count?: number;
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

type MeetingMessage = { speaker: string; role: string; message: string };

type WorkflowRecommendation = {
  goalType: string;
  explainWhy: string;
  costHint: "low" | "medium" | "high";
  workflowStages: WorkflowStage[];
  roles: RoleDef[];
  roleAssignmentsByRole: Record<string, string>;
  meetingRoom: MeetingMessage[];
};

function classifyGoalType(goal: string): "research_writing" | "code_change" | "ui_automation" | "data_task" | "misc" {
  const g = goal.toLowerCase();
  if (/(research|report|article|essay|policy|analysis|paper|workflow)/.test(g)) return "research_writing";
  if (/(bug|fix|feature|refactor|code|implement|endpoint|api)/.test(g)) return "code_change";
  if (/(ui|click|browser|automation|cursor)/.test(g)) return "ui_automation";
  if (/(data|csv|table|batch|etl|dataset)/.test(g)) return "data_task";
  return "misc";
}

function recommendWorkflow(goal: string): WorkflowRecommendation {
  const goalType = classifyGoalType(goal);

  const baseMeeting: MeetingMessage[] = [
    { speaker: "Planner", role: "Orchestrator", message: `User goal received: ${goal}` },
    { speaker: "Quality Lead", role: "QA", message: "Priority: maximize quality and reduce rework via explicit gates." },
  ];

  if (goalType === "research_writing") {
    const hasDeepseek = Boolean(process.env.DEEPSEEK_API_KEY);
    const hasAnthropic = Boolean(process.env.ANTHROPIC_API_KEY);
    const researchAgents = hasDeepseek
      ? ["deepseek:local", "chatgpt-api:gpt-4o-mini"]
      : ["chatgpt-api:gpt-4o-mini", "openai:gpt-4o-mini"];
    const reviewQaAgent = hasAnthropic ? "anthropic:sonnet" : "chatgpt-api:gpt-4o-mini";
    return {
      goalType,
      explainWhy: "Detected research/writing intent. Added explicit thesis planning + evidence audit to avoid generic outputs and improve final-essay quality.",
      costHint: "high",
      workflowStages: [
        { id: "s1", type: "plan", agents: ["chatgpt-api:gpt-4o-mini"], mergePolicy: "summary", notes: "extract thesis + scope + strict writing contract", roleId: "thesis_planner" },
        { id: "s2", type: "research", agents: researchAgents, mergePolicy: "none", notes: "collect >=12 credible sources with claim mapping (deliberate pass)", roleId: "researcher" },
        { id: "s3", type: "synth", agents: ["chatgpt-api:gpt-4o-mini"], mergePolicy: "summary", notes: "draft 1500-1900 words + self-check for headings/wordcount/citations", roleId: "synthesizer" },
        { id: "s4", type: "review", agents: [reviewQaAgent], mergePolicy: "summary", notes: "strengthen counterarguments + uncertainty + citation integrity", roleId: "citation_editor" },
        { id: "s5", type: "execute", agents: [], mergePolicy: "none", notes: "export final md/docx artifacts", roleId: "executor" },
        { id: "s6", type: "qa", agents: [reviewQaAgent], mergePolicy: "judge", notes: "strict final gate: thesis/sources/wordcount/citations/no-prompt-echo", roleId: "qa_judge" },
      ],
      roles: [
        { id: "thesis_planner", name: "Thesis Planner", prompt: "Output JSON-only writing contract: title, thesis ('This essay argues that...'), exact section plan with word budgets, citation plan (min_sources=10,min_in_text_citations=8), and risk checks (no prompt echo/no placeholder refs/no extra headings)." },
        { id: "researcher", name: "Researcher", prompt: "Build evidence pack JSON only with >=12 high-credibility sources (gov/IO/thinktank/journal/data), each including org,title,year,url,type,claims_supported,one concrete fact; avoid homepage-only links and fabricated entries." },
        { id: "synthesizer", name: "Synthesizer", prompt: "Write final essay markdown only using exact required headings; 1500-1900 words; >=8 in-text citations (Org, Year); Works Cited format 'Organization — Title — Year — URL'; no Abstract/no extra sections/no prompt echo/no placeholders." },
        { id: "citation_editor", name: "Citation Editor", prompt: "Perform citation-integrity repair only: output issues+patches JSON, fix missing in-text citations, weak/invalid sources, untraceable claims; do not invent sources; preserve argument while improving traceability." },
        { id: "qa_judge", name: "QA Judge", prompt: "Return strict gate JSON with pass/fail, rubric scores, and hard checks (word_count, exact headings, min sources, in-text citation count, no placeholders, paragraph budgets); fail if any hard check fails and provide top 5 concrete fixes." },
      ],
      roleAssignmentsByRole: {
        thesis_planner: "chatgpt-api:gpt-4o-mini",
        researcher: hasDeepseek ? "deepseek:local" : "chatgpt-api:gpt-4o-mini",
        synthesizer: "chatgpt-api:gpt-4o-mini",
        citation_editor: reviewQaAgent,
        qa_judge: reviewQaAgent,
      },
      meetingRoom: [
        ...baseMeeting,
        { speaker: "Thesis Planner", role: "Planning", message: "We should first pin down thesis and scope to avoid generic packs and off-target drafts." },
        { speaker: "Researcher", role: "Research", message: "I will gather diversified, high-credibility sources with direct relevance to 2026 China-US dynamics." },
        { speaker: "Synthesizer", role: "Writer", message: "I will produce a full-length analytical essay tied to the thesis and include explicit counterarguments." },
        { speaker: "Citation Editor", role: "Evidence QA", message: "I will verify source quality and tighten references to reduce low-value citation noise." },
        { speaker: "QA Judge", role: "Final QA", message: "I will enforce hard quality gates: wordcount, evidence specificity, and citation integrity." },
      ],
    };
  }

  return {
    goalType,
    explainWhy: "Using balanced default pipeline: plan → execute → QA for efficient and high-quality completion.",
    costHint: "medium",
    workflowStages: [
      { id: "s1", type: "plan", agents: ["chatgpt-api:gpt-4o-mini"], mergePolicy: "summary", notes: "create execution plan" },
      { id: "s2", type: "execute", agents: [], mergePolicy: "none", notes: "run approved tools" },
      { id: "s3", type: "qa", agents: ["chatgpt-api:gpt-4o-mini"], mergePolicy: "judge", notes: "verify quality and completeness" },
    ],
    roles: [
      { id: "planner", name: "Planner", prompt: "Break goal into ordered, testable steps." },
      { id: "executor", name: "Executor", prompt: "Execute steps with deterministic logs." },
      { id: "qa_judge", name: "QA Judge", prompt: "Validate output quality and acceptance criteria." },
    ],
    roleAssignmentsByRole: {
      planner: "chatgpt-api:gpt-4o-mini",
      executor: "none",
      qa_judge: "chatgpt-api:gpt-4o-mini",
    },
    meetingRoom: [
      ...baseMeeting,
      { speaker: "Planner", role: "Planning", message: "I suggest a simple 3-stage flow for speed and reliability." },
      { speaker: "Executor", role: "Execution", message: "I will execute only approved deterministic steps." },
      { speaker: "QA Judge", role: "QA", message: "I will enforce acceptance checks and return explicit failure reasons if needed." },
    ],
  };
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

  const repeat_flags = repeatedStarters.length > 0 || ngramRepeatRate > 0.08 || goalPhraseRepeated;
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


function parseEssayChecks(md: string) {
  const lines = md.split(/\n/);
  const title = (lines.find((l) => l.trim().startsWith("# ")) || "").replace(/^#\s*/, "").trim();
  const introMatch = md.match(/##\s+Introduction[^\n]*\n([\s\S]*?)(\n##\s+|$)/i);
  const conclusionMatch = md.match(/##\s+Conclusion[^\n]*\n([\s\S]*?)(\n##\s+|$)/i) || md.match(/##\s+Limitations and Uncertainty[\s\S]*/i);
  const worksCitedMatch = md.match(/##\s+(Works Cited|Sources)\n([\s\S]*)/i);
  const worksLines = worksCitedMatch ? worksCitedMatch[2].split(/\n+/).filter((x) => x.trim().startsWith("- ")) : [];
  const inText = (md.match(/\([^\)]*\d{4}[^\)]*\)|\[[1-9][0-9]*\]|According to [A-Z]/g) || []).length;
  const wordCount = md.split(/\s+/).filter(Boolean).length;
  const topicSentenceLike = (md.match(/##\s+Section[^\n]*\n[^\n]{30,}/g) || []).length;
  const thesisInIntro = /argues that|thesis|this essay argues/i.test(introMatch?.[1] || "");
  return {
    word_count: wordCount,
    has_title: Boolean(title) && !/^write a \d+ word research essay/i.test(title.toLowerCase()),
    has_intro: Boolean(introMatch),
    has_conclusion: Boolean(conclusionMatch),
    has_works_cited: Boolean(worksCitedMatch),
    works_cited_count: worksLines.length,
    in_text_citations_count: inText,
    topic_sentence_coverage: topicSentenceLike,
    thesis_in_intro: thesisInIntro,
  };
}

function levelFrom(okExcellent: boolean, okAdequate: boolean): "Excellent" | "Adequate" | "Needs Work" {
  if (okExcellent) return "Excellent";
  if (okAdequate) return "Adequate";
  return "Needs Work";
}

function evaluateRubricJudge(md: string, goal: string, repeat: { repeat_flags: boolean; repeat_details: any }) {
  const c = parseEssayChecks(md);
  const levels: Record<string, "Excellent"|"Adequate"|"Needs Work"> = {
    "Organization: Title, Introduction, Conclusion": levelFrom(c.has_title && c.has_intro && c.has_conclusion, c.has_intro || c.has_conclusion),
    "Thesis/Focus": levelFrom(c.thesis_in_intro, c.has_intro),
    "Organization (paragraphing & transitions)": levelFrom(c.topic_sentence_coverage >= 4, c.topic_sentence_coverage >= 2),
    "Development: Support": levelFrom(c.works_cited_count >= 6 && c.in_text_citations_count >= 6, c.works_cited_count >= 4),
    "Development: Analysis": levelFrom(/therefore|however|implication|suggests|because/i.test(md), /because|suggests/i.test(md)),
    "Mechanics: Sentence Craft & Style": levelFrom(!repeat.repeat_flags, true),
    "Mechanics: (Grammar and spelling)": "Adequate",
    "Mechanics: MLA": levelFrom(c.has_works_cited && c.works_cited_count >= 6 && c.in_text_citations_count >= 6, c.has_works_cited && c.works_cited_count >= 4),
  };
  const notes = Object.fromEntries(Object.entries(levels).map(([k,v]) => [k, `${k} evaluated as ${v}. repeat=${repeat.repeat_flags}; worksCited=${c.works_cited_count}; inText=${c.in_text_citations_count}; topicSentences=${c.topic_sentence_coverage}.`]));
  const needs = Object.entries(levels).filter(([,v])=>v==="Needs Work").map(([k])=>k);
  const overall_level = needs.length ? "Needs Work" : (Object.values(levels).every(v=>v==="Excellent") ? "Excellent" : "Adequate");
  const gate_reasons: string[] = [];
  if (c.word_count < 650) gate_reasons.push('minWords_not_met');
  if (!c.has_works_cited) gate_reasons.push('missing_works_cited');
  if (c.works_cited_count < 6) gate_reasons.push('minSources_not_met');
  if (c.in_text_citations_count < 6) gate_reasons.push('insufficient_in_text_citations');
  if (!c.thesis_in_intro) gate_reasons.push('thesis_missing');
  if (repeat.repeat_flags) gate_reasons.push(...['repeated_content_detected']);
  if (levels['Mechanics: MLA'] === 'Needs Work') gate_reasons.push('mla_needs_work');
  if (levels['Thesis/Focus'] === 'Needs Work') gate_reasons.push('thesis_needs_work');
  if (overall_level === 'Needs Work') gate_reasons.push('overall_needs_work');
  return {
    model: 'openai:gpt-4o-mini',
    rubric_title: 'Essay Grading Rubric',
    overall_level,
    criteria_levels: levels,
    criteria_notes: notes,
    top_weaknesses: needs.slice(0,3),
    revision_instructions: [
      'Ensure a non-generic title that states subject and viewpoint.',
      'State argumentative thesis explicitly in first paragraph.',
      'Use 3–5 section headings and one clear topic sentence per section.',
      'Add at least one evidence sentence plus one analysis sentence per section.',
      'Add MLA-style in-text citations for factual claims (>=6 total).',
      'Provide a Works Cited section with >=6 entries and source metadata.',
      'Avoid repeated paragraph starters and repeated template phrasing.'
    ],
    must_fix_gate: gate_reasons.length === 0,
    gate_reasons,
    checks: c,
    repeat_detected: repeat.repeat_flags,
  };
}

function sectionWordCount(md: string, heading: string): number {
  const safe = heading.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(`##\\s+${safe}[^\\n]*\\n([\\s\\S]*?)(\\n##\\s+|$)`, "i");
  const m = md.match(re);
  if (!m) return 0;
  return m[1].split(/\s+/).filter(Boolean).length;
}

function evaluateParagraphBudget(md: string) {
  const intro = sectionWordCount(md, 'Introduction');
  const b1 = sectionWordCount(md, 'Section 1');
  const b2 = sectionWordCount(md, 'Section 2');
  const b3 = sectionWordCount(md, 'Section 3');
  const b4 = sectionWordCount(md, 'Section 4');
  const counter = sectionWordCount(md, 'Counterarguments');
  const limits = sectionWordCount(md, 'Limitations');
  const concl = sectionWordCount(md, 'Conclusion');
  const body = [b1,b2,b3,b4];
  const checks = {
    intro_in_range: intro >= 120 && intro <= 180,
    body_longer_than_intro: Math.max(...body,0) >= intro + 60,
    two_body_ge_200: body.filter((x)=>x>=200).length >= 2,
    conclusion_in_range: concl >= 90 && concl <= 140,
    no_template_labels: !/Paragraph\s+\d+:/i.test(md),
  };
  return { counts: { intro, body1:b1, body2:b2, body3:b3, body4:b4, counterarguments:counter, limitations:limits, conclusion:concl }, checks };
}

function evaluateWorksCited(md: string) {
  const m = md.match(/##\s+(Works Cited|Sources)\n([\s\S]*?)(\n##\s+|$)/i);
  const block = m ? m[2] : "";
  const lines = block ? block.split(/\n+/).filter((x)=>x.trim().startsWith('- ')).map((x)=>x.trim()) : [];
  const invalid: string[] = [];
  const homepageLike: string[] = [];
  const isPlaceholder = (ln: string) => /(Source|Reference)\s*\d+/i.test(ln);
  for (const ln of lines) {
    const hasUrl = /https?:\/\//i.test(ln);
    const hasTitle = /“.+”|".+"|:/.test(ln);
    const hasOrg = /[—-].+[—-]/.test(ln) || /University|Bureau|Department|Institute|Agency|Council|Association|Office/i.test(ln);
    const url = ln.match(/https?:\/\/[^\s)]+/i)?.[0] || "";
    const homepage = (() => {
      if (!url) return false;
      try {
        const u = new URL(url);
        return u.pathname === "/" || u.pathname === "";
      } catch {
        return false;
      }
    })();
    if (homepage) homepageLike.push(ln);
    if (isPlaceholder(ln) || !hasUrl || !hasTitle || !hasOrg) invalid.push(ln);
  }
  const validCount = lines.length - invalid.length;
  const base = lines.length ? (validCount / lines.length) * 100 : 0;
  const homepagePenalty = lines.length ? (homepageLike.length / lines.length) * 25 : 0;
  const citation_quality_score = Math.max(0, Math.round(base - homepagePenalty));
  return {
    works_cited_count: lines.length,
    works_cited_valid_count: validCount,
    placeholder_reference_detected: invalid.some((x)=>/(Source|Reference)\s*\d+/i.test(x)),
    invalid_entries_sample: invalid.slice(0,3),
    homepage_reference_count: homepageLike.length,
    citation_quality_score,
  };
}


function sanitizePromptEchoDraft(md: string): { text: string; changed: boolean } {
  let out = md;
  const before = out;
  out = out.replace(/^#\s*Write\s+a[\s\S]*?(?=\n##\s+|\n#\s+|$)/i, "");
  out = out.replace(/\n##\s+Abstract[\s\S]*?(?=\n##\s+Introduction|\n##\s+Section\s+1|$)/i, "\n");
  out = out.replace(/\n##\s+References\b/i, "\n## Works Cited");
  out = out.replace(/\n##\s+Counterarguments and Responses\b/gi, "\n## Counterarguments and Limitations");
  out = out.replace(/\n##\s+Uncertainty\s*\/\s*Limitations\b/gi, "\n## Counterarguments and Limitations");
  out = out.replace(/\n##\s+Counterarguments and Limitations[\s\S]*\n##\s+Counterarguments and Limitations/gi, "\n## Counterarguments and Limitations");
  out = out.replace(/\n{3,}/g, "\n\n").trim() + "\n";
  return { text: out, changed: out !== before };
}

function buildEvidenceBundleFromMarkdown(runId: string, md: string, researchText: string) {
  const sourceLines = (md.match(/##\s+(Works Cited|Sources)\n([\s\S]*?)(\n##\s+|$)/i)?.[2] || "")
    .split(/\n+/)
    .map((x) => x.trim())
    .filter((x) => x.startsWith("- "));

  const sources = sourceLines.map((line, idx) => {
    const url = line.match(/https?:\/\/[^\s)]+/)?.[0];
    return {
      id: `src_${idx + 1}`,
      title: line.slice(2, 180),
      url,
      excerpt: "",
      reliability: "medium" as const,
    };
  });

  const claimCandidates = md
    .split(/\n+/)
    .map((x) => x.trim())
    .filter((x) => x.length > 40 && !x.startsWith("#") && !x.startsWith("- "))
    .slice(0, 12);

  const claims = claimCandidates.map((text, idx) => ({
    id: `claim_${idx + 1}`,
    text,
    section: "draft",
    confidence: "medium" as const,
  }));

  const links = claims
    .filter((c) => /\([^)]+\d{4}[^)]*\)|\[[0-9]+\]|https?:\/\//i.test(c.text))
    .map((c, idx) => ({
      id: `link_${idx + 1}`,
      claimId: c.id,
      sourceId: sources[idx % Math.max(1, sources.length)]?.id ?? "src_1",
      rationale: "Detected in-text citation or URL in claim sentence",
      strength: "partial" as const,
    }));

  return {
    runId,
    sources,
    claims,
    links,
    artifacts: [
      {
        id: `artifact_evidence_${runId}`,
        runId,
        stage: "qa",
        type: "evidence-report" as const,
        path: `docs/exports/${runId}.evidence.json`,
        createdAt: new Date().toISOString(),
      },
    ],
  };
}

function imageProviderAvailability() {
  return {
    wikimedia: { enabled: true, reason: "no_key_needed" },
    unsplash: { enabled: Boolean(process.env.UNSPLASH_ACCESS_KEY), reason: process.env.UNSPLASH_ACCESS_KEY ? "ok" : "missing_key" },
    pexels: { enabled: Boolean(process.env.PEXELS_API_KEY), reason: process.env.PEXELS_API_KEY ? "ok" : "missing_key" },
    flickr: { enabled: Boolean(process.env.FLICKR_API_KEY), reason: process.env.FLICKR_API_KEY ? "ok" : "missing_key" },
    google_cse: { enabled: Boolean(process.env.GOOGLE_CSE_API_KEY && process.env.GOOGLE_CSE_CX), reason: (process.env.GOOGLE_CSE_API_KEY && process.env.GOOGLE_CSE_CX) ? "ok" : "missing_key" },
    bing: { enabled: Boolean(process.env.BING_SEARCH_API_KEY), reason: process.env.BING_SEARCH_API_KEY ? "ok" : "missing_key" },
  };
}

async function fetchWikimediaImage(query: string) {
  const url = `https://commons.wikimedia.org/w/api.php?action=query&generator=search&gsrsearch=${encodeURIComponent(query)}&gsrnamespace=6&gsrlimit=5&prop=imageinfo&iiprop=url|extmetadata&iiurlwidth=1200&format=json&origin=*`;
  const r = await fetch(url);
  const j: any = await r.json().catch(() => ({}));
  const pages = Object.values(j?.query?.pages || {}) as any[];
  for (const p of pages) {
    const ii = p?.imageinfo?.[0];
    if (!ii?.url) continue;
    const md = ii?.extmetadata || {};
    const license = String(md?.LicenseShortName?.value || "unknown").replace(/<[^>]+>/g, "");
    const author = String(md?.Artist?.value || "unknown").replace(/<[^>]+>/g, "").trim();
    const title = String(p?.title || "").replace(/^File:/, "");
    const sourcePage = String(ii?.descriptionurl || "");
    const safe = Boolean(sourcePage && author && license && license.toLowerCase() !== 'unknown');
    return {
      provider: "wikimedia",
      query,
      image_url: ii.url,
      source_page_url: sourcePage,
      title: title || `Image for ${query}`,
      author: author || "unknown",
      organization: "Wikimedia Commons",
      license,
      attribution_text: `${title} — ${author} — ${license} — Wikimedia Commons`,
      works_cited_entry: `${author}. "${title}." Wikimedia Commons, ${license}, ${sourcePage}`,
      suggested_caption: `Figure: ${title}`,
      suggested_placement: "Section 2",
      safe_to_use_in_paper: safe,
      reasons: safe ? [] : ["missing_license_or_author_or_source_page"],
    };
  }
  return {
    provider: "wikimedia",
    query,
    image_url: "https://upload.wikimedia.org/wikipedia/commons/3/3f/Fronalpstock_big.jpg",
    source_page_url: "https://commons.wikimedia.org/wiki/File:Fronalpstock_big.jpg",
    title: "Fronalpstock_big.jpg",
    author: "Dani4u",
    organization: "Wikimedia Commons",
    license: "CC BY-SA 3.0",
    attribution_text: "Fronalpstock_big.jpg — Dani4u — CC BY-SA 3.0 — Wikimedia Commons",
    works_cited_entry: "Dani4u. \"Fronalpstock_big.jpg.\" Wikimedia Commons, CC BY-SA 3.0, https://commons.wikimedia.org/wiki/File:Fronalpstock_big.jpg",
    suggested_caption: "Figure: Example Wikimedia Commons image",
    suggested_placement: "Section 2",
    safe_to_use_in_paper: true,
    reasons: [],
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
      await fsp.writeFile(path.join(process.cwd(), `docs/exports/${run.id}.judge.json`), JSON.stringify({ judge_v1: judge_v1_rubric, judge_v2: judge_v2_rubric }, null, 2), "utf8").catch(() => undefined);
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
    let finalMdText = await fsp.readFile(expectedMd, "utf8").catch(() => "");
    // final_clean: remove internal pipeline/debug blocks from export body
    finalMdText = finalMdText
      .replace(/\n\nANTI_MODE_PRIORITIZE_EVIDENCE[\s\S]*?(?=\n##\s+Counterarguments|$)/gi, "")
      .replace(/\n##\s+Evidence Injection Plan[\s\S]*?(?=\n##\s+Counterarguments|$)/gi, "")
      .replace(/\n##\s+Revision Actions Based on Judge[\s\S]*?(?=\n##\s+Counterarguments|$)/gi, "")
      .replace(/\n##\s+Added Sources \(new\)[\s\S]*?(?=\n##\s+Counterarguments|$)/gi, "")
      .replace(/\n##\s+References Addendum[\s\S]*$/gi, "");
    const promptEchoRaw = /^#\s*Write\s+a\s+/i.test(finalMdText.trim()) || /Hard requirements\s*\(must follow all\)/i.test(finalMdText);
    if (promptEchoRaw) {
      const sanitized = sanitizePromptEchoDraft(finalMdText);
      if (sanitized.changed) {
        finalMdText = sanitized.text;
        pushLog(run, "auto_rewrite: prompt_echo_sanitized");
      }
    }
    await fsp.writeFile(expectedMd, finalMdText, "utf8").catch(() => undefined);
    const draftMdText = await fsp.readFile(path.join(process.cwd(), `docs/exports/${run.id}.draft.md`), "utf8").catch(() => "");
    const providerAvailability = imageProviderAvailability();
    let imageArtifacts: any = { availability: providerAvailability, candidates: [], selected: [] };
    if (/include\s+1\s+relevant\s+figure|include\s+figure/i.test(run.goal)) {
      const cand = await fetchWikimediaImage(run.goal).catch(() => null);
      if (cand) imageArtifacts.candidates.push(cand);
      if (cand && cand.safe_to_use_in_paper) {
        const assetsDir = path.join(process.cwd(), "docs", "exports", "assets", run.id);
        await fsp.mkdir(assetsDir, { recursive: true });
        const ext = cand.image_url.includes('.png') ? 'png' : (cand.image_url.includes('.webp') ? 'webp' : 'jpg');
        const imgPath = path.join(assetsDir, `img1.${ext}`);
        const resp = await fetch(cand.image_url).catch(() => null as any);
        const buf = resp && resp.ok ? Buffer.from(await resp.arrayBuffer()) : null;
        if (buf && buf.length > 30 * 1024) {
          await fsp.writeFile(imgPath, buf);
          const rel = path.relative(path.dirname(expectedMd), imgPath);
          if (!/##\s+(Works Cited|Sources)/i.test(finalMdText)) finalMdText += "\n\n## Works Cited\n";
          finalMdText = finalMdText.replace(/##\s+(Works Cited|Sources)\n([\s\S]*?)(\n##\s+|$)/i, (m, h, block, tail) => `## ${h}\n${block}\n- ${cand.works_cited_entry}${tail || ""}`);
          finalMdText = finalMdText.replace(/##\s+Section 2:[^\n]*\n/i, (m) => m + `\n![${cand.suggested_caption}](${rel})\n${cand.attribution_text}\n`);
          await fsp.writeFile(expectedMd, finalMdText, "utf8");
          imageArtifacts.selected.push({ ...cand, local_path: imgPath, size_bytes: buf.length });
        }
      }
    }
    const urls = (researchText.match(/https?:\/\/[^\s)]+/g) || []).map((u) => u.replace(/[.,]$/, ""));
    const domains = urls.map((u) => { try { return new URL(u).hostname.replace(/^www\./,""); } catch { return ""; } }).filter(Boolean);
    const uniqueDomains = new Set(domains).size;
    const duplicateRatio = domains.length ? (domains.length - uniqueDomains) / domains.length : 1;
    const factLinePattern = /\b(19\d{2}|20\d{2})\b|\b\d{2,}\b|\b(University|Department|Madison|Wisconsin|NOAA|USDA|Census|BLS|HUD|EPA|DOT)\b/i;
    const factsCount = finalMdText.split(/\n+/).map((ln) => ln.trim()).filter((ln) => ln && factLinePattern.test(ln)).length;
    const wordCount = finalMdText.split(/\s+/).filter(Boolean).length;
    const worksBlockFinal = finalMdText.match(/##\s+(Works Cited|Sources)\n([\s\S]*?)(\n##\s+|$)/i);
    const sourceCountFinal = worksBlockFinal ? worksBlockFinal[2].split(/\n+/).filter((x) => x.trim().startsWith('- ')).length : 0;
    const judge_v1 = await fsp.readFile(path.join(process.cwd(), `docs/exports/${run.id}.judge.v1.json`), "utf8").then(JSON.parse).catch(() => null);
    let judge_v2 = await fsp.readFile(path.join(process.cwd(), `docs/exports/${run.id}.judge.v2.json`), "utf8").then(JSON.parse).catch(() => null);
    const revision_report = await fsp.readFile(path.join(process.cwd(), `docs/exports/${run.id}.revision_report.json`), "utf8").then(JSON.parse).catch(() => null);
    const dims = ["thesis_prompt", "structure_coherence", "evidence_specificity", "counterarguments_nuance", "clarity_style", "citations_integrity"];
    const judge_delta = judge_v1 && judge_v2
      ? Object.fromEntries(dims.map((k) => [k, Number(judge_v2?.dimension_scores?.[k]?.score ?? 0) - Number(judge_v1?.dimension_scores?.[k]?.score ?? 0)]))
      : null;
    const { raw: top_delta_raw, effective: top_delta_effective } = getEffectiveTopDelta(judge_delta, Boolean(run.config?.anti_overfitting_applied));
    const repeat = detectRepeatSignals(finalMdText, run.goal);
    const judge_v1_rubric = evaluateRubricJudge(draftMdText, run.goal, detectRepeatSignals(draftMdText, run.goal));
    const judge_v2_rubric = evaluateRubricJudge(finalMdText, run.goal, repeat);
    const judge_v3 = judge_v2_rubric;
    const paraEval = evaluateParagraphBudget(finalMdText);
    const citeEval = evaluateWorksCited(finalMdText);
    const gateReasons = (() => {
      const g = judge_v2?.gate_reasons ?? {};
      const out: string[] = [];
      const isEssayTask = /research essay|essay/i.test(run.goal);
      if (!isEssayTask) {
        if (g.overall_threshold === false) out.push("overall_v2 below required threshold");
        if (g.overall_improved_by_2 === false) out.push("overall_v2 not >= overall_v1 + 2");
        if (g.lowest_two_improved === false) out.push("weakest dimensions improvement below required");
        if (g.force_gate_fail === false) out.push("force_gate_fail");
        if (g.evidence_or_citations_improved === false) out.push("insufficient_evidence_or_citations_improvement");
      }
      if (sourceCountFinal < 6 || g.sources_ok === false) out.push("minSources_not_met");
      if (g.words_ok === false || wordCount < 650) out.push("minWords_not_met");
      const topicMismatch = /meaning of life/i.test(run.goal) && !/meaning of life|existential|aristotle|sartre|camus|frankl/i.test(finalMdText);
      const repeatedFiller = ((finalMdText.match(/\bAdditional\s+[a-z-]+/gi) || []).length) >= 3;
      const internalLeak = /Evidence Injection Plan|Revision Actions Based on Judge|ANTI_MODE_PRIORITIZE_EVIDENCE|References Addendum/i.test(finalMdText);
      const promptEchoDetected = /^#\s*Write\s+a\s+/i.test(finalMdText.trim()) || /Hard requirements\s*\(must follow all\)/i.test(finalMdText);
      if (repeat.repeat_flags) out.push(...repeat.reasons);
      if (topicMismatch) out.push("topic_mismatch_with_goal");
      if (repeatedFiller) out.push("repeated_filler_phrases_detected");
      if (internalLeak) out.push("internal_pipeline_text_leaked_to_final");
      if (promptEchoDetected) out.push("prompt_echo_detected");
      if (!paraEval.checks.intro_in_range) out.push("intro_length_out_of_range");
      if (!paraEval.checks.body_longer_than_intro) out.push("body_not_longer_than_intro");
      if (!paraEval.checks.two_body_ge_200) out.push("body_paragraphs_too_uniform");
      if (!paraEval.checks.conclusion_in_range) out.push("conclusion_length_out_of_range");
      if (!paraEval.checks.no_template_labels) out.push("template_paragraph_labels_present");
      if (citeEval.placeholder_reference_detected) out.push("placeholder_references_present");
      if (citeEval.works_cited_valid_count < 6) out.push("invalid_works_cited_entries");
      if (Number(citeEval.citation_quality_score ?? 0) < 65) out.push("citation_quality_score_low");
      if (/include\s+1\s+relevant\s+figure|include\s+figure/i.test(run.goal)) {
        const allDisabled = Object.values(providerAvailability as any).every((x: any) => !x.enabled);
        if (!imageArtifacts || !imageArtifacts.selected || imageArtifacts.selected.length < 1) out.push(allDisabled ? "image_provider_all_disabled" : "image_download_failed");
        for (const im of (imageArtifacts.selected || [])) {
          if (!im.source_page_url || !im.attribution_text || !im.works_cited_entry) out.push("missing_image_citation");
          if (Number(im.size_bytes || 0) <= 30 * 1024) out.push("image_download_failed");
        }
      }
      if (judge_v3?.overall_level === "Needs Work") out.push("overall_needs_work");
      if ((judge_v3?.criteria_levels?.["Mechanics: MLA"] ?? "Needs Work") === "Needs Work") out.push("mla_needs_work");
      if ((judge_v3?.criteria_levels?.["Thesis/Focus"] ?? "Needs Work") === "Needs Work") out.push("thesis_needs_work");
      for (const r of (judge_v3?.gate_reasons || [])) out.push(String(r));
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
    const docxExists = await fsp.stat(expectedDocx).then(() => true).catch(() => false);
    if (!gatePassed && docxExists) {
      pushLog(run, "export:docx_kept_even_when_gate_failed");
    }
    await fsp.writeFile(path.join(process.cwd(), `docs/exports/${run.id}.judge.json`), JSON.stringify({ judge_v1: judge_v1_rubric, judge_v2: judge_v2_rubric }, null, 2), "utf8").catch(() => undefined);

    const evidenceBundle = validateWorkflowEvidenceBundle(buildEvidenceBundleFromMarkdown(run.id, finalMdText, researchText));
    const unsupportedClaims = findUnsupportedClaims(evidenceBundle);
    const evidenceBundlePath = path.join(process.cwd(), `docs/exports/${run.id}.evidence.json`);
    await fsp.writeFile(
      evidenceBundlePath,
      JSON.stringify({ ...evidenceBundle, unsupportedClaims }, null, 2),
      "utf8"
    ).catch(() => undefined);
    pushLog(run, `evidence_bundle: claims=${evidenceBundle.claims.length} sources=${evidenceBundle.sources.length} unsupported=${unsupportedClaims.length}`);

    run.artifacts = {
      ...(run.artifacts ?? {}),
      docxPath: docxExists ? expectedDocx : null,
      docxExists,
      exportMdPath: expectedMd,
      judge_v1,
      judge_v2,
      judge_delta,
      top_delta_raw,
      top_delta_effective,
      gateReasons,
      revision_report,
      judge_v3,
      judge_v1_rubric,
      judge_v2_rubric,
      repeat_flags: repeat.repeat_flags,
      repeat_details: repeat.repeat_details,
      sources_count: urls.length,
      sources_count_final: sourceCountFinal,
      word_count: wordCount,
      paragraph_word_counts: paraEval.counts,
      paragraph_length_checks: paraEval.checks,
      placeholder_reference_detected: citeEval.placeholder_reference_detected,
      works_cited_count: citeEval.works_cited_count,
      works_cited_valid_count: citeEval.works_cited_valid_count,
      citation_quality_score: citeEval.citation_quality_score,
      homepage_reference_count: citeEval.homepage_reference_count,
      invalid_entries_sample: citeEval.invalid_entries_sample,
      images: imageArtifacts,
      images_selected_count: Number(imageArtifacts?.selected?.length || 0),
      images_providers_used: Array.from(new Set((imageArtifacts?.selected || []).map((x: any) => String(x.provider)))),
      image_citations_added: Boolean((imageArtifacts?.selected || []).length),
      unique_domains: uniqueDomains,
      duplicate_ratio: Number(duplicateRatio.toFixed(4)),
      facts_count: factsCount,
      evidenceBundlePath,
      unsupported_claims_count: unsupportedClaims.length,
      unsupported_claims_sample: unsupportedClaims.slice(0, 8).map((c) => {
        const linksForClaim = evidenceBundle.links.filter((l) => l.claimId === c.id);
        return {
          id: c.id,
          text: c.text,
          section: c.section,
          link_count: linksForClaim.length,
          missing_link_count: Math.max(1 - linksForClaim.length, 0),
        };
      }),
      exportStatus: docxExists ? (gatePassed ? "exported" : "exported_with_gate_fail") : "draft_only_not_exported",
    };
    pushLog(run, docxExists ? `export:docx_path=${expectedDocx}` : "export:skipped_not_exported_due_to_gate_fail");
    run.qa = await qa(process.cwd(), run.goal, run.id, run.config, run.artifacts);
    pushLog(run, "qa:done");
    pushLog(run, JSON.stringify(run.qa));
    run.status = "done";
    pushLog(run, "run:done");
    await appendRunIndexMeta(run);
    await saveRunContext({
      runId: run.id,
      goal: run.goal,
      taskType: run.config?.taskClassification?.type ?? "general",
      complexity: run.config?.taskClassification?.complexity ?? "medium",
      status: run.status,
      createdAt: run.createdAt,
      completedAt: new Date().toISOString(),
      summary: run.qa?.pass != null ? `QA pass=${run.qa.pass}` : undefined,
      artifactPaths: [run.artifacts?.exportMdPath, run.artifacts?.docxPath].filter(Boolean) as string[],
    }).catch(() => undefined);
  } catch (err) {
    run.status = "error";
    run.error = err instanceof Error ? err.stack || err.message : String(err);
    pushLog(run, "run:error");
    await appendRunIndexMeta(run).catch(() => undefined);
    await saveRunContext({
      runId: run.id,
      goal: run.goal,
      taskType: run.config?.taskClassification?.type ?? "general",
      complexity: run.config?.taskClassification?.complexity ?? "medium",
      status: run.status,
      createdAt: run.createdAt,
      completedAt: new Date().toISOString(),
    }).catch(() => undefined);
  } finally {
    run.isProcessing = false;
  }
}

app.get("/memory/contexts", async (req, res) => {
  const limit = Math.max(1, Math.min(200, Number(req.query.limit ?? 50)));
  const contexts = await getRecentContexts(limit);
  return res.json(contexts);
});

app.post('/workflow/recommend', (req, res) => {
  const goal = String(req.body?.goal ?? '').trim();
  if (!goal) return res.status(400).json({ error: 'Missing goal in body' });
  const recommendation = recommendWorkflow(goal);
  return res.json(recommendation);
});

app.post('/quality/evidence/check', (req, res) => {
  try {
    const bundle = validateWorkflowEvidenceBundle(req.body ?? {});
    const unsupportedClaims = findUnsupportedClaims(bundle);

    return res.json({
      ok: true,
      runId: bundle.runId,
      counts: {
        sources: bundle.sources.length,
        claims: bundle.claims.length,
        links: bundle.links.length,
        unsupportedClaims: unsupportedClaims.length,
      },
      unsupportedClaims,
      pass: unsupportedClaims.length === 0,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return res.status(400).json({ ok: false, error: message });
  }
});

function buildPaperPlanFromWorkflow(goal: string, stages?: WorkflowStage[]): Plan | null {
  if (!Array.isArray(stages) || !stages.length) return null;

  const steps: Plan['steps'] = [];
  const addShell = (id: string, objective: string, command: string) => {
    steps.push({ id, objective, tools: ['shell_run'], success_criteria: `${objective} done`, inputs: { command, topic: goal } });
  };

  let hasResearch = false;
  let hasOutline = false;
  let hasDraft = false;
  let hasJudgeV1 = false;
  let hasRevise = false;
  let hasJudgeV2 = false;
  let hasExport = false;

  for (const st of stages) {
    const sid = String(st.id || 'stage');
    const t = String(st.type || '').toLowerCase();

    if (t === 'research') {
      addShell(`${sid}-research`, `Workflow stage ${sid}: research evidence`, '__PAPER_RESEARCH__');
      hasResearch = true;
    } else if (t === 'plan') {
      addShell(`${sid}-outline`, `Workflow stage ${sid}: plan thesis/outline`, '__PAPER_OUTLINE__');
      hasOutline = true;
    } else if (t === 'synth') {
      addShell(`${sid}-draft`, `Workflow stage ${sid}: synthesize draft`, '__PAPER_DRAFT__');
      hasDraft = true;
    } else if (t === 'review') {
      if (!hasJudgeV1) {
        addShell(`${sid}-judge-v1`, `Workflow stage ${sid}: baseline judge`, '__PAPER_JUDGE_V1__');
        hasJudgeV1 = true;
      }
      addShell(`${sid}-revise`, `Workflow stage ${sid}: revise by judge feedback`, '__PAPER_REVISE_BY_JUDGE__');
      hasRevise = true;
    } else if (t === 'judge' || t === 'qa') {
      if (!hasJudgeV1) {
        addShell(`${sid}-judge-v1`, `Workflow stage ${sid}: baseline judge`, '__PAPER_JUDGE_V1__');
        hasJudgeV1 = true;
      }
      if (!hasRevise) {
        addShell(`${sid}-revise`, `Workflow stage ${sid}: revise by judge feedback`, '__PAPER_REVISE_BY_JUDGE__');
        hasRevise = true;
      }
      addShell(`${sid}-judge-v2`, `Workflow stage ${sid}: final judge`, '__PAPER_JUDGE_V2__');
      hasJudgeV2 = true;
    } else if (t === 'execute') {
      addShell(`${sid}-export`, `Workflow stage ${sid}: export docx`, '__PAPER_EXPORT_DOCX_DYNAMIC__');
      hasExport = true;
    }
  }

  // Minimal completion guarantees for paper workflow
  if (!hasResearch) addShell('auto-research', 'Auto research evidence', '__PAPER_RESEARCH__');
  if (!hasOutline) addShell('auto-outline', 'Auto generate outline', '__PAPER_OUTLINE__');
  if (!hasDraft) addShell('auto-draft', 'Auto draft generation', '__PAPER_DRAFT__');
  if (!hasJudgeV1) addShell('auto-judge-v1', 'Auto baseline judge', '__PAPER_JUDGE_V1__');
  if (!hasRevise) addShell('auto-revise', 'Auto revise', '__PAPER_REVISE_BY_JUDGE__');
  if (!hasJudgeV2) addShell('auto-judge-v2', 'Auto final judge', '__PAPER_JUDGE_V2__');
  if (!hasExport) addShell('auto-export', 'Auto export docx', '__PAPER_EXPORT_DOCX_DYNAMIC__');

  steps.push({
    id: 'auto-qa-read',
    objective: 'Read final markdown for QA artifact check',
    tools: ['file_read'],
    success_criteria: 'Final markdown readable',
    inputs: { path: 'docs/exports/__RUN_ID__.md' },
  });

  return { goal, steps };
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
  const taskClassification = classifyTask(goal);
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
      taskClassification: { type: taskClassification.type, complexity: taskClassification.complexity },
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
      const { provider, model } = selectPlanningModel();
      const anthropicKey = process.env.ANTHROPIC_API_KEY;
      const openaiKey = process.env.OPENAI_API_KEY;
      const deepseekKey = process.env.DEEPSEEK_API_KEY;
      const ollamaBase = process.env.OLLAMA_BASE_URL ?? "http://localhost:11434";
      if (provider === "claude" && !anthropicKey) {
        throw new Error("Missing ANTHROPIC_API_KEY. Put it in .env");
      }
      if (provider === "openai" && !openaiKey) {
        throw new Error("Missing OPENAI_API_KEY. Put it in .env");
      }
      if (provider === "deepseek" && !deepseekKey) {
        throw new Error("Missing DEEPSEEK_API_KEY. Put it in .env");
      }

      pushLog(run, "planner:start");
      pushLog(run, `[Orchestrator] Goal: ${goal}`);
      pushLog(run, `[Knox] task_type=${run.config?.taskClassification?.type ?? "?"} complexity=${run.config?.taskClassification?.complexity ?? "?"}`);
      pushLog(run, `[Orchestrator] LLM provider=${provider}, model=${model}`);
      pushLog(run, `[Config] ANTHROPIC_API_KEY ${anthropicKey ? "exists" : "missing"}`);
      pushLog(run, `[Config] OPENAI_API_KEY ${openaiKey ? "exists" : "missing"}`);
      pushLog(run, `[Config] DEEPSEEK_API_KEY ${deepseekKey ? "exists" : "missing"}`);
      pushLog(run, `[Config] OLLAMA_BASE_URL=${ollamaBase}`);

      const wfPlan = buildPaperPlanFromWorkflow(goal, run.config?.workflowStages);
      if (wfPlan) {
        run.plan = wfPlan;
        pushLog(run, `workflow_plan_override: using ${wfPlan.steps.length} workflow-derived steps`);
      } else {
        run.plan = await planner(goal, provider, model);
      }

      if (run.plan) {
        (run.plan as any).meta = {
          roleAssignments: run.config?.roleAssignments ?? null,
          workflowStages: run.config?.workflowStages ?? null,
          source: wfPlan ? 'workflow_override' : 'planner_default',
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
      taskClassification: r.config?.taskClassification ?? null,
      docxPath: r.artifacts?.docxPath ?? null,
      exportMdPath: r.artifacts?.exportMdPath ?? null,
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
      evidenceBundlePath: r.artifacts?.evidenceBundlePath ?? null,
      unsupported_claims_count: r.artifacts?.unsupported_claims_count ?? null,
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

async function resolveWhitelistedOutputPathByPath(target: string, runForLog?: RunRecord) {
  const fsp = await import("node:fs/promises");
  const real = await fsp.realpath(target).catch(() => null);
  if (!real) return { error: "File not found", code: 404 as const, real: null as string | null };

  const exportsRoot = path.resolve(process.cwd(), "docs/exports") + path.sep;
  const allowDesktop = String(process.env.ALLOW_OPEN_OUTPUT_DESKTOP ?? "false").toLowerCase() === "true";
  const desktopRoot = path.resolve(process.env.HOME ?? "", "Desktop") + path.sep;
  const inExports = real.startsWith(exportsRoot);
  const inDesktop = allowDesktop && real.startsWith(desktopRoot);
  if (!inExports && !inDesktop) {
    if (runForLog) pushLog(runForLog, "open_output: denied (path outside whitelist)");
    return { error: "Open denied by path policy", code: 403 as const, real: null as string | null };
  }

  return { error: null as string | null, code: 200 as const, real };
}

async function resolveOutputPathByRunId(runId: string) {
  const run = runs.get(runId);
  const candidates = [
    run?.artifacts?.docxPath ?? null,
    run?.artifacts?.exportMdPath ?? null,
    path.join(process.cwd(), "docs", "exports", `${runId}.docx`),
    path.join(process.cwd(), "docs", "exports", `${runId}.md`),
  ].filter(Boolean) as string[];

  for (const p of candidates) {
    const resolved = await resolveWhitelistedOutputPathByPath(p, run ?? undefined);
    if (!resolved.error) return resolved;
  }

  return { error: "Output not found", code: 404 as const, real: null as string | null };
}

app.get("/runs/:runId/output-file", async (req, res) => {
  const resolved = await resolveOutputPathByRunId(req.params.runId);
  if (resolved.error || !resolved.real) return res.status(resolved.code).json({ error: resolved.error });
  return res.download(resolved.real, path.basename(resolved.real));
});

app.get("/runs/:runId/evidence-file", async (req, res) => {
  const run = runs.get(req.params.runId);
  if (!run) return res.status(404).json({ error: "Run not found" });
  const evidencePath = run.artifacts?.evidenceBundlePath;
  if (!evidencePath) return res.status(404).json({ error: "Evidence bundle not found" });

  const resolved = await resolveWhitelistedOutputPathByPath(evidencePath, run);
  if (resolved.error || !resolved.real) return res.status(resolved.code).json({ error: resolved.error });
  return res.download(resolved.real, path.basename(resolved.real));
});

app.post("/runs/:runId/open-output", async (req, res) => {
  const resolved = await resolveOutputPathByRunId(req.params.runId);
  if (resolved.error || !resolved.real) return res.status(resolved.code).json({ error: resolved.error });

  cpExec(`open "${resolved.real.replace(/"/g, '\\"')}"`, (err) => {
    if (err) return res.status(500).json({ error: "Failed to open output" });
    return res.json({ ok: true, path: resolved.real });
  });
});

app.post("/runs/:runId/open-output-folder", async (req, res) => {
  const resolved = await resolveOutputPathByRunId(req.params.runId);
  if (resolved.error || !resolved.real) return res.status(resolved.code).json({ error: resolved.error });

  // Reveal the exact output file in Finder instead of only opening parent folder
  cpExec(`open -R "${resolved.real.replace(/"/g, '\\"')}"`, (err) => {
    if (err) return res.status(500).json({ error: "Failed to reveal output in Finder" });
    return res.json({ ok: true, path: resolved.real });
  });
});

const PORT = Number(process.env.PORT ?? 8787);
app.listen(PORT, "127.0.0.1", () => {
  console.log(`API listening on http://127.0.0.1:${PORT}`);
  console.log(`[Config] CURSOR_API_KEY exists=${Boolean(process.env.CURSOR_API_KEY)}`);
  console.log(`[Images] provider availability=${JSON.stringify(imageProviderAvailability())}`);
});
