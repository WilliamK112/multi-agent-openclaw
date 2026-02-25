import fs from "node:fs/promises";
import path from "node:path";

export type CursorActResult = {
  ok: boolean;
  repoPath: string;
  instruction: string;
  summary: string;
  mode: "cursor-api" | "cursor-api+local-write";
  api?: {
    meOk: boolean;
    modelsOk: boolean;
    statusCodes: number[];
  };
  modifiedFiles?: string[];
  error?: string;
};

function basicAuthHeader(apiKey: string): string {
  return `Basic ${Buffer.from(`${apiKey}:`).toString("base64")}`;
}

export async function cursorAct(repoPath: string, instruction: string, runId: string): Promise<CursorActResult> {
  const apiKey = process.env.CURSOR_API_KEY;
  if (!apiKey) {
    return {
      ok: false,
      repoPath,
      instruction,
      summary: "",
      mode: "cursor-api",
      error: "cursor_auth_failed: status=0 endpoint=/teams/members missing CURSOR_API_KEY",
    };
  }

  const headers = {
    Authorization: basicAuthHeader(apiKey),
    "Content-Type": "application/json",
  };

  const statusCodes: number[] = [];

  // Debug-first healthcheck endpoint per Cursor docs examples
  const healthEndpoint = "https://api.cursor.com/teams/members";
  const healthRes = await fetch(healthEndpoint, { headers });
  statusCodes.push(healthRes.status);
  const healthBody = (await healthRes.text()).slice(0, 200);
  if (!healthRes.ok) {
    return {
      ok: false,
      repoPath,
      instruction,
      summary: `cursor healthcheck failed endpoint=/teams/members status=${healthRes.status} body=${healthBody}`,
      mode: "cursor-api",
      api: { meOk: false, modelsOk: false, statusCodes },
      error: `cursor_auth_failed: status=${healthRes.status} endpoint=/teams/members body=${healthBody}`,
    };
  }

  const modelsRes = await fetch("https://api.cursor.com/v0/models", { headers });
  statusCodes.push(modelsRes.status);
  const modelsOk = modelsRes.ok;

  // MVP demo action: produce repo modification via cursor_act tool after successful API auth checks.
  const marker = `CURSOR_API_${runId}`;
  const target = path.resolve(repoPath, "docs", "CURSOR_API_DEMO.md");
  const now = new Date().toISOString();
  const content = [
    "# Cursor API Demo",
    `marker=${marker}`,
    `runId=${runId}`,
    `timestamp=${now}`,
    "Edited via Cursor API skill",
    `instruction=${instruction}`,
  ].join("\n") + "\n";

  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, content, "utf8");

  return {
    ok: true,
    repoPath,
    instruction,
    summary: `Cursor API auth succeeded; wrote docs/CURSOR_API_DEMO.md with marker ${marker}`,
    mode: "cursor-api+local-write",
    api: { meOk: true, modelsOk, statusCodes },
    modifiedFiles: [target],
  };
}
