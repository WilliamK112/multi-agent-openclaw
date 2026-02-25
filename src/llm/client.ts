import { LLMRequest, LLMResponse } from "./types";

async function callClaude(req: LLMRequest): Promise<LLMResponse> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("Missing ANTHROPIC_API_KEY");

  const system = req.messages.filter((m) => m.role === "system").map((m) => m.content).join("\n\n");
  const messages = req.messages
    .filter((m) => m.role !== "system")
    .map((m) => ({ role: m.role, content: [{ type: "text", text: m.content }] }));

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: req.model,
      max_tokens: 1200,
      temperature: req.temperature ?? 0.2,
      system,
      messages,
    }),
  });

  if (!res.ok) throw new Error(`Claude API error ${res.status}: ${await res.text()}`);
  const data: any = await res.json();
  const text = (data.content ?? []).filter((c: any) => c.type === "text").map((c: any) => c.text).join("\n");
  return { text, provider: "claude", model: req.model };
}

async function callGemini(req: LLMRequest): Promise<LLMResponse> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("Missing GEMINI_API_KEY");

  const joined = req.messages.map((m) => `${m.role.toUpperCase()}: ${m.content}`).join("\n\n");
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${req.model}:generateContent?key=${apiKey}`;

  const res = await fetch(endpoint, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      contents: [{ role: "user", parts: [{ text: joined }] }],
      generationConfig: { temperature: req.temperature ?? 0.2 },
    }),
  });

  if (!res.ok) throw new Error(`Gemini API error ${res.status}: ${await res.text()}`);
  const data: any = await res.json();
  const text = data?.candidates?.[0]?.content?.parts?.map((p: any) => p.text ?? "").join("\n") ?? "";
  return { text, provider: "gemini", model: req.model };
}

function fakeResponse(req: LLMRequest): LLMResponse {
  const userGoal = req.messages.find((m) => m.role === "user")?.content ?? "unknown";
  return {
    text: JSON.stringify({
      goal: userGoal.replace(/^Goal:\s*/i, "").split("\n")[0],
      steps: [
        {
          id: "step-1",
          objective: "Create README with project overview",
          tools: ["file_write"],
          success_criteria: "README.generated.md exists",
          inputs: { path: "README.generated.md" },
        },
        {
          id: "step-2",
          objective: "Create skills interface note",
          tools: ["file_write", "file_read"],
          success_criteria: "docs/SKILLS.md exists",
          inputs: { path: "docs/SKILLS.md" },
        },
        {
          id: "step-3",
          objective: "Run self-check",
          tools: ["shell_run"],
          success_criteria: "pwd/ls successful",
          inputs: { command: "pwd" },
        },
        {
          id: "step-4",
          objective: "Demonstrate OpenClaw action",
          tools: ["openclaw_act"],
          success_criteria: "OpenClaw status command runs",
          inputs: { instruction: "openclaw: status" },
        },
      ],
    }),
    provider: "fake",
    model: req.model,
  };
}

export async function generate(req: LLMRequest): Promise<LLMResponse> {
  if (req.provider === "fake") return fakeResponse(req);
  if (req.provider === "claude") return callClaude(req);
  if (req.provider === "gemini") return callGemini(req);
  throw new Error(`Unsupported provider: ${req.provider}`);
}
