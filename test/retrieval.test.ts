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
