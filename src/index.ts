import "./env.ts";
import { createInterface } from "node:readline/promises";
import generalPurposeAgent from "./agent/index.ts";
import whisper from "./stt/whisper.ts";
import { checkbox, confirm, input, select } from "@inquirer/prompts";

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
      for (const question of survey) {
        if (question.type === "text") {
          const answer = await input({
            message: question.question,
          });

          finishedSurvey.push({
            type: question.type,
            question: question.question,
            answer,
          });
        } else if (question.type === "single_choice") {
          let answer = await select({
            message: question.question,
            choices: [...question.choices, "Enter your own answer"],
          });
          if (answer === "Enter your own answer") {
            answer = await input({
              message: question.question,
            });
          }
          finishedSurvey.push({
            type: question.type,
            question: question.question,
            answer,
          });
        } else if (question.type === "multiple_choice") {
          let answer = await checkbox({
            message: question.question,
            choices: [...question.choices, "Enter your own answer"],
          });
          if (answer.includes("Enter your own answer")) {
            const selectedAnswers = answer.filter(
              (answer) => answer !== "Enter your own answer",
            );
            answer = [
              ...selectedAnswers,
              await input({
                message: question.question,
              }),
            ];
          }
          finishedSurvey.push({
            type: question.type,
            question: question.question,
            answer,
          });
        } else {
          const answer = await confirm({
            message: question.question,
          });

          finishedSurvey.push({
            type: question.type,
            question: question.question,
            answer,
          });
        }
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
