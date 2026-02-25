import { exec } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";

export type OpenClawActResult = {
  ok: boolean;
  instruction: string;
  mode: "openclaw-cli";
  output: string;
  stderr?: string;
  error?: string;
};

type Action =
  | { kind: "status" }
  | { kind: "gateway_status" }
  | { kind: "dashboard" }
  | { kind: "demo_create_file"; marker: string };

function run(cmd: string): Promise<{ ok: boolean; stdout: string; stderr: string; error?: string }> {
  return new Promise((resolve) => {
    exec(cmd, { timeout: 20_000 }, (error, stdout, stderr) => {
      if (error) {
        resolve({ ok: false, stdout: stdout ?? "", stderr: stderr ?? "", error: error.message });
        return;
      }
      resolve({ ok: true, stdout: stdout ?? "", stderr: stderr ?? "" });
    });
  });
}

function parseInstruction(instruction: string): Action | null {
  const trimmed = instruction.trim();
  if (!trimmed.toLowerCase().startsWith("openclaw:")) return null;

  const body = trimmed.slice("openclaw:".length).trim();
  if (body === "status") return { kind: "status" };
  if (body === "gateway status") return { kind: "gateway_status" };
  if (body === "dashboard") return { kind: "dashboard" };
  if (body.startsWith("demo_create_file")) {
    const marker = body.slice("demo_create_file".length).trim() || "OPENCLAW_DEMO";
    return { kind: "demo_create_file", marker };
  }

  return null;
}

function summarize(text: string, max = 800): string {
  const compact = text.replace(/\s+/g, " ").trim();
  return compact.length > max ? `${compact.slice(0, max)}...` : compact;
}

export async function openclawAct(instruction: string): Promise<OpenClawActResult> {
  const action = parseInstruction(instruction);
  if (!action) {
    return {
      ok: false,
      instruction,
      mode: "openclaw-cli",
      output: "",
      error: "Instruction must start with 'openclaw:' and use an allowlisted action",
    };
  }

  if (action.kind === "status") {
    const out = await run("openclaw status");
    return {
      ok: out.ok,
      instruction,
      mode: "openclaw-cli",
      output: summarize(out.stdout),
      stderr: summarize(out.stderr),
      error: out.error,
    };
  }

  if (action.kind === "gateway_status") {
    const out = await run("openclaw gateway status");
    return {
      ok: out.ok,
      instruction,
      mode: "openclaw-cli",
      output: summarize(out.stdout),
      stderr: summarize(out.stderr),
      error: out.error,
    };
  }

  if (action.kind === "dashboard") {
    const out = await run("openclaw dashboard");
    return {
      ok: out.ok,
      instruction,
      mode: "openclaw-cli",
      output: summarize(out.stdout || "dashboard opened"),
      stderr: summarize(out.stderr),
      error: out.error,
    };
  }

  // demo_create_file: run real OpenClaw CLI, then write proof file in project docs/
  const statusOut = await run("openclaw status");
  if (!statusOut.ok) {
    return {
      ok: false,
      instruction,
      mode: "openclaw-cli",
      output: summarize(statusOut.stdout),
      stderr: summarize(statusOut.stderr),
      error: statusOut.error || "openclaw status failed",
    };
  }

  const demoPath = path.resolve(process.cwd(), "docs", "OPENCLAW_DEMO.txt");
  const now = new Date().toISOString();
  const content = [
    "OPENCLAW_DEMO",
    `marker=${action.marker}`,
    `timestamp=${now}`,
    "action=openclaw status",
  ].join("\n") + "\n";

  await fs.mkdir(path.dirname(demoPath), { recursive: true });
  await fs.writeFile(demoPath, content, "utf8");

  return {
    ok: true,
    instruction,
    mode: "openclaw-cli",
    output: summarize(`Demo file created at ${demoPath}. openclaw status ok.`),
    stderr: summarize(statusOut.stderr),
  };
}
