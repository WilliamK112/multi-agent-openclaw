# Workflow Gap Map — 2026-03-13

Scope: `multi-agent-openclaw` current workflow and role orchestration.

## Current state snapshot
Based on code/docs inspection (`src/server.ts`, `src/agents/*`, existing docs):

### Existing workflow strengths
- Supports staged workflows (`workflowStages`) with ordered execution.
- Supports role prompts and role-to-model mapping (`roles`, `roleAssignmentsByRole`).
- Supports multi-agent research arrays and merge policies (`none|summary|judge|vote`).
- Has quality-related endpoints and checks (`/quality/evidence/check`, QA stage, citation checks).
- Provides recommendation path for goal → workflow/roles bootstrap.

### Current implied default stage families
- General: `plan -> execute -> qa`
- Research/Writing-oriented: `plan -> research -> synth -> review -> execute -> qa`

---

## Gap map

### 1) Agent responsibilities are not yet a hard contract
Symptoms:
- Roles are generated and editable, but not enforced by a single canonical contract.
- Stage `type`, `roleId`, role prompt, and assigned model can drift semantically.

Impact:
- Overlap between planner/synth/review/qa.
- Inconsistent outputs across runs with similar goals.

### 2) Handoff payload is under-specified
Symptoms:
- Stages pass data, but no strict handoff schema is required per stage.
- Acceptance criteria are present conceptually, not consistently machine-checkable between stages.

Impact:
- Rework loops due to missing context/evidence requirements.
- Hard to debug where quality degraded.

### 3) Manager quality gate is not explicit as a unified pre-close checklist
Symptoms:
- QA checks exist, but no single run-level manager gate that blocks completion unless all key checks pass.

Impact:
- “Looks done” outputs may still fail quality expectations.
- Variable completion quality.

### 4) Retry/fallback policy is partially implemented but not standardized by failure type
Symptoms:
- Some retry logic exists, but not a documented matrix (e.g., evidence failure vs coherence failure vs citation failure).

Impact:
- Non-deterministic recovery behavior.

### 5) Observability is spread across logs/artifacts without one concise per-run summary contract
Symptoms:
- Useful data exists (`runs`, logs, quality endpoints), but no single canonical run summary schema for humans.

Impact:
- Slow review and harder operator confidence.

---

## Overlap/conflict points (top)
1. **Synthesizer vs Writer vs Reviewer** boundaries can blur.
2. **Planner vs Researcher** may both define scope and evidence claims redundantly.
3. **QA Judge vs Reviewer** can duplicate validation without strict ownership split.

---

## Missing workflow stages (recommended additions)
1. **Handoff Pack Validation stage** (lightweight schema validation before stage transition).
2. **Final Manager Gate stage** (hard stop if quality checklist fails).
3. **Run Summary stage** (standardized report artifact for operator trust).

---

## Top 3 quality failure modes
1. **Evidence quality drift**: claims not tightly linked to strong sources.
2. **Role semantic drift**: stage output no longer matches intended role purpose.
3. **Completion before quality threshold**: run marked complete without unified gate pass.

---

## Immediate improvement chosen in this heartbeat
Create and adopt a **single role contract** document as source-of-truth for role boundaries, ownership, and deliverables.
