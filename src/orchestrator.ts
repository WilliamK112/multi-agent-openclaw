import path from "node:path";
import { getModel, getProvider } from "./config";
import { planner } from "./agents/planner";
import { executor } from "./agents/executor";
import { qa } from "./agents/qa";

export type RunHooks = {
  onLog?: (line: string) => void;
  onPlan?: (plan: any) => void;
  onStep?: (info: any) => void;
  onQA?: (qa: any) => void;
};

export async function run(
  goal: string,
  hooks?: RunHooks
): Promise<{ plan: any; qa: any }> {
  const log = (line: string) => {
    console.log(line);
    hooks?.onLog?.(line);
  };

  log(`\n[Orchestrator] Goal: ${goal}`);

  const root = path.resolve(process.cwd());
  const provider = getProvider();
  const model = getModel(provider);

  const key = process.env.ANTHROPIC_API_KEY;
  if (provider === "claude" && !key) {
    throw new Error("Missing ANTHROPIC_API_KEY. Put it in .env");
  }

  log(`[Orchestrator] LLM provider=${provider}, model=${model}`);
  log(`[Config] ANTHROPIC_API_KEY ${key ? "exists" : "missing"}`);

  hooks?.onLog?.("planner:start");
  const plan = await planner(goal, provider, model);
  hooks?.onPlan?.(plan);
  hooks?.onLog?.("planner:done");

  log("\n[Planner] Plan JSON:");
  log(JSON.stringify(plan, null, 2));

  for (const step of plan.steps) {
    hooks?.onLog?.(`executor:step ${step.id} start`);
    const result = await executor(step, root);
    hooks?.onStep?.({ stepId: step.id, objective: step.objective, ok: result.ok, logs: result.logs });
    hooks?.onLog?.(`executor:step ${step.id} done`);
  }

  const qaResult = await qa(root);
  hooks?.onQA?.(qaResult);
  hooks?.onLog?.("qa:done");

  log("\n[QA] Result:");
  log(JSON.stringify(qaResult, null, 2));

  hooks?.onLog?.("run:done");
  return { plan, qa: qaResult };
}
