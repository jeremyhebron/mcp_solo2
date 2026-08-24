import { writeFile } from "node:fs/promises";
import orchestratorAgent from "../agent/index.ts";
import type { Agent } from "./agent.ts";
import cron from "node-cron";

type Schedule = {
  schedule: string;
  name: string;
  prompt: string;
  agent: Agent;
  onComplete?: (
    finalResponse: string,
    usage: {
      prompt_tokens: number;
      completion_tokens: number;
      total_tokens: number;
      tps: number;
      time_to_first_token_ms: number;
    },
  ) => Promise<void>;
};

export class Scheduler {
  schedules: Record<string, Schedule>;

  constructor(args: { schedules: Record<string, Schedule> }) {
    this.schedules = args.schedules;
  }

  async start() {
    for (const { schedule, prompt, agent, onComplete, name } of Object.values(
      this.schedules,
    )) {
      cron.schedule(
        schedule,
        async () => {
          console.log(`${name} starting...`);
          const { finalResponse, usage } = await agent.start({
            prompt,
          });
          console.log(`${name} has completed...`);
          await onComplete?.(finalResponse, usage);
        },
        {
          noOverlap: true,
        },
      );
    }
  }
}
