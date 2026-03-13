import { z } from "zod";

const planStepSchema = z.object({
  id: z.string().min(1),
  objective: z.string().min(1),
  tools: z.array(z.string().min(1)).min(1),
  success_criteria: z.string().min(1),
  inputs: z.record(z.string()).optional(),
});

const plannerOutputSchema = z.object({
  goal: z.string().min(1),
  steps: z.array(planStepSchema).min(1),
});

const executionLogSchema = z.object({
  skill: z.string().min(1),
  input: z.unknown(),
  output: z.unknown(),
});

const executorStepSchema = z.object({
  stepId: z.string().min(1),
  objective: z.string().min(1),
  logs: z.array(executionLogSchema),
  ok: z.boolean(),
});

const qaOutputSchema = z.object({
  pass: z.boolean(),
  issues: z.array(z.string()),
  checks: z.record(z.boolean()),
});

export type ValidationResult = {
  agent: "planner" | "executor" | "qa";
  valid: boolean;
  errors: string[];
};

function toErrors(err: z.ZodError): string[] {
  return err.issues.map((i) => `${i.path.join(".") || "root"}: ${i.message}`);
}

export function validatePlannerOutput(payload: unknown): ValidationResult {
  const parsed = plannerOutputSchema.safeParse(payload);
  return parsed.success
    ? { agent: "planner", valid: true, errors: [] }
    : { agent: "planner", valid: false, errors: toErrors(parsed.error) };
}

export function validateExecutorStepOutput(payload: unknown): ValidationResult {
  const parsed = executorStepSchema.safeParse(payload);
  return parsed.success
    ? { agent: "executor", valid: true, errors: [] }
    : { agent: "executor", valid: false, errors: toErrors(parsed.error) };
}

export function validateQAOutput(payload: unknown): ValidationResult {
  const parsed = qaOutputSchema.safeParse(payload);
  return parsed.success
    ? { agent: "qa", valid: true, errors: [] }
    : { agent: "qa", valid: false, errors: toErrors(parsed.error) };
}
