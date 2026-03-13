#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const indexPath = path.join(root, "docs", "runs_index.jsonl");
const outDir = path.join(root, "docs", "quality");

const windowArg = Number(process.argv.find((a) => a.startsWith("--window="))?.split("=")[1] ?? "20");
const windowSize = Number.isFinite(windowArg) && windowArg > 0 ? Math.floor(windowArg) : 20;

function scoreTo5(value, max = 5) {
  const n = Number(value ?? 0);
  if (!Number.isFinite(n)) return 1;
  const clamped = Math.max(0, Math.min(max, n));
  return Number(clamped.toFixed(2));
}

function ratioTo5(numerator, denominator) {
  if (!denominator) return 1;
  const r = numerator / denominator;
  return Number((Math.max(0, Math.min(1, r)) * 5).toFixed(2));
}

const raw = await fs.readFile(indexPath, "utf8").catch(() => "");
const rows = raw
  .split(/\n+/)
  .filter(Boolean)
  .map((line) => {
    try {
      return JSON.parse(line);
    } catch {
      return null;
    }
  })
  .filter(Boolean)
  .sort((a, b) => String(b.createdAt ?? "").localeCompare(String(a.createdAt ?? "")))
  .slice(0, windowSize);

if (!rows.length) {
  console.log("No benchmark rows available (docs/runs_index.jsonl empty).");
  process.exit(0);
}

const passCount = rows.filter((r) => r.gate === true).length;
const closeAllowedCount = rows.filter((r) => r.close_allowed === true || r.gate === true).length;
const withReasons = rows.filter((r) => Array.isArray(r.gateReasons) && r.gateReasons.length > 0);
const lowReworkCount = rows.filter((r) => {
  const reasons = Array.isArray(r.gateReasons) ? r.gateReasons : [];
  return reasons.length <= 1;
}).length;

const roleClarity = ratioTo5(lowReworkCount, rows.length);
const handoffCompleteness = ratioTo5(closeAllowedCount, rows.length);
const outputQuality = ratioTo5(passCount, rows.length);
const reliabilityRecovery = ratioTo5(rows.length - withReasons.length, rows.length);
const observabilityDebug = ratioTo5(rows.filter((r) => r.run_summary_path || r.evidenceBundlePath).length, rows.length);
const avg = scoreTo5((roleClarity + handoffCompleteness + outputQuality + reliabilityRecovery + observabilityDebug) / 5);

const reasons = {};
for (const r of rows) {
  for (const reason of (Array.isArray(r.gateReasons) ? r.gateReasons : [])) {
    reasons[reason] = (reasons[reason] || 0) + 1;
  }
}
const topReasons = Object.entries(reasons)
  .sort((a, b) => b[1] - a[1])
  .slice(0, 5);

const ts = new Date().toISOString().replace(/[:.]/g, "-");
const outPath = path.join(outDir, `benchmark_${windowSize}_${ts}.md`);
await fs.mkdir(outDir, { recursive: true });

const md = [
  `# Quality Benchmark (window=${rows.length})`,
  "",
  `Generated: ${new Date().toISOString()}`,
  `Source: docs/runs_index.jsonl`,
  "",
  "## Rubric (1-5)",
  `- Role Clarity: **${roleClarity}**`,
  `- Handoff Completeness: **${handoffCompleteness}**`,
  `- Output Quality: **${outputQuality}**`,
  `- Reliability/Recovery: **${reliabilityRecovery}**`,
  `- Observability/Debuggability: **${observabilityDebug}**`,
  `- Average: **${avg}**`,
  "",
  "## Outcome Snapshot",
  `- Gate pass rate: ${passCount}/${rows.length}`,
  `- Close allowed rate: ${closeAllowedCount}/${rows.length}`,
  `- Runs with gate reasons: ${withReasons.length}/${rows.length}`,
  "",
  "## Top Gate Reasons",
  ...(topReasons.length ? topReasons.map(([k, v]) => `- ${k}: ${v}`) : ["- none"]),
  "",
  "## Recommendation",
  avg >= 4.5
    ? "- Benchmark target met (>=4.5). Keep monitoring trend windows."
    : "- Benchmark target not met (<4.5). Prioritize top gate reasons in next revision cycle.",
  "",
].join("\n");

await fs.writeFile(outPath, md, "utf8");
console.log(JSON.stringify({ ok: true, outPath, rows: rows.length, average: avg }, null, 2));
