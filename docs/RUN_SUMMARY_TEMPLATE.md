# RUN_SUMMARY_TEMPLATE.md

Minimal run summary artifact template for `multi-agent-openclaw`.

## Purpose
Provide a concise, reproducible close artifact capturing what changed, what evidence supports it, remaining risks, and immediate next actions.

---

## Required Fields (must be present)

```yaml
run_id: "string"
completed_at: "ISO8601"
goal: "string"
status: "PASS|REVISE|OVERRIDDEN"
gate:
  verdict: "PASS|REVISE"
  close_reason: "PASS_VERDICT|OVERRIDE|BLOCKED_BY_GATE"
  gate_report_path: "string"
  override_note: "string|null"
changes:
  - id: "CHG-1"
    summary: "what changed"
    artifact_paths: ["path1", "path2"]
    owner_role: "thesis_planner|researcher|synthesizer|citation_editor|qa_judge|executor"
evidence:
  - claim_or_decision: "string"
    support: ["citation or artifact path"]
risks:
  - id: "RISK-1"
    level: "high|medium|low"
    description: "string"
    mitigation: "string"
next_actions:
  - id: "NEXT-1"
    owner_role: "thesis_planner|researcher|synthesizer|citation_editor|qa_judge|executor"
    action: "string"
    due_hint: "now|next-run|date"
```

---

## Markdown Template (copy/paste)

```markdown
# Run Summary — {{run_id}}

- Completed at: {{completed_at}}
- Goal: {{goal}}
- Status: {{status}}

## Gate
- Verdict: {{gate.verdict}}
- Close reason: {{gate.close_reason}}
- Gate report: {{gate.gate_report_path}}
- Override note: {{gate.override_note}}

## Changes
- [CHG-1] {{summary}} (owner: {{owner_role}})
  - Artifacts: {{artifact_paths}}

## Evidence
- {{claim_or_decision}}
  - Support: {{support}}

## Risks
- [RISK-1][{{level}}] {{description}}
  - Mitigation: {{mitigation}}

## Next Actions
- [NEXT-1] ({{owner_role}}) {{action}} — due: {{due_hint}}
```

---

## Completion Checks
A summary is valid only if:
1. All required fields are populated.
2. At least one `changes` entry exists.
3. At least one `evidence` entry exists (or explicit `N/A` with reason for non-evidence runs).
4. At least one `next_actions` entry exists unless run is terminal by design.

Use this artifact as the final concise report for operators and downstream audits.
