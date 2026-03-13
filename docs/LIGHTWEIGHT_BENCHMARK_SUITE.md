# LIGHTWEIGHT_BENCHMARK_SUITE.md

Lightweight benchmark suite for output-quality trend checks.

## Command
- `npm run benchmark:quality -- --window=20`

## Data source
- `docs/runs_index.jsonl`

## Output
- Writes markdown report to `docs/quality/benchmark_<window>_<timestamp>.md`

## Scored rubric (1-5)
- Role Clarity
- Handoff Completeness
- Output Quality
- Reliability/Recovery
- Observability/Debuggability

## Notes
- This is a fast trend benchmark (not a full eval harness).
- Use report top gate reasons to decide next workflow fixes.
