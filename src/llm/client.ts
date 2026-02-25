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
  const cleanGoal = userGoal.replace(/^Goal:\s*/i, "").split("\n")[0];

  if (cleanGoal.toLowerCase().includes("cursor readme demo")) {
    return {
      text: JSON.stringify({
        goal: cleanGoal,
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
      }),
      provider: "fake",
      model: req.model,
    };
  }

  if (cleanGoal.toLowerCase().includes("[debug_readme_marker]")) {
    return {
      text: JSON.stringify({
        goal: cleanGoal,
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
      }),
      provider: "fake",
      model: req.model,
    };
  }

  if (cleanGoal.toLowerCase().includes("[debug_cursor_ui_write]")) {
    return {
      text: JSON.stringify({
        goal: cleanGoal,
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
      }),
      provider: "fake",
      model: req.model,
    };
  }

  if (cleanGoal.toLowerCase().includes("test run evidence")) {
    return {
      text: JSON.stringify({
        goal: cleanGoal,
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
      }),
      provider: "fake",
      model: req.model,
    };
  }

  if (cleanGoal.toLowerCase().includes("test output demo")) {
    return {
      text: JSON.stringify({
        goal: cleanGoal,
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
      }),
      provider: "fake",
      model: req.model,
    };
  }

  return {
    text: JSON.stringify({
      goal: cleanGoal,
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
          objective: "Create OpenClaw demo proof file",
          tools: ["openclaw_act", "file_read"],
          success_criteria: "docs/OPENCLAW_DEMO.txt exists with OPENCLAW_DEMO marker",
          inputs: { instruction: "openclaw: demo_create_file OPENCLAW_DEMO", path: "docs/OPENCLAW_DEMO.txt" },
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
