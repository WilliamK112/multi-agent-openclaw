import { exec } from "node:child_process";

const ALLOWLIST = new Set(["pwd", "ls", "cat", "npm", "node", "echo", "git", "npx", "tsc"]);

export type ShellRunResult = {
  ok: boolean;
  command: string;
  stdout: string;
  stderr: string;
  code?: number;
  error?: string;
};

function isAllowed(command: string): boolean {
  const trimmed = command.trim();
  if (!trimmed) return false;
  const head = trimmed.split(/\s+/)[0];
  return ALLOWLIST.has(head);
}

export function shellRun(command: string, cwd: string): Promise<ShellRunResult> {
  return new Promise((resolve) => {
    if (!isAllowed(command)) {
      resolve({ ok: false, command, stdout: "", stderr: "", error: "Command not allowlisted" });
      return;
    }

    exec(command, { cwd, timeout: 15_000 }, (error, stdout, stderr) => {
      if (error) {
        resolve({
          ok: false,
          command,
          stdout: stdout ?? "",
          stderr: stderr ?? "",
          code: (error as any).code,
          error: error.message,
        });
        return;
      }
      resolve({ ok: true, command, stdout: stdout ?? "", stderr: stderr ?? "" });
    });
  });
}
