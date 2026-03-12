import fs from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { generate } from "../llm/client";
import { LLMProvider } from "../llm/types";
import { classifyTask } from "../domain/task";

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

function isPaperGoal(goal: string): boolean {
  const g = goal.toLowerCase();
  return /(research|report|article|essay|policy|analysis|paper|write|word document|thesis|citation|sources?|论文|研究)/.test(g);
}

function fallbackPlan(goal: string): Plan {
  const task = classifyTask(goal);

  if (task.type === "programming") {
    return {
      goal,
      steps: [
        {
          id: "prog-1-scope",
          objective: "Produce a scoped implementation plan for this programming goal",
          tools: ["llm_generate"],
          success_criteria: "Plan file exists with concrete steps and acceptance criteria",
          inputs: {
            system: "You are a senior software engineer. Produce concise, practical implementation plans.",
            prompt: `Goal: ${goal}\nReturn a concrete implementation plan with: files to touch, risks, and test checklist.`,
            outputPath: "docs/exports/__RUN_ID__.programming.plan.md",
          },
        },
        {
          id: "prog-2-self-check",
          objective: "Run project self-check",
          tools: ["shell_run"],
          success_criteria: "Project checks executed",
          inputs: { command: "__AUTO_SELF_CHECK__" },
        },
        {
          id: "prog-3-read",
          objective: "Read generated plan artifact",
          tools: ["file_read"],
          success_criteria: "Programming plan is readable",
          inputs: { path: "docs/exports/__RUN_ID__.programming.plan.md" },
        },
      ],
    };
  }

  if (isPaperGoal(goal)) {
    return {
      goal,
      steps: [
        { id: "stage-1-research", objective: "Collect evidence and sources", tools: ["shell_run"], success_criteria: "sources and research notes generated", inputs: { command: "__PAPER_RESEARCH__", topic: goal } },
        { id: "stage-2-outline", objective: "Generate thesis-driven outline", tools: ["shell_run"], success_criteria: "outline generated", inputs: { command: "__PAPER_OUTLINE__", topic: goal } },
        { id: "stage-3-draft", objective: "Write first draft", tools: ["shell_run"], success_criteria: "draft markdown generated", inputs: { command: "__PAPER_DRAFT__", topic: goal } },
        { id: "stage-4-judge-v1", objective: "Judge draft with rubric JSON", tools: ["shell_run"], success_criteria: "judge v1 json generated", inputs: { command: "__PAPER_JUDGE_V1__", topic: goal } },
        { id: "stage-5-revise", objective: "Revise by judge weaknesses", tools: ["shell_run"], success_criteria: "revised markdown generated", inputs: { command: "__PAPER_REVISE_BY_JUDGE__", topic: goal } },
        { id: "stage-6-judge-v2", objective: "Judge revised draft again", tools: ["shell_run"], success_criteria: "judge v2 json generated", inputs: { command: "__PAPER_JUDGE_V2__", topic: goal } },
        { id: "stage-7-export", objective: "Export docx when gate passes", tools: ["shell_run"], success_criteria: "docx exported", inputs: { command: "__PAPER_EXPORT_DOCX_DYNAMIC__", topic: goal } },
        { id: "stage-8-qa", objective: "Read final markdown evidence", tools: ["file_read"], success_criteria: "export markdown readable", inputs: { path: "docs/exports/__RUN_ID__.md" } },
      ],
    };
  }

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

  if (goal.toLowerCase().includes("stage 3b")) {
    return {
      goal,
      steps: [
        {
          id: "step-1",
          objective: "Run npm test and capture output",
          tools: ["shell_run"],
          success_criteria: "npm test exits with code 0",
          inputs: { command: "__RUN_NPM_TEST_AND_WRITE__" },
        },
        {
          id: "step-2",
          objective: "Read docs/TEST_OUTPUT.txt",
          tools: ["file_read"],
          success_criteria: "test output file contains required fields",
          inputs: { path: "docs/TEST_OUTPUT.txt" },
        },
      ],
    };
  }

  if (goal.toLowerCase().includes("stage 3c")) {
    return {
      goal,
      steps: [
        {
          id: "step-1",
          objective: "Use cursor_act to write CURSOR_API_DEMO marker file",
          tools: ["cursor_act"],
          success_criteria: "docs/CURSOR_API_DEMO.md created/updated with marker",
          inputs: {
            repoPath: "/Users/William/Projects/multi-agent-openclaw",
            instruction: "Create or update docs/CURSOR_API_DEMO.md with marker CURSOR_API___RUN_ID__ and include runId/timestamp lines",
          },
        },
        {
          id: "step-2",
          objective: "Read CURSOR_API_DEMO file and verify marker",
          tools: ["file_read"],
          success_criteria: "marker CURSOR_API_<RUN_ID> present",
          inputs: { path: "docs/CURSOR_API_DEMO.md" },
        },
        {
          id: "step-3",
          objective: "Optional shell self-check for marker visibility",
          tools: ["shell_run"],
          success_criteria: "grep marker returns at least one line",
          inputs: { command: "__VERIFY_CURSOR_API_MARKER__", marker: "CURSOR_API___RUN_ID__" },
        },
      ],
    };
  }

  if (goal.toLowerCase().includes("phase 1 role assignment")) {
    return {
      goal,
      steps: [
        {
          id: "step-1",
          objective: "Write run config snapshot artifact",
          tools: ["file_write"],
          success_criteria: "docs/ROLE_ASSIGNMENT_RUN.md exists",
          inputs: { path: "docs/ROLE_ASSIGNMENT_RUN.md", content: "Role assignment phase-1 run artifact." },
        },
        {
          id: "step-2",
          objective: "Run lightweight shell verification",
          tools: ["shell_run"],
          success_criteria: "pwd executes successfully",
          inputs: { command: "pwd" },
        },
        {
          id: "step-3",
          objective: "Read role assignment artifact",
          tools: ["file_read"],
          success_criteria: "artifact readable",
          inputs: { path: "docs/ROLE_ASSIGNMENT_RUN.md" },
        },
      ],
    };
  }

  if (goal.toLowerCase().includes("phase 2 multi research demo")) {
    return {
      goal,
      steps: [
        {
          id: "step-1",
          objective: "Run npm test and write docs/TEST_OUTPUT.txt",
          tools: ["shell_run"],
          success_criteria: "npm test exit code recorded",
          inputs: { command: "__RUN_NPM_TEST_AND_WRITE__" },
        },
        {
          id: "step-2",
          objective: "Read test output evidence",
          tools: ["file_read"],
          success_criteria: "docs/TEST_OUTPUT.txt readable",
          inputs: { path: "docs/TEST_OUTPUT.txt" },
        },
        {
          id: "step-3",
          objective: "Write research summary artifact",
          tools: ["file_write"],
          success_criteria: "docs/PHASE2_RESEARCH_SUMMARY.md exists",
          inputs: { path: "docs/PHASE2_RESEARCH_SUMMARY.md", content: "Phase2 research summary is available in run.artifacts.researchSummary" },
        },
      ],
    };
  }

  if (goal.toLowerCase().includes("phase 3a workflow builder demo")) {
    return {
      goal,
      steps: [
        {
          id: "step-1",
          objective: "Run npm test and write docs/TEST_OUTPUT.txt",
          tools: ["shell_run"],
          success_criteria: "npm test exit code recorded",
          inputs: { command: "__RUN_NPM_TEST_AND_WRITE__" },
        },
        {
          id: "step-2",
          objective: "Read test output evidence",
          tools: ["file_read"],
          success_criteria: "docs/TEST_OUTPUT.txt readable",
          inputs: { path: "docs/TEST_OUTPUT.txt" },
        },
      ],
    };
  }

  if (goal.toLowerCase().includes("word document") || goal.toLowerCase().includes("research this topic")) {
    return {
      goal,
      steps: [
        {
          id: "step-1",
          objective: "Generate English research article markdown from topic",
          tools: ["shell_run"],
          success_criteria: "docs/IMMIGRATION_ICE_STATE_LOCAL_COOP_EN.md is created",
          inputs: { command: "__WRITE_TOPIC_ARTICLE__", topic: goal },
        },
        {
          id: "step-2",
          objective: "Export markdown article to Word document on Desktop",
          tools: ["shell_run"],
          success_criteria: "Desktop docx exists",
          inputs: { command: "__EXPORT_TOPIC_DOCX__" },
        },
        {
          id: "step-3",
          objective: "Read article file for verification",
          tools: ["file_read"],
          success_criteria: "article markdown readable",
          inputs: { path: "docs/IMMIGRATION_ICE_STATE_LOCAL_COOP_EN.md" },
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

export async function planner(goal: string, provider: LLMProvider, model: string, contextHints: string[] = []): Promise<Plan> {
  const lower = goal.toLowerCase();
  if (isPaperGoal(goal) || lower.includes("phase 1 role assignment") || lower.includes("phase 2 multi research demo") || lower.includes("phase 3a workflow builder demo") || lower.includes("stage 3") || lower.includes("test run evidence") || lower.includes("cursor readme demo") || lower.includes("test output demo") || lower.includes("[debug_") || lower.includes("word document") || lower.includes("research this topic")) {
    return fallbackPlan(goal);
  }

  const promptPath = path.resolve(process.cwd(), "src/prompts/planner.system.txt");
  const plannerPrompt = await fs.readFile(promptPath, "utf8").catch(() => "You are Planner.");

  const userPrompt = [
    `Goal: ${goal}`,
    contextHints.length ? `Recent context hints:\n- ${contextHints.join("\n- ")}` : "Recent context hints: (none)",
    `Return strict JSON only with shape: { goal, steps:[{id, objective, tools, success_criteria, inputs?}] }`,
    `Allowed tools: shell_run, file_read, file_write, openclaw_act, cursor_act, llm_generate`,
    `Need 3-6 steps.`,
    `Prefer including an early context/research step for quality when task is complex.`,
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
