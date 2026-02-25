import { PlanStep } from "./planner";
import { fileRead, fileWrite } from "../skills/files";
import { shellRun } from "../skills/shell";
import { openclawAct } from "../skills/openclaw";

export type StepExecution = {
  stepId: string;
  objective: string;
  logs: Array<{ skill: string; input: unknown; output: unknown }>;
  ok: boolean;
};

export async function executor(step: PlanStep, projectRoot: string): Promise<StepExecution> {
  const logs: StepExecution["logs"] = [];

  function logSkill(skill: string, input: unknown, output: unknown) {
    console.log(`\\n[Executor] Step ${step.id}: ${step.objective}`);
    console.log(`[Executor] Calling skill: ${skill}`);
    console.log(`[Executor] Skill input:`, input);
    console.log(`[Executor] Skill output:`, output);
    logs.push({ skill, input, output });
  }

  for (const tool of step.tools) {
    if (tool === "file_write") {
      const path = step.inputs?.path ?? "README.md";
      const content = path.endsWith("README.md")
        ? `# multi-agent-openclaw\\n\\nGoal: ${step.objective}\\n\\nThis repo uses Planner / Executor / QA.\\n`
        : `# Skills Interface\\n\\n- shell_run\\n- file_read\\n- file_write\\n- openclaw_act\\n`;
      const out = await fileWrite(projectRoot, path, content);
      logSkill("file_write", { path, contentPreview: content.slice(0, 60) }, out);
      continue;
    }

    if (tool === "file_read") {
      const path = step.inputs?.path ?? "README.md";
      const out = await fileRead(projectRoot, path);
      logSkill("file_read", { path }, out.ok ? { ...out, content: (out.content ?? "").slice(0, 120) } : out);
      continue;
    }

    if (tool === "shell_run") {
      const cmds = [step.inputs?.command ?? "pwd", "ls src/skills"];
      for (const command of cmds) {
        const out = await shellRun(command, projectRoot);
        logSkill("shell_run", { command }, out);
      }
      continue;
    }

    if (tool === "openclaw_act") {
      const instruction = step.inputs?.instruction ?? "No instruction";
      const out = await openclawAct(instruction);
      logSkill("openclaw_act", { instruction }, out);
      continue;
    }

    const unsupported = { ok: false, reason: `Unsupported tool: ${tool}` };
    logSkill(tool, {}, unsupported);
  }

  const ok = logs.every((l) => {
    const out = l.output as any;
    return out?.ok !== false;
  });

  return { stepId: step.id, objective: step.objective, logs, ok };
}
