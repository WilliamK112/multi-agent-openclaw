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

async function containsText(p: string, needle: string): Promise<boolean> {
  try {
    const text = await fs.readFile(p, "utf8");
    return text.includes(needle);
  } catch {
    return false;
  }
}

export async function qa(projectRoot: string): Promise<QAResult> {
  const demoPath = path.join(projectRoot, "docs/OPENCLAW_DEMO.txt");

  const readmePath = path.join(projectRoot, "README.md");

  const checks: Record<string, boolean> = {
    "README.md exists": await exists(readmePath),
    "README.generated.md exists": await exists(path.join(projectRoot, "README.generated.md")),
    "skills directory exists": await exists(path.join(projectRoot, "src/skills")),
    "skills note exists": await exists(path.join(projectRoot, "docs/SKILLS.md")),
    "planner file exists": await exists(path.join(projectRoot, "src/agents/planner.ts")),
    "executor file exists": await exists(path.join(projectRoot, "src/agents/executor.ts")),
    "qa file exists": await exists(path.join(projectRoot, "src/agents/qa.ts")),
    "OPENCLAW_DEMO file exists": await exists(demoPath),
    "OPENCLAW_DEMO contains marker": await containsText(demoPath, "OPENCLAW_DEMO"),
    "README has Cursor Automation Demo title": await containsText(readmePath, "## Cursor Automation Demo"),
    "README has CodePilot GUI line": await containsText(readmePath, "This run was triggered from CodePilot GUI"),
    "README has approval line": await containsText(readmePath, "openclaw_act executes only after Approval/Resume"),
    "README has TEST_OUTPUT TODO line": await containsText(readmePath, "Next step: run npm test and save output to docs/TEST_OUTPUT.txt (TODO)"),
  };

  const issues = Object.entries(checks)
    .filter(([, ok]) => !ok)
    .map(([name]) => `Missing/failed: ${name}`);

  return {
    pass: issues.length === 0,
    issues,
    checks,
  };
}
