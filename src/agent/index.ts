import OpenAI from "openai";
import { Agent } from "../lib/agent.ts";
import getWeather from "../tools/getWeather.ts";
import browserAgent from "./browser_agent.ts";
import desktopAgent from "./desktop_agent.ts";

const orchestratorAgent = new Agent({
  id: "Orchestrator Agent",
  client: new OpenAI({
    apiKey: process.env.OPEN_ROUTER_API_KEY,
    baseURL: "https://openrouter.ai/api/v1",
  }),
  model: "deepseek/deepseek-v4-pro",
  role: "Are are the orchestraion agent. You have a team of specialist for specific tasks. Use the browser agent for tasks requiring web serach or web scraping. Use the desktop agent for tasks requiring the file system.",

  localTools: {},
  subagents: {
    browserAgent,
    desktopAgent,
  },
});

export default orchestratorAgent;
