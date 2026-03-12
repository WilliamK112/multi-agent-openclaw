import { getRun } from "../state.js";

export default function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }
  const id = req.query?.id;
  const run = getRun(id);
  if (!run) return res.status(404).json({ error: "Run not found" });
  return res.status(200).json(run);
}
