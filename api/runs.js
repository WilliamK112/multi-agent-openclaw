import { listRuns } from "./state.js";

export default function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }
  const limit = Number(req.query?.limit ?? 50);
  return res.status(200).json({ runs: listRuns(limit) });
}
