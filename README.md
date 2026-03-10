# multi-agent-openclaw

Desktop-first dark-mode multi-agent orchestration app for research/paper workflows.

## What it does

- Task composer + prompt clarity check
- Role Assignment and Workflow Builder modes
- Recommended workflow + meeting-room discussion
- Multi-stage run pipeline: research → plan/synth/review/qa/execute
- Final output open/reveal actions
- Local web UI at `http://127.0.0.1:8787`

## Run

```bash
npm install
npm run dev:server
```

Then open:

```text
http://127.0.0.1:8787
```

## Key UI features

- **Agent Library** with categorized, humanized avatar cards
- **Role cards** with drag/drop assignment and improved empty states
- **Workflow Builder** with stage ordering, merge policy, and role mapping
- **Prompt Clarifier** to catch vague prompts before run
- **Recommendation panel** with readable summary + meeting room transcript
- **Results** with final output actions:
  - Open Final Essay
  - Show Final in Finder

## Local API (optional)

Create run:

```bash
curl -s -X POST http://127.0.0.1:8787/run \
  -H "Content-Type: application/json" \
  -d '{"goal":"Write a research essay on the relationship between China and US in 2026"}'
```

Recommend workflow:

```bash
curl -s -X POST http://127.0.0.1:8787/workflow/recommend \
  -H "Content-Type: application/json" \
  -d '{"goal":"Write a research essay on the relationship between China and US in 2026"}'
```

## Notes

- This repo includes generated sample avatars in `public/agent-avatars/generated`.
- Runtime outputs under `docs/exports` are local artifacts and can be excluded from commits.
