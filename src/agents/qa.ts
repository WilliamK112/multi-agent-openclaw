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

export async function qa(projectRoot: string, goal = "", runId = ""): Promise<QAResult> {
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
    "README has edited-in-UI line": await containsText(readmePath, "Edited inside Cursor UI (not shell)."),
    "README has approval line": await containsText(readmePath, "Protected by Approval/Resume for openclaw_act."),
    "README has next-step line": await containsText(readmePath, "Next: run real tests and save output to docs/TEST_OUTPUT.txt."),
  };

  if (goal.toLowerCase().includes("cursor readme demo")) {
    const marker = `CURSOR_UI_EDIT_${runId}`;
    checks[`README contains marker=${marker}`] = await containsText(readmePath, `marker=${marker}`);
  }

  if (goal.toLowerCase().includes("test output demo")) {
    const testPath = path.join(projectRoot, "docs/TEST_OUTPUT.txt");
    checks["TEST_OUTPUT file exists"] = await exists(testPath);
    checks["TEST_OUTPUT has timestamp"] = await containsText(testPath, "timestamp=");
    checks["TEST_OUTPUT has command"] = await containsText(testPath, "command=");
    checks["TEST_OUTPUT has exitCode=0"] = await containsText(testPath, "exitCode=0");
  }

  const issues = Object.entries(checks)
    .filter(([, ok]) => !ok)
    .map(([name]) => `Missing/failed: ${name}`);

  return {
    pass: issues.length === 0,
    issues,
    checks,
  };
}
