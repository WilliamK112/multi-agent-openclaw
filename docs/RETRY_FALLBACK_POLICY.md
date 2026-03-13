# RETRY_FALLBACK_POLICY.md

Retry and fallback strategy for `multi-agent-openclaw` by failure class.

## Objective
Increase reliability and reduce rework by applying deterministic retry behavior and role-specific fallback routing.

---

## Failure Classes
Use these canonical classes in manager/QA outputs:
- `evidence` — missing, weak, stale, or unmapped support.
- `coherence` — argument flow, logical consistency, or section alignment failures.
- `citation` — broken/malformed citations, missing references, integrity mismatches.
- `format` — schema/template/output-structure violations.

---

## Retry Budget (per stage attempt)
- `max_retries_per_class`: 2
- `max_total_retries_per_run`: 4
- `retry_backoff`: linear (`+1` attempt each cycle; no tight loops)

If retry budget is exhausted for a class, trigger fallback route immediately.

---

## Class → Owner Retry Route

1. `evidence`
   - Primary retry owner: `researcher`
   - Retry objective: close evidence gaps, refresh low-quality sources, complete claim-source mapping.

2. `coherence`
   - Primary retry owner: `synthesizer`
   - Retry objective: repair structure/flow, resolve contradiction, align sections with goal.

3. `citation`
   - Primary retry owner: `citation_editor`
   - Retry objective: fix citation integrity, upgrade weak references, patch missing references.

4. `format`
   - Primary retry owner: stage owner that produced invalid artifact.
   - Retry objective: satisfy required schema/template exactly.

---

## Fallback Agent Strategy (after retry exhaustion)

### Fallback routing table
- `evidence`:
  1) `researcher` (secondary prompt: stricter source quality constraints)
  2) escalate to `qa_judge` for narrowed acceptance thresholds if still blocked

- `coherence`:
  1) `synthesizer` (secondary pass with outline-locked rewrite)
  2) escalate to `thesis_planner` for scope tightening if contradictions persist

- `citation`:
  1) `citation_editor` (secondary pass with claim-by-claim verification checklist)
  2) escalate to `researcher` for replacement sources when citations remain invalid

- `format`:
  1) emitting role rerun with strict schema checklist
  2) escalate to `executor` for packaging/schema normalization pass

---

## Retry Packet Additions
When dispatching a retry, include:

```json
{
  "failure_class": "evidence|coherence|citation|format",
  "attempt_index": 1,
  "max_retries_for_class": 2,
  "failed_checks": ["check_id"],
  "required_fixes": [
    {
      "id": "FIX-1",
      "instruction": "specific fix",
      "acceptance": "testable condition"
    }
  ]
}
```

Rules:
- `attempt_index` increments on each retry.
- Retries must preserve `required_fixes` IDs for traceability.

---

## Escalation Conditions
Escalate to human/operator note when any condition is met:
1. Same failure class fails 2 retries + fallback pass.
2. Two or more failure classes remain unresolved after max total retries.
3. Evidence class cannot meet minimum source/citation requirements due to unavailable sources.

Escalation artifact must include unresolved fixes and proposed decision options.

---

## Observability Requirements
For each retry/fallback cycle, log:
- `run_id`, `failure_class`, `attempt_index`
- target role
- failing checks
- result (`PASS` | `REVISE`)
- whether fallback/escalation triggered

This policy should be used by manager loop orchestration for deterministic recovery behavior.
