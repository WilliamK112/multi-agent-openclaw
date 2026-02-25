export type LLMProvider = "fake" | "claude" | "gemini";

export type ChatMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

export type LLMRequest = {
  provider: LLMProvider;
  model: string;
  messages: ChatMessage[];
  temperature?: number;
};

export type LLMResponse = {
  text: string;
  provider: LLMProvider;
  model: string;
};
