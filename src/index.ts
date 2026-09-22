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
    async askUserSurvey(survey) {
      const finishedSurvey = [];
      for (const { question } of survey) {
        const answer = await rl.question(`Question ${question}: `);

        finishedSurvey.push({
          question,
          answer,
        });
      }
      return finishedSurvey;
    },
    async askForToolCallApproval({ name, args }) {
      const approved = await rl.question(
        `Approve Tool Call: ${name}(${args})  (y/n)  `,
      );
      if (approved === "y") {
        return true;
      }
      return false;
    },
  });

  process.stdout.write("\n");
  console.table(usage);
  process.stdout.write("\n");

  console.log(finalResponse);
}
