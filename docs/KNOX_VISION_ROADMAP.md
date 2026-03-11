# Knox Memory System Vision — multi-agent-openclaw Roadmap

This document maps the **Knox Memory System Architecture** (智能计划-任务-记忆编排, 动态模型选择) to multi-agent-openclaw and outlines phased implementation steps.

## Knox Architecture Overview

```
User Input → Search + Planning Model
     ↓
Vector Embedding → Vector Storage → Reorder
     ↓
Task System → Task Type (Programming | General)
     ↓
Programming: Simple / Medium / Complex (dynamic model selection)
General: General-purpose model
     ↓
Response → Final Output + Memory System (persistent)
     ↓
Context Update Loop
```

## Mapping: Knox → multi-agent-openclaw

| Knox Component | Current State | Target State |
|----------------|---------------|--------------|
| **User Input** | Goal string via POST /run | Same; add optional context/session |
| **Search (检索)** | None (fixed research templates) | RAG: vector search over run history, sources, docs |
| **Planning Model** | Planner (LLM) or workflow override | Keep; add self-selected model config |
| **Vector Embedding** | None | Embed run artifacts, sources, claims for retrieval |
| **Vector Storage** | None | Local vector DB (e.g. sqlite-vec, chroma, or file-based) |
| **Reorder** | None | Rerank search results by relevance/recency |
| **Task System** | Orchestrator + server continueRun | Formal TaskSystem abstraction |
| **Task Type** | `classifyGoalType()` (research_writing, code_change, etc.) | Extend: Programming vs General + complexity |
| **Dynamic Model Selection** | Single provider/model from config | Route by task type + complexity (simple/medium/complex) |
| **Response** | Run artifacts (md, docx, judge JSON) | Same; add structured response envelope |
| **Memory System** | Ephemeral runs in Map; artifacts on disk | Persistent run context, cross-run retrieval |
| **Context Update Loop** | None | Feed run outcomes back into memory for future runs |

## Phased Implementation

### Phase 1: Task Classification + Dynamic Model Selection (Now)

**Goal:** Introduce task type and complexity classification, route to appropriate models.

1. **Task type module** (`src/domain/task.ts`)
   - `TaskType`: `"programming" | "research_writing" | "general"`
   - `Complexity`: `"simple" | "medium" | "complex"`
   - `classifyTask(goal: string): { type, complexity }`

2. **Model selector** (`src/llm/selector.ts`)
   - Map `(TaskType, Complexity)` → `(provider, model)`
   - Env overrides: `MODEL_SIMPLE`, `MODEL_MEDIUM`, `MODEL_COMPLEX`, `MODEL_PLANNING`

3. **Wire into planner/executor**
   - Planner uses planning model
   - Executor stages use task-type–appropriate model (when LLM is used)

**Deliverables:**
- `src/domain/task.ts`
- `src/llm/selector.ts`
- Config/env updates
- Planner uses `selectPlanningModel()`

---

### Phase 2: Memory System Foundation

**Goal:** Persistent run context that survives restarts and can be queried.

1. **Run context schema**
   - `RunContext`: runId, goal, taskType, complexity, artifacts, createdAt, summary
   - Store in `docs/memory/runs.jsonl` or sqlite

2. **Memory service** (`src/memory/context.ts`)
   - `saveRunContext(ctx)`
   - `getRecentContexts(limit)`
   - `getContextByRunId(runId)`

3. **Context update loop**
   - On run completion: save RunContext to memory
   - Optional: extract summary for future retrieval

**Deliverables:**
- `src/memory/context.ts`
- `docs/memory/` directory
- Server calls `saveRunContext` after run done

---

### Phase 3: Search (RAG) Pipeline

**Goal:** Retrieve relevant past runs, sources, and artifacts for planning.

1. **Embedding**
   - Use OpenAI embeddings or local (e.g. sentence-transformers via subprocess)
   - Embed: goal, run summary, source titles, claim text

2. **Vector storage**
   - Start simple: JSONL + cosine similarity (no external DB)
   - Or: sqlite-vec, chroma, or similar

3. **Search API**
   - `searchMemory(query: string, limit: number): RunContext[]`
   - Planner can optionally receive `relevantContexts` as input

**Deliverables:**
- `src/memory/embed.ts`
- `src/memory/search.ts`
- Optional planner integration

---

### Phase 4: Reorder + Task System Formalization

**Goal:** Rerank search results; formal TaskSystem abstraction.

1. **Reorder**
   - Score by: recency, relevance, task-type match
   - Simple heuristic first; LLM rerank later if needed

2. **TaskSystem**
   - `TaskSystem.run(goal, options)` as single entry point
   - Internal: classify → select model → plan → execute → save context

---

### Phase 5: Programming Path (Code Model Tiers)

**Goal:** Support code-related goals with simple/medium/complex routing.

1. **Enable programming task type**
   - Currently disabled ("Paper Mode Only")
   - Re-enable with gated model selection

2. **Code model tiers**
   - Simple: fast model (gpt-4o-mini, deepseek-chat)
   - Medium: balanced (gpt-4o, claude-sonnet)
   - Complex: strongest (claude-opus, gpt-4o)

3. **Executor integration**
   - Code steps use selected code model

---

## Environment Variables (New)

```bash
# Dynamic model selection (optional overrides)
MODEL_PLANNING=openai:gpt-4o-mini
MODEL_SIMPLE=openai:gpt-4o-mini
MODEL_MEDIUM=anthropic:claude-3-5-sonnet
MODEL_COMPLEX=anthropic:claude-3-5-sonnet

# Memory
MEMORY_PATH=docs/memory
MEMORY_MAX_RUNS=500

# Search (Phase 3)
OPENAI_EMBEDDING_MODEL=text-embedding-3-small
```

## Success Criteria

- **Phase 1:** Runs use task-type–appropriate models; complexity influences model choice.
- **Phase 2:** Run contexts persist; can list recent runs from memory.
- **Phase 3:** Planner can optionally receive relevant past context via search.
- **Phase 4:** Search results are reranked; TaskSystem is the single orchestration entry point.
- **Phase 5:** Programming goals work with tiered code models.

## Alignment with Existing Plans

- **RESEARCH_WRITING_VNEXT_PLAN.md:** Knox extends this with memory, search, and dynamic model selection.
- **Evidence panel, claim linking, QA gates:** Unchanged; Knox adds orchestration and memory layers on top.
