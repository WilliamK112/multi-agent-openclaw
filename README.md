# multi-agent-openclaw

A minimal runnable **multi-agent + multi-skills** CLI in Node.js + TypeScript.

## Install

```bash
npm install
cp .env.example .env
```

## Run

```bash
npm run dev -- "你的goal"
```

If no goal argument is provided, the CLI will prompt interactively.

## Agent Roles

- **Planner**: Converts the goal into a structured JSON plan.
- **Executor**: Executes each step and logs every skill call (input/output).
- **QA**: Validates required artifacts and returns pass/fail + issues.

## Skills

- `shell_run`: executes allowlisted shell commands (`pwd`, `ls`, `cat`, `npm`, `node`, `echo`, `git`, `npx`, `tsc`).
- `file_read`: reads files safely inside project root.
- `file_write`: writes files safely inside project root.
- `openclaw_act`:
  - `openclaw: status`
  - `openclaw: gateway status`
  - other instructions run as safe stub log.

## LLM Provider

Set `.env`:

- `LLM_PROVIDER=fake` (default)
- `LLM_PROVIDER=claude` + `ANTHROPIC_API_KEY`
- `LLM_PROVIDER=gemini` + `GEMINI_API_KEY`

Planner attempts selected provider, and falls back to safe fake JSON if provider/API fails.

## Verify

```bash
npm run dev -- "Build a multi-agent system skeleton"
```

Expected output includes:
- Planner JSON plan
- Executor step-by-step skill logs
- QA pass/fail summary
