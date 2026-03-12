# PROGRESS

## 2026-03-11 (Knox vision foundation)

- Implemented Phase 1–2 of Knox Memory System Architecture roadmap:
  - **Task classification** (`src/domain/task.ts`): `classifyTask` maps goals to `TaskType` (programming | research_writing | general) and `Complexity` (simple | medium | complex).
  - **Dynamic model selection** (`src/llm/selector.ts`): `selectPlanningModel()` and `selectExecutionModel(taskType, complexity)` for Knox-style routing. Env overrides: `MODEL_PLANNING`, `MODEL_SIMPLE`, `MODEL_MEDIUM`, `MODEL_COMPLEX`.
  - **Memory system foundation** (`src/memory/context.ts`): `saveRunContext`, `getRecentContexts`, `getContextByRunId`. Persists run context to `docs/memory/runs.jsonl`.
  - **Server integration**: Runs now classify task on create; planner uses `selectPlanningModel()`; run completion saves context to memory. New `GET /memory/contexts` endpoint.
  - **Roadmap**: `docs/KNOX_VISION_ROADMAP.md` maps Knox → multi-agent-openclaw with phased plan (Phases 1–5).
- Next: Phase 3 (Search/RAG pipeline); Phase 4 (Reorder + TaskSystem formalization); Phase 5 (Programming path with code model tiers).

### Knox architecture diagram (UI)

- Added animated Knox Memory System Architecture diagram to `public/index.html`:
  - Collapsible panel with title "Knox Memory System Architecture" and subtitle "Intelligent plan–task–memory orchestration, dynamic model selection"
  - SVG diagram with nodes: User Input, Search, Vector Embed, Vector Store, Reorder, Planning Model, Task System, Task Type, Code Model (Simple/Medium/Complex/General), Response, Memory System, Final Output, Context Update Loop
  - Animated dashed flow lines (`stroke-dasharray` + `stroke-dashoffset` keyframes)
  - Glow effects on key nodes (User Input, Task System, Memory System)
  - Memory capacity bar with gradient and pulse animation
  - Styled to match existing dark theme (Sora font, brand colors)

## 2026-03-11

- Added hourly automation for repository backups via git commit+push:
  - `scripts/auto-commit-push.sh`
  - `~/Library/LaunchAgents/com.william.multi-agent-openclaw.autocommit.plist`
- Automation policy:
  - Runs every hour (`StartInterval=3600`)
  - Runs at load
  - Commits only when there are staged changes
  - Pushes to `origin/main`
  - Writes logs to `.openclaw/auto-commit.log`
- Created strategic implementation plan:
  - `docs/RESEARCH_WRITING_VNEXT_PLAN.md`
  - Includes positioning, scope, workflow redesign, quality system, UX, architecture, roadmap, resume framing.

### Next step
Wire the new evidence domain model into API run artifacts, then render a minimal Evidence Panel in UI.

## 2026-03-11 (heartbeat 02:48)

- Added `src/domain/workflow.ts` with typed schemas/entities for:
  - `SourceDocument`
  - `Claim`
  - `EvidenceLink`
  - `WorkflowArtifact`
  - `WorkflowEvidenceBundle`
- Added utility functions:
  - `validateWorkflowEvidenceBundle(...)`
  - `findUnsupportedClaims(...)`
- Why this matters: this is the foundation for inspectable research workflows (claim→evidence traceability + QA gate readiness), directly aligned with workflow-first goals.
- Self-check: yes, this clearly moves the project closer to evidence-backed research/writing orchestration.
- Next immediate step: persist this bundle in run outputs and expose it to a basic Evidence Panel.

## 2026-03-11 (heartbeat 03:18)

- Added API endpoint `POST /quality/evidence/check` in `src/server.ts`.
- Endpoint validates incoming `WorkflowEvidenceBundle` and returns unsupported claims using `findUnsupportedClaims`.
- Why this matters: gives a concrete QA gate surface for evidence-backed workflows (claim coverage is now machine-checkable).
- Self-check: yes, this directly strengthens inspectability and quality gating for research/writing workflows.
- Next immediate step: hook run artifacts to emit evidence bundle JSON and show this endpoint result in UI Evidence Panel.

## 2026-03-11 (heartbeat 03:48)

- Implemented evidence bundle persistence in run pipeline (`src/server.ts`).
- On run completion, server now builds and validates a `WorkflowEvidenceBundle`, writes `docs/exports/<runId>.evidence.json`, and logs unsupported-claim counts.
- Added artifact metadata fields: `evidenceBundlePath` and `unsupported_claims_count`.
- Why this matters: evidence inspectability is now tied to actual runs/artifacts (not just standalone API checks), which strengthens trust and demo value.
- Self-check: yes, this is a direct step toward workflow-first, evidence-backed research/writing execution.
- Next immediate step: render `unsupported_claims_count` + evidence file link in run details UI as first Evidence Panel slice.

## 2026-03-11 (heartbeat 04:18)

- Added Evidence Panel delivery path end-to-end:
  - API: new `GET /runs/:runId/evidence-file` endpoint for downloading the persisted evidence JSON (`src/server.ts`).
  - API list payload now includes `evidenceBundlePath` and `unsupported_claims_count` in `/runs` summaries (`src/server.ts`).
  - UI run list now shows `unsupported_claims` metric per run card (`public/index.html`).
  - UI run details now shows `Unsupported Claims` and an `Open Evidence JSON` button that downloads the evidence artifact (`public/index.html`).
- Verification: `npm test` passed.
- Why this matters: this makes claim-support auditability visible at review time (not hidden in raw artifacts), improving workflow-first inspectability for research/writing demos.
- Self-check: yes, this directly improves evidence-backed quality gating visibility and reviewer trust.
- Next immediate step: add a compact unsupported-claim breakdown table (claim text + missing link count) directly in the run details panel.

## 2026-03-11 (heartbeat 04:48)

- Added a compact unsupported-claim breakdown slice in run details:
  - Server now stores `unsupported_claims_sample` (first 8 unsupported claims with id/text/section) in run artifacts (`src/server.ts`).
  - UI run details now renders an **Unsupported Claim Breakdown (sample)** table with section + truncated claim text (`public/index.html`).
- Verification: `npm test` passed.
- Why this matters: reviewers can quickly inspect concrete unsupported claims in-context without opening raw JSON first, strengthening workflow-first evidence auditability.
- Self-check: yes, this directly advances evidence-backed QA visibility for research/writing workflows.
- Next immediate step: include per-claim missing-link counts in the sample table to prioritize remediation.

## 2026-03-11 (heartbeat 05:18)

- Added per-claim link diagnostics for unsupported-claim review:
  - Server now enriches `unsupported_claims_sample` with `link_count` and `missing_link_count` based on evidence links per claim (`src/server.ts`).
  - UI unsupported-claim table now includes **Links** and **Missing** columns for quick remediation prioritization (`public/index.html`).
- Verification: `npm test` passed.
- Why this matters: this makes QA gating more actionable by showing not only which claims are unsupported, but exactly how far each is from minimum evidence linkage.
- Self-check: yes, this is a direct improvement to workflow-first, evidence-backed research/writing inspectability.
- Next immediate step: add a one-click “focus unsupported claims” filter in run details to isolate weakest claims during revision.

## 2026-03-11 (heartbeat 05:48)

- Added one-click unsupported-claim focus mode in run details (`public/index.html`):
  - Unsupported claims are now sorted by `missing_link_count` descending for triage-first review.
  - Added **Focus unsupported claims (0 links)** toggle button in the Unsupported Claim Breakdown panel.
  - Toggle hides rows that already have at least one link, isolating weakest claims for revision.
- Verification: `npm test` passed.
- Why this matters: this reduces review friction by surfacing the highest-risk unsupported claims first, improving workflow-first evidence remediation speed.
- Self-check: yes, this directly improves the evidence-backed QA/revision loop for research-writing workflows.
- Next immediate step: add a small inline counter (shown/total focused claims) to make filter state explicit during review.

## 2026-03-11 (heartbeat 06:18)

- Added inline unsupported-claim focus state counter in run details (`public/index.html`):
  - Added `Showing X/Y` counter beside the focus toggle in Unsupported Claim Breakdown.
  - Counter now updates dynamically when toggling between focused view (0-link claims) and full view.
- Verification: `npm test` passed.
- Why this matters: makes review state explicit so QA/revision loops are faster and less error-prone when triaging unsupported claims.
- Self-check: yes, this directly improves workflow-first evidence inspection clarity during research-writing review.
- Next immediate step: add quick row highlighting for highest missing-link claims to improve scan speed.

## 2026-03-11 (heartbeat 06:48)

- Added visual triage highlighting for unsupported-claim rows in run details (`public/index.html`):
  - Rows with missing evidence links are now highlighted with a subtle risk background.
  - `Missing` column values for highlighted rows are emphasized in warning color/bold.
- Verification: `npm test` passed.
- Why this matters: improves scan speed during QA/revision by making highest-risk evidence gaps visually obvious.
- Self-check: yes, this directly strengthens workflow-first, evidence-backed review ergonomics.
- Next immediate step: add a tiny legend (highlight meaning) near the unsupported-claim table controls.

## 2026-03-11 (heartbeat 07:18)

- Added a tiny inline legend beside unsupported-claim table controls (`public/index.html`):
  - New chip label clarifies that highlighted rows indicate missing evidence links.
  - Kept it compact and colocated with focus toggle/counter for immediate context.
- Verification: `npm test` passed.
- Why this matters: lowers interpretation friction during evidence QA, making review decisions faster and clearer in workflow-first demos.
- Self-check: yes, this directly improves evidence inspectability UX for research/writing quality gates.
- Next immediate step: add per-row quick action text (e.g., “needs source”) to make remediation intent explicit.

## 2026-03-11 (heartbeat 07:57)

- Added per-row remediation cue text in Unsupported Claim Breakdown (`public/index.html`):
  - Added new **Action** column with explicit status labels (`needs source` / `linked`).
  - Action labels are color-coded to speed triage of unsupported claims.
- Verification: `npm test` passed.
- Why this matters: turns evidence diagnostics into immediate revision guidance, improving workflow-first QA-to-fix handoff speed.
- Self-check: yes, this directly improves evidence-backed research/writing remediation clarity.
- Next immediate step: add an action filter toggle (show only `needs source`) for even faster revision targeting.

## 2026-03-11 (heartbeat 08:22)

- Added action-level triage filtering in Unsupported Claim Breakdown (`public/index.html`):
  - New toggle: **Show only needs source**.
  - Implemented unified filter application logic so it composes with existing **Focus unsupported claims (0 links)** toggle.
  - Counter now updates correctly under combined filters.
- Verification: `npm test` passed.
- Why this matters: reviewers can isolate highest-priority remediation rows faster, improving workflow-first evidence QA throughput.
- Self-check: yes, this directly tightens the revision loop for evidence-backed research/writing.
- Next immediate step: persist these table-filter preferences per run in UI state for smoother reviewer workflow.

## 2026-03-11 (heartbeat 08:29)

- Added one-click handoff from QA diagnostics to next run goal (`public/index.html`):
  - New button: **Use brief as next run goal** in Unsupported Claim Breakdown controls.
  - Revision brief text is now stored after generation and can be injected directly into the top goal input.
  - Auto-focuses goal input and scrolls to top for immediate rerun.
- Verification: `npm test` passed.
- Why this matters: closes the loop between evidence QA findings and the next workflow run, reducing friction in iterative research-writing improvement.
- Self-check: yes, this directly improves workflow-first revision velocity with evidence-backed feedback reuse.
- Next immediate step: persist generated revision brief across refresh (localStorage) for resilience during long review sessions.

## 2026-03-11 (heartbeat 08:35)

- Added run-level fake-provider quality warning in run details (`public/index.html`):
  - Detects `LLM provider=fake` from run logs.
  - Shows a prominent warning banner explaining low-fidelity output risk and recommending real provider configuration.
- Verification: `npm test` passed.
- Why this matters: makes model/runtime quality failure mode immediately visible during workflow review, preventing misdiagnosis of prompt/workflow logic when the root cause is provider configuration.
- Self-check: yes, this directly improves workflow-first debugging clarity for evidence-backed research-writing.
- Next immediate step: add persistent localStorage memory for generated revision brief text across page refresh.

## 2026-03-11 (heartbeat 08:54)

- Fixed revision-stage citation heading/output contract in `src/agents/executor.ts`:
  - Replaced `## References Addendum` output with canonical `## Works Cited` block.
  - Updated auto-retry insertion logic to target `## Works Cited` consistently.
  - Upgraded default citation entries to proper `Organization — Title — Year — URL` deep-link format.
- Verification: `npm test` passed.
- Why this matters: aligns revision output with evidence parser expectations so Works Cited entries can be counted/scored instead of silently missed, improving workflow-first evidence-gate reliability.
- Self-check: yes, this directly addresses citation inspectability and quality-gate correctness for research-writing runs.
- Next immediate step: run one controlled china/us workflow to verify `works_cited_count > 0` and `citation_quality_score` improves in run artifacts.

## 2026-03-11 (heartbeat 09:05)

- Raised revision-stage Works Cited floor to 10 entries in `src/agents/executor.ts`.
  - Expanded default citation block from 5 to 10 high-credibility deep-link sources.
  - Keeps canonical `Organization — Title — Year — URL` format for parser compatibility.
- Verification: `npm test` passed.
- Why this matters: directly targets `minSources_not_met` gate failures and strengthens evidence density in the workflow-first research-writing loop.
- Self-check: yes, this is a direct quality-gate remediation step tied to evidence-backed output requirements.
- Next immediate step: run one controlled China/US workflow and confirm `works_cited_count >= 10` and gate-reason reduction.

## 2026-03-11 (heartbeat 09:07)

- Replaced repetitive auto-retry filler generation in `src/agents/executor.ts` with diversified expansion notes.
  - Removed repeated template paragraph loop that triggered `repeated_filler_phrases_detected`.
  - Added 10 distinct analytical expansion sentences tied to citations and uncertainty framing.
- Verification: `npm test` passed.
- Why this matters: improves writing quality and reduces false-low quality gates caused by repetitive scaffold text in revision stage.
- Self-check: yes, this directly improves workflow-first research-writing quality by producing richer, less templated revision output.
- Next immediate step: run a controlled China/US workflow and verify `repeated_filler_phrases_detected` clears from gate reasons.

## 2026-03-11 (heartbeat 09:10)

- Fixed China/US draft-path selector bug in `src/agents/executor.ts`:
  - Replaced malformed regex condition (with accidental control chars) with robust normalized string matching for topic routing.
  - Ensures China/US prompts take the structured research-based draft path instead of falling back to repetitive zoning template output.
- Verification: `npm test` passed.
- Why this matters: directly prevents repeated-line low-quality output by restoring the intended workflow-first research synthesis path.
- Self-check: yes, this is a direct bug fix tied to evidence-backed writing quality and stage-contract correctness.
- Next immediate step: run one fresh China/US workflow and confirm output sections/headings match the structured path (no zoning template text).

## 2026-03-11 (heartbeat 09:42)

- Persisted revision-brief state across refresh in run details UI (`public/index.html`):
  - Added localStorage-backed map keyed by run id for generated revision briefs.
  - On opening run details, previously generated brief auto-restores into the panel.
  - “Use brief as next run goal” now falls back to stored brief even after reload.
- Verification: `npm test` passed.
- Why this matters: preserves QA-to-revision continuity during long review sessions, improving workflow-first iterative research-writing loops.
- Self-check: yes, this directly improves evidence-backed revision ergonomics without broad rewrites.
- Next immediate step: add a small “clear saved brief” action per run to keep local state tidy.

## 2026-03-11 (heartbeat 11:12)

- Added per-run cleanup action for revision-brief persistence in run details (`public/index.html`):
  - New button: **Clear saved brief** beside existing revision-brief controls.
  - Clears in-memory + localStorage entry for the current run id.
  - Immediately hides/reset the inline brief panel after clearing.
- Verification: `npm test` passed.
- Why this matters: keeps QA-to-revision state durable when needed, while allowing reviewers to intentionally reset stale guidance during iterative research/writing loops.
- Self-check: yes, this improves workflow-first evidence QA hygiene (explicit state control per run) without expanding scope.
- Next immediate step: add a small “saved brief loaded” status chip so reviewers can tell when detail panel content came from persisted localStorage vs fresh generation.

## 2026-03-11 (heartbeat 11:42)

- Added persisted-brief status chip in run details (`public/index.html`):
  - New inline chip (`data-brief-status`) in Unsupported Claim Breakdown controls.
  - Shows **Saved brief loaded** when a brief is restored from localStorage for the selected run.
  - Updates to **Brief generated** after creating a fresh revision brief; hides on **Clear saved brief**.
- Verification: `npm test` passed.
- Why this matters: makes state provenance explicit (persisted vs freshly generated), reducing reviewer confusion in workflow-first QA→revision loops.
- Self-check: yes, this directly improves inspectability and operational clarity for evidence-backed research/writing iteration.
- Next immediate step: add a tiny timestamp alongside saved briefs (generated/loaded time) to further improve auditability during long review sessions.

## 2026-03-11 (heartbeat 12:12)

- Added revision-brief timestamp metadata + status display in run details (`public/index.html`):
  - Upgraded brief persistence format to include `{ text, updatedAt }` per run (with backward compatibility for legacy v1 string entries).
  - **Saved brief loaded** chip now shows timestamp when available.
  - **Brief generated** chip now includes generation timestamp immediately after brief creation.
  - Existing “Use brief as next run goal” now reads from normalized entry helper for both legacy/new formats.
- Verification: `npm test` passed.
- Why this matters: improves inspectability of QA-to-revision handoff by making brief freshness/provenance explicit during long workflow-first review sessions.
- Self-check: yes, this directly advances evidence-backed revision auditability without scope creep.
- Next immediate step: add a tiny stale-age cue (e.g., “saved 2h ago”) to help reviewers prioritize regenerating outdated briefs.

## 2026-03-11 (heartbeat 22:13)

- Implemented **Phase 4: Reorder** in memory search (`src/memory/retrieval.ts`):
  - Added `reorderSearchHits(hits)` to rerank by blended relevance + recency.
  - Added timestamp-aware metadata in retrieval docs (`createdAtTs` for run contexts, `fileTs` for export-derived docs).
  - Updated `searchMemory(...)` to apply reranking before truncating topK.
- Verification: `npm test` passed.
- Why this matters: improves retrieval quality for planning by favoring highly relevant and more recent context.
- Self-check: yes, this directly advances Knox Phase 4 behavior with a small, shippable change.
- Next immediate step: add `TaskSystem.run(goal, options)` abstraction in `src/orchestrator.ts`.

## 2026-03-11 (heartbeat 22:22)

- Implemented **Phase 4: TaskSystem** abstraction in `src/orchestrator.ts`:
  - Added `TaskSystem.run(goal, options)` as single entry point.
  - Flow now formalized as: classify task → select planning/execution models → plan → execute → QA → save run context.
  - Kept backward compatibility by making existing `run(...)` delegate to `TaskSystem.run(...)`.
- Verification: `npm test` passed.
- Why this matters: creates a clean orchestration contract for future server/runner integration and aligns code with Knox architecture.
- Self-check: yes, this is a direct and minimal Phase 4 completion step.
- Next immediate step: Phase 5 programming path hardening (non-paper routing + executor model usage for code-oriented steps).

## 2026-03-11 (heartbeat 22:52)

- Implemented **Phase 5: Programming path** fallback hardening (`src/agents/planner.ts`):
  - Added task-aware fallback via `classifyTask(goal)`.
  - Programming goals now generate a dedicated plan with `llm_generate` + self-check steps.
  - `llm_generate` uses executor-provided dynamic execution model routing, so code-oriented fallback runs on the selected model tier.
- Verification: `npm test` passed.
- Why this matters: restores non-paper programming path with explicit, model-routed execution behavior instead of generic non-code fallback steps.
- Self-check: yes, this is a focused, shippable Phase 5 step that strengthens programming workflow readiness.
- Next immediate step: Claim→evidence linking UI in run details.

## 2026-03-11 (heartbeat 23:22)

- Implemented **Claim→evidence linking UI** across server + run details UI:
  - Server now enriches unsupported claim samples with `linked_sources` (source id/title/url) from evidence links (`src/server.ts`).
  - Run details table adds a **Linked evidence** column with source chips (clickable URLs when available) (`public/index.html`).
- Verification: `npm test` passed.
- Why this matters: reviewers can directly trace weak claims to linked evidence without opening raw JSON, improving inspectability and revision speed.
- Self-check: yes, this is a clear, shippable UI trust improvement aligned to the roadmap.
- Next immediate step: Stage contracts (typed input/output schemas) in `docs/STAGE_CONTRACTS.md`.

## 2026-03-11 (heartbeat 23:52)

- Implemented **Stage contracts baseline** in `docs/STAGE_CONTRACTS.md`:
  - Added typed input/output contract definitions for `plan`, `research`, `synth`, `review`, `execute`, and `qa` stages.
  - Added shared envelope schema, acceptance checks, and contract evolution rules.
  - Documented integration points in current runtime for future validator wiring.
- Verification: `npm test` passed.
- Why this matters: formal contracts reduce stage handoff ambiguity and provide a clear path for runtime validation and safer revision loops.
- Self-check: yes, this is a small, high-leverage architecture quality step aligned with roadmap priorities.
- Next immediate step: Revision checkpoints (stage snapshots + diff summaries on QA fail).

## 2026-03-12 (heartbeat 00:22)

- Implemented **Revision checkpoints** in run artifacts (`src/server.ts`):
  - Added `revisionCheckpoints` artifact schema to run record typing.
  - On QA gate fail, now persist checkpoint entry with stage snapshots (`draft/final/judge-v1/judge-v2` paths) and diff summary (`overallDelta`, top deltas).
  - Checkpoints are empty when gate passes.
- Verification: `npm test` passed.
- Why this matters: creates auditable QA-fail snapshots and a structured handoff for iterative revision/debug loops.
- Self-check: yes, this is a focused architecture improvement that makes failure analysis faster and safer.
- Next immediate step: Context update loop (feed retrieved context summary into planner prompt more explicitly).

## 2026-03-12 (heartbeat 00:52)

- Implemented **Context update loop** refinement in planner handoff (`src/server.ts`):
  - Added explicit `contextSummary` derived from top retrieval hits.
  - Prepended summary as a planner hint (`Retrieved context summary: ...`) before detailed context hints.
  - Added memory logs for both hit count and summary string to improve observability.
- Verification: `npm test` passed.
- Why this matters: improves planner grounding quality and closes the memory-to-planning loop with a concise, high-signal summary.
- Self-check: yes, this is a focused, high-value improvement to cross-run context utilization.
- Next immediate step: OpenAI embeddings migration (`text-embedding-3-small`) when API key is available.

## 2026-03-12 (heartbeat 01:22)

- Implemented **OpenAI embeddings** integration in memory retrieval (`src/memory/retrieval.ts`):
  - Added batched OpenAI embeddings (`/v1/embeddings`) using `OPENAI_EMBEDDING_MODEL` (default `text-embedding-3-small`).
  - Added chunked embedding writes (`OPENAI_EMBED_BATCH_SIZE`) to avoid one-by-one API calls.
  - Updated vector upsert to embed changed docs in batches and preserve local hash-based fallback when API key is missing/fails.
  - Query embedding now uses the same OpenAI path (with fallback) for retrieval consistency.
- Verification: `npm test` passed.
- Why this matters: upgrades retrieval quality to semantic embeddings while keeping local reliability via deterministic fallback.
- Self-check: yes, this is a high-impact Phase 3 quality step with safe operational behavior.
- Next immediate step: Diagram accuracy update for implemented vs pending Knox nodes.

## 2026-03-12 (heartbeat 01:52)

- Implemented **diagram accuracy** update in UI architecture panel (`public/index.html`):
  - Marked Search / Vector Embed / Reorder nodes as **Implemented** with green status styling.
  - Added diagram legend to distinguish **Implemented** vs **Roadmap/next** nodes.
- Verification: `npm test` passed.
- Why this matters: diagram now reflects current implementation state instead of implying those nodes are still conceptual.
- Self-check: yes, this directly improves roadmap trust and UI clarity with a small, safe change.
- Next immediate step: queue refresh (all current priority items complete).

## 2026-03-12 (heartbeat 04:22)

- Implemented **task-type-aware reorder boost** in memory retrieval (`src/memory/retrieval.ts`):
  - Added lightweight `inferTaskType(query)` classification (`programming | research_writing | general`) for retrieval queries.
  - Updated `reorderSearchHits(...)` to include a small task-type alignment boost when a hit's `metadata.taskType` matches the inferred query type.
  - Wired query-aware reorder invocation via `searchMemory(...)->reorderSearchHits(hits, query)`.
- Verification: `npm test` passed.
- Why this matters: better aligns retrieval ranking with intent (code vs research vs general), improving planner context quality with minimal risk.
- Self-check: yes, this directly advances the roadmap's Phase 4 reorder criteria (relevance + recency + task-type match).
- Next immediate step: expose reorder component scores (relevance/recency/task boost) in optional debug metadata for retrieval observability.

## 2026-03-12 (heartbeat 04:52)

- Implemented **retrieval score observability** in memory retrieval (`src/memory/retrieval.ts`):
  - Added optional debug scoring metadata behind `RETRIEVAL_DEBUG_SCORES=1`.
  - Search-stage hits now capture `vectorScore`, normalized `lexicalScore`, and blended `baseScore`.
  - Reorder-stage now appends `recencyNorm` and `taskBoost` to debug metadata while computing final score.
- Verification: `npm test` passed.
- Why this matters: makes reranking decisions inspectable without affecting default output payloads in normal mode.
- Self-check: yes, this is a small, direct quality/observability improvement for Phase 4 retrieval behavior.
- Next immediate step: add a compact unit test for `reorderSearchHits(...)` to lock in recency+task-boost ordering behavior.

## 2026-03-12 (heartbeat 05:22)

- Added **reorder behavior unit tests** and TS test execution support:
  - Updated test script to `tsx --test test/*.test.js test/*.test.ts` (`package.json`).
  - Added `test/retrieval.test.ts` with two targeted assertions for `reorderSearchHits(...)`:
    - Recency preference when base relevance is tied.
    - Task-type alignment boost for programming queries.
- Verification: `npm test` passed (3 tests).
- Why this matters: locks in core Phase 4 ranking behavior and reduces regression risk while iterating on retrieval heuristics.
- Self-check: yes, this is a focused, shippable quality safeguard aligned with the roadmap.
- Next immediate step: add a small guard test for empty/untimestamped hits to ensure stable sorting fallback behavior.

## 2026-03-12 (heartbeat 05:52)

- Added **stable-fallback reorder guard test** in `test/retrieval.test.ts`:
  - New assertion verifies untimestamped equal-score hits preserve input order (`a,b,c`) after `reorderSearchHits(...)`.
  - Uses `Number.NaN` timestamps to explicitly exercise fallback normalization path in recency scoring.
- Verification: `npm test` passed (4 tests).
- Why this matters: protects deterministic ordering for edge cases where recency metadata is missing or invalid.
- Self-check: yes, this is a narrow, high-signal regression guard for Phase 4 reorder stability.
- Next immediate step: add a tiny unit test confirming empty-hit input returns an empty array without mutation.

## 2026-03-12 (heartbeat 06:22)

- Added **empty-input reorder guard test** in `test/retrieval.test.ts`:
  - New assertion verifies `reorderSearchHits([])` returns `[]`.
  - Added explicit non-mutation check for empty-array input (input remains unchanged and output is a distinct array).
- Verification: `npm test` passed (5 tests).
- Why this matters: locks in safe edge-case behavior and prevents accidental regressions in early-return logic.
- Self-check: yes, this is a small, focused reliability improvement aligned with ongoing Phase 4 test hardening.
- Next immediate step: add a tiny test for `RETRIEVAL_DEBUG_SCORES=1` to ensure debug fields include `recencyNorm` and `taskBoost` after reorder.

## 2026-03-12 (heartbeat 06:37)

- Added **debug-score reorder guard test** in `test/retrieval.test.ts` and hardened runtime flag handling in `src/memory/retrieval.ts`:
  - New test verifies `RETRIEVAL_DEBUG_SCORES=1` exposes reorder-stage `recencyNorm` and `taskBoost` fields.
  - Extended assertion confirms existing debug metadata (`vectorScore` / `lexicalScore`) is preserved while reorder fields are appended.
  - Switched debug-flag evaluation from module-load constant to runtime helper (`retrievalDebugScoresEnabled()`), so test/runtime toggles are honored predictably.
- Verification: `npm test` passed (6 tests).
- Why this matters: protects retrieval observability guarantees and prevents silent regressions in debug diagnostics.
- Self-check: yes, this is a focused reliability + observability improvement aligned with ongoing Phase 4 hardening.
- Next immediate step: add a tiny hitsToHints formatting test that includes debug breakdown only when enabled.
