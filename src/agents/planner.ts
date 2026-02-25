import fs from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { generate } from "../llm/client";
import { LLMProvider } from "../llm/types";

export type PlanStep = {
  id: string;
  objective: string;
  tools: string[];
  success_criteria: string;
  inputs?: Record<string, string>;
};

export type Plan = {
  goal: string;
  steps: PlanStep[];
};

const planSchema = z.object({
  goal: z.string(),
  steps: z
    .array(
      z.object({
        id: z.string(),
        objective: z.string(),
        tools: z.array(z.string()).min(1),
        success_criteria: z.string(),
        inputs: z.record(z.string()).optional(),
      })
    )
    .min(1),
});

function fallbackPlan(goal: string): Plan {
  if (goal.toLowerCase().includes("cursor readme demo")) {
    return {
      goal,
      steps: [
        {
          id: "step-1",
          objective: "Open/focus Cursor on multi-agent-openclaw project",
          tools: ["openclaw_act"],
          success_criteria: "Cursor is opened and focused on project",
          inputs: { instruction: "openclaw: cursor_open_project" },
        },
        {
          id: "step-2",
          objective: "Append Cursor Automation Demo section to README via openclaw_act",
          tools: ["openclaw_act"],
          success_criteria: "README contains Cursor Automation Demo section",
          inputs: { instruction: "openclaw: cursor_append_readme_demo" },
        },
        {
          id: "step-3",
          objective: "Read README to verify section",
          tools: ["file_read"],
          success_criteria: "README content can be read with expected section",
          inputs: { path: "README.md" },
        },
      ],
    };
  }

  return {
    goal,
    steps: [
      {
        id: "step-1",
        objective: "Create README with project overview",
        tools: ["file_write"],
        success_criteria: "README.md exists and describes Planner/Executor/QA",
        inputs: { path: "README.generated.md" },
      },
      {
        id: "step-2",
        objective: "Create a simple skills interface note",
        tools: ["file_write", "file_read"],
        success_criteria: "docs/SKILLS.md exists and can be read",
        inputs: { path: "docs/SKILLS.md" },
      },
      {
        id: "step-3",
        objective: "Run lightweight self-check commands",
        tools: ["shell_run"],
        success_criteria: "pwd and ls execute successfully",
        inputs: { command: "pwd" },
      },
      {
        id: "step-4",
        objective: "Create OpenClaw demo proof file",
        tools: ["openclaw_act", "file_read"],
        success_criteria: "docs/OPENCLAW_DEMO.txt exists with OPENCLAW_DEMO marker",
        inputs: { instruction: "openclaw: demo_create_file OPENCLAW_DEMO", path: "docs/OPENCLAW_DEMO.txt" },
      },
    ],
  };
}

export async function planner(goal: string, provider: LLMProvider, model: string): Promise<Plan> {
  const promptPath = path.resolve(process.cwd(), "src/prompts/planner.system.txt");
  const plannerPrompt = await fs.readFile(promptPath, "utf8").catch(() => "You are Planner.");

  const userPrompt = [
    `Goal: ${goal}`,
    `Return strict JSON only with shape: { goal, steps:[{id, objective, tools, success_criteria, inputs?}] }`,
    `Allowed tools: shell_run, file_read, file_write, openclaw_act`,
    `Need 3-5 steps.`,
    `Avoid writing over README.md; write generated output to README.generated.md if needed.`,
  ].join("\n");

  try {
    const response = await generate({
      provider,
      model,
      temperature: 0.2,
      messages: [
        { role: "system", content: plannerPrompt },
        { role: "user", content: userPrompt },
      ],
    });

    const raw = response.text.trim();
    const jsonText = raw.startsWith("```") ? raw.replace(/^```[a-zA-Z]*\n?/, "").replace(/```$/, "").trim() : raw;
    const parsed = JSON.parse(jsonText);
    return planSchema.parse(parsed);
  } catch {
    return fallbackPlan(goal);
  }
}
