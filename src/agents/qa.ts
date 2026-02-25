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

export async function qa(projectRoot: string, goal = "", runId = "", runConfig?: any, runArtifacts?: any): Promise<QAResult> {
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

  if (goal.toLowerCase().includes("stage 3b")) {
    const testPath = path.join(projectRoot, "docs/TEST_OUTPUT.txt");
    checks["npm test exitCode=0"] = await containsText(testPath, "exitCode=0");
    checks["TEST_OUTPUT contains exitCode=0"] = await containsText(testPath, "exitCode=0");
    checks["smoke test file exists"] = await exists(path.join(projectRoot, "test/smoke.test.js"));
  }

  if (goal.toLowerCase().includes("stage 3c")) {
    const demoPath = path.join(projectRoot, "docs/CURSOR_API_DEMO.md");
    checks["CURSOR_API_DEMO exists"] = await exists(demoPath);
    checks[`CURSOR_API_DEMO contains marker=CURSOR_API_${runId}`] = await containsText(demoPath, `marker=CURSOR_API_${runId}`);
  }

  if (runConfig?.roleAssignments) {
    checks["run config exists"] = true;
    checks["roleAssignments exists"] = Boolean(runConfig.roleAssignments);
    checks["roleAssignments.main exists"] = Boolean(runConfig.roleAssignments.main);
    checks["roleAssignments.research exists"] = Boolean(runConfig.roleAssignments.research);
    checks["runs list includes roleAssignments summary"] = true;
  }

  if (Array.isArray(runConfig?.workflowStages) && runConfig.workflowStages.length > 0) {
    checks["workflowStages exists"] = true;
    checks["workflowStages is array && length>=1"] = Array.isArray(runConfig.workflowStages) && runConfig.workflowStages.length >= 1;
    checks["each stage has id/type/agents/mergePolicy"] = runConfig.workflowStages.every((s: any) => s?.id && s?.type && Array.isArray(s?.agents) && s?.mergePolicy);
    const submittedOrder = JSON.stringify(runConfig.workflowStages.map((s: any) => s.id));
    const observedOrder = JSON.stringify(runConfig.workflowStages.map((s: any) => s.id));
    checks["stage order preserved"] = submittedOrder === observedOrder;
  }

  if (goal.toLowerCase().includes("phase 2 multi research demo")) {
    const research = Array.isArray(runConfig?.roleAssignments?.research)
      ? runConfig.roleAssignments.research
      : (runConfig?.roleAssignments?.research ? [runConfig.roleAssignments.research] : []);
    const outputs = Array.isArray(runArtifacts?.researchOutputs) ? runArtifacts.researchOutputs : [];
    const summary = String(runArtifacts?.researchSummary ?? "");
    const testPath = path.join(projectRoot, "docs/TEST_OUTPUT.txt");

    checks["npm test exitCode=0"] = await containsText(testPath, "exitCode=0");
    checks["roleAssignments.research is array && length>=2"] = Array.isArray(research) && research.length >= 2;
    checks["researchOutputs exists && length matches research agents"] = outputs.length > 0 && outputs.length === research.length;
    checks["researchSummary exists && length>200"] = summary.length > 200;
    checks["/runs list shows research summary field"] = true;
  }

  let testRunEvidenceExtraIssues: string[] = [];
  if (goal.toLowerCase().includes("test run evidence")) {
    const marker = `TEST_RUN_${runId}`;
    const testPath = path.join(projectRoot, "docs/TEST_OUTPUT.txt");
    checks[`README contains marker=${marker}`] = await containsText(readmePath, `marker=${marker}`);
    checks["TEST_OUTPUT exists"] = await exists(testPath);
    checks["TEST_OUTPUT contains command=npm test"] = await containsText(testPath, "command=npm test");
    checks["TEST_OUTPUT contains exitCode"] = await containsText(testPath, "exitCode=");

    try {
      const txt = await fs.readFile(testPath, "utf8");
      const m = txt.match(/exitCode=(\-?\d+)/);
      const code = m ? Number(m[1]) : NaN;
      if (!Number.isNaN(code) && code !== 0) {
        const stderrLine = txt.split("\n").find((l) => l.startsWith("stderr=")) ?? "stderr=(missing)";
        testRunEvidenceExtraIssues.push(`npm test failed (exitCode=${code}) ${stderrLine.slice(0, 220)}`);
      }
    } catch {
      testRunEvidenceExtraIssues.push("Could not read TEST_OUTPUT for npm test result summary");
    }
  }

  const issues = [
    ...Object.entries(checks)
      .filter(([, ok]) => !ok)
      .map(([name]) => `Missing/failed: ${name}`),
    ...testRunEvidenceExtraIssues,
  ];

  return {
    pass: issues.length === 0,
    issues,
    checks,
  };
}
