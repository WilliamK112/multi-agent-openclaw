# SKILL Spec: `cursor_ui_edit` (UI-driven file edit with verification)

## Scope
This spec defines a stable, reusable skill contract for editing files in Cursor through desktop UI automation, then verifying persistence through file readback.

This is a spec-first document. Implementation may vary, but behavior and acceptance criteria must remain consistent.

## Inputs
Required fields:
- `filePath` (string, absolute path preferred)
- `appendText` (string, intended content to append)
- `marker` (string, unique run-scoped token such as `CURSOR_UI_EDIT_<RUN_ID>`)

Optional fields:
- `maxRetries` (number, default `1`)
- `saveTwice` (boolean, default `true`)
- `verifyText` (array of required substrings, default includes marker)

## Output
Structured result:
- `success` (boolean)
- `failureReason` (string | null)
- `retryCount` (number)
- `markerFound` (boolean)
- `logs` object including at least:
  - `openclawActSummary`
  - `openedPath`
  - `saveActions` (count/timing)
  - `verificationNeedle`
  - `verificationSource` (`file_read`)

## Required Behavior
1. Activate Cursor window.
2. Open file with absolute path via command palette (Cmd+P + path).
3. Move cursor to end of file.
4. Append safe text block including `marker`.
5. Save with Cmd+S, then optional second Cmd+S.
6. Immediately read file via `file_read` and verify marker/text.

## Verification Contract
After save:
- Must call `file_read(filePath)`.
- Must compute `markerFound` using exact match for `marker=<value>` or equivalent strict needle.
- Must record verification output in run logs.

## Retry Strategy
- If verification fails, allow exactly one retry (default).
- Retry consists of re-focus Cursor, reopen target file, re-append block, resave, re-verify.
- If retry still fails, fail hard with reason:
  - `readme_ui_edit_failed: marker not found after retry`
  - or context-specific equivalent.

## Approval/Resume Rules
`cursor_ui_edit` must run under approval-gated execution when invoked through `openclaw_act`:
- Step that triggers UI control enters `needs_approval`.
- Execution resumes only after explicit `approve` call.
- Verification step (`file_read`) does not require approval.

## Failure Modes and Countermeasures

### 1) Focus error (wrong app/window)
Symptoms:
- Keystrokes go to wrong surface.
Mitigation:
- Force app activation before typing.
- Log active target summary.

### 2) Wrong file opened
Symptoms:
- Marker written elsewhere; verification fails.
Mitigation:
- Open absolute path, not relative only.
- Log resolved `openedPath`.

### 3) Special-char script break (`-2741`)
Symptoms:
- AppleScript syntax error on injected line.
Mitigation:
- Use safe character set for UI-typed block.
- Avoid unsafe symbols in typed payload (notably backticks, quotes, backslashes) unless escaped by hardened serializer.
- Pre-validate `appendText` before script assembly.

### 4) Save not persisted
Symptoms:
- UI appears edited, file_read unchanged.
Mitigation:
- Save twice with short delay.
- Verify immediately from disk with `file_read`.

## Safety Character Guidance
For maximum stability, constrain UI-typed content to:
- letters/numbers
- spaces
- `. : = _ - ( )`
- newline

If richer markdown is required, transform to safe equivalent or use a hardened escaping path with explicit tests.

## Acceptance Checklist
- [ ] Marker appears in target file from `file_read`.
- [ ] Required verification lines present.
- [ ] Retry count recorded.
- [ ] Failure reason actionable when not successful.
- [ ] No secret material emitted in logs.
