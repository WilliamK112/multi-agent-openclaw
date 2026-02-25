# Main Agent Plan Template (ChatGPT/Ollama → OpenClaw Execution)

## Intent
Use this template when the Main Agent prepares executable work for OpenClaw.

Rule: **OpenClaw does execution, not research.**
Main Agent must deliver research context, explicit tool steps, and QA checks before execution starts.

## Required Output Structure

### 1) Research Notes
Include:
- Goal restatement.
- Key facts from repository and environment.
- Source references (paths/commands).
- Assumptions.
- Risks and mitigations.

Minimum evidence sources to collect and cite:
- `README.md`
- `package.json`
- `src/server.ts`
- `src/agents/planner.ts`
- `src/agents/executor.ts`
- `src/agents/qa.ts`
- `shell_run`: `pwd`
- `shell_run`: `npm test` (record exitCode + short summary)
- optional discovery: `ls -R src | head`

### 2) Plan JSON
Main Agent must emit strict machine-readable JSON.

Schema:
```json
{
  "goal": "...",
  "steps": [
    {
      "id": "step-1",
      "objective": "...",
      "tools": ["shell_run|file_read|file_write|openclaw_act|cursor_act"],
      "success_criteria": "...",
      "inputs": { "key": "value" }
    }
  ]
}
```

### 3) QA Checks
Main Agent lists checks to be enforced at run end.
Each check should be objective and machine-verifiable when possible.

---

## Example Plan JSON (minimum 4-step contract)

```json
{
  "goal": "Prepare execution evidence package for a small repo update",
  "steps": [
    {
      "id": "step-1",
      "objective": "Write research notes artifact",
      "tools": ["file_write"],
      "success_criteria": "docs/RESEARCH_NOTES.md exists and includes assumptions/risks",
      "inputs": {
        "path": "docs/RESEARCH_NOTES.md",
        "content": "Research summary, assumptions, risks, and cited sources."
      }
    },
    {
      "id": "step-2",
      "objective": "Capture environment evidence",
      "tools": ["shell_run"],
      "success_criteria": "pwd and npm test exit code are logged",
      "inputs": {
        "command": "pwd"
      }
    },
    {
      "id": "step-3",
      "objective": "Read repository control files",
      "tools": ["file_read"],
      "success_criteria": "README.md and package.json are read for grounding",
      "inputs": {
        "path": "README.md"
      }
    },
    {
      "id": "step-4",
      "objective": "Run QA gate",
      "tools": ["qa"],
      "success_criteria": "All required checks pass",
      "inputs": {
        "checks": [
          "research_note_write completed",
          "shell_run evidence captured",
          "file_read evidence captured"
        ]
      }
    }
  ]
}
```

---

## Main Agent Prompt Snippet (Reusable)

Use this prompt skeleton when generating a run plan:

1. Collect and cite repo evidence from required files/commands.
2. Produce Research Notes with sources and assumptions.
3. Emit strict Plan JSON (3-8 steps).
4. Provide QA checks aligned to the plan.
5. Avoid hidden decisions; every action must map to a step.

## Execution Contract Summary
- Main Agent: research + planning + QA design.
- OpenClaw: deterministic execution + logs + QA report.
- Reviewer (optional): critique outputs, not privileged execution.

## Security Reminder
Never put secrets in:
- Plan JSON
- logs
- docs artifacts
Use environment references only (e.g., `CURSOR_API_KEY exists=true`).
