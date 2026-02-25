import fs from "node:fs/promises";
import path from "node:path";

export type QAResult = {
  pass: boolean;
  issues: string[];
  checks: Record<string, boolean>;
};

async function exists(p: string): Promise<boolean> {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

export async function qa(projectRoot: string): Promise<QAResult> {
  const checks: Record<string, boolean> = {
    "README.md exists": await exists(path.join(projectRoot, "README.md")),
    "README.generated.md exists": await exists(path.join(projectRoot, "README.generated.md")),
    "skills directory exists": await exists(path.join(projectRoot, "src/skills")),
    "skills note exists": await exists(path.join(projectRoot, "docs/SKILLS.md")),
    "planner file exists": await exists(path.join(projectRoot, "src/agents/planner.ts")),
    "executor file exists": await exists(path.join(projectRoot, "src/agents/executor.ts")),
    "qa file exists": await exists(path.join(projectRoot, "src/agents/qa.ts")),
  };

  const issues = Object.entries(checks)
    .filter(([, ok]) => !ok)
    .map(([name]) => `Missing: ${name}`);

  return {
    pass: issues.length === 0,
    issues,
    checks,
  };
}
