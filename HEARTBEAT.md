# HEARTBEAT — multi-agent-openclaw

**Schedule:** Every 10 min (work) + every 2nd beat (push to GitHub).

---

## Beat 1: Work (every 10 min)

**Goal:** Make progress. Think how to improve. Pick ONE item, implement, commit.

### Loop

1. Read `PROGRESS.md` (last 2 sections) and `docs/KNOX_VISION_ROADMAP.md` (Phases 3–5).
2. **Think:** What would move the project closest to perfect? Pick the **next unchecked item** (or a quick win if time is short).
3. Implement it. Run `npm test`. Commit with a clear message.
4. Mark it done here, add a short note to `PROGRESS.md`, update `memory/heartbeat-state.json`.
5. If nothing needs work, reply `HEARTBEAT_OK`.

### Priority Queue (work top to bottom; check off when done)

- [ ] **Phase 4: Reorder** — Rerank `searchMemory` results by recency + relevance. Add `reorderSearchHits()` in `src/memory/retrieval.ts`.
- [ ] **Phase 4: TaskSystem** — Add `TaskSystem.run(goal, options)` in `src/orchestrator.ts` as single entry point (classify → select model → plan → execute → save context).
- [ ] **Phase 5: Programming path** — Re-enable non-paper goals with gated model selection; wire `selectExecutionModel` into executor for code steps.
- [ ] **Claim→evidence linking UI** — Add UI to link claims to sources in run details (from `docs/RESEARCH_WRITING_VNEXT_PLAN.md`).
- [ ] **Stage contracts** — Define typed input/output schemas per stage; document in `docs/STAGE_CONTRACTS.md`.
- [ ] **Revision checkpoints** — Save stage snapshots + diff summaries on QA fail; add `revisionCheckpoints` to run artifacts.
- [ ] **Context update loop** — Feed run summary back into planner prompt when `retrieveContext` returns hits.
- [ ] **OpenAI embeddings** — Replace hash-based embeddings in `retrieval.ts` with `text-embedding-3-small` when `OPENAI_API_KEY` exists.
- [ ] **Diagram accuracy** — Update Memory System Architecture diagram to gray out or label unimplemented nodes (Search, Vector Embed, Reorder).

### Rules

- One concrete change per work beat. Prefer small, shippable steps.
- If blocked: check the item, add "BLOCKED: &lt;reason&gt;", move to next. Log in PROGRESS.md.
- When all items are checked, refresh from roadmaps — add new items for the next cycle.

---

## Beat 2: Push (every 2nd heartbeat = every 20 min)

**Goal:** Push current work to GitHub. Run this when `beatCount % 2 === 0` (after each work beat).

1. `git status` — any uncommitted changes? If yes, stage + commit with message `chore(heartbeat): progress checkpoint`.
2. `git push origin main` (or current branch).
3. Update `memory/heartbeat-state.json`: `lastPush: <ISO timestamp>`.
4. Reply `HEARTBEAT_OK` (or brief summary if push had content).

---

## Last completed (update after each work beat)

- 2026-03-12 10:07 CDT — Website quality quick win: run-details system snapshot now shows `Last manual refresh` timestamp after successful inline refresh.
- 2026-03-12 09:50 CDT — Website quality quick win: run-details system snapshot now includes `Refresh snapshot` button to fetch latest `/healthz` and rerender details without page reload.
- 2026-03-12 09:46 CDT — Website quality quick win: run-details system snapshot now shows freshness (`Snapshot age` + checked-at time) with stale highlighting after 2 minutes.

---

## State tracking (`memory/heartbeat-state.json`)

```json
{
  "beatCount": 0,
  "lastWorkBeat": null,
  "lastPushBeat": null,
  "lastCompletedItem": null,
  "completedCount": 0
}
```
