/**
 * Dynamic model selection for Knox-style orchestration.
 * Routes to provider+model based on task type and complexity.
 */

import type { LLMProvider } from "./types";
import { getProvider, getModel } from "../config";
import type { TaskType, Complexity } from "../domain/task";

export type ModelSpec = {
  provider: LLMProvider;
  model: string;
};

function parseModelEnv(key: string): ModelSpec | null {
  const raw = process.env[key];
  if (!raw || typeof raw !== "string") return null;
  const [provider, model] = raw.split(":");
  if (!provider || !model) return null;
  const p = provider.toLowerCase();
  if (!["openai", "anthropic", "claude", "deepseek", "ollama", "gemini"].includes(p)) {
    return null;
  }
  const prov: LLMProvider = p === "anthropic" ? "claude" : (p as LLMProvider);
  return { provider: prov, model: model.trim() };
}

/**
 * Select model for planning (Planning Model in Knox).
 */
export function selectPlanningModel(): ModelSpec {
  const spec = parseModelEnv("MODEL_PLANNING");
  if (spec) return spec;
  const provider = getProvider();
  const model = getModel(provider);
  return { provider, model };
}

/**
 * Select model for execution based on task type and complexity.
 * Programming path: simple/medium/complex tiers.
 * General/research_writing: single tier or complexity-based.
 */
export function selectExecutionModel(
  taskType: TaskType,
  complexity: Complexity
): ModelSpec {
  const key =
    taskType === "programming"
      ? `MODEL_${complexity.toUpperCase()}`
      : "MODEL_MEDIUM";
  const spec = parseModelEnv(key);
  if (spec) return spec;

  // Fallback: use config default
  const provider = getProvider();
  const model = getModel(provider);

  // For complex tasks, prefer stronger models when available
  if (complexity === "complex") {
    const complexSpec = parseModelEnv("MODEL_COMPLEX");
    if (complexSpec) return complexSpec;
    if (provider === "openai" && process.env.OPENAI_API_KEY) {
      return { provider: "openai", model: process.env.OPENAI_MODEL ?? "gpt-4o" };
    }
    if (provider === "claude" && process.env.ANTHROPIC_API_KEY) {
      return {
        provider: "claude",
        model: process.env.CLAUDE_MODEL ?? "claude-3-5-sonnet-20241022",
      };
    }
  }

  if (complexity === "simple") {
    const simpleSpec = parseModelEnv("MODEL_SIMPLE");
    if (simpleSpec) return simpleSpec;
    if (provider === "openai") {
      return { provider: "openai", model: "gpt-4o-mini" };
    }
  }

  return { provider, model };
}
