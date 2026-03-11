# multi-agent-openclaw

A desktop-first dark-mode orchestration workspace for multi-agent research and writing workflows.

multi-agent-openclaw helps you turn broad prompts into structured, inspectable execution pipelines.  
It is designed for research/paper-style work where role specialization, workflow stages, and quality gates matter more than one-shot chat output.

## Current Focus (March 2026)

This branch is now evolving from a pure workflow UI into a **task-aware orchestration system**:

- **Task classification** at run start (`programming | research_writing | general`) with complexity tiers (`simple | medium | complex`)
- **Dynamic model selection** for planning and execution, with env-based overrides
- **Persistent run memory** (`docs/memory/runs.jsonl`) to retain context across runs
- **Memory architecture panel** in the UI for visualizing the plan → task → model → memory loop
- **New API endpoint**: `GET /memory/contexts` for recent context retrieval

## Screenshots

> Add real screenshots here.

- Role Assignment  
  `![Role Assignment](docs/screenshots/role-assignment.png)`

- Workflow Builder  
  `![Workflow Builder](docs/screenshots/workflow-builder.png)`

- Recommendation + Meeting Room  
  `![Recommendation + Meeting Room](docs/screenshots/recommendation-meeting-room.png)`

- Results / Final Output  
  `![Results](docs/screenshots/results.png)`

## Why this project

- Turn one-shot prompts into **structured execution pipelines**.
- Keep control with **local-first run flow** and explicit output files.
- Improve output quality with **prompt clarity checks + staged QA**.
- Make agent behavior understandable through **role and stage separation**.
- Support both quick execution and deeper configuration without forcing either.

## Core Concepts

### Agents
Model/tool identities you can assign to responsibilities (research, synthesis, QA, etc.).

### Role Assignment
Maps agents to functional responsibilities (Main, Research, Executor, QA, Reviewer).

### Workflow Builder
Defines ordered stages (e.g., research → synth → review → execute → qa) and stage-level policies.

### Prompt Clarifier
Checks whether a task is specific enough before run; helps reduce vague output.

### Recommendation Engine
Suggests workflow structure + role mapping from task intent.

### Execution Pipeline
Runs the configured workflow through local API orchestration and stage handling.

### Final Output Actions
Open final result, reveal in Finder, and inspect run artifacts.

## Architecture Overview

multi-agent-openclaw is organized as a local orchestration stack: browser UI, local API, stage executor, provider layer, and file-based outputs.

```text
┌─────────────────────────────────────────────────────────────┐
│ Browser / Local UI                                          │
│ Task Composer | Role Assignment | Workflow Builder          │
│ Recommendation + Meeting Room | Results + Output Actions    │
└───────────────────────────────┬─────────────────────────────┘
                                │ HTTP
                     ┌──────────▼──────────┐
                     │ Local API Server    │
                     │ /run /runs /workflow│
                     └──────────┬──────────┘
                                │
                     ┌──────────▼──────────┐
                     │ Orchestrator Layer  │
                     │ role mapping        │
                     │ stage execution     │
                     │ merge policy        │
                     └──────────┬──────────┘
                                │
        ┌───────────────────────┼────────────────────────┐
        │                       │                        │
┌───────▼────────┐    ┌─────────▼─────────┐    ┌────────▼────────┐
│ OpenAI / APIs  │    │ Local Model Runtime│    │ Other Providers │
└────────────────┘    └────────────────────┘    └─────────────────┘

                     ┌────────────────────────────┐
                     │ Local Artifacts / Exports  │
                     │ docs/exports + run metadata│
                     └────────────────────────────┘
```

Execution flow: user task → optional clarification/recommendation → configured run request → stage execution + quality checks → final output artifacts.

## Project Structure

```text
multi-agent-openclaw/
├─ public/                     # Browser assets (UI entry, avatars, static resources)
│  └─ agent-avatars/           # Agent visual assets
├─ src/                        # Local API + orchestration source
│  ├─ server.ts                # Main server entry and endpoints
│  └─ agents/                  # Planner/executor/QA modules
├─ docs/                       # Documentation and local run outputs
│  └─ exports/                 # Generated markdown/docx artifacts
├─ scripts/                    # Utility scripts (if present)
├─ test/                       # Test files (if present)
├─ .env.example                # Environment template
├─ package.json                # Scripts and dependencies
├─ tsconfig.json               # TypeScript configuration
└─ README.md                   # Project overview
```

- `public/`: user-facing UI and static files.
- `src/`: orchestration + endpoint implementation.
- `docs/exports/`: generated run artifacts for inspection.
- `scripts/`: helper/dev automation.
- `test/`: verification and regression checks.

## Key Workflows

1. **Clarify → Configure → Run → Review**
   - Enter task
   - Clarify prompt
   - Assign roles / set stages
   - Run pipeline
   - Open final output and inspect quality

2. **Recommend → Meeting Room → Apply → Execute**
   - Generate recommended workflow
   - Review discussion/explain-why
   - Apply recommendation
   - Run and evaluate output

3. **UI or API-triggered runs**
   - Trigger from UI
   - Or call local API endpoints directly

## Quick Start

```bash
npm install
npm run dev:server
```

Open:

```text
http://127.0.0.1:8787
```

## API

### `POST /run`
Create a run.

```json
{
  "goal": "Write a research essay on the relationship between China and US in 2026",
  "workflowStages": [],
  "roles": [],
  "roleAssignmentsByRole": {}
}
```

### `GET /runs?limit=50`
List recent runs.

### `GET /runs/:runId`
Get run details, logs, and artifacts.

### `GET /memory/contexts?limit=50`
Get recent run contexts from Knox memory (task type, complexity, status, summary).

### `POST /workflow/recommend`
Get recommended workflow/roles for a goal.

### `POST /runs/:runId/open-output`
Open final output file.

### `POST /runs/:runId/open-output-folder`
Reveal output in Finder.

## Configuration

Configure model/provider keys via environment variables (see `.env.example`).  
Keep secrets local and out of git history.

## Current Scope

### What it currently does
- Role + stage workflow setup
- Prompt clarity checks and recommendation flow
- Local run execution and artifact output
- Final output opening/reveal actions
- UI support for iterative run-review cycles

### What it does not yet fully do
- Full production-grade durable state/recovery guarantees
- Multi-user collaboration and hosted deployment layer
- Advanced visual execution tracing across all stage internals

## Roadmap

- Richer run history and filtering
- Shareable workflow templates
- Agent persona/avatar identity packs
- Multi-model comparison runs
- Visual stage execution trace timeline
- Export improvements (docx/pdf workflows)
- Optional image/video-oriented workflow extensions

## Contributing

1. Fork and clone the repo
2. Create a feature branch
3. Make scoped changes with clear commits
4. Open PR with:
   - summary
   - screenshots (if UI change)
   - test/verification notes

Issues and focused PRs are welcome.
