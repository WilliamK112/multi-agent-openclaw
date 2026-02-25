# WORKFLOW UI UPGRADE PLAN（Phase 1.5：多角色多 Agent 分配 + 汇总）

## 0. 目标与边界

本文档用于在 **不引入新框架、不做大重构** 的前提下，把当前 `/agent + /runs` 体系升级为“同一 role 可分配多个 agents（至少 Research / Reviewer / QA）”，并把多输出汇总成可复用的 `summary`，为后续真正多 agent 调度做准备。

本次仅设计最小可落地方案（兼容当前代码）：
- 先打通 **UI → API payload → run.config 保存 → run detail 展示 → QA check**。
- 研究/审查输出先走轻量模拟执行（不做复杂并发调度引擎）。
- 禁止 openclaw_act 依赖，保持 shell_run/file_read/file_write 体系可运行。

---

## 1. 现状盘点（基于仓库证据）

### 1.1 /agent 当前支持能力
证据来源：`public/index.html`
- 有 Goal 输入与 Run 提交（`createRun(goal, roleAssignmentsPayload)`）。
- 有 Available Agents 拖拽池（`AGENTS` 常量）。
- 有 Role Assignment 区块（`ROLE_RULES` + drop zone）。
- 当前 role 规则：`main/research/executor/qa` 为单选；`reviewer` 支持多选。
- 页面有 roleAssignments JSON 预览（`renderRoleJsonPreview()`）。

### 1.2 roleAssignments 当前数据结构
证据来源：`public/index.html` 中 `assignmentPayload()`

当前 payload（发送到 `/run`）实际为：
```json
{
  "main": "...",
  "research": "...",
  "executor": "...",
  "qa": "...",
  "reviewer": ["..."]
}
```
说明：Research/QA 目前是单值字符串，Reviewer 是数组。

### 1.3 后端保存与展示链路
证据来源：`src/server.ts` + `grep roleAssignments`
- `/run` 已接收 `req.body.roleAssignments`。
- run 对象存入 `run.config.roleAssignments`。
- planner 输出后，`plan.meta.roleAssignments` 已被注入。
- executor 开头 logs 有 `run_config: roleAssignments=...`（截断输出）。
- `/runs` 列表返回 roleAssignments 摘要（当前 main/research/qa）。
- `/runs/:id` 返回完整 run（包含 config、plan、logs、qa）。

### 1.4 QA 当前覆盖
证据来源：`src/agents/qa.ts`
已存在：
- `run config exists`
- `roleAssignments exists`
- `roleAssignments.main exists`
- `roleAssignments.research exists`
- `runs list includes roleAssignments summary`

结论：配置链路已基本打通，但**Research/QA 仍是单值模型**，且**没有 research.outputs[] / summary 结构**。

---

## 2. 目标数据结构（最小升级版）

### 2.1 新 roleAssignments 结构（兼容旧格式）

建议改为：
```json
{
  "main": "ollama:llama3.1",
  "research": ["openai:gpt-4o-mini", "deepseek:local"],
  "executor": "cursor_ui:tool",
  "qa": ["openai:gpt-4o-mini", "anthropic:sonnet"],
  "reviewer": ["anthropic:sonnet", "cursor_ui:tool"]
}
```

兼容策略：
- 若 `research`/`qa` 传入字符串，后端归一化为数组（`[value]`）。
- `main`/`executor` 仍保持单值（避免一次改动过大）。

### 2.2 Run State 新增字段

在 `run.state`（或 `run.meta`）新增：
```json
{
  "research": {
    "outputs": [
      {
        "agentId": "openai:gpt-4o-mini",
        "status": "ok",
        "text": "...",
        "sourceStep": "step-research"
      }
    ],
    "summary": "聚合后的研究摘要"
  }
}
```

字段定义：
- `outputs[]`：保留每个 agent 的原始输出（可截断）。
- `summary`：供下一步 planner/executor/qa 使用的统一文本。

---

## 3. 前端 UI 交互改造（最小改动）

1. `ROLE_RULES` 调整：
   - `research.multi = true`
   - `qa.multi = true`
   - `reviewer.multi = true`（保持）
2. `roleAssignments` 初始值调整：
   - `research: []`
   - `qa: []`
3. `assignmentPayload()` 输出归一化：
   - research/qa/reviewer 均返回数组（空时 `['none']` 或 `[]`，二选一统一）。
4. JSON 预览继续保留，便于肉眼验收。

收益：前端只改几处常量与payload构造，不动路由结构。

---

## 4. 后端执行流改造（最小可运行）

### 4.1 接口与存储
- `/run` 接收新结构（支持旧字符串自动归一化）。
- run.config 仍是单入口，不新增复杂配置层级。

### 4.2 Executor 日志
- 保留现有 `run_config: roleAssignments=...`。
- 追加 `research_agents_count=<n>` 等摘要日志，便于快速定位。

### 4.3 最小“research 汇总器”实现建议

在不做新调度器前提下，先加一个轻量步骤：
- 若 goal 命中 `phase1.5 multi research demo`：
  - 生成 `research.outputs[]`（按 research agents 逐个产出模拟/模板化输出）
  - 生成 `research.summary`（拼接 + 去重 + 关键点提取）
  - 写入 `run.state.research`

说明：这一步可以先不调用外部真实模型，仅验证结构与链路可用。

---

## 5. QA 设计（升级后）

新增 checks：
- `roleAssignments.research is array`
- `roleAssignments.qa is array`
- `research.outputs exists`
- `research.outputs length >= 1`（当 research 配置非空）
- `research.summary exists`
- `runs detail includes research summary`

这样可以保证“不是只保存配置，而是真的有产物可供下一步使用”。

---

## 6. 最小改动文件清单（建议）

1. `public/index.html`
   - Role rules 改多选（research/qa）
   - payload 归一化
   - JSON preview 保持

2. `src/server.ts`
   - roleAssignments 归一化（字符串->数组）
   - run.state.research 挂载
   - logs 增加 research 摘要

3. `src/agents/planner.ts`
   - 增加一个 demo goal 分支（可选）
   - 计划中加入 `research_collect` 与 `research_summarize` 语义步骤

4. `src/agents/executor.ts`
   - 最小 research outputs 生成与 summary 聚合

5. `src/agents/qa.ts`
   - 新增 array/outputs/summary checks

> 注：以上改动都可控且回滚简单，不需要引入 dnd 新库或状态机框架。

---

## 7. Demo 运行建议（后续一步）

建议 demo goal：
- `Phase 1.5 demo: multi research assignment summary`

输入 roleAssignments 示例：
- research = ["openai:gpt-4o-mini", "deepseek:local"]
- qa = ["openai:gpt-4o-mini"]
- reviewer = ["anthropic:sonnet"]

验收证据：
- `/runs/:id` 中出现 `run.config.roleAssignments.research[]`
- `run.state.research.outputs[]` 存在
- `run.state.research.summary` 非空
- `qa.pass=true`

---

## 8. 风险与控制

1. **数组化兼容风险**：旧 run payload 仍是字符串。→ 后端归一化。
2. **输出过长风险**：outputs 可能爆日志。→ 做长度截断。
3. **假输出误用风险**：demo阶段为模板产出。→ 明确 `mode=demo` 标记。
4. **后续真实调度复杂度**：并行超时/重试策略。→ Phase 2 再引入。
5. **UI 误操作风险**：拖拽误放。→ 保留 Clear 与 JSON 预览。

---

## 9. 结论

当前系统已经具备“角色配置可视化 + API入库 + run详情可查 + QA可验证”的主链路。最小升级应优先完成 **research/qa 多选数组化 + research.outputs/summary 产物化**，这样下一阶段才能把“多 Agent 协作”从展示层推进到真正可执行层。
