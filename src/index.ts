import { createInterface } from "node:readline/promises";
import { is } from "zod/locales";
import "./env.ts";
import { Agent } from "./lib/agent.ts";
import generalPurposeAgent from "./agent/index.ts";

const rl = createInterface({
  input: process.stdin,
  output: process.stdout,
});

let isShuttingDown = false;

function shutDown() {
  if (isShuttingDown) return;
  isShuttingDown = true;
  rl.close();
  process.exit(0);
}

process.on("SIGINT", shutDown);
process.on("SIGTERM", shutDown);

rl.on("close", () => shutDown());

while (!isShuttingDown) {
  const prompt = await rl.question("Prompt: ");

  const { finalResponse, usage } = await generalPurposeAgent.start({
    prompt: prompt,
  });

  process.stdout.write("\n");
  console.table(usage);
  process.stdout.write("\n");

  console.log(finalResponse);
}
