/**
 * Memory system foundation for Knox-style persistent run context.
 * Saves run outcomes for future retrieval (Phase 2 of Knox roadmap).
 */

import fs from "node:fs/promises";
import path from "node:path";

export type RunContext = {
  runId: string;
  goal: string;
  taskType: string;
  complexity: string;
  status: string;
  createdAt: string;
  completedAt?: string;
  summary?: string;
  artifactPaths?: string[];
};

const DEFAULT_MEMORY_DIR = "docs/memory";
const DEFAULT_INDEX_FILE = "runs.jsonl";

function getMemoryPath(): string {
  return path.resolve(process.cwd(), process.env.MEMORY_PATH ?? DEFAULT_MEMORY_DIR);
}

function getIndexPath(): string {
  return path.join(getMemoryPath(), process.env.MEMORY_INDEX_FILE ?? DEFAULT_INDEX_FILE);
}

const MAX_RUNS = Number(process.env.MEMORY_MAX_RUNS ?? 500);

/**
 * Save run context to persistent memory.
 */
export async function saveRunContext(ctx: RunContext): Promise<void> {
  const dir = getMemoryPath();
  await fs.mkdir(dir, { recursive: true });
  const indexPath = getIndexPath();
  const line = JSON.stringify(ctx) + "\n";
  await fs.appendFile(indexPath, line, "utf8");

  // Trim if over limit (simple: read all, keep last N, rewrite)
  try {
    const content = await fs.readFile(indexPath, "utf8");
    const lines = content.split("\n").filter(Boolean);
    if (lines.length > MAX_RUNS) {
      const kept = lines.slice(-MAX_RUNS);
      await fs.writeFile(indexPath, kept.map((l) => l + "\n").join(""), "utf8");
    }
  } catch {
    // Ignore trim errors
  }
}

/**
 * Get recent run contexts from memory.
 */
export async function getRecentContexts(limit = 50): Promise<RunContext[]> {
  const indexPath = getIndexPath();
  try {
    const content = await fs.readFile(indexPath, "utf8");
    const lines = content.split("\n").filter(Boolean);
    const parsed: RunContext[] = [];
    for (let i = lines.length - 1; i >= 0 && parsed.length < limit; i--) {
      try {
        parsed.push(JSON.parse(lines[i]) as RunContext);
      } catch {
        // Skip malformed lines
      }
    }
    return parsed;
  } catch {
    return [];
  }
}

/**
 * Get run context by runId.
 */
export async function getContextByRunId(runId: string): Promise<RunContext | null> {
  const indexPath = getIndexPath();
  try {
    const content = await fs.readFile(indexPath, "utf8");
    const lines = content.split("\n").filter(Boolean);
    for (let i = lines.length - 1; i >= 0; i--) {
      try {
        const ctx = JSON.parse(lines[i]) as RunContext;
        if (ctx.runId === runId) return ctx;
      } catch {
        // Skip
      }
    }
  } catch {
    // File may not exist
  }
  return null;
}
