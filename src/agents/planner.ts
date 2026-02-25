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
          inputs: { instruction: "openclaw: cursor_append_readme_demo CURSOR_UI_EDIT___RUN_ID__" },
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

  if (goal.toLowerCase().includes("[debug_readme_marker]")) {
    return {
      goal,
      steps: [
        {
          id: "step-1",
          objective: "Read-only shell diagnostics for README marker",
          tools: ["shell_run"],
          success_criteria: "stat/tail/grep outputs collected",
          inputs: { command: "__DEBUG_README_DIAG__" },
        },
        {
          id: "step-2",
          objective: "Read README by absolute path and report markerFound",
          tools: ["file_read"],
          success_criteria: "file_read tail and markerFound logged",
          inputs: { path: "/Users/William/Projects/multi-agent-openclaw/README.md" },
        },
      ],
    };
  }

  if (goal.toLowerCase().includes("[debug_cursor_ui_write]")) {
    return {
      goal,
      steps: [
        {
          id: "step-1",
          objective: "Cursor UI write marker with save twice",
          tools: ["openclaw_act"],
          success_criteria: "marker typed and file saved in Cursor UI",
          inputs: { instruction: "openclaw: cursor_debug_write_marker CURSOR_UI_EDIT___RUN_ID__" },
        },
        {
          id: "step-2",
          objective: "Read-only shell post-write diagnostics",
          tools: ["shell_run"],
          success_criteria: "stat/tail/grep show new marker",
          inputs: { command: "__DEBUG_POST_WRITE__" },
        },
        {
          id: "step-3",
          objective: "Read README absolute path and verify exact marker",
          tools: ["file_read"],
          success_criteria: "markerFound exact true",
          inputs: { path: "/Users/William/Projects/multi-agent-openclaw/README.md" },
        },
      ],
    };
  }

  if (goal.toLowerCase().includes("test run evidence")) {
    return {
      goal,
      steps: [
        {
          id: "step-1",
          objective: "Open README in Cursor and append Test Run Evidence via UI",
          tools: ["openclaw_act"],
          success_criteria: "README appended and saved in Cursor UI",
          inputs: { instruction: "openclaw: cursor_append_test_evidence TEST_RUN___RUN_ID__" },
        },
        {
          id: "step-2",
          objective: "Read-only shell verify marker in README",
          tools: ["shell_run"],
          success_criteria: "grep and tail evidence emitted",
          inputs: { command: "__VERIFY_TEST_MARKER__", marker: "TEST_RUN___RUN_ID__" },
        },
        {
          id: "step-3",
          objective: "Read README and verify exact test marker",
          tools: ["file_read"],
          success_criteria: "README contains marker=TEST_RUN_<RUN_ID>",
          inputs: { path: "/Users/William/Projects/multi-agent-openclaw/README.md" },
        },
        {
          id: "step-4",
          objective: "Run npm test and write docs/TEST_OUTPUT.txt",
          tools: ["shell_run"],
          success_criteria: "npm test executed and output file written",
          inputs: { command: "__RUN_NPM_TEST_AND_WRITE__" },
        },
        {
          id: "step-5",
          objective: "Read TEST_OUTPUT and verify fields",
          tools: ["file_read"],
          success_criteria: "timestamp/command/exitCode/stdout/stderr present",
          inputs: { path: "docs/TEST_OUTPUT.txt" },
        },
      ],
    };
  }

  if (goal.toLowerCase().includes("test output demo")) {
    return {
      goal,
      steps: [
        {
          id: "step-1",
          objective: "Select and run project self-check command",
          tools: ["shell_run"],
          success_criteria: "Self-check command exits successfully",
          inputs: { command: "__AUTO_SELF_CHECK__" },
        },
        {
          id: "step-2",
          objective: "Write self-check result to docs/TEST_OUTPUT.txt",
          tools: ["file_write"],
          success_criteria: "docs/TEST_OUTPUT.txt exists with timestamp/command/exitCode/stdout/stderr",
          inputs: { path: "docs/TEST_OUTPUT.txt" },
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
