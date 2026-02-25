# PHASE 3A: Workflow Builder（UI + 数据链路）

## 为什么从 roleAssignments 升级到 workflowStages

Phase 2 的 roleAssignments 已经解决了“按角色选模型/工具”的问题，但它仍是平面配置：
- 只能表达“谁负责什么角色”，
- 不能表达“先做什么、后做什么、每一步如何合并结果”。

当任务复杂度提升（例如多路 research -> 合并 -> QA 评审）时，仅有 roleAssignments 不足以表达流程编排。Phase 3A 引入 workflowStages，是为了把“人/模型配置”提升为“流程配置”：

- 可排序 stages（Research -> Synthesis -> QA）；
- 每个 stage 可挂多个 agents；
- 每个 stage 有 mergePolicy（none/summary/judge/vote）；
- 运行时先保存配置与展示，后续 3B 再执行。

换句话说：Phase 3A 不做复杂执行引擎，只打通 **UI -> API -> run.config -> /runs & /runs/:id 展示 -> QA 结构校验**。

---

## workflowStages Schema（示例）

```json
[
  {
    "id": "s1",
    "type": "research",
    "agents": ["openai:gpt-4o-mini", "deepseek:local"],
    "mergePolicy": "none",
    "notes": "collect candidate directions"
  },
  {
    "id": "s2",
    "type": "synth",
    "agents": ["openai:gpt-4o-mini"],
    "mergePolicy": "summary",
    "notes": "merge into concise plan"
  },
  {
    "id": "s3",
    "type": "qa",
    "agents": ["openai:gpt-4o-mini"],
    "mergePolicy": "judge",
    "notes": "quality gate"
  }
]
```

字段定义：
- `id`: stage 唯一标识，保序。
- `type`: `research | synth | plan | execute | qa | review`。
- `agents`: 该 stage 的 agent 列表（可多选）。
- `mergePolicy`: `none | summary | judge | vote`。
- `notes`: 可选说明文本。

兼容原则：
- 如果用户不传 `workflowStages`，系统继续沿用 `roleAssignments` 老模式；
- 若两者同时传，3A 先以 `workflowStages` 作为展示/配置优先输入，roleAssignments 仍保留用于兼容。

---

## UI 操作指南（至少 6 步）

1. 打开 `/` 页面。
2. 在 Mode 区选择 **Workflow Builder**（而不是 Role Assignment）。
3. 默认会看到三个 stage：Research / Synthesis / QA。
4. 从左侧 Available Agents 拖拽多个 agent 到某个 stage（例如把 `openai:gpt-4o-mini` 和 `deepseek:local` 都拖到 Research）。
5. 根据需要调整每个 stage 的 `type` 与 `mergePolicy`（下拉选择）。
6. 使用 Up/Down 按钮重排 stage 顺序；必要时 Add Stage 或 Remove Stage。
7. 查看下方 JSON 预览，确认 `workflowStages` 为数组结构且顺序正确。
8. 输入 goal 后点 Run，触发 `/run`，并在 `/runs` / detail 中验证保存结果。

---

## 与 Phase 2 的衔接（3B 执行方向）

Phase 2 已经具备 `researchOutputs[]` 与 `researchSummary` 的最小产物链路。Phase 3B 将把这个能力从“固定触发”升级为“按 workflowStages 执行”：

- 扫描 stage 顺序执行；
- `research` stage 可产生多路 outputs；
- `synth` stage 根据 mergePolicy 生成 summary；
- `qa` stage 按 judge/vote 给出验收结论；
- 所有中间产物写入 run.artifacts（便于回放和审计）。

这样可把目前的“配置可视化”过渡到“可执行工作流”。

---

## 风险点与排查（至少 8 条）

1. **排序错乱风险**：UI 操作后 stage 顺序可能不一致。需以数组顺序为唯一真值。
2. **多 agent 成本风险**：真实执行时 token/cost 增长明显，需预算控制。
3. **并发复杂度风险**：3B 若并发执行 research，超时与重试策略需要明确。
4. **mergePolicy 语义不清**：none/summary/judge/vote 的行为边界需文档化。
5. **兼容风险**：历史 run 只有 roleAssignments，展示层需容错。
6. **缓存/陈旧数据风险**：runs 轮询时可能短暂显示旧 config。
7. **UI 复杂度风险**：stage 多了后可用性下降，需要折叠/分组设计。
8. **模型可用性风险**：某些 agent（如本地 deepseek）可能不可用，需 graceful fallback。
9. **日志过长风险**：stage+agents 多时日志急速增长，需摘要策略。
10. **安全风险**：不能把 secrets 注入 stage notes 或 logs。

---

## 3A 验收标准（本阶段）

- 能在 UI 里编辑并预览 workflowStages。
- POST /run 可接收并保存 `config.workflowStages`。
- GET /runs 可见 workflow 摘要（stageCount + 首尾 type）。
- GET /runs/:id 可见完整 workflowStages。
- QA 在有 workflowStages 时校验：
  - exists
  - is array && length >= 1
  - each stage has id/type/agents/mergePolicy
  - stage order preserved

此阶段完成后，系统已具备 Workflow Builder 的前端与数据链路基础，可进入 3B 执行引擎阶段。
