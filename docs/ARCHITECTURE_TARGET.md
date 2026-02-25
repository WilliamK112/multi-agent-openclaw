# Architecture Target: Main Agent + Execution Agent + Optional Reviewers

## Purpose
This document defines the target operating model for the next phase of `multi-agent-openclaw`: a **separated planning/research layer** and an **execution layer** with clear contracts, safety boundaries, and verifiable outputs.

The target is intentionally pragmatic:
- Keep OpenClaw excellent at deterministic execution and evidence collection.
- Keep planning/research in a primary conversational model (ChatGPT or Ollama).
- Add optional specialist reviewers (Claude and optionally Cursor-assisted review) for quality gates.

## Recommended Role Split

### 1) Main Agent (ChatGPT or Ollama)
Responsibilities:
- Understand user goal, context, and constraints.
- Perform background research and summarize sources.
- Produce a strict execution plan (Plan JSON) with explicit steps.
- Choose tools per step (shell_run/file_read/file_write/openclaw_act/cursor_act).
- Define success criteria and QA checks up front.

Output contract to Execution Agent:
- Research Notes
- Plan JSON
- QA checks
- Risks/assumptions

### 2) Execution Agent (OpenClaw)
Responsibilities:
- Execute the approved plan exactly.
- Log each step and tool call.
- Enforce safety policies (approval for high-risk actions).
- Capture run evidence and final QA verdict.

This matches the current repo behavior:
- `src/server.ts` provides `/run`, `/runs`, `/runs/:id`, approval/resume states.
- `src/agents/executor.ts` performs tool calls and emits logs.
- `src/agents/qa.ts` provides structured checks and pass/fail.

### 3) Optional Reviewer (Claude and Cursor)
Responsibilities:
- Review-only pass after execution or before merge.
- Suggest improvements for writing quality, architecture consistency, and code quality.
- No direct privileged execution by default.

## Why Cursor Is Temporarily UI-First
At this moment, Cursor API integration is not production-ready in this environment because auth currently returns 401 on documented healthcheck endpoint (`/teams/members`).

Meanwhile, Cursor desktop UI automation via approval-gated `openclaw_act` is already demonstrated end-to-end. Therefore:
- Cursor remains a practical UI tool for controlled edits.
- Cursor API remains in guarded/diagnostic mode until auth and endpoint permissions are stable.

## Data Flow (Target)
1. **Goal** (user intent)
2. **Research Notes** (by Main Agent)
3. **Plan JSON** (tool-ready, explicit success criteria)
4. **Execution** (OpenClaw tool calls + logs)
5. **QA** (structured checks + issues)
6. **Runs UI** (`/runs`, `/runs/:id` for status/history/evidence)

## Security Boundaries

### Secrets
- API keys only from environment variables.
- Never store keys in repo files, logs, README, or screenshots.
- Log only `exists=true/false` and masked error summaries.

### Approval
- High-risk actions (especially `openclaw_act`) require `needs_approval` and explicit resume.
- Low-risk deterministic commands may execute without approval.

### Logging/Redaction
- Keep logs diagnosable but bounded and sanitized.
- Capture command status, short stdout/stderr summaries, and structured errors.

### UI Instability Risks
Known fragile points in desktop automation:
- Focus drift to wrong app/window.
- Wrong file opened if context changed.
- Special character handling in AppleScript keystroke paths.
- Save race conditions.

Mitigations:
- Use absolute paths when opening files.
- Save twice with short delay.
- Immediate file_read verification after edit.
- One controlled retry path; then fail fast with clear error reason.

## Minimal Next-Phase Plan
- Freeze role boundaries and output contracts.
- Keep execution deterministic and evidence-driven.
- Keep reviewer optional and non-blocking initially.
- Move Cursor API from debug to write mode only after endpoint auth is consistently healthy.
