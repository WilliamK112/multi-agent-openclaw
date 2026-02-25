# NEXT STEPS REPORT（能力盘点 + 使用指南 + 扩展路线图）

## 一、当前能力盘点（你现在已经具备的能力）

基于本次仓库检查（`pwd`、`npm test`、`README.md`、`docs/*`、`src/server.ts`、`src/agents/{planner,executor,qa}.ts`），当前系统已经具备以下可用能力：

1. **本地 API 编排能力**
   - 已有 `/run`、`/runs`、`/runs/:id`，支持异步执行、状态查询、日志回放。
   - run 生命周期有 `queued/running/needs_approval/done/error`，可视化友好。

2. **多步骤执行能力（Planner/Executor/QA）**
   - Planner 可生成结构化 steps（`objective/tools/success_criteria/inputs`）。
   - Executor 可按工具顺序执行并记录每步输入输出。
   - QA 可做结构化 checks + issues，形成明确验收结论。

3. **审批机制能力（高风险步骤）**
   - `openclaw_act` 触发 `needs_approval`，必须 approve 才能继续。
   - 支持暂停后恢复，有清晰日志事件（`approved: by user`）。

4. **测试与证据链能力**
   - `npm test` 目前可通过（`node --test test/*.test.js`，smoke test 生效）。
   - 可把执行结果写入 `docs/TEST_OUTPUT.txt`，包括时间、命令、exitCode、stdout/stderr。

5. **UI 自动化可用但有波动**
   - Cursor UI 编辑路径已跑通过多次，但仍存在焦点/脚本字符敏感问题。
   - 已有重试与失败快速停止策略，避免静默错误。

6. **Cursor API 处于诊断状态**
   - 已接入 `cursor_act` 形态和 healthcheck，但当前 `/teams/members` 鉴权返回 401。
   - 说明当前 key/权限/组织配置尚未打通，暂不宜作为主执行通道。

---

## 二、怎么用：主脑 → OpenClaw 推荐工作流（7 步）

1. **主脑接目标**（ChatGPT 或 Ollama）：明确范围、约束、风险。
2. **主脑做研究与拆解**：输出 Research Notes（来源、假设、风险）。
3. **主脑产出 Plan JSON**：每步写清楚 objective/tools/success_criteria/inputs。
4. **OpenClaw 执行**：仅按 plan 执行，不自行扩展研究范围。
5. **遇高风险动作进审批**：如 `openclaw_act` 自动暂停，人工 approve 后继续。
6. **QA 验收与证据落盘**：checks、issues、输出文件（如 TEST_OUTPUT）。
7. **Runs UI 回放与复盘**：在 `/runs` 和 `/runs/:id` 查看全过程日志与状态。

这套方式的核心是：**主脑负责“想清楚”，OpenClaw负责“做扎实”。**

---

## 三、下一步路线图（P0 / P1 / P2）

### P0（必须先做，收益最高）
1. **固定主脑输出契约**（Research Notes + Plan JSON + QA checks）
   - 收益：减少执行歧义；可复用。
   - 风险：模板初版过严可能影响灵活性。

2. **将关键验收项标准化**（统一 checks 命名与结果格式）
   - 收益：便于自动统计和对比历史 runs。
   - 风险：迁移期间旧 run 对齐成本。

3. **稳定 Cursor UI 编辑 skill**（只允许安全字符集 + 双保存 + file_read 验证）
   - 收益：在 API 未通前保持可交付能力。
   - 风险：仍受桌面焦点与系统状态影响。

### P1（中期增强）
1. **cursor_act 从诊断切到可写生产模式**（前提是鉴权稳定）
   - 收益：减少 UI 自动化脆弱性。
   - 风险：API 权限模型/endpoint 变更。

2. **引入 reviewer 子流程**（Claude/Cursor review-only）
   - 收益：提升文档质量、代码质量与风格一致性。
   - 风险：流程时长增加。

3. **失败分类与自动回退策略**
   - 收益：出错可快速定位（auth、焦点、脚本、I/O、测试）。
   - 风险：状态机复杂度上升。

### P2（长期优化）
1. **Runs 结果结构化报表**（趋势、失败分布、平均时延）
2. **计划执行可重放**（同 plan 在新分支/新环境复现）
3. **回滚与补偿机制**（关键文件变更失败后自动恢复）

---

## 四、风险清单（至少 6 条）

1. **UI 自动化不稳定**：焦点漂移、窗口遮挡、输入丢失。
2. **Secrets 风险**：key 泄露到日志、文档或提交历史。
3. **日志噪声与敏感信息混入**：stdout/stderr 可能包含隐私内容。
4. **主脑 research 幻觉**：来源不准导致 plan 偏航。
5. **依赖与环境漂移**：Node/包版本变化导致行为不一致。
6. **回滚不足**：失败后缺少一致的恢复路径。
7. **审批疲劳**：高频 needs_approval 降低操作效率。
8. **API 权限不确定**：如 Cursor API 401 导致流程中断。

---

## 五、本次检查证据摘要

- 目录：`/Users/William/Projects/multi-agent-openclaw`
- `npm test`：exitCode=0，smoke test 通过。
- 关键实现位置：
  - `src/server.ts`（run 生命周期、审批、日志）
  - `src/agents/planner.ts`（计划生成）
  - `src/agents/executor.ts`（工具执行）
  - `src/agents/qa.ts`（验收检查）
- 文档基线：
  - `docs/ARCHITECTURE_TARGET.md`
  - `docs/SKILL_CURSOR_UI_EDIT_SPEC.md`
  - `docs/PLAN_TEMPLATE_MAIN_AGENT.md`

结论：当前系统已具备“可执行、可审计、可验收”的基础骨架。下一步应优先强化契约与稳定性，再推进 Cursor API 真正落地。
