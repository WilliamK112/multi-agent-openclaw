# OUTPUT_SCHEMA_VALIDATION_HOOKS.md

Per-agent output schema validation hooks for `multi-agent-openclaw`.

## What was added
- Runtime validation module: `src/agents/validation.ts`
- Orchestrator integration: `src/orchestrator.ts`
- New optional hook: `RunHooks.onValidation(result)`

## Validated agent outputs
1. `planner`
   - checks: `goal`, non-empty `steps[]`, required step fields.
2. `executor` (per step)
   - checks: `stepId`, `objective`, `logs[]`, boolean `ok`.
3. `qa`
   - checks: boolean `pass`, `issues[]`, `checks{}` map.

## Behavior
- Validation runs immediately after each agent output is produced.
- On validation failure:
  - orchestrator logs `[Validation] <agent>=invalid ...`
  - run fails fast with a validation error
- On success:
  - orchestrator logs `[Validation] <agent>=valid`

## Extension guidance
- Add future agent schema in `src/agents/validation.ts`
- Call validator in orchestrator right after agent output generation
- Keep errors machine-readable and tied to a single agent
