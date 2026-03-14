# OPERATOR_RUNBOOK.md

Short runbook for operator controls in `multi-agent-openclaw`.

## Controls
- Pause: `POST /runs/:runId/pause`
- Resume: `POST /runs/:runId/resume`
- Retry Last: `POST /runs/:runId/retry-last`
- Escalate: `POST /runs/:runId/escalate`

## Control semantics
- **Pause**
  - Marks run as `paused`.
  - Runtime loop stops safely before next step execution.
- **Resume**
  - Clears paused state and returns run to queued/running flow.
- **Retry Last**
  - Moves pointer to previous step and re-enters execution.
  - Auto-derives failure class from gate reasons and maps retry route:
    - evidence -> researcher
    - coherence -> synthesizer
    - citation -> citation_editor
    - format -> executor
  - Tracks gate transition: `BLOCKED_BY_GATE->RETRY_PENDING`.
- **Escalate**
  - Records escalation note/timestamp.
  - Tracks gate transition: `RETRY_PENDING->ESCALATED`.

## Safe-use order (recommended)
1. **Pause** if run is actively producing low-quality output or noisy retries.
2. Review run details:
   - gate reasons
   - retry route (`failure_class -> target_role`)
   - run close status
3. Choose one:
   - **Retry Last** if issue is likely fixable by one more pass.
   - **Escalate** if repeated failures, policy conflicts, or unclear remediation.
4. **Resume** only after confirming expected route/transition.

## When to escalate immediately
- Same failure class repeats across retries.
- Multiple gate reason clusters appear at once (evidence + citation + format).
- Output violates hard safety/quality constraints that cannot be auto-fixed reliably.

## UI fields to monitor
- `paused`
- `escalations`
- `retry_route`
- `close` (allowed/blocked + reason)
- `gate` (pass/fail) + `reasons`

## Lightweight UI smoke assertion (condensed controls)
After any condensed-controls UI change, verify these quick assertions in the dashboard:
1. Hover `Mode: ...` condensed badge shows source-aware tooltip and includes interaction hint (click / Enter / Space + Auto mode reset path).
2. Keyboard focus on condensed badge (`Tab`) then press `Enter`/`Space` toggles condensed mode ON/OFF.
3. Keyboard hint text remains visible: `Tip: Enter/Space toggles mode`.
4. If a screen reader is active, condensed mode state/source announcement updates on toggle.
5. `Auto mode` clears saved preference and reverts behavior to viewport default.
