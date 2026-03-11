# multi-agent-openclaw — Research/Writing VNext Plan

## 1) Product positioning refinement

### Clearer positioning
multi-agent-openclaw is a **local-first workflow orchestration workspace** for research and writing: it breaks complex work into explicit roles, staged execution, and quality checkpoints so users can inspect, iterate, and trust outputs.

### How to describe it
- Not a one-shot chatbot.
- A multi-agent production line for thinking work.
- Optimized for traceability: every claim, stage, and revision is inspectable.

### One-sentence value proposition
**Turn one-shot AI answers into auditable research/writing workflows with role-based stages, evidence links, and local-first control.**

### Stronger README opening paragraph
multi-agent-openclaw is a local-first orchestration workspace that turns research and writing into structured multi-agent workflows. Instead of a single opaque response, it runs explicit stages (research, evidence, synthesis, drafting, review, QA), with role assignment, quality checks, and artifact history—so you can inspect why output is good, fix what is weak, and iterate toward publishable results.

---

## 2) Research/writing-focused product scope

### Core use cases to support first
1. **Literature scan -> brief** (topic mapping + key findings)
2. **Evidence-backed article draft** (claims linked to sources)
3. **Position memo** (arguments, counterarguments, risk notes)
4. **Revision workflow** (feedback -> targeted rewrite -> QA)

### Highest-value workflow families
- Source-heavy factual writing
- Multi-perspective synthesis
- Long-form content with explicit review gates

### Must-have now
- Stage templates for research/writing
- Source tracking + evidence linking to claims
- Claim checker pass before final output
- Revision checkpoints with diff summary
- Run scorecard (coverage, unsupported claims, contradictions)

### Nice-to-have later
- Citation style exporters (APA/MLA/etc.)
- Multi-document corpus indexing
- Team collaboration permissions
- Auto-generated visual diagrams per run

### Do NOT build yet
- Generic social-chat features
- Agent personality marketplace
- Heavy multimodal generation stack
- Complex plugin SDK before core quality loop is proven

---

## 3) Workflow redesign

## Recommended default template: "Research-to-Draft (Trustable)"

1. **Task framing**
   - Goal: scope, audience, success criteria
   - Roles: Planner + Lead Writer
   - Output: brief spec + acceptance checklist

2. **Evidence gathering**
   - Goal: collect candidate sources and extract facts
   - Roles: Researcher agents
   - Output: SourceDocument set + extracted notes + confidence tags

3. **Evidence filtering**
   - Goal: dedupe, rank quality, drop weak sources
   - Roles: Critic/Verifier
   - Output: approved evidence set

4. **Synthesis**
   - Goal: cluster findings into themes and narrative structure
   - Roles: Synthesizer
   - Output: synthesis map + outline

5. **Drafting**
   - Goal: produce first full draft with claim->evidence links
   - Roles: Writer
   - Output: Draft v1 + claim map

6. **Review**
   - Goal: style, logic, clarity, audience fit
   - Roles: Reviewer/Editor
   - Output: revision requests with severity

7. **QA gate**
   - Goal: unsupported claim detection + contradiction scan
   - Roles: QA agent
   - Output: pass/fail + issues list

8. **Finalize**
   - Goal: publish-ready artifact and metadata
   - Roles: Lead Writer
   - Output: final markdown/docx + evidence report

### Handoff / merge policy
- Stage output is immutable once approved.
- Downstream stage can only consume approved artifacts.
- If QA fails, route back to Drafting with issue IDs.
- Merge rule: latest approved artifact per stage + explicit provenance.

---

## 4) Evidence and quality system

### Practical trust features
1. **Evidence panel**
   - Show each claim and linked sources
   - Badge unsupported/weak/conflicting claims

2. **Source quality score**
   - Basic scoring: recency, authority, corroboration count

3. **Claim checker**
   - Detect claims lacking evidence links
   - Detect evidence mismatch (claim says X, source says Y)

4. **Contradiction detector**
   - Flag mutually exclusive claims in draft

5. **Confidence flags**
   - Per section confidence: High/Medium/Low with reasons

6. **Revision checkpoints**
   - Save stage snapshots and diff summaries

These are realistic and high signal for demos/interviews.

---

## 5) UI/UX improvements

### Dashboard evolution
- Rename primary tabs to a workflow narrative:
  1) Setup
  2) Run Graph
  3) Evidence
  4) Draft
  5) QA
  6) Final

### Layout improvements
- Left: workflow graph + stage status
- Center: current stage workspace
- Right: evidence/quality inspector

### Interaction improvements
- Every stage card shows:
  - input artifacts
  - output artifacts
  - quality metrics
  - handoff state
- Meeting room should end with structured decisions:
  - accepted changes
  - rejected suggestions
  - follow-up actions

### Naming cleanup
- “Recommendation” -> “Workflow Coach”
- “Meeting Room” -> “Review Board”
- “Final result” -> “Publishable Artifact”

---

## 6) Data / architecture improvements

## Suggested domain entities
- `WorkflowDefinition`
- `WorkflowRun`
- `StageRun`
- `RoleAssignment`
- `Artifact`
- `SourceDocument`
- `Claim`
- `EvidenceLink` (Claim <-> SourceDocument)
- `QualityCheckResult`
- `RevisionCheckpoint`

## Key technical upgrades
1. **Typed stage contract**
   - each stage has explicit input/output schemas
2. **Artifact-first orchestration**
   - stages exchange artifacts, not raw free-text only
3. **Quality engine abstraction**
   - pluggable checks (unsupported claims, contradictions, style)
4. **Run ledger**
   - append-only event log for explainability
5. **Template registry**
   - research-first templates now, extensible for planning/analysis later

Why this is strong for interviews: it demonstrates workflow systems design, not just prompt chaining.

---

## 7) Roadmap

## V1 (polish, high impact / low-medium complexity)
- Research-to-Draft template
- Evidence panel + claim linking
- Unsupported claim checker
- Stage status graph with checkpointing
- README and demo script refresh

## V2 (deeper quality, medium complexity)
- Contradiction detector
- Source quality scoring
- Revision loop automation (QA fail -> Draft stage)
- Run scorecard and benchmark view (workflow vs one-shot)

## V3 (stretch, higher complexity)
- Multi-template framework (analysis/planning/content)
- Corpus mode (multi-doc ingestion)
- Optional multimodal stage interfaces

### Priority by impact vs difficulty
1. Evidence panel + claim linking
2. Unsupported claim checker
3. Stage contracts + artifact-first handoff
4. Revision checkpoint + diff view
5. Workflow-vs-one-shot benchmark UI

---

## 8) Resume / portfolio framing

### Recruiter/interviewer framing
Built a local-first multi-agent workflow platform that transforms research/writing from opaque one-shot outputs into auditable multi-stage pipelines with evidence traceability and quality gates.

### 3 resume bullets
- Architected a **local-first multi-agent orchestration system** with role assignment, stage-based execution, and artifact-driven handoffs for research/writing workflows.
- Implemented **trust/quality infrastructure** (claim-evidence links, QA gates, revision checkpoints) to improve factual reliability and output inspectability.
- Designed extensible workflow/domain models (`WorkflowRun`, `StageRun`, `Artifact`, `EvidenceLink`, `QualityCheckResult`) enabling future expansion beyond research use cases.

### GitHub subtitle
**Local-first multi-agent workflow workspace for evidence-backed research and writing.**

---

## A) Top 5 most important next changes
1. Ship claim->evidence linking UI + data model.
2. Add unsupported-claim QA gate before finalize.
3. Introduce typed stage input/output contracts.
4. Add revision checkpoints with diff summaries.
5. Publish benchmark demo comparing one-shot vs staged workflow quality.

## B) Best single “next version” definition
**vNext = “Trustable Research Pipeline”**: a default research/writing template where every final claim is traceable to sources, every stage has explicit artifacts, and finalization is blocked unless QA gates pass.
