# PHASE2_MULTI_RESEARCH_DEMO

## 目标与验收标准
本阶段目标是在不引入新框架的情况下，把“同一 role 可分配多个 agent（至少 Research）”跑通到最小可用：
1. UI 能为 Research/QA/Reviewer 选择多个 agent。
2. 后端 run.config 能保存数组化 roleAssignments（并兼容历史字符串输入）。
3. 执行时生成 `researchOutputs[]` 与 `researchSummary`。
4. `/runs` 与 `/runs/:id` 可看到配置与研究产物。
5. 通过一次端到端 run，满足 `qa.pass=true`。

## roleAssignments 新 schema（示例）
```json
{
  "main": "ollama:llama3.1",
  "research": ["openai:gpt-4o-mini", "deepseek:local"],
  "executor": "none",
  "qa": ["openai:gpt-4o-mini"],
  "reviewer": ["anthropic:sonnet"]
}
```

兼容策略：若收到 `research: "openai:gpt-4o-mini"`，后端自动归一化为 `research:["openai:gpt-4o-mini"]`。

## researchOutputs / researchSummary 数据结构
```json
{
  "researchOutputs": [
    {
      "agent": "openai:gpt-4o-mini",
      "text": "...该 agent 的研究输出..."
    },
    {
      "agent": "deepseek:local",
      "text": "...该 agent 的研究输出..."
    }
  ],
  "researchSummary": "聚合后的总结文本，建议 > 200 字符"
}
```

## UI 拖拽设置（最少 5 步）
1. 打开 `/`（agent runner 页面）。
2. 在 Goal 输入 demo 目标（例如：`Phase 2 multi research demo: openai:gpt-4o-mini + deepseek:local`）。
3. 从 Available Agents 拖拽 `openai:gpt-4o-mini` 到 Research。
4. 再拖拽 `deepseek:local` 到 Research（Research 支持多选）。
5. 拖拽或设置 QA、Reviewer（可多选），检查下方 JSON 预览为数组结构。
6. 点击 Run，查看详情中的 `Run Config` 与 `Artifacts`。

## curl 触发示例（可复制）
```bash
curl -s -X POST http://127.0.0.1:8787/run \
  -H "Content-Type: application/json" \
  -d '{
    "goal":"Phase 2 multi research demo: openai:gpt-4o-mini + deepseek:local",
    "roleAssignments":{
      "main":"ollama:llama3.1",
      "research":["openai:gpt-4o-mini","deepseek:local"],
      "executor":"none",
      "qa":["openai:gpt-4o-mini"],
      "reviewer":["anthropic:sonnet"]
    }
  }'
```

## 常见失败点与排查（至少 6 条）
1. **research 仍是字符串**：确认后端归一化函数是否生效。
2. **UI 看起来多选但 payload 不是数组**：检查 `assignmentPayload()`。
3. **researchOutputs 为空**：确认 run 启动阶段是否读取到 research agents，并生成 artifacts。
4. **researchSummary 太短**：检查 summary 生成逻辑长度阈值。
5. **qa.pass=false（exitCode）**：检查 `docs/TEST_OUTPUT.txt` 是否包含 `exitCode=0`。
6. **provider 未配置导致外部失败**：本 demo 使用最小本地汇总逻辑，不依赖外部 provider 成功率；若切换到真实 provider，请先验证 key 与可用性。
7. **/runs 列表没显示 research**：确认 `/runs` summary map 已输出 `roleAssignments.research`。
8. **详情页看不到产物**：确认前端 detail 面板渲染了 `run.artifacts`。
