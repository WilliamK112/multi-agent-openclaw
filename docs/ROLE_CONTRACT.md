# ROLE_CONTRACT.md

Single source of truth for role boundaries in `multi-agent-openclaw`.

## Contract goals
- Eliminate overlap.
- Make handoffs deterministic.
- Improve output quality and reduce rework.

## Global rules (apply to all roles)
1. Every role must produce explicit outputs matching its contract.
2. No role may silently skip required fields.
3. If inputs are insufficient, role must emit `BLOCKED` with exact missing items.
4. Roles must not overwrite upstream artifacts; only append/derive.

---

## Role definitions

### 1) Thesis Planner (`thesis_planner`)
**Owns:** problem framing, scope, constraints, acceptance criteria.

**Must output:**
- Problem statement
- Thesis/hypothesis
- Scope + non-goals
- Success criteria
- Stage-by-stage plan (high-level)

**Must NOT do:** deep source collection, final prose drafting.

---

### 2) Researcher (`researcher`)
**Owns:** evidence collection and claim-source mapping.

**Must output:**
- Source list (quality-ranked)
- Claim → evidence map
- Gaps and uncertainty notes

**Must NOT do:** final narrative synthesis decisions.

---

### 3) Synthesizer (`synthesizer`)
**Owns:** converting validated evidence into structured argument/draft.

**Must output:**
- Draft with clear argument flow
- Embedded evidence references
- Open questions for review

**Must NOT do:** invent unsupported claims.

---

### 4) Citation Editor (`citation_editor`)
**Owns:** citation integrity and evidence specificity.

**Must output:**
- Citation corrections
- Weak claim list
- Required evidence upgrades

**Must NOT do:** large structural rewrites unless required by evidence failures.

---

### 5) QA Judge (`qa_judge`)
**Owns:** final quality gate decision.

**Must output:**
- Gate checklist results (pass/fail per criterion)
- Overall verdict: `PASS` | `REVISE`
- If `REVISE`, prioritized fixes with acceptance thresholds

**Must NOT do:** new argument introduction; this role validates, not authors.

---

### 6) Executor (`executor`)
**Owns:** artifact packaging/export and run finalization.

**Must output:**
- Final artifacts (paths)
- Export summary
- Residual risks note

**Must NOT do:** quality judgment overrides after QA verdict.

---

## Ownership matrix (single owner per concern)
- Scope definition → Thesis Planner
- Evidence collection → Researcher
- Argument synthesis → Synthesizer
- Citation integrity → Citation Editor
- Final acceptance gate → QA Judge
- Delivery/export → Executor

## Escalation rules
- If two roles conflict, ownership matrix decides.
- If uncertainty remains, QA Judge flags `REVISE` and routes to owning role.

## Adoption note
This contract should be referenced by workflow recommendations and role prompt generation to keep runtime behavior aligned.

Related:
- use `docs/HANDOFF_PACKET_TEMPLATE.md` as the required stage-to-stage handoff structure.
- use `docs/MANAGER_QUALITY_GATE.md` for deterministic pass/fail gate + `REVISE` routing.
