import { exec } from "node:child_process";

export type OpenClawActResult = {
  ok: boolean;
  instruction: string;
  mode: "stub" | "openclaw-cli";
  output: string;
  stderr?: string;
  error?: string;
};

const OPENCLAW_ALLOW = new Set([
  "status",
  "gateway status",
]);

function run(cmd: string): Promise<{ ok: boolean; stdout: string; stderr: string; error?: string }> {
  return new Promise((resolve) => {
    exec(cmd, { timeout: 15000 }, (error, stdout, stderr) => {
      if (error) {
        resolve({ ok: false, stdout: stdout ?? "", stderr: stderr ?? "", error: error.message });
        return;
      }
      resolve({ ok: true, stdout: stdout ?? "", stderr: stderr ?? "" });
    });
  });
}

/**
 * instruction formats:
 * 1) "openclaw: status"
 * 2) "openclaw: gateway status"
 * 3) anything else => stub log
 */
export async function openclawAct(instruction: string): Promise<OpenClawActResult> {
  const trimmed = instruction.trim();
  const prefix = "openclaw:";

  if (trimmed.toLowerCase().startsWith(prefix)) {
    const sub = trimmed.slice(prefix.length).trim();
    if (!OPENCLAW_ALLOW.has(sub)) {
      return {
        ok: false,
        instruction,
        mode: "openclaw-cli",
        output: "",
        error: `openclaw subcommand not allowlisted: ${sub}`,
      };
    }

    const cmd = `openclaw ${sub}`;
    const out = await run(cmd);
    return {
      ok: out.ok,
      instruction,
      mode: "openclaw-cli",
      output: out.stdout,
      stderr: out.stderr,
      error: out.error,
    };
  }

  const output = `OPENCLAW_ACT(STUB): ${instruction}`;
  console.log(output);
  return { ok: true, instruction, mode: "stub", output };
}
