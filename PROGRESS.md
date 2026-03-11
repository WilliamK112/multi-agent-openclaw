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
