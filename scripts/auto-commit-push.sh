#!/usr/bin/env bash
set -euo pipefail

REPO_DIR="/Users/William/.openclaw/workspace/multi-agent-openclaw"
BRANCH="main"
TS="$(date '+%Y-%m-%d %H:%M:%S %Z')"
LOG_DIR="$REPO_DIR/.openclaw"
LOG_FILE="$LOG_DIR/auto-commit.log"

mkdir -p "$LOG_DIR"

cd "$REPO_DIR"

# Ensure we are on the intended branch.
current_branch="$(git rev-parse --abbrev-ref HEAD)"
if [[ "$current_branch" != "$BRANCH" ]]; then
  echo "[$TS] Skip: current branch is '$current_branch' (expected '$BRANCH')." >> "$LOG_FILE"
  exit 0
fi

# Keep local branch up to date before committing.
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

# Stage all changes and commit only if needed.
git add -A
if git diff --cached --quiet; then
  echo "[$TS] No changes to commit." >> "$LOG_FILE"
  exit 0
fi

msg="chore(auto): hourly progress checkpoint ($TS)"
git commit -m "$msg" >> "$LOG_FILE" 2>&1

git push origin "$BRANCH" >> "$LOG_FILE" 2>&1

echo "[$TS] Committed and pushed." >> "$LOG_FILE"
