# RUN_CLOSE_POLICY.md

Run-close completion policy for `multi-agent-openclaw`.

## Objective
Prevent premature completion by enforcing manager quality gate outcome before close/export.

## Canonical Rule (blocking)
A run is **not allowed to close** unless one of the following is true:
1. Manager gate verdict is `PASS` (`docs/MANAGER_QUALITY_GATE.md`), or
2. An explicit non-empty `override_note` is present in the manager gate output and marked by operator/human.

If neither condition is satisfied, run-close status must remain `BLOCKED`.

---

## State Model

```text
IN_PROGRESS -> GATE_EVALUATED -> (READY_TO_CLOSE | BLOCKED)

READY_TO_CLOSE requires:
  verdict == PASS
  OR explicit override_note

BLOCKED requires:
  verdict == REVISE and no override_note
```

---

## Required Run-Close Check
Before finalization/export, manager must evaluate:

```json
{
  "run_id": "string",
  "gate_verdict": "PASS|REVISE",
  "override_note": "string|null",
  "close_allowed": true,
  "close_reason": "PASS_VERDICT|OVERRIDE|BLOCKED_BY_GATE"
}
```

Validation rules:
- `close_allowed=true` only when:
  - `gate_verdict=PASS`, or
  - `override_note` is present and non-whitespace.
- If `gate_verdict=REVISE` and no override, set:
  - `close_allowed=false`
  - `close_reason=BLOCKED_BY_GATE`

---

## Enforcement Behavior
When `close_allowed=false`:
1. Do not run final export/packaging close path.
2. Emit manager `REVISE` routing packet back to owning role.
3. Keep run active with `BLOCKED` status and latest failing checks attached.

When `close_allowed=true`:
1. Continue to execute/export stage.
2. Persist gate result and reason in run summary metadata.
3. Emit summary artifact using `docs/RUN_SUMMARY_TEMPLATE.md`.

---

## Auditability Requirements
Each run close attempt must retain:
- manager gate output JSON
- computed close check record (`close_allowed` + `close_reason`)
- timestamp and actor of override (if used)

This policy is mandatory for all run finalization paths.
