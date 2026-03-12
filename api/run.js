import { createRun } from "./state.js";

export default function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }
  const run = createRun(req.body?.goal);
  return res.status(200).json({ runId: run.id, run });
}
