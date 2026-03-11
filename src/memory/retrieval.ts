import fs from "node:fs/promises";
import path from "node:path";
import { getRecentContexts, type RunContext } from "./context";

export type RetrievalDoc = {
  id: string;
  source: "memory" | "export";
  title: string;
  text: string;
};

export type RetrievalHit = RetrievalDoc & { score: number };

function tokenize(input: string): string[] {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .map((x) => x.trim())
    .filter((x) => x.length > 2);
}

function score(query: string, text: string): number {
  const q = tokenize(query);
  if (!q.length) return 0;
  const t = tokenize(text);
  if (!t.length) return 0;
  const freq = new Map<string, number>();
  for (const tok of t) freq.set(tok, (freq.get(tok) ?? 0) + 1);
  let s = 0;
  for (const tok of q) s += Math.log(1 + (freq.get(tok) ?? 0));
  const coverage = q.filter((tok) => freq.has(tok)).length / q.length;
  return s + coverage * 2;
}

async function loadMemoryDocs(limit: number): Promise<RetrievalDoc[]> {
  const contexts: RunContext[] = await getRecentContexts(limit);
  return contexts.map((c) => ({
    id: c.runId,
    source: "memory",
    title: `run ${c.runId}`,
    text: [c.goal, c.taskType, c.complexity, c.status, c.summary ?? ""].join(" | "),
  }));
}

async function loadExportDocs(limit: number): Promise<RetrievalDoc[]> {
  const exportsDir = path.resolve(process.cwd(), "docs/exports");
  try {
    const files = (await fs.readdir(exportsDir)).filter((f) => f.endsWith(".md")).slice(-limit);
    const docs: RetrievalDoc[] = [];
    for (const f of files) {
      const p = path.join(exportsDir, f);
      const text = await fs.readFile(p, "utf8").catch(() => "");
      if (!text) continue;
      docs.push({ id: f, source: "export", title: f, text: text.slice(0, 4000) });
    }
    return docs;
  } catch {
    return [];
  }
}

export async function retrieveContext(query: string, topK = 6): Promise<RetrievalHit[]> {
  const [memoryDocs, exportDocs] = await Promise.all([loadMemoryDocs(80), loadExportDocs(40)]);
  const all = [...memoryDocs, ...exportDocs];
  const hits = all
    .map((d) => ({ ...d, score: score(query, d.text) }))
    .filter((d) => d.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, topK);
  return hits;
}

export function hitsToHints(hits: RetrievalHit[]): string[] {
  return hits.map((h) => `${h.source}:${h.title} (score=${h.score.toFixed(2)}) ${h.text.slice(0, 180).replace(/\s+/g, " ")}`);
}
