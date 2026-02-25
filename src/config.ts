import "dotenv/config";
import { LLMProvider } from "./llm/types";

export function getProvider(): LLMProvider {
  const p = (process.env.LLM_PROVIDER ?? "fake").toLowerCase();
  if (p === "claude" || p === "gemini" || p === "fake") return p;
  return "fake";
}

export function getModel(provider: LLMProvider): string {
  if (provider === "claude") return process.env.CLAUDE_MODEL ?? "claude-3-5-sonnet-20241022";
  if (provider === "gemini") return process.env.GEMINI_MODEL ?? "gemini-1.5-pro";
  return "fake-plan-v1";
}
