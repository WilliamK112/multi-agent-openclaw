import "dotenv/config";
import { run } from "./orchestrator";

async function main() {
  const goal = process.argv.slice(2).join(" ").trim();

  if (!goal) {
    console.log('No goal provided. Use: npm run dev -- "your goal"');
    console.log("Or start API server: npm run dev:server");
    process.exit(1);
  }

  const result = await run(goal);

  console.log("\n[Final] QA pass:", result.qa.pass);
  if (!result.qa.pass) {
    console.log("[Final] Issues:");
    for (const issue of result.qa.issues) console.log(`- ${issue}`);
  }
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
