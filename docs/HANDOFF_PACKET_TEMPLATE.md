# HANDOFF_PACKET_TEMPLATE.md

Canonical stage-to-stage handoff contract for `multi-agent-openclaw`.

Use this packet for every transition between workflow stages.

---

## Required schema

```json
{
  "context": {
    "run_id": "string",
    "stage_from": "plan|research|synth|review|qa|execute",
    "stage_to": "plan|research|synth|review|qa|execute",
    "goal": "string",
    "summary": "short context summary",
    "artifacts": [
      {
        "id": "string",
        "type": "notes|evidence_map|draft|review_notes|qa_report|export",
        "path": "string",
        "notes": "string"
      }
    ]
  },
  "task": {
    "owner_role": "thesis_planner|researcher|synthesizer|citation_editor|qa_judge|executor",
    "instruction": "exact next task",
    "priority": "high|medium|low"
  },
  "constraints": {
    "must_follow": ["array of hard constraints"],
    "must_not": ["array of prohibitions"],
    "budget": {
      "time_minutes": 0,
      "max_tokens": 0
    }
  },
  "done_criteria": [
    "explicit criterion 1",
    "explicit criterion 2"
  ],
  "evidence_required": {
    "min_sources": 0,
    "citation_style": "APA|MLA|Chicago|project-default",
    "required_checks": ["claim_source_mapping", "freshness_check", "counterargument_coverage"]
  }
}
```

---

## Field intent (short)
- `context`: what happened and what artifacts are available.
- `task`: what the next role must do.
- `constraints`: hard boundaries and resource limits.
- `done_criteria`: objective pass conditions for the receiving role.
- `evidence_required`: quality floor for evidence/citations.

---

## Handoff example — plan → research

```json
{
  "context": {
    "run_id": "run_20260313_001",
    "stage_from": "plan",
    "stage_to": "research",
    "goal": "Write an evidence-backed policy brief on zoning reform outcomes.",
    "summary": "Planner defined thesis, scope, and target sections.",
    "artifacts": [
      {
        "id": "plan_v1",
        "type": "notes",
        "path": "docs/runs/run_20260313_001/plan.md",
        "notes": "Contains thesis + section outline + key claims to validate"
      }
    ]
  },
  "task": {
    "owner_role": "researcher",
    "instruction": "Collect and map sources for each planned claim; flag unsupported claims.",
    "priority": "high"
  },
  "constraints": {
    "must_follow": ["Prefer primary or institution-level sources", "Capture publication date for each source"],
    "must_not": ["No unverifiable blog-only evidence", "No claim without mapped source"],
    "budget": { "time_minutes": 40, "max_tokens": 12000 }
  },
  "done_criteria": [
    "Every major claim has >=1 mapped source",
    "At least 10 quality sources collected",
    "Known evidence gaps explicitly listed"
  ],
  "evidence_required": {
    "min_sources": 10,
    "citation_style": "project-default",
    "required_checks": ["claim_source_mapping", "freshness_check"]
  }
}
```

## Handoff example — research → synth

```json
{
  "context": {
    "run_id": "run_20260313_001",
    "stage_from": "research",
    "stage_to": "synth",
    "goal": "Write an evidence-backed policy brief on zoning reform outcomes.",
    "summary": "Research completed claim-evidence matrix and highlighted uncertainty points.",
    "artifacts": [
      {
        "id": "evidence_map_v1",
        "type": "evidence_map",
        "path": "docs/runs/run_20260313_001/evidence_map.json",
        "notes": "Claim-source mapping with source quality labels"
      }
    ]
  },
  "task": {
    "owner_role": "synthesizer",
    "instruction": "Draft brief using only mapped evidence; include uncertainty and counterargument section.",
    "priority": "high"
  },
  "constraints": {
    "must_follow": ["Use evidence map IDs in draft references", "Preserve thesis from planning stage"],
    "must_not": ["Do not invent unsupported statistics", "Do not drop uncertainty disclosures"],
    "budget": { "time_minutes": 35, "max_tokens": 10000 }
  },
  "done_criteria": [
    "Complete first draft across all planned sections",
    "Counterargument and response included",
    "Every non-trivial claim is evidence-linked"
  ],
  "evidence_required": {
    "min_sources": 10,
    "citation_style": "project-default",
    "required_checks": ["claim_source_mapping", "counterargument_coverage"]
  }
}
```

## Handoff example — synth → review

```json
{
  "context": {
    "run_id": "run_20260313_001",
    "stage_from": "synth",
    "stage_to": "review",
    "goal": "Write an evidence-backed policy brief on zoning reform outcomes.",
    "summary": "Initial draft complete with references and open issues noted by synthesizer.",
    "artifacts": [
      {
        "id": "draft_v1",
        "type": "draft",
        "path": "docs/runs/run_20260313_001/draft_v1.md",
        "notes": "Contains argument flow and references"
      }
    ]
  },
  "task": {
    "owner_role": "citation_editor",
    "instruction": "Review evidence specificity and citation integrity; produce revision instructions.",
    "priority": "high"
  },
  "constraints": {
    "must_follow": ["Preserve argument structure unless evidence requires change"],
    "must_not": ["No style-only edits without quality impact"],
    "budget": { "time_minutes": 25, "max_tokens": 8000 }
  },
  "done_criteria": [
    "Weak/unsupported claims list produced",
    "Citation fixes and upgrades listed by priority",
    "Revision-ready checklist delivered"
  ],
  "evidence_required": {
    "min_sources": 10,
    "citation_style": "project-default",
    "required_checks": ["claim_source_mapping", "citation_integrity"]
  }
}
```

---

## Adoption guidance
- Attach this packet to each stage transition in run artifacts.
- Treat missing required fields as handoff failure and route back for completion.
- Prefer strict completion checks over implicit assumptions.
