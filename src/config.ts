import "dotenv/config";
import { LLMProvider } from "./llm/types";

export function getProvider(): LLMProvider {
  const raw = process.env.LLM_PROVIDER;
  const p = (raw ?? "").toLowerCase();
  if (p === "claude" || p === "gemini" || p === "openai" || p === "deepseek" || p === "ollama" || p === "fake") {
    if (p !== "fake") return p;
  }
  // safer default: prefer real providers when keys exist
  if (process.env.OPENAI_API_KEY) return "openai";
  if (process.env.ANTHROPIC_API_KEY) return "claude";
  if (process.env.DEEPSEEK_API_KEY) return "deepseek";
  if (process.env.OLLAMA_BASE_URL) return "ollama";
  return "fake";
}

export function getModel(provider: LLMProvider): string {
  if (provider === "claude") return process.env.CLAUDE_MODEL ?? "claude-3-5-sonnet-20241022";
  if (provider === "gemini") return process.env.GEMINI_MODEL ?? "gemini-1.5-pro";
  if (provider === "openai") return process.env.OPENAI_MODEL ?? "gpt-4o-mini";
  if (provider === "deepseek") return process.env.DEEPSEEK_MODEL ?? "deepseek-chat";
  if (provider === "ollama") return process.env.OLLAMA_MODEL ?? "llama3.1";
  return "fake-plan-v1";
}
