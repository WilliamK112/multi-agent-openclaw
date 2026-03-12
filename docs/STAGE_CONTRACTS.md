# Stage Contracts — multi-agent-openclaw

Defines typed input/output schemas and validation rules for each workflow stage.

## Purpose

- Make stage handoffs explicit and machine-checkable.
- Reduce hidden coupling between planner, executor, and QA.
- Enable safer retries/revisions with deterministic artifact contracts.

---

## Shared Envelope

All stage payloads should be wrapped with:

```ts
type StageEnvelope<T> = {
  runId: string;
  stageId: string;
  stageType: "plan" | "research" | "synth" | "review" | "execute" | "qa";
  createdAt: string; // ISO8601
  data: T;
};
```

Validation requirements:
- `runId`, `stageId`, `stageType`, `createdAt` required
- `createdAt` must parse as valid ISO datetime
- `data` must satisfy stage-specific schema below

---

## Stage: plan

### Input

```ts
type PlanInput = {
  goal: string;
  taskType?: "programming" | "research_writing" | "general";
  complexity?: "simple" | "medium" | "complex";
  contextHints?: string[];
};
```

### Output

```ts
type PlanStep = {
  id: string;
  objective: string;
  tools: string[];
  success_criteria: string;
  inputs?: Record<string, string>;
};

type PlanOutput = {
  goal: string;
  steps: PlanStep[];
};
```

Acceptance checks:
- `steps.length >= 1`
- each step has non-empty `id/objective/tools/success_criteria`

---

## Stage: research

### Input

```ts
type ResearchInput = {
  topic: string;
  minSources?: number;
  maxSearchQueriesPerRun?: number;
};
```

### Output

```ts
type ResearchSource = {
  id: string;
  organization: string;
  title: string;
  year: number;
  url: string;
  type: string;
  claims_supported: string[];
};

type ResearchOutput = {
  topic: string;
  generatedAt: string;
  sources: ResearchSource[];
};
```

Acceptance checks:
- `sources.length >= minSources` (default 6)
- each source has valid `url`

---

## Stage: synth (draft)

### Input

```ts
type SynthInput = {
  topic: string;
  outlinePath?: string;
  researchPath?: string;
  minWords?: number;
};
```

### Output

```ts
type SynthOutput = {
  markdownPath: string;
  wordCount: number;
  worksCitedCount: number;
};
```

Acceptance checks:
- `wordCount >= minWords` (default 800)
- markdown includes `## Works Cited`

---

## Stage: review (revision)

### Input

```ts
type ReviewInput = {
  draftPath: string;
  judgePath: string;
  antiOverfittingApplied?: boolean;
};
```

### Output

```ts
type RevisionReport = {
  lowest_two_dimensions: string[];
  concrete_changes: string[];
  added_sources: { url: string; domain: string }[];
  facts_added: string[];
};

type ReviewOutput = {
  revisedMarkdownPath: string;
  revisionReportPath: string;
};
```

Acceptance checks:
- revised markdown exists
- revision report exists and includes `lowest_two_dimensions`

---

## Stage: execute (export)

### Input

```ts
type ExecuteInput = {
  finalMarkdownPath: string;
  gatePassed: boolean;
  desktopPath?: string;
};
```

### Output

```ts
type ExecuteOutput = {
  exported: boolean;
  docxPath?: string;
  reason?: string;
};
```

Acceptance checks:
- if `gatePassed=true`, `exported=true` and `docxPath` should exist
- if `gatePassed=false`, reason must be recorded

---

## Stage: qa

### Input

```ts
type QAInput = {
  runId: string;
  draftPath: string;
  finalPath?: string;
  artifacts?: Record<string, unknown>;
};
```

### Output

```ts
type QAOutput = {
  pass: boolean;
  checks: { id: string; pass: boolean; reason?: string }[];
  summary?: string;
};
```

Acceptance checks:
- `checks.length >= 1`
- overall `pass` must reflect check outcomes

---

## Contract Evolution Rules

1. Backward compatible additions only in minor updates.
2. Breaking field removals/renames require migration notes in `PROGRESS.md`.
3. Every new stage field should include:
   - producer location (file/function)
   - consumer location (file/function)
   - validation rule

---

## Current Integration Notes

- Existing runtime uses partial implicit contracts in:
  - `src/agents/planner.ts`
  - `src/agents/executor.ts`
  - `src/server.ts`
- This document is the canonical contract baseline for future zod/TS runtime validators.
