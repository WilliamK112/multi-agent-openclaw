# PROGRESS

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
