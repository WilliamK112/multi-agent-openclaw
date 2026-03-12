import fs from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import { getRecentContexts, type RunContext } from "./context";

export type RetrievalDoc = {
  id: string;
  source: "memory" | "export";
  kind: "run_summary" | "source" | "claim" | "export";
  title: string;
  text: string;
  metadata?: Record<string, string | number | boolean | null>;
};

export type RetrievalHit = RetrievalDoc & {
  score: number;
  debug?: {
    vectorScore?: number;
    lexicalScore?: number;
    baseScore?: number;
    recencyNorm?: number;
    taskBoost?: number;
  };
};

type VectorRecord = {
  id: string;
  hash: string;
  source: RetrievalDoc["source"];
  kind: RetrievalDoc["kind"];
  title: string;
  text: string;
  vector: number[];
};

const VECTOR_DIM = Number(process.env.MEMORY_VECTOR_DIM ?? 256);
const VECTOR_DB = path.resolve(process.cwd(), process.env.MEMORY_VECTOR_FILE ?? "docs/memory/vectors.jsonl");
const OPENAI_EMBEDDING_MODEL = process.env.OPENAI_EMBEDDING_MODEL ?? "text-embedding-3-small";
const OPENAI_EMBED_BATCH_SIZE = Math.max(1, Math.min(128, Number(process.env.OPENAI_EMBED_BATCH_SIZE ?? 64)));
function retrievalDebugScoresEnabled(): boolean {
  return process.env.RETRIEVAL_DEBUG_SCORES === "1";
}

function tokenize(input: string): string[] {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .map((x) => x.trim())
    .filter((x) => x.length > 2);
}

function hashText(text: string): string {
  return createHash("sha1").update(text).digest("hex");
}

function embedTextHash(input: string): number[] {
  const vec = new Array<number>(VECTOR_DIM).fill(0);
  const tokens = tokenize(input);
  if (!tokens.length) return vec;

  for (const tok of tokens) {
    const h = createHash("md5").update(tok).digest();
    const idx = h.readUInt16BE(0) % VECTOR_DIM;
    const sign = (h[2] & 1) === 0 ? 1 : -1;
    const weight = 1 + (h[3] % 5) * 0.1;
    vec[idx] += sign * weight;
  }

  const norm = Math.sqrt(vec.reduce((a, b) => a + b * b, 0)) || 1;
  return vec.map((x) => x / norm);
}

function cosine(a: number[], b: number[]): number {
  const n = Math.min(a.length, b.length);
  let s = 0;
  for (let i = 0; i < n; i++) s += a[i] * b[i];
  return s;
}

async function embedTextsOpenAI(texts: string[]): Promise<number[][] | null> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey || !texts.length) return null;

  const vectors: number[][] = [];
  for (let i = 0; i < texts.length; i += OPENAI_EMBED_BATCH_SIZE) {
    const batch = texts.slice(i, i + OPENAI_EMBED_BATCH_SIZE);
    const res = await fetch("https://api.openai.com/v1/embeddings", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({ model: OPENAI_EMBEDDING_MODEL, input: batch }),
    }).catch(() => null);

    if (!res || !res.ok) return null;
    const data: any = await res.json().catch(() => null);
    const rows: any[] = Array.isArray(data?.data) ? data.data : [];
    if (!rows.length) return null;
    for (const row of rows) {
      const emb = Array.isArray(row?.embedding) ? row.embedding.map(Number) : null;
      if (!emb || !emb.length) return null;
      vectors.push(emb);
    }
  }

  return vectors.length === texts.length ? vectors : null;
}

async function embedTexts(texts: string[]): Promise<number[][]> {
  const openai = await embedTextsOpenAI(texts).catch(() => null);
  if (openai && openai.length === texts.length) return openai;
  return texts.map((t) => embedTextHash(t));
}

async function loadVectorStore(): Promise<Map<string, VectorRecord>> {
  try {
    const raw = await fs.readFile(VECTOR_DB, "utf8");
    const map = new Map<string, VectorRecord>();
    for (const line of raw.split("\n")) {
      if (!line.trim()) continue;
      try {
        const rec = JSON.parse(line) as VectorRecord;
        map.set(rec.id, rec);
      } catch {
        // Skip malformed lines
      }
    }
    return map;
  } catch {
    return new Map();
  }
}

async function saveVectorStore(records: VectorRecord[]): Promise<void> {
  const dir = path.dirname(VECTOR_DB);
  await fs.mkdir(dir, { recursive: true });
  const lines = records.map((r) => JSON.stringify(r)).join("\n");
  await fs.writeFile(VECTOR_DB, (lines ? lines + "\n" : ""), "utf8");
}

async function upsertVectors(docs: RetrievalDoc[]): Promise<VectorRecord[]> {
  const existing = await loadVectorStore();
  let dirty = false;

  const toEmbed: RetrievalDoc[] = [];
  for (const d of docs) {
    const h = hashText(d.text);
    const prev = existing.get(d.id);
    if (prev && prev.hash === h) continue;
    toEmbed.push(d);
  }

  if (toEmbed.length) {
    const embedded = await embedTexts(toEmbed.map((d) => d.text));
    for (let i = 0; i < toEmbed.length; i++) {
      const d = toEmbed[i];
      const h = hashText(d.text);
      existing.set(d.id, {
        id: d.id,
        hash: h,
        source: d.source,
        kind: d.kind,
        title: d.title,
        text: d.text,
        vector: embedded[i] ?? embedTextHash(d.text),
      });
      dirty = true;
    }
  }

  const validIds = new Set(docs.map((d) => d.id));
  for (const key of existing.keys()) {
    if (!validIds.has(key)) {
      existing.delete(key);
      dirty = true;
    }
  }

  const records = Array.from(existing.values());
  if (dirty) await saveVectorStore(records);
  return records;
}

async function loadMemoryDocs(limit: number): Promise<RetrievalDoc[]> {
  const contexts: RunContext[] = await getRecentContexts(limit);
  return contexts.map((c) => {
    const summary = [c.goal, c.taskType, c.complexity, c.status, c.summary ?? ""].join(" | ");
    const createdAtTs = Date.parse(c.createdAt ?? "");
    return {
      id: `run:${c.runId}`,
      source: "memory",
      kind: "run_summary",
      title: `run ${c.runId}`,
      text: summary,
      metadata: {
        runId: c.runId,
        status: c.status,
        taskType: c.taskType,
        complexity: c.complexity,
        createdAt: c.createdAt ?? null,
        createdAtTs: Number.isFinite(createdAtTs) ? createdAtTs : null,
      },
    };
  });
}

function parseSourceLines(md: string): string[] {
  const sourcesSection = md.match(/##\s+(Works Cited|Sources)\n([\s\S]*?)(\n##\s+|$)/i);
  if (!sourcesSection) return [];
  return sourcesSection[2]
    .split(/\n+/)
    .map((x) => x.trim())
    .filter((x) => x.startsWith("- "));
}

function parseClaimLines(md: string): string[] {
  return md
    .split(/\n+/)
    .map((x) => x.trim())
    .filter((x) => x.length > 50)
    .filter((x) => /\[(\d+|source)\]|\([A-Za-z][^)]*\d{4}[^)]*\)|https?:\/\//.test(x))
    .slice(0, 30);
}

async function loadExportDocs(limit: number): Promise<RetrievalDoc[]> {
  const exportsDir = path.resolve(process.cwd(), "docs/exports");
  try {
    const files = (await fs.readdir(exportsDir)).filter((f) => f.endsWith(".md")).slice(-limit);
    const docs: RetrievalDoc[] = [];
    for (const f of files) {
      const p = path.join(exportsDir, f);
      const stat = await fs.stat(p).catch(() => null);
      const fileTs = stat?.mtimeMs ?? null;
      const text = await fs.readFile(p, "utf8").catch(() => "");
      if (!text) continue;

      docs.push({
        id: `export:${f}`,
        source: "export",
        kind: "export",
        title: f,
        text: text.slice(0, 4000),
        metadata: { fileTs },
      });

      const sourceLines = parseSourceLines(text);
      sourceLines.forEach((line, idx) => {
        docs.push({
          id: `source:${f}:${idx}`,
          source: "export",
          kind: "source",
          title: `${f} source ${idx + 1}`,
          text: line,
          metadata: { fileTs },
        });
      });

      const claimLines = parseClaimLines(text);
      claimLines.forEach((line, idx) => {
        docs.push({
          id: `claim:${f}:${idx}`,
          source: "export",
          kind: "claim",
          title: `${f} claim ${idx + 1}`,
          text: line,
          metadata: { fileTs },
        });
      });
    }
    return docs;
  } catch {
    return [];
  }
}

function lexicalScore(query: string, text: string): number {
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

function toTimestamp(hit: RetrievalHit): number {
  const ts = Number(hit.metadata?.createdAtTs ?? hit.metadata?.fileTs ?? 0);
  return Number.isFinite(ts) ? ts : 0;
}

function inferTaskType(query: string): "programming" | "research_writing" | "general" {
  const q = query.toLowerCase();
  if (/\b(code|program|debug|refactor|typescript|javascript|python|bug|test)\b/.test(q)) return "programming";
  if (/\b(research|paper|citation|sources|analysis|evidence|report|summary)\b/.test(q)) return "research_writing";
  return "general";
}

/**
 * Phase 4 reorder step: rerank by blended relevance + recency + task-type alignment.
 */
export function reorderSearchHits(hits: RetrievalHit[], query?: string): RetrievalHit[] {
  if (!hits.length) return [];

  const maxTs = Math.max(...hits.map(toTimestamp), 0);
  const minTs = Math.min(...hits.map(toTimestamp), maxTs);
  const span = Math.max(1, maxTs - minTs);
  const queryTaskType = inferTaskType(query ?? "");

  return hits
    .map((h) => {
      const recencyNorm = (toTimestamp(h) - minTs) / span;
      const hitTaskType = String(h.metadata?.taskType ?? "general");
      const taskBoost = hitTaskType === queryTaskType ? 0.08 : 0;
      const baseScore = h.score;
      const score = baseScore * 0.77 + recencyNorm * 0.15 + taskBoost;
      return {
        ...h,
        score,
        debug: retrievalDebugScoresEnabled()
          ? {
              ...(h.debug ?? {}),
              baseScore,
              recencyNorm,
              taskBoost,
            }
          : h.debug,
      };
    })
    .sort((a, b) => b.score - a.score);
}

export async function searchMemory(query: string, topK = 6): Promise<RetrievalHit[]> {
  const [memoryDocs, exportDocs] = await Promise.all([loadMemoryDocs(80), loadExportDocs(40)]);
  const allDocs = [...memoryDocs, ...exportDocs];

  const vectorRows = await upsertVectors(allDocs);
  const rowById = new Map(vectorRows.map((r) => [r.id, r]));
  const qv = (await embedTexts([query]))[0] ?? embedTextHash(query);

  const hits = allDocs
    .map((d) => {
      const row = rowById.get(d.id);
      const vecScore = row ? Math.max(0, cosine(qv, row.vector)) : 0;
      const lexScore = lexicalScore(query, d.text);
      const lexicalNorm = Math.min(1, lexScore / 6);
      const combined = vecScore * 0.7 + lexicalNorm * 0.3;
      return {
        ...d,
        score: combined,
        debug: retrievalDebugScoresEnabled()
          ? {
              vectorScore: vecScore,
              lexicalScore: lexicalNorm,
              baseScore: combined,
            }
          : undefined,
      };
    })
    .filter((d) => d.score > 0.05);

  return reorderSearchHits(hits, query).slice(0, topK);
}

export async function retrieveContext(query: string, topK = 6): Promise<RetrievalHit[]> {
  return searchMemory(query, topK);
}

export function hitsToHints(hits: RetrievalHit[]): string[] {
  return hits.map((h) => `${h.source}/${h.kind}:${h.title} (score=${h.score.toFixed(3)}) ${h.text.slice(0, 180).replace(/\s+/g, " ")}`);
}
