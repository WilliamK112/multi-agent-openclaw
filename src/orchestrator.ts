import path from "node:path";
import { getModel, getProvider } from "./config";
import { planner } from "./agents/planner";
import { executor, StepExecution } from "./agents/executor";
import { qa, QAResult } from "./agents/qa";

export type RunResult = {
  goal: string;
  provider: string;
  model: string;
  plan: Awaited<ReturnType<typeof planner>>;
  executions: StepExecution[];
  qa: QAResult;
};

export async function run(goal: string, projectRoot = process.cwd()): Promise<RunResult> {
  console.log("\n[Orchestrator] Goal:", goal);
  const root = path.resolve(projectRoot);
  const provider = getProvider();
  const model = getModel(provider);

  const key = process.env.ANTHROPIC_API_KEY;
  if (provider === "claude" && !key) {
    throw new Error("Missing ANTHROPIC_API_KEY. Put it in .env");
  }
  console.log(`[Orchestrator] LLM provider=${provider}, model=${model}`);
  console.log(`[Config] ANTHROPIC_API_KEY ${key ? "exists" : "missing"}`);

  const plan = await planner(goal, provider, model);
  console.log("\n[Planner] Plan JSON:");
  console.log(JSON.stringify(plan, null, 2));

  const executions: StepExecution[] = [];
  for (const step of plan.steps) {
    const result = await executor(step, root);
    executions.push(result);
  }

  const qaResult = await qa(root);
  console.log("\n[QA] Result:");
  console.log(JSON.stringify(qaResult, null, 2));

  return { goal, provider, model, plan, executions, qa: qaResult };
}
