import readline from "node:readline";
import { run } from "./orchestrator";

function ask(question: string): Promise<string> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer);
    });
  });
}

async function main() {
  let goal = process.argv.slice(2).join(" ").trim();

  if (!goal) {
    goal = (await ask("Enter goal: ")).trim();
    if (!goal) {
      console.log('Usage: npm run dev -- "your goal"');
      process.exit(1);
    }
  }

  const result = await run(goal, process.cwd());

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
