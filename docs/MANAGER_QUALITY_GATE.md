# MANAGER_QUALITY_GATE.md

Single pass/fail quality gate contract for workflow manager decisions.

## Purpose
- Provide one deterministic gate used by manager at run close.
- Standardize `PASS` vs `REVISE` decisions.
- Route revisions to the correct owner role with explicit fixes.

---

## Gate Input Contract
Manager evaluates the candidate output package with these required artifacts:
- Latest handoff packet (`docs/HANDOFF_PACKET_TEMPLATE.md` schema)
- Current stage output artifact(s)
- Evidence/citation map (or explicit `N/A` justification)
- Role contract reference (`docs/ROLE_CONTRACT.md`)

If any required artifact is missing, gate result is immediate `REVISE`.

---

## Gate Checklist (all criteria required for PASS)

Use exactly these check IDs:

1. `role_boundary_adherence`
   - Pass when output stays within the owning role responsibilities from `ROLE_CONTRACT.md`.
   - Fail when role performs another role's ownership work without explicit escalation note.

2. `handoff_completeness`
   - Pass when handoff packet contains all required fields: `context`, `task`, `constraints`, `done_criteria`, `evidence_required`.
   - Fail when any required field is missing/empty or contradicts upstream stage intent.

3. `evidence_citation_quality`
   - Pass when non-trivial claims are evidence-linked and citation requirements in packet are met.
   - Fail when unsupported claims, broken references, or source-quality floor violations exist.

4. `output_coherence_format`
   - Pass when output is internally coherent, follows requested format, and satisfies stage done criteria.
   - Fail when structure is inconsistent, sections are missing, or required output format is violated.

### Decision Rule
- `PASS` only if all four checks pass.
- Otherwise `REVISE`.

---

## Manager Gate Output Schema

```json
{
  "run_id": "string",
  "gate_version": "v1",
  "verdict": "PASS|REVISE",
  "checks": [
    {
      "id": "role_boundary_adherence|handoff_completeness|evidence_citation_quality|output_coherence_format",
      "pass": true,
      "reason": "short reason",
      "evidence": ["artifact path or citation"]
    }
  ],
  "revise": {
    "target_role": "thesis_planner|researcher|synthesizer|citation_editor|qa_judge|executor",
    "required_fixes": [
      {
        "id": "FIX-1",
        "priority": "P0|P1|P2",
        "check_id": "failing check id",
        "instruction": "specific remediation action",
        "acceptance": "objective completion condition"
      }
    ]
  },
  "override_note": "optional explicit human/operator override"
}
```

Rules:
- `revise.target_role` is required when verdict is `REVISE`.
- `required_fixes` must include at least one `P0` item for each failing check.
- `acceptance` must be testable (not stylistic/vague).

---

## REVISE Routing Rules
When verdict is `REVISE`, manager must select **one primary target role** using this routing map:

- Role ownership/scope failure → `thesis_planner` (or role that violated boundary if clearer)
- Missing/incomplete handoff contract → emitting upstream role for that stage handoff
- Evidence/citation failure → `researcher` for missing evidence, `citation_editor` for citation integrity issues
- Coherence/format/content assembly failure → `synthesizer`
- Final gate logic inconsistency in QA report → `qa_judge`
- Packaging/export-only failure after QA pass → `executor`

If multiple checks fail:
1. Route to role for highest-risk failing check in this order:
   `evidence_citation_quality` > `handoff_completeness` > `output_coherence_format` > `role_boundary_adherence`
2. Include secondary fixes in `required_fixes` so one revision pass can clear all failures.

---

## Minimal Manager Procedure (single pass)
1. Evaluate all four checks.
2. Emit gate output JSON.
3. If `PASS`, allow run to proceed to close/export policy.
4. If `REVISE`, dispatch packet to `revise.target_role` with `required_fixes` list.

Run-close enforcement is defined in `docs/RUN_CLOSE_POLICY.md` (block completion unless gate `PASS` or explicit override).

This file is the canonical manager gate contract until superseded by a versioned update.
