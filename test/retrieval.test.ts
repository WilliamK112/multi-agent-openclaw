import test from "node:test";
import assert from "node:assert/strict";
import { reorderSearchHits, type RetrievalHit } from "../src/memory/retrieval";

function makeHit(id: string, score: number, ts: number, taskType?: string): RetrievalHit {
  return {
    id,
    source: "memory",
    kind: "run_summary",
    title: id,
    text: id,
    score,
    metadata: {
      createdAtTs: ts,
      ...(taskType ? { taskType } : {}),
    },
  };
}

test("reorderSearchHits: prefers recency when base scores are tied", () => {
  const older = makeHit("older", 0.5, 1000, "general");
  const newer = makeHit("newer", 0.5, 2000, "general");

  const out = reorderSearchHits([older, newer], "summarize this");
  assert.equal(out[0]?.id, "newer");
});

test("reorderSearchHits: applies task-type alignment boost", () => {
  const programming = makeHit("prog", 0.4, 1500, "programming");
  const general = makeHit("gen", 0.46, 1500, "general");

  const out = reorderSearchHits([general, programming], "debug this typescript function");
  assert.equal(out[0]?.id, "prog");
});

test("reorderSearchHits: keeps stable order for untimestamped equal-score hits", () => {
  const a = makeHit("a", 0.3, Number.NaN, "general");
  const b = makeHit("b", 0.3, Number.NaN, "general");
  const c = makeHit("c", 0.3, Number.NaN, "general");

  const out = reorderSearchHits([a, b, c], "plain note");
  assert.deepEqual(
    out.map((x) => x.id),
    ["a", "b", "c"],
  );
});

test("reorderSearchHits: returns empty array for empty input without mutating", () => {
  const input: RetrievalHit[] = [];
  const snapshot = [...input];

  const out = reorderSearchHits(input, "anything");

  assert.deepEqual(out, []);
  assert.deepEqual(input, snapshot);
  assert.notEqual(out, input);
});

test("reorderSearchHits: debug mode exposes recencyNorm/taskBoost fields", async () => {
  const prev = process.env.RETRIEVAL_DEBUG_SCORES;
  process.env.RETRIEVAL_DEBUG_SCORES = "1";
  const mod = await import(`../src/memory/retrieval.ts?debug=${Date.now()}`);

  const reorder = mod.reorderSearchHits as typeof reorderSearchHits;
  const programming = makeHit("prog", 0.4, 2000, "programming");
  const general = makeHit("gen", 0.4, 1000, "general");

  const out = reorder([general, programming], "debug this test");
  assert.ok(typeof out[0]?.debug?.recencyNorm === "number");
  assert.ok(typeof out[0]?.debug?.taskBoost === "number");

  if (prev === undefined) delete process.env.RETRIEVAL_DEBUG_SCORES;
  else process.env.RETRIEVAL_DEBUG_SCORES = prev;
});
