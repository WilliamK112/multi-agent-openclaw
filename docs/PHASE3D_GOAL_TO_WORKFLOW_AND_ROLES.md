# PHASE 3D：Goal → Workflow + Roles 自动构建（可编辑）

## 1. 功能目标
Phase 3D 的核心是把“用户输入 Goal 后的工作流与角色设计”从手工配置升级为“自动建议 + 人工确认”的模式，并且保持完全可编辑、可回退、可兼容。

本阶段不追求复杂多智能体调度引擎，而是先打通以下链路：
1. 用户输入 Goal。
2. 系统自动分类 Goal 类型。
3. 系统生成推荐 workflowStages（含顺序/type/mergePolicy/agents/roleId）。
4. 系统自动生成 roles（id/name/prompt）与 roleAssignmentsByRole（role 到 model）。
5. 用户点击 Apply 后，把推荐结果填入 Workflow Builder 与 Roles 面板。
6. 用户可继续编辑 stage 顺序、type、mergePolicy、role 绑定、role prompt、role 对应模型。
7. 点击 Run 后把全部配置（workflowStages + roles + roleAssignmentsByRole + roleAssignments）保存到 run.config，并在 /runs / /runs/:id 可见。

## 2. 用户路径（最终体验）
- 进入 /agent 页面后，默认可手工配置（兼容旧模式）。
- 输入 Goal 后，点击 “Recommend Workflow”。
- 页面显示 Recommendation 面板：
  - 推荐 stages
  - explain why（为什么这样分 stage、为什么这些角色）
  - cost hint（low/medium/high）
- 点击 “Apply Recommended Workflow” 后：
  - Workflow Builder 被填入推荐 stages
  - Roles 面板被填入推荐角色与 prompt
  - 每个 stage 自动绑定 roleId
  - roleAssignmentsByRole 被设置为默认模型映射（用户可改）
- 点击 Run：保存并执行（执行逻辑沿用现有后端最小流程，重点先保证配置链路完整）。

## 3. Goal 分类规则（轻量可解释）
当前采用关键词启发式分类（不引入重依赖）：
- `research_writing`：research/report/article/analysis/topic
- `code_change`：bug/fix/feature/code/refactor/implement
- `ui_automation`：cursor/ui/click/browser/openclaw_act/automation
- `data_task`：data/csv/table/batch/script/etl
- 其他落入 `misc`

分类结果决定推荐模板与成本提示：
- research_writing：通常 `high`
- code_change/ui_automation：`medium`
- data_task：`low`
- misc：`medium`

## 4. 推荐模板策略（示例）

### A) research_writing
- stages:
  - research（多路）
  - research（反方/边界）
  - synth（summary）
  - qa（judge）
- roles:
  - Researcher A / Researcher B / Synthesizer / QA Judge
- 特点：强调来源多样性与不确定性标注。

### B) code_change
- stages:
  - research（定位代码）
  - plan（改动计划）
  - execute（工具执行）
  - qa（回归检查）
- roles:
  - Code Researcher / Planner / Executor / QA Judge

### C) ui_automation
- stages:
  - plan（动作脚本）
  - execute（UI operator）
  - qa（marker 验证）
- roles:
  - UI Planner / UI Operator / QA Judge / Reviewer

### D) data_task
- stages:
  - plan
  - execute
  - qa
- roles:
  - Data Planner / Data Executor / QA Judge / Summarizer

## 5. 数据结构

### workflowStages
```json
[
  {
    "id": "s1",
    "type": "research",
    "agents": ["tavily-search:tool", "deepseek:local", "chatgpt-api:gpt-4o-mini"],
    "mergePolicy": "none",
    "notes": "parallel evidence collection",
    "roleId": "researcher_a"
  }
]
```

### roles
```json
[
  {
    "id": "researcher_a",
    "name": "Researcher A",
    "prompt": "8+ lines role prompt ..."
  }
]
```

### roleAssignmentsByRole
```json
{
  "researcher_a": "chatgpt-api:gpt-4o-mini",
  "synthesizer": "chatgpt-api:gpt-4o-mini",
  "qa_judge": "anthropic:sonnet"
}
```

## 6. 成本策略（如何省钱）
1. 推荐阶段优先使用便宜模型（chatgpt-api:gpt-4o-mini / deepseek:local）。
2. 仅在 QA 关键阶段建议使用高成本模型（如 sonnet），并给出 `high` 提示。
3. 用户可在 Roles 面板把高成本角色切回便宜模型，保持流程不变。
4. synth 只保留一个主模型，避免重复汇总成本。
5. execute stage 默认 `none`，让后端工具执行，避免无效 token 消耗。

## 7. 风险与防呆（至少 8 条）
1. Goal 分类误判导致模板不贴合。
2. 推荐过度复杂导致用户理解负担上升。
3. role prompt 太长影响可读性与维护。
4. role 与 stage 绑定错位导致执行语义混乱。
5. 高成本模型默认过多导致预算超支。
6. 用户忘记 Apply 就 Run（需在 UI 提醒当前模式与配置来源）。
7. 历史 roleAssignments 兼容导致字段混用（已保留向后兼容并显式区分）。
8. 配置可视化与后端保存不一致（通过 /runs/:id 回读验证）。
9. 角色编辑后未同步到 run payload（通过统一 payload 构造函数规避）。

## 8. 未来扩展
1. 用户自定义模板（按团队保存 preset）。
2. Goal 分类从规则升级到小模型评分器（含置信度）。
3. 推荐解释增加“替代方案 A/B”与成本对比。
4. 可视化 stage 依赖图（而不仅是线性列表）。
5. 角色提示词版本管理（prompt versioning）。
6. 团队共享角色库与模板市场。

## 9. 结论
Phase 3D 的价值不在“自动替用户决定”，而在“自动给出可解释、可编辑、可运行的起点”。用户依然掌控最终工作流与角色分配，但不必每次从零搭建。这使 /agent 从“配置器”进化为“带建议的工作台”，同时保持当前 OpenClaw 执行链路的兼容与稳定。
