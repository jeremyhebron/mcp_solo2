import "./env.ts";
import { createInterface } from "node:readline/promises";
import generalPurposeAgent from "./agent/index.ts";
import whisper from "./stt/whisper.ts";

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
  let prompt = await rl.question("Prompt: ");

  // open microphone and record
  if (prompt.trim() === "/voice") {
    prompt = await whisper.openMicAndTranscribe(rl);
    console.log(`> ${prompt}`);
  }

  const { finalResponse, usage } = await generalPurposeAgent.start({
    prompt: prompt,
  });

  process.stdout.write("\n");
  console.table(usage);
  process.stdout.write("\n");

  console.log(finalResponse);
}
