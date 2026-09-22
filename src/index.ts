import "./env.ts";
import { createInterface } from "node:readline/promises";
import generalPurposeAgent from "./agent/index.ts";
import whisper from "./stt/whisper.ts";
import { input, select } from "@inquirer/prompts";

let isShuttingDown = false;

function shutDown() {
  if (isShuttingDown) return;
  isShuttingDown = true;
  process.exit(0);
}

process.on("SIGINT", shutDown);
process.on("SIGTERM", shutDown);

while (!isShuttingDown) {
  let prompt = await input({
    message: "Prompt: ",
  });

  // open microphone and record
  if (prompt.trim() === "/voice") {
    // prompt = await whisper.openMicAndTranscribe(rl);
    console.log(`> ${prompt}`);
  }

  const { finalResponse, usage } = await generalPurposeAgent.start({
    prompt: prompt,
    async askUserSurvey(survey) {
      const finishedSurvey = [];
      for (const { question } of survey) {
        const answer = await input({
          message: question,
        });

        finishedSurvey.push({
          question,
          answer,
        });
      }
      return finishedSurvey;
    },
    async askForToolCallApproval({ name, args }) {
      const answer = await select({
        message: `Approve Tool Call: ${name}(${args})`,
        choices: [
          {
            name: "Allow Once",
            value: "allow_once",
            description: "Allow only this time",
          },
          {
            name: "ALways Allow",
            value: "always_allow",
            description: "Always allow this tool",
          },
          {
            name: "Reject",
            value: "reject",
            description: "Reject this tool call",
          },
        ],
      });
      return answer;
    },
  });

  process.stdout.write("\n");
  console.table(usage);
  process.stdout.write("\n");

  console.log(finalResponse);
}
