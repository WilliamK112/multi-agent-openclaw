import path from "node:path";
import { planner } from "./agents/planner";
import { executor } from "./agents/executor";
import { qa } from "./agents/qa";
import {
  validateExecutorStepOutput,
  validatePlannerOutput,
  validateQAOutput,
  type ValidationResult,
} from "./agents/validation";
import { classifyTask } from "./domain/task";
import { selectExecutionModel, selectPlanningModel } from "./llm/selector";
import { saveRunContext } from "./memory/context";

export type RunHooks = {
  onLog?: (line: string) => void;
  onPlan?: (plan: any) => void;
  onStep?: (info: any) => void;
  onQA?: (qa: any) => void;
  onValidation?: (result: ValidationResult) => void;
};

export type TaskSystemRunOptions = {
  runId?: string;
  hooks?: RunHooks;
};

function ensureProviderKeys(provider: string) {
  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  const openaiKey = process.env.OPENAI_API_KEY;
  const deepseekKey = process.env.DEEPSEEK_API_KEY;

  if (provider === "claude" && !anthropicKey) {
    throw new Error("Missing ANTHROPIC_API_KEY. Put it in .env");
  }
  if (provider === "openai" && !openaiKey) {
    throw new Error("Missing OPENAI_API_KEY. Put it in .env");
  }
  if (provider === "deepseek" && !deepseekKey) {
    throw new Error("Missing DEEPSEEK_API_KEY. Put it in .env");
  }

  return {
    anthropicKeyExists: Boolean(anthropicKey),
    openaiKeyExists: Boolean(openaiKey),
    deepseekKeyExists: Boolean(deepseekKey),
    ollamaBase: process.env.OLLAMA_BASE_URL ?? "http://localhost:11434",
  };
}

/**
 * Phase 4 TaskSystem abstraction:
 * single entry point (classify → select model → plan → execute → save context).
 */
export class TaskSystem {
  static async run(
    goal: string,
    options: TaskSystemRunOptions = {}
  ): Promise<{ plan: any; qa: any; meta: any }> {
    const hooks = options.hooks;
    const log = (line: string) => {
      console.log(line);
      hooks?.onLog?.(line);
    };

    const root = path.resolve(process.cwd());
    const runId = options.runId ?? `orchestrator_${Date.now()}`;
    const createdAt = new Date().toISOString();

    log(`\n[TaskSystem] Goal: ${goal}`);

    const task = classifyTask(goal);
    const planningModel = selectPlanningModel();
    const executionModel = selectExecutionModel(task.type, task.complexity);
    const keyStatus = ensureProviderKeys(planningModel.provider);

    log(`[TaskSystem] task_type=${task.type} complexity=${task.complexity}`);
    log(`[TaskSystem] planning_model=${planningModel.provider}:${planningModel.model}`);
    log(`[TaskSystem] execution_model=${executionModel.provider}:${executionModel.model}`);
    log(`[Config] ANTHROPIC_API_KEY ${keyStatus.anthropicKeyExists ? "exists" : "missing"}`);
    log(`[Config] OPENAI_API_KEY ${keyStatus.openaiKeyExists ? "exists" : "missing"}`);
    log(`[Config] DEEPSEEK_API_KEY ${keyStatus.deepseekKeyExists ? "exists" : "missing"}`);
    log(`[Config] OLLAMA_BASE_URL=${keyStatus.ollamaBase}`);

    let plan: any = null;
    let qaResult: any = null;
    let status = "error";

    const emitValidation = (result: ValidationResult) => {
      hooks?.onValidation?.(result);
      const marker = result.valid ? "valid" : "invalid";
      log(`[Validation] ${result.agent}=${marker}${result.errors.length ? ` errors=${result.errors.join(" | ")}` : ""}`);
      if (!result.valid) {
        throw new Error(`[Validation:${result.agent}] ${result.errors.join("; ")}`);
      }
    };

    try {
      hooks?.onLog?.("planner:start");
      plan = await planner(goal, planningModel.provider, planningModel.model);
      emitValidation(validatePlannerOutput(plan));
      hooks?.onPlan?.(plan);
      hooks?.onLog?.("planner:done");

      log("\n[Planner] Plan JSON:");
      log(JSON.stringify(plan, null, 2));

      for (const step of plan.steps) {
        hooks?.onLog?.(`executor:step ${step.id} start`);
        const result = await executor(step, root, runId, {
          executionModel,
          taskType: task.type,
          complexity: task.complexity,
        });
        emitValidation(validateExecutorStepOutput(result));
        hooks?.onStep?.({
          stepId: step.id,
          objective: step.objective,
          ok: result.ok,
          logs: result.logs,
        });
        hooks?.onLog?.(`executor:step ${step.id} done`);
      }

      qaResult = await qa(root);
      emitValidation(validateQAOutput(qaResult));
      hooks?.onQA?.(qaResult);
      hooks?.onLog?.("qa:done");

      log("\n[QA] Result:");
      log(JSON.stringify(qaResult, null, 2));

      status = "done";
      hooks?.onLog?.("run:done");

      return {
        plan,
        qa: qaResult,
        meta: {
          runId,
          taskType: task.type,
          complexity: task.complexity,
          planningModel,
          executionModel,
        },
      };
    } catch (err) {
      status = "error";
      hooks?.onLog?.("run:error");
      throw err;
    } finally {
      await saveRunContext({
        runId,
        goal,
        taskType: task.type,
        complexity: task.complexity,
        status,
        createdAt,
        completedAt: new Date().toISOString(),
        summary: qaResult?.pass != null ? `QA pass=${qaResult.pass}` : undefined,
      }).catch(() => undefined);
    }
  }
}

export async function run(
  goal: string,
  hooks?: RunHooks
): Promise<{ plan: any; qa: any }> {
  const result = await TaskSystem.run(goal, { hooks });
  return { plan: result.plan, qa: result.qa };
}
