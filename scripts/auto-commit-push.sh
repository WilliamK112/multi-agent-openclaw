#!/usr/bin/env bash
set -euo pipefail

REPO_DIR="/Users/William/.openclaw/workspace/multi-agent-openclaw"
BRANCH="main"
TS="$(date '+%Y-%m-%d %H:%M:%S %Z')"
LOG_DIR="$REPO_DIR/.openclaw"
LOG_FILE="$LOG_DIR/auto-commit.log"
PROGRESS_FILE="$REPO_DIR/PROGRESS.md"

mkdir -p "$LOG_DIR"

cd "$REPO_DIR"

current_branch="$(git rev-parse --abbrev-ref HEAD)"
if [[ "$current_branch" != "$BRANCH" ]]; then
  echo "[$TS] Skip: current branch is '$current_branch' (expected '$BRANCH')." >> "$LOG_FILE"
  exit 0
fi

# Sync with remote
git fetch origin "$BRANCH" >> "$LOG_FILE" 2>&1 || true
ahead_behind="$(git rev-list --left-right --count HEAD...origin/$BRANCH 2>/dev/null || echo '0 0')"
behind_count="$(echo "$ahead_behind" | awk '{print $2}')"
if [[ "$behind_count" != "0" ]]; then
  if ! git pull --rebase origin "$BRANCH" >> "$LOG_FILE" 2>&1; then
    echo "[$TS] Rebase pull failed; aborting this cycle." >> "$LOG_FILE"
    git rebase --abort >> "$LOG_FILE" 2>&1 || true
    exit 1
  fi
fi

# Hourly quality gate: tests must pass before push
echo "[$TS] Running hourly quality gate: npm test" >> "$LOG_FILE"
if ! npm test >> "$LOG_FILE" 2>&1; then
  echo "[$TS] Quality gate FAILED. Skip commit/push." >> "$LOG_FILE"
  {
    echo ""
    echo "### Auto-check blocker ($TS)"
    echo "- Hourly quality gate failed: \\`npm test\\`"
    echo "- Action: fix tests before next auto-push cycle."
  } >> "$PROGRESS_FILE"
  exit 1
fi

# Commit/push only when there are changes
git add -A
if git diff --cached --quiet; then
  echo "[$TS] No changes to commit." >> "$LOG_FILE"
  exit 0
fi

msg="chore(auto): hourly progress checkpoint ($TS)"
git commit -m "$msg" >> "$LOG_FILE" 2>&1
git push origin "$BRANCH" >> "$LOG_FILE" 2>&1

echo "[$TS] Committed and pushed." >> "$LOG_FILE"
