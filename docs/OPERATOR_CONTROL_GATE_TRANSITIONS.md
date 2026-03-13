# OPERATOR_CONTROL_GATE_TRANSITIONS.md

Connects operator controls to retry/fallback policy and gate status transitions.

## Runtime behavior
- `POST /runs/:runId/retry-last`
  - infers `failure_class` from `gateReasons`
  - maps to target role:
    - evidence -> researcher
    - coherence -> synthesizer
    - citation -> citation_editor
    - format -> executor
  - writes `artifacts.operator_retry_route` with transition:
    - `BLOCKED_BY_GATE->RETRY_PENDING`

- `POST /runs/:runId/escalate`
  - appends escalation note/timestamp
  - updates transition to:
    - `RETRY_PENDING->ESCALATED`

## UI visibility
- Run card shows `retry_route=<failure_class>-><target_role>`
- Run details show retry route + gate transition state.
