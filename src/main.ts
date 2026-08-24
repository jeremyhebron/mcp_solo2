import "./env.ts";
import { writeFile } from "node:fs/promises";
import { Scheduler } from "./lib/scheduler.ts";
import orchestratorAgent from "./agent/index.ts";

const scheduler = new Scheduler({
  schedules: {
    dodgerMorningDigest: {
      name: "Dodger Minute Digest",
      prompt:
        "Research the latest news on the Los Angeles Dodgers and give me a comprehensive report in markdown.",
      schedule: "* * * * *",
      onComplete: async (finalResponse, usage) => {
        const reportFileName = `./${crypto.randomUUID()}_dodger_report.md`;
        await writeFile(reportFileName, finalResponse);
      },
      agent: orchestratorAgent,
    },
  },
});

scheduler.start();
